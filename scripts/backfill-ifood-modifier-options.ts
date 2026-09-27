/**
 * Resolve `opcaoId` dos modificadores de venda do iFood já importados, pelos vínculos de complemento
 * (ADD_ON_OPCAO). Complementa a ingestão, que passou a resolver pelos vínculos só dali em diante.
 *
 * Uso:
 *   npx tsx scripts/backfill-ifood-modifier-options.ts --org=<organizationId> [--confirm]
 *
 * `sale_item_modifiers` não guarda o id da opção remota — ele está no payload cru do item
 * (`sale_items.metadados.options[].id`). O pareamento modificador ↔ opção do payload é por
 * (nome, quantidade, valor unitário), consumindo cada opção uma vez. Dois modificadores idênticos
 * nesses três campos no mesmo item (ex.: "Morango" sabor e "Morango" cobertura, ambos grátis) são
 * indistinguíveis: são contados como ambíguos e só resolvidos se as opções remotas apontarem para a
 * mesma opção local.
 */
import "@/utils/scripts/load-next-env";

import { connection, db } from "@/services/drizzle";
import { catalogLinks, saleItemModifiers } from "@/services/drizzle/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((value) => value.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : null;
}

type TRawOption = { id?: string | null; name?: string | null; quantity?: number | null; unitPrice?: number | null };

const pairKey = (nome: string | null | undefined, quantidade: number | null | undefined, valorUnitario: number | null | undefined) =>
	`${(nome ?? "").trim().toLowerCase()}|${quantidade ?? 0}|${Math.round((valorUnitario ?? 0) * 100)}`;

async function main() {
	const orgId = getArgValue("org");
	if (!orgId) throw new Error("Informe --org=<organizationId>.");
	const confirm = process.argv.includes("--confirm");

	const rows = (await db.execute(sql`
		select m.id, m.nome, m.quantidade, m.valor_unitario as "valorUnitario", i.id as "itemId", i.metadados->'options' as options
		from ampmais_sale_item_modifiers m
		join ampmais_sale_items i on i.id = m.item_venda_id
		where i.organizacao_id = ${orgId}
			and m.opcao_id is null
			and jsonb_typeof(i.metadados->'options') = 'array'
	`)) as unknown as { rows?: unknown[] } & unknown[];
	const modifiers = ((rows as { rows?: unknown[] }).rows ?? rows) as {
		id: string;
		nome: string;
		quantidade: number | null;
		valorUnitario: number | null;
		itemId: string;
		options: TRawOption[];
	}[];

	const remoteIds = [...new Set(modifiers.flatMap((modifier) => modifier.options.map((option) => option.id).filter((id): id is string => !!id)))];
	const links = remoteIds.length
		? await db.query.catalogLinks.findMany({
				where: and(
					eq(catalogLinks.organizacaoId, orgId),
					eq(catalogLinks.tipo, "ADD_ON_OPCAO"),
					ne(catalogLinks.status, "DESVINCULADO"),
					inArray(catalogLinks.externoOptionId, remoteIds),
				),
				columns: { externoOptionId: true, produtoAddOnOpcaoId: true },
			})
		: [];
	const localByRemote = new Map(links.map((link) => [link.externoOptionId as string, link.produtoAddOnOpcaoId as string]));

	// Pareamento por item: cada opção do payload é consumida por no máximo um modificador.
	const byItem = new Map<string, typeof modifiers>();
	for (const modifier of modifiers) byItem.set(modifier.itemId, [...(byItem.get(modifier.itemId) ?? []), modifier]);

	const updates: { id: string; opcaoId: string }[] = [];
	let semVinculo = 0;
	let semPar = 0;
	let ambiguos = 0;
	for (const itemModifiers of byItem.values()) {
		const pool = new Map<string, TRawOption[]>();
		for (const option of itemModifiers[0].options) {
			const key = pairKey(option.name, option.quantity, option.unitPrice);
			pool.set(key, [...(pool.get(key) ?? []), option]);
		}
		for (const modifier of itemModifiers) {
			const candidates = pool.get(pairKey(modifier.nome, modifier.quantidade, modifier.valorUnitario)) ?? [];
			if (!candidates.length) {
				semPar += 1;
				continue;
			}
			const targets = new Set(candidates.map((option) => (option.id ? localByRemote.get(option.id) : undefined)));
			const option = candidates.shift() as TRawOption;
			if (targets.size > 1) {
				// Opções remotas indistinguíveis apontando para opções locais diferentes.
				ambiguos += 1;
				continue;
			}
			const opcaoId = option.id ? localByRemote.get(option.id) : undefined;
			if (!opcaoId) {
				semVinculo += 1;
				continue;
			}
			updates.push({ id: modifier.id, opcaoId });
		}
	}

	console.log(
		`${confirm ? "APLICANDO" : "SIMULAÇÃO (use --confirm)"} — ${modifiers.length} modificadores sem opção | resolvíveis: ${updates.length}, sem vínculo: ${semVinculo}, sem par no payload: ${semPar}, ambíguos: ${ambiguos}`,
	);
	if (!confirm) return;

	for (const update of updates) {
		await db.update(saleItemModifiers).set({ opcaoId: update.opcaoId }).where(eq(saleItemModifiers.id, update.id));
	}
	console.log(`${updates.length} modificadores atualizados.`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());

/**
 * Aplica o JSON revisado gerado por `scripts/ifood-suggest-catalog-links.ts`.
 *
 * Uso:
 *   npx tsx scripts/ifood-apply-catalog-links.ts --file=<json> [--confirm]
 *
 * Sem `--confirm` só mostra o que faria. Com `--confirm`, para cada sugestão `acao: "VINCULAR"`:
 *
 * 1. Cria o vínculo com nome/descrição/imagem NÃO sincronizados — o Portal do iFood continua dono
 *    da apresentação; só preço e disponibilidade seguem o cadastro.
 * 2. Semeia a matriz do canal iFood com o estado ATUAL do iFood (preço como override do canal,
 *    disponível/indisponível). Sem isso, o primeiro push — disparado pelo próximo save do produto,
 *    com snapshot vazio — empurraria o preço base e religaria itens pausados no Portal.
 *    Item com preço 0 no iFood (preço mora nos complementos) não sincroniza preço.
 * 3. Para as cópias `DUPLICADO_IFOOD` sem código externo, grava no item do iFood o código do
 *    original (PATCH /items), para que a ingestão de pedidos resolva pelo código em vez de criar
 *    produto novo — o vínculo não cobre a cópia (um item por produto).
 * 4. Relê o catálogo e roda a reconciliação da loja: o código gravado e o status dos vínculos só
 *    são confirmados pela releitura.
 *
 * Idempotente: vínculos e linhas da matriz são upserts; o PATCH de código só roda se faltar.
 */
import "@/utils/scripts/load-next-env";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TIfoodItemDTO } from "@/lib/integrations/ifood/catalog-types";
import { getIfoodCatalogs, listIfoodCategories } from "@/lib/integrations/ifood/catalog";
import { patchIfoodItem } from "@/lib/integrations/ifood/catalog-items";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { upsertCatalogLink } from "@/lib/integrations/ifood/sync/links";
import { reconcileMerchantCatalog } from "@/lib/integrations/ifood/sync/reconcile";
import { ensureIfoodSalesChannel } from "@/lib/products/sales-channels-store";
import { connection, db } from "@/services/drizzle";
import { productChannelSettings } from "@/services/drizzle/schema";

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((value) => value.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : null;
}

type TSuggestionFile = {
	organizacao: { id: string; nome: string };
	merchantId: string;
	catalogoId: string;
	sugestoes: {
		acao: "VINCULAR" | "REVISAR" | "DUPLICADO_IFOOD";
		item: { itemId: string; nome: string | null; codigoExterno: string | null };
		duplicataDe: { itemId: string; nome: string | null } | null;
		produto: { produtoId: string; nome: string; codigo: string | null } | null;
	}[];
};

async function loadRemoteItems(client: Parameters<typeof listIfoodCategories>[0], merchantId: string) {
	const items = new Map<string, TIfoodItemDTO & { categoriaId: string }>();
	for (const catalog of await getIfoodCatalogs(client, merchantId)) {
		for (const category of await listIfoodCategories(client, merchantId, { catalogId: catalog.id })) {
			for (const item of category.itens) if (item.id) items.set(item.id, { ...item, categoriaId: category.id });
		}
	}
	return items;
}

async function main() {
	const file = getArgValue("file");
	if (!file) throw new Error("Informe --file=<json revisado>.");
	const confirm = process.argv.includes("--confirm");
	const plan = JSON.parse(readFileSync(resolve(file), "utf-8")) as TSuggestionFile;
	const orgId = plan.organizacao.id;
	const merchantId = plan.merchantId;

	console.log(`${confirm ? "APLICANDO" : "SIMULAÇÃO (use --confirm para gravar)"} — ${plan.organizacao.nome}, loja ${merchantId}\n`);

	const context = await resolveIfoodManagementContext({ organizacaoId: orgId, merchantId });
	const remoteItems = await loadRemoteItems(context.client, merchantId);

	const toLink = plan.sugestoes.filter((suggestion) => suggestion.acao === "VINCULAR" && suggestion.produto);
	const seenProducts = new Set<string>();
	for (const suggestion of toLink) {
		const produtoId = suggestion.produto?.produtoId as string;
		if (seenProducts.has(produtoId)) throw new Error(`Produto ${suggestion.produto?.nome} aparece em mais de um VINCULAR — revise o JSON.`);
		seenProducts.add(produtoId);
		if (!remoteItems.has(suggestion.item.itemId)) throw new Error(`Item "${suggestion.item.nome}" (${suggestion.item.itemId}) não existe mais no iFood.`);
	}

	// Cópias sem código: recebem o código do produto vinculado ao original.
	const productByItemId = new Map(toLink.map((suggestion) => [suggestion.item.itemId, suggestion.produto]));
	const codePatches = plan.sugestoes
		.filter((suggestion) => suggestion.acao === "DUPLICADO_IFOOD" && suggestion.duplicataDe)
		.map((suggestion) => {
			const remote = remoteItems.get(suggestion.item.itemId);
			const original = productByItemId.get(suggestion.duplicataDe?.itemId as string);
			return { suggestion, remote, codigo: original?.codigo ?? null };
		})
		.filter(({ remote, codigo }) => remote && !remote.codigoExterno && codigo);

	const channel = confirm ? await ensureIfoodSalesChannel({ orgId, integracaoId: context.integrationId, merchantId }) : null;

	for (const suggestion of toLink) {
		const remote = remoteItems.get(suggestion.item.itemId) as TIfoodItemDTO & { categoriaId: string };
		const produto = suggestion.produto as NonNullable<typeof suggestion.produto>;
		const disponivel = remote.status === "AVAILABLE";
		const precoCanal = remote.preco && remote.preco > 0 ? remote.preco : null;

		console.log(
			`VINCULAR  ${remote.nome}  →  ${produto.nome}  | canal iFood: ${disponivel ? "disponível" : "INDISPONÍVEL"}, preço ${precoCanal ?? "(não sincroniza)"}`,
		);
		if (!confirm || !channel) continue;

		await upsertCatalogLink({
			orgId,
			merchantId,
			node: { tipo: "PRODUTO", produtoId: produto.produtoId },
			externalRefs: { externoItemId: remote.id, externoProdutoId: remote.produtoId, externoCategoriaId: remote.categoriaId },
			sincronizar: { nome: false, descricao: false, imagem: false, preco: precoCanal != null, disponibilidade: true },
		});

		await db
			.insert(productChannelSettings)
			.values({ organizacaoId: orgId, canalVendaId: channel.id, produtoId: produto.produtoId, produtoVarianteId: null, disponivel, precoVenda: precoCanal })
			.onConflictDoUpdate({
				target: [productChannelSettings.canalVendaId, productChannelSettings.produtoId, productChannelSettings.produtoVarianteId],
				set: { disponivel, precoVenda: precoCanal, dataAtualizacao: new Date() },
			});
	}

	for (const { suggestion, codigo } of codePatches) {
		console.log(`CÓDIGO    ${suggestion.item.nome} [cópia] → externalCode "${codigo}"`);
		if (confirm) await patchIfoodItem(context.client, merchantId, suggestion.item.itemId, { codigoExterno: codigo });
	}

	console.log(`\n${toLink.length} vínculos, ${codePatches.length} códigos a gravar no iFood.`);
	if (!confirm) return;

	// Releitura: o catálogo do iFood é eventualmente consistente — espera antes de conferir.
	await new Promise((done) => setTimeout(done, 5000));
	const reread = await loadRemoteItems(context.client, merchantId);
	for (const { suggestion, codigo } of codePatches) {
		const actual = reread.get(suggestion.item.itemId)?.codigoExterno ?? null;
		console.log(`${actual === codigo ? "OK " : "FALHOU"}  código de "${suggestion.item.nome}": esperado "${codigo}", iFood tem "${actual}"`);
	}

	const reconciliation = await reconcileMerchantCatalog({ orgId, merchantId });
	console.log("\nReconciliação:", reconciliation);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());

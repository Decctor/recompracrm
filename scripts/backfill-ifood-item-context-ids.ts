import "dotenv/config";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { readItemContextIds, recordItemContextIds, sameContextIds } from "@/lib/integrations/ifood/sync/item-context-ids";
import { connection, db } from "@/services/drizzle";
import { catalogLinks } from "@/services/drizzle/schema";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";

/**
 * Preenche `externo_item_contexto_ids` (drizzle/0143) dos vínculos de item do iFood: uma leitura do
 * `/flat` por vínculo. Sem esses ids a ingestão de pedidos não casa pelo vínculo (o pedido traz o
 * `itemContextId`, não o id do item) e cai no `externalCode`.
 *
 * Idempotente: só grava quando os ids lidos diferem dos gravados. A 0143 precisa estar aplicada.
 * Rodar com: npm run backfill:ifood-item-context-ids [-- --dry-run] [-- --org=<organizacaoId>]
 */

const dryRun = process.argv.includes("--dry-run");
const orgFilter = process.argv.find((arg) => arg.startsWith("--org="))?.slice("--org=".length) ?? null;

async function main() {
	const links = await db.query.catalogLinks.findMany({
		where: and(
			eq(catalogLinks.provider, "IFOOD"),
			inArray(catalogLinks.tipo, ["PRODUTO", "VARIANTE"]),
			ne(catalogLinks.status, "DESVINCULADO"),
			isNotNull(catalogLinks.externoItemId),
			...(orgFilter ? [eq(catalogLinks.organizacaoId, orgFilter)] : []),
		),
		columns: { id: true, organizacaoId: true, merchantId: true, externoItemId: true, externoItemContextoIds: true },
	});

	const byMerchant = new Map<string, typeof links>();
	for (const link of links) {
		const key = `${link.organizacaoId}:${link.merchantId}`;
		byMerchant.set(key, [...(byMerchant.get(key) ?? []), link]);
	}

	let updated = 0;
	let unchanged = 0;
	let unreadable = 0;
	for (const [key, merchantLinks] of byMerchant) {
		const [organizacaoId, merchantId] = key.split(":");
		const context = await resolveIfoodManagementContext({ organizacaoId, merchantId }).catch((error) => {
			console.error(`[${key}] Sem conexão iFood utilizável — ${merchantLinks.length} vínculos pulados.`, error instanceof Error ? error.message : error);
			return null;
		});
		if (!context) {
			unreadable += merchantLinks.length;
			continue;
		}

		let merchantUpdated = 0;
		for (const link of merchantLinks) {
			const ids = await readItemContextIds({ client: context.client, merchantId, itemId: link.externoItemId as string });
			if (ids.length === 0) {
				unreadable += 1;
				console.warn(`[${key}] Item ${link.externoItemId} sem ids de contexto (apagado no Portal?).`);
				continue;
			}
			if (sameContextIds(link.externoItemContextoIds, ids)) {
				unchanged += 1;
				continue;
			}
			if (!dryRun) await recordItemContextIds(link, ids);
			merchantUpdated += 1;
		}
		updated += merchantUpdated;
		console.log(`[${key}] ${merchantLinks.length} vínculos, ${merchantUpdated} ${dryRun ? "a atualizar" : "atualizados"}.`);
	}

	console.log(
		`\nVínculos: ${links.length} | ${dryRun ? "A atualizar" : "Atualizados"}: ${updated} | Já corretos: ${unchanged} | Sem leitura: ${unreadable}`,
	);
	if (unreadable > 0) process.exitCode = 1;
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());

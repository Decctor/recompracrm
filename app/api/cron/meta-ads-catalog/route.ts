import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { getActiveMetaAdsIntegrationIds, syncMetaAdsCatalog } from "@/lib/integrations/meta/ads/catalog-sync";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Sincronização periódica do catálogo de anúncios (`media_ads`) de cada conta Meta Ads ativa. Cada
 * rodada decide sozinha entre completa (uma por dia) e incremental. Falha numa conta não interrompe
 * as outras.
 */
async function metaAdsCatalogRoute(req: NextRequest) {
	assertCronAuthorized(req);
	const startedAt = Date.now();

	const integrationIds = await getActiveMetaAdsIntegrationIds();
	let synced = 0;
	let failed = 0;
	let read = 0;
	let removed = 0;

	for (const integrationId of integrationIds) {
		try {
			const result = await syncMetaAdsCatalog({ integrationId });
			synced += 1;
			read += result.read;
			removed += result.removed;
		} catch (error) {
			failed += 1;
			console.error("[ERROR] [META_ADS_CATALOG_CRON] Falha ao sincronizar catálogo:", {
				integrationId,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const summary = { contas: integrationIds.length, synced, failed, read, removed, durationMs: Date.now() - startedAt };
	console.log("[INFO] [META_ADS_CATALOG_CRON] Sincronização concluída:", summary);
	return NextResponse.json({ data: summary, message: "Sincronização do catálogo de anúncios concluída." });
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = appApiHandler({ GET: metaAdsCatalogRoute });

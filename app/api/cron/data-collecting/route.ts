import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { runDataCollectingV2 } from "@/lib/data-collecting-v2";
import { NextRequest, NextResponse } from "next/server";

/**
 * Organizações coletadas em paralelo. O ciclo passa a custar as organizações mais lentas, não a
 * soma de todas. Conexões da MESMA organização seguem em série (ver
 * `groupIntegrationsByOrganization`) e cada uma já é isolada em try/catch. O teto fica bem abaixo
 * do pool (max 10 por instância): a transação de persistência só usa `tx`, então nenhuma
 * organização segura uma conexão esperando outra, e os efeitos pós-commit rodam depois do commit.
 * Mesmo valor do polling do iFood (`IFOOD_POLLING_ORGANIZATION_CONCURRENCY`).
 */
const DATA_COLLECTING_ORGANIZATION_CONCURRENCY = 4;

async function getDataCollectingRoute(_req: NextRequest) {
	console.log("[INFO] [DATA_COLLECTING_V2] Starting data collecting cron job");

	const result = await runDataCollectingV2({ organizationConcurrency: DATA_COLLECTING_ORGANIZATION_CONCURRENCY });

	console.log("[INFO] [DATA_COLLECTING_V2] Processing concluded", {
		summaries: result.summaries.length,
		eventDispatches: result.eventDispatches.length,
		errors: result.errors.length,
	});

	return NextResponse.json(
		{
			data: result,
			message: result.errors.length > 0 ? "Coleta de dados concluída com erros em algumas organizações." : "Coleta de dados executada com sucesso.",
		},
		{ status: 200 },
	);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = appApiHandler({
	GET: async (req) => {
		assertCronAuthorized(req);
		return getDataCollectingRoute(req);
	},
});

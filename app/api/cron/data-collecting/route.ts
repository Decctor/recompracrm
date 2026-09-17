import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { runDataCollectingV2 } from "@/lib/data-collecting-v2";
import { NextRequest, NextResponse } from "next/server";

async function getDataCollectingRoute(_req: NextRequest) {
	console.log("[INFO] [DATA_COLLECTING_V2] Starting data collecting cron job");

	const result = await runDataCollectingV2();

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

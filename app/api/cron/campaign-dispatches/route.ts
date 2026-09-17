import { appApiHandler } from "@/lib/app-api";
import { runCampaignDispatchClock } from "@/lib/campaigns/dispatch/clock";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Relógio do pipeline de campanhas (substitui process-single-use-campaigns,
 * process-recurrent-campaigns e process-interactions). Só cria claims e publica trabalho nas
 * filas `campaign-dispatch-expand` / `campaign-dispatch-send`; a expansão da audiência e o envio
 * acontecem nos consumers, em paralelo, fora do limite de 300s do cron.
 */
async function campaignDispatchesClockRoute(_request: NextRequest) {
	const summary = await runCampaignDispatchClock();
	return NextResponse.json({ data: summary, message: "Relógio de disparos executado com sucesso." });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = appApiHandler({
	GET: async (request) => {
		assertCronAuthorized(request);
		return campaignDispatchesClockRoute(request);
	},
});

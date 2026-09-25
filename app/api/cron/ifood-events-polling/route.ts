import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { runIfoodPollingCycle } from "@/lib/integrations/ifood/polling-cron";
import { type NextRequest, NextResponse } from "next/server";

async function postIfoodEventsPollingRoute(request: NextRequest) {
	const handlerStartedAt = Date.now();
	console.log("[IFOOD_POLLING_CRON] Iniciando ciclo de polling iFood.");
	const result = await runIfoodPollingCycle();
	const cycles = result.cycles.map(({ startedAt, finishedAt, durationMs, summaries, errors, result: collection }) => ({
		startedAt,
		finishedAt,
		durationMs,
		summaries,
		errors,
		// Tempo de rede (iFood) x persistencia por integracao. `handlerMs` abaixo e o tempo total
		// dentro do handler; a diferenca para a duracao que a Vercel cobra e o custo fora do nosso
		// codigo (runtime/framework), e so aparece comparando as duas medidas para a mesma
		// invocacao (`vercelId`).
		timings: collection.timings,
	}));

	console.log("[IFOOD_POLLING_CRON] Ciclo concluido.", {
		state: result.state,
		integrationIds: result.integrationIds,
		durationMs: result.durationMs,
		handlerMs: Date.now() - handlerStartedAt,
		vercelId: request.headers.get("x-vercel-id"),
		cycles,
	});

	return NextResponse.json(
		{
			data: {
				state: result.state,
				integrationIds: result.integrationIds,
				durationMs: result.durationMs,
				cycles,
			},
			message:
				result.state === "SKIPPED_OVERLAP"
					? "Polling do iFood ignorado porque o ciclo anterior ainda está em execução."
					: "Ciclo de polling do iFood concluído.",
		},
		{ status: 200 },
	);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

export const POST = appApiHandler({
	POST: async (request) => {
		assertCronAuthorized(request);
		return postIfoodEventsPollingRoute(request);
	},
});

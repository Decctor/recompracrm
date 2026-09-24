import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { processFiscalQueue } from "@/lib/fiscal/worker";
import { NextRequest, NextResponse } from "next/server";

async function processFiscalQueueRoute(_req: NextRequest) {
	const result = await processFiscalQueue({});
	return NextResponse.json(
		{
			data: result,
			message: `Fila fiscal processada: ${result.enviados} enviados, ${result.falhas} falhas, ${result.sincronizados} sincronizados, ${result.agendamentosExecutados} agendamentos executados.`,
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
		return processFiscalQueueRoute(req);
	},
});

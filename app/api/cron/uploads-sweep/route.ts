import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { sweepExpiredUploads } from "@/lib/files/intake";
import { type NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

/** Expira uploads abandonados e remove os bytes de envios diretos que nunca foram conferidos. */
async function runUploadsSweep() {
	const result = await sweepExpiredUploads();
	console.log(`[INFO] [UPLOADS_SWEEP] ${result.expirados} upload(s) expirado(s), ${result.pastasRemovidas} pasta(s) removida(s).`);
	return { data: result, message: "Uploads expirados varridos com sucesso." };
}
export type TRunUploadsSweepOutput = Awaited<ReturnType<typeof runUploadsSweep>>;

async function runUploadsSweepRoute(req: NextRequest) {
	assertCronAuthorized(req);
	const result = await runUploadsSweep();
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: runUploadsSweepRoute });

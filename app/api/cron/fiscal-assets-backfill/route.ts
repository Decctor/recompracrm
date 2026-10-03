import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { backfillMissingFiscalAssets } from "@/lib/fiscal/asset-backfill";
import { NextRequest, NextResponse } from "next/server";

async function backfillFiscalAssetsRoute(_req: NextRequest) {
	const result = await backfillMissingFiscalAssets();
	return NextResponse.json(
		{
			data: result,
			message: `Backfill de arquivos fiscais: ${result.arquivosGuardados} arquivo(s) guardado(s) de ${result.candidatos} documento(s), ${result.falhas.length} falha(s).`,
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
		return backfillFiscalAssetsRoute(req);
	},
});

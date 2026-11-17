import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanViewCampaigns } from "@/lib/campaigns/access";
import { TAuthUserSession } from "@/lib/authentication/types";
import { computeWorstSalesDayOfWeek } from "@/lib/campaigns/utils";
import { db } from "@/services/drizzle";
import { appApiHandler } from "@/lib/app-api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

async function previewWorstSalesDay(session: TAuthUserSession) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	return db.transaction(async (tx) => {
		const worstDayOfWeek = await computeWorstSalesDayOfWeek(tx, userOrgId);
		return {
			data: worstDayOfWeek,
		};
	});
}
export type TPreviewWorstSalesDayOutput = Awaited<ReturnType<typeof previewWorstSalesDay>>;

async function previewWorstSalesDayRoute(request: NextRequest) {
	console.log("[INFO] Running previewWorstSalesDayRoute");
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanViewCampaigns(session);
	console.log("[INFO] Running previewWorstSalesDayRoute");
	const result = await previewWorstSalesDay(session);
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: previewWorstSalesDayRoute });

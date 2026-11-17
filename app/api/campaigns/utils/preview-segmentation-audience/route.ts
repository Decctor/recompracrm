import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanViewCampaigns } from "@/lib/campaigns/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import createHttpError from "http-errors";
import { count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

async function previewSegmentationAudience(session: TAuthUserSession) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	return db.transaction(async (tx) => {
		const grouped = await tx
			.select({
				titulo: clients.analiseRFMTitulo,
				qty: count(),
			})
			.from(clients)
			.where(eq(clients.organizacaoId, userOrgId))
			.groupBy(clients.analiseRFMTitulo);

		const bySegment: Record<string, number> = {};
		let totalClients = 0;
		let clientsWithoutRfm = 0;

		for (const row of grouped) {
			const qty = Number(row.qty);
			totalClients += qty;
			if (!row.titulo || row.titulo === "") {
				clientsWithoutRfm += qty;
			} else {
				bySegment[row.titulo] = qty;
			}
		}

		return {
			data: {
				bySegment,
				totalClients,
				clientsWithoutRfm,
			},
		};
	});
}

export type TPreviewSegmentationAudienceOutput = Awaited<ReturnType<typeof previewSegmentationAudience>>;

async function previewSegmentationAudienceRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanViewCampaigns(session);
	const result = await previewSegmentationAudience(session);
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: previewSegmentationAudienceRoute });

import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { previewAudience } from "@/lib/campaign-flows";
import { FilterTreeSchema, type TFilterTree } from "@/schemas/campaign-audiences";
import { db } from "@/services/drizzle";
import { campaignAudiences } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// POST: Preview audience (count + sample clients)
// ============================================================================

const PreviewCampaignAudienceInputSchema = z.object({
	// Either pass an existing audience ID...
	audienceId: z.string().optional().nullable(),
	// ...or inline filters for preview without saving
	filtros: FilterTreeSchema.optional().nullable(),
	sampleSize: z.number().int().positive().max(50).optional().default(10),
});
export type TPreviewCampaignAudienceInput = z.infer<typeof PreviewCampaignAudienceInputSchema>;

async function previewCampaignAudience({ input, session }: { input: TPreviewCampaignAudienceInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	let filtros: TFilterTree;

	if (input.audienceId) {
		const audience = await db.query.campaignAudiences.findFirst({
			where: and(eq(campaignAudiences.id, input.audienceId), eq(campaignAudiences.organizacaoId, userOrgId)),
		});
		if (!audience) throw new createHttpError.NotFound("Público não encontrado.");
		filtros = audience.filtros as TFilterTree;
	} else if (input.filtros) {
		filtros = input.filtros as TFilterTree;
	} else {
		throw new createHttpError.BadRequest("Informe o ID do público ou os filtros para preview.");
	}

	const result = await previewAudience({
		tx: db,
		organizacaoId: userOrgId,
		filtros,
		sampleSize: input.sampleSize,
	});

	return {
		data: result,
		message: `${result.total} cliente(s) encontrado(s).`,
	};
}
export type TPreviewCampaignAudienceOutput = Awaited<ReturnType<typeof previewCampaignAudience>>;

async function previewCampaignAudienceRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const payload = await request.json();
	const input = PreviewCampaignAudienceInputSchema.parse(payload);
	const result = await previewCampaignAudience({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: previewCampaignAudienceRoute });

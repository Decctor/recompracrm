import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanViewCampaigns } from "@/lib/campaigns/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { previewCampaignAudience } from "@/lib/campaigns/filters";
import { CampaignFiltersSchema } from "@/schemas/campaigns";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

const PreviewAudienceInputSchema = z.object({
	segmentations: z
		.array(
			z.string({
				required_error: "Segmentação não informada.",
				invalid_type_error: "Tipo não válido para a segmentação.",
			}),
			{
				required_error: "Segmentações não informadas.",
				invalid_type_error: "Tipo não válido para as segmentações.",
			},
		)
		.optional()
		.default([]),
	filters: CampaignFiltersSchema.optional().nullable(),
});
export type TPreviewAudienceInput = z.infer<typeof PreviewAudienceInputSchema>;

async function previewAudience({ input, session }: { input: TPreviewAudienceInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const preview = await previewCampaignAudience({
		organizationId: userOrgId,
		segmentations: input.segmentations,
		filters: input.filters,
	});

	return {
		data: {
			bySegment: preview.bySegment,
			totalClients: preview.totalClients,
			clientsWithoutRfm: preview.clientsWithoutRfm,
			matchedClientIds: preview.clientIds,
		},
		message: "Audiência pré-visualizada com sucesso.",
	};
}
export type TPreviewAudienceOutput = Awaited<ReturnType<typeof previewAudience>>;

async function previewAudienceRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanViewCampaigns(session);

	const input = PreviewAudienceInputSchema.parse(await request.json());
	const result = await previewAudience({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: previewAudienceRoute });

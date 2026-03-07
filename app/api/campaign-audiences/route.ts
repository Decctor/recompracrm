import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { CampaignAudienceStateSchema } from "@/schemas/campaign-audiences";
import { db } from "@/services/drizzle";
import { campaignAudiences } from "@/services/drizzle/schema";
import { and, count, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// GET: List audiences / Get by ID
// ============================================================================

const GetCampaignAudiencesInputSchema = z.object({
	id: z.string().optional().nullable(),
	search: z.string().optional().nullable(),
	page: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : 1)),
});
export type TGetCampaignAudiencesInput = z.infer<typeof GetCampaignAudiencesInputSchema>;

async function getCampaignAudiences({ input, session }: { input: TGetCampaignAudiencesInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (input.id) {
		const audience = await db.query.campaignAudiences.findFirst({
			where: and(eq(campaignAudiences.id, input.id), eq(campaignAudiences.organizacaoId, userOrgId)),
			with: {
				autor: { columns: { id: true, nome: true, avatarUrl: true } },
			},
		});
		if (!audience) throw new createHttpError.NotFound("Público não encontrado.");

		return {
			data: { byId: audience, default: null },
			message: "Público encontrado com sucesso.",
		};
	}

	const PAGE_SIZE = 25;
	const conditions = [eq(campaignAudiences.organizacaoId, userOrgId)];

	if (input.search && input.search.trim().length > 0) {
		conditions.push(
			sql`(${campaignAudiences.titulo} ILIKE '%' || ${input.search} || '%' OR ${campaignAudiences.descricao} ILIKE '%' || ${input.search} || '%')`,
		);
	}

	const [{ matched }] = await db
		.select({ matched: count() })
		.from(campaignAudiences)
		.where(and(...conditions));

	if (matched === 0) {
		return {
			data: {
				byId: null,
				default: { audiences: [], matched: 0, totalPages: 0 },
			},
			message: "Nenhum público encontrado.",
		};
	}

	const totalPages = Math.ceil(matched / PAGE_SIZE);

	const audiences = await db.query.campaignAudiences.findMany({
		where: and(...conditions),
		orderBy: (fields, { desc }) => [desc(fields.dataInsercao)],
		with: {
			autor: { columns: { id: true, nome: true, avatarUrl: true } },
		},
		offset: PAGE_SIZE * (input.page - 1),
		limit: PAGE_SIZE,
	});

	return {
		data: {
			byId: null,
			default: { audiences, matched, totalPages },
		},
		message: "Públicos obtidos com sucesso.",
	};
}
export type TGetCampaignAudiencesOutput = Awaited<ReturnType<typeof getCampaignAudiences>>;
export type TGetCampaignAudiencesOutputDefault = NonNullable<TGetCampaignAudiencesOutput["data"]["default"]>;
export type TGetCampaignAudiencesOutputById = NonNullable<TGetCampaignAudiencesOutput["data"]["byId"]>;

async function getCampaignAudiencesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetCampaignAudiencesInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		search: searchParams.get("search") ?? undefined,
		page: searchParams.get("page") ?? undefined,
	});
	const result = await getCampaignAudiences({ input, session });
	return NextResponse.json(result);
}

// ============================================================================
// POST: Create audience
// ============================================================================

const CreateCampaignAudienceInputSchema = CampaignAudienceStateSchema;
export type TCreateCampaignAudienceInput = z.infer<typeof CreateCampaignAudienceInputSchema>;

async function createCampaignAudience({ input, session }: { input: TCreateCampaignAudienceInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const [inserted] = await db
		.insert(campaignAudiences)
		.values({
			...input.audience,
			organizacaoId: userOrgId,
			autorId: session.user.id,
		})
		.returning({ id: campaignAudiences.id });

	const insertedId = inserted?.id;
	if (!insertedId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar público.");

	return {
		data: { insertedId },
		message: "Público criado com sucesso.",
	};
}
export type TCreateCampaignAudienceOutput = Awaited<ReturnType<typeof createCampaignAudience>>;

async function createCampaignAudienceRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const payload = await request.json();
	const input = CreateCampaignAudienceInputSchema.parse(payload);
	const result = await createCampaignAudience({ input, session });
	return NextResponse.json(result, { status: 201 });
}

// ============================================================================
// PUT: Update audience
// ============================================================================

const UpdateCampaignAudienceInputSchema = z.object({
	audienceId: z.string({
		required_error: "ID do público não informado.",
		invalid_type_error: "Tipo não válido para o ID do público.",
	}),
	audience: CampaignAudienceStateSchema.shape.audience,
});
export type TUpdateCampaignAudienceInput = z.infer<typeof UpdateCampaignAudienceInputSchema>;

async function updateCampaignAudience({ input, session }: { input: TUpdateCampaignAudienceInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const [updated] = await db
		.update(campaignAudiences)
		.set({ ...input.audience, dataAtualizacao: new Date() })
		.where(and(eq(campaignAudiences.id, input.audienceId), eq(campaignAudiences.organizacaoId, userOrgId)))
		.returning({ id: campaignAudiences.id });

	if (!updated?.id) throw new createHttpError.NotFound("Público não encontrado.");

	return {
		data: { updatedId: updated.id },
		message: "Público atualizado com sucesso.",
	};
}
export type TUpdateCampaignAudienceOutput = Awaited<ReturnType<typeof updateCampaignAudience>>;

async function updateCampaignAudienceRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const payload = await request.json();
	const input = UpdateCampaignAudienceInputSchema.parse(payload);
	const result = await updateCampaignAudience({ input, session });
	return NextResponse.json(result);
}

// ============================================================================
// DELETE: Delete audience
// ============================================================================

const DeleteCampaignAudienceInputSchema = z.object({
	id: z.string({
		required_error: "ID do público não informado.",
		invalid_type_error: "Tipo não válido para o ID do público.",
	}),
});
export type TDeleteCampaignAudienceInput = z.infer<typeof DeleteCampaignAudienceInputSchema>;

async function deleteCampaignAudience({ input, session }: { input: TDeleteCampaignAudienceInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const [deleted] = await db
		.delete(campaignAudiences)
		.where(and(eq(campaignAudiences.id, input.id), eq(campaignAudiences.organizacaoId, userOrgId)))
		.returning({ id: campaignAudiences.id });

	if (!deleted?.id) throw new createHttpError.NotFound("Público não encontrado.");

	return {
		data: { deletedId: deleted.id },
		message: "Público excluído com sucesso.",
	};
}
export type TDeleteCampaignAudienceOutput = Awaited<ReturnType<typeof deleteCampaignAudience>>;

async function deleteCampaignAudienceRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID do público não informado.");

	const input = DeleteCampaignAudienceInputSchema.parse({ id });
	const result = await deleteCampaignAudience({ input, session });
	return NextResponse.json(result);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const GET = appApiHandler({ GET: getCampaignAudiencesRoute });
export const POST = appApiHandler({ POST: createCampaignAudienceRoute });
export const PUT = appApiHandler({ PUT: updateCampaignAudienceRoute });
export const DELETE = appApiHandler({ DELETE: deleteCampaignAudienceRoute });

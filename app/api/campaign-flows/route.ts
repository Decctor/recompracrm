import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { handleAdminSimpleChildRowsProcessing } from "@/lib/db-utils";
import { CampaignFlowStateSchema } from "@/schemas/campaign-flows";
import { db } from "@/services/drizzle";
import { campaignFlowEdges, campaignFlowNodes, campaignFlows } from "@/services/drizzle/schema";
import { and, count, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// GET: List campaign flows / Get by ID
// ============================================================================

const GetCampaignFlowsInputSchema = z.object({
	id: z.string().optional().nullable(),
	search: z.string().optional().nullable(),
	status: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : [])),
	tipo: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : [])),
	page: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : 1)),
});
export type TGetCampaignFlowsInput = z.infer<typeof GetCampaignFlowsInputSchema>;

async function getCampaignFlows({ input, session }: { input: TGetCampaignFlowsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (input.id) {
		const campaignFlow = await db.query.campaignFlows.findFirst({
			where: and(eq(campaignFlows.id, input.id), eq(campaignFlows.organizacaoId, userOrgId)),
			with: {
				nos: true,
				arestas: true,
				publico: true,
				autor: { columns: { id: true, nome: true, avatarUrl: true } },
			},
		});
		if (!campaignFlow) throw new createHttpError.NotFound("Fluxo de campanha não encontrado.");

		return {
			data: { byId: campaignFlow, default: null },
			message: "Fluxo de campanha encontrado com sucesso.",
		};
	}

	const PAGE_SIZE = 25;
	const conditions = [eq(campaignFlows.organizacaoId, userOrgId)];

	if (input.search && input.search.trim().length > 0) {
		conditions.push(
			sql`(${campaignFlows.titulo} ILIKE '%' || ${input.search} || '%' OR ${campaignFlows.descricao} ILIKE '%' || ${input.search} || '%')`,
		);
	}
	if (input.status && input.status.length > 0) {
		conditions.push(
			sql`${campaignFlows.status} IN ${input.status}`,
		);
	}
	if (input.tipo && input.tipo.length > 0) {
		conditions.push(
			sql`${campaignFlows.tipo} IN ${input.tipo}`,
		);
	}

	const [{ matched }] = await db
		.select({ matched: count() })
		.from(campaignFlows)
		.where(and(...conditions));

	if (matched === 0) {
		return {
			data: {
				byId: null,
				default: { campaignFlows: [], matched: 0, totalPages: 0 },
			},
			message: "Nenhum fluxo de campanha encontrado.",
		};
	}

	const totalPages = Math.ceil(matched / PAGE_SIZE);

	const campaignFlowsResult = await db.query.campaignFlows.findMany({
		where: and(...conditions),
		orderBy: (fields, { desc }) => [desc(fields.dataInsercao)],
		with: {
			publico: { columns: { id: true, titulo: true } },
			autor: { columns: { id: true, nome: true, avatarUrl: true } },
		},
		offset: PAGE_SIZE * (input.page - 1),
		limit: PAGE_SIZE,
	});

	return {
		data: {
			byId: null,
			default: { campaignFlows: campaignFlowsResult, matched, totalPages },
		},
		message: "Fluxos de campanha obtidos com sucesso.",
	};
}
export type TGetCampaignFlowsOutput = Awaited<ReturnType<typeof getCampaignFlows>>;
export type TGetCampaignFlowsOutputDefault = NonNullable<TGetCampaignFlowsOutput["data"]["default"]>;
export type TGetCampaignFlowsOutputById = NonNullable<TGetCampaignFlowsOutput["data"]["byId"]>;

async function getCampaignFlowsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetCampaignFlowsInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		search: searchParams.get("search") ?? undefined,
		status: searchParams.get("status") ?? undefined,
		tipo: searchParams.get("tipo") ?? undefined,
		page: searchParams.get("page") ?? undefined,
	});
	const result = await getCampaignFlows({ input, session });
	return NextResponse.json(result);
}

// ============================================================================
// POST: Create campaign flow
// ============================================================================

const CreateCampaignFlowInputSchema = z.object({
	campaignFlow: CampaignFlowStateSchema.shape.campaignFlow,
	nos: CampaignFlowStateSchema.shape.nos,
	arestas: CampaignFlowStateSchema.shape.arestas,
});
export type TCreateCampaignFlowInput = z.infer<typeof CreateCampaignFlowInputSchema>;

async function createCampaignFlow({ input, session }: { input: TCreateCampaignFlowInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const [inserted] = await db
		.insert(campaignFlows)
		.values({
			...input.campaignFlow,
			organizacaoId: userOrgId,
			autorId: session.user.id,
		})
		.returning({ id: campaignFlows.id });

	const insertedId = inserted?.id;
	if (!insertedId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar fluxo de campanha.");

	// Insert nodes with temporary→real ID mapping for edges
	const nodeIdMap = new Map<string, string>();

	if (input.nos.length > 0) {
		const nodesToInsert = input.nos.map((no) => {
			const tempId = no.id || crypto.randomUUID();
			const realId = crypto.randomUUID();
			nodeIdMap.set(tempId, realId);
			return {
				id: realId,
				campanhaId: insertedId,
				tipo: no.tipo,
				subtipo: no.subtipo,
				rotulo: no.rotulo,
				configuracao: no.configuracao,
				posicaoX: no.posicaoX,
				posicaoY: no.posicaoY,
			};
		});
		await db.insert(campaignFlowNodes).values(nodesToInsert);
	}

	if (input.arestas.length > 0) {
		const edgesToInsert = input.arestas.map((aresta) => ({
			campanhaId: insertedId,
			noOrigemId: nodeIdMap.get(aresta.noOrigemId) ?? aresta.noOrigemId,
			noDestinoId: nodeIdMap.get(aresta.noDestinoId) ?? aresta.noDestinoId,
			condicaoLabel: aresta.condicaoLabel,
			ordem: aresta.ordem,
		}));
		await db.insert(campaignFlowEdges).values(edgesToInsert);
	}

	return {
		data: { insertedId },
		message: "Fluxo de campanha criado com sucesso.",
	};
}
export type TCreateCampaignFlowOutput = Awaited<ReturnType<typeof createCampaignFlow>>;

async function createCampaignFlowRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const payload = await request.json();
	const input = CreateCampaignFlowInputSchema.parse(payload);
	const result = await createCampaignFlow({ input, session });
	return NextResponse.json(result, { status: 201 });
}

// ============================================================================
// PUT: Update campaign flow
// ============================================================================

const UpdateCampaignFlowInputSchema = z.object({
	campaignFlowId: z.string({
		required_error: "ID do fluxo de campanha não informado.",
		invalid_type_error: "Tipo não válido para o ID do fluxo de campanha.",
	}),
	campaignFlow: CampaignFlowStateSchema.shape.campaignFlow,
	nos: CampaignFlowStateSchema.shape.nos,
	arestas: CampaignFlowStateSchema.shape.arestas,
});
export type TUpdateCampaignFlowInput = z.infer<typeof UpdateCampaignFlowInputSchema>;

async function updateCampaignFlow({ input, session }: { input: TUpdateCampaignFlowInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	return await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(campaignFlows)
			.set({ ...input.campaignFlow, dataAtualizacao: new Date() })
			.where(and(eq(campaignFlows.id, input.campaignFlowId), eq(campaignFlows.organizacaoId, userOrgId)))
			.returning({ id: campaignFlows.id });

		const updatedId = updated?.id;
		if (!updatedId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar fluxo de campanha.");

		await handleAdminSimpleChildRowsProcessing({
			trx: tx,
			table: campaignFlowNodes,
			entities: input.nos,
			fatherEntityKey: "campanhaId",
			fatherEntityId: updatedId,
		});

		await handleAdminSimpleChildRowsProcessing({
			trx: tx,
			table: campaignFlowEdges,
			entities: input.arestas,
			fatherEntityKey: "campanhaId",
			fatherEntityId: updatedId,
		});

		return {
			data: { updatedId },
			message: "Fluxo de campanha atualizado com sucesso.",
		};
	});
}
export type TUpdateCampaignFlowOutput = Awaited<ReturnType<typeof updateCampaignFlow>>;

async function updateCampaignFlowRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const payload = await request.json();
	const input = UpdateCampaignFlowInputSchema.parse(payload);
	const result = await updateCampaignFlow({ input, session });
	return NextResponse.json(result);
}

// ============================================================================
// DELETE: Delete campaign flow
// ============================================================================

const DeleteCampaignFlowInputSchema = z.object({
	id: z.string({
		required_error: "ID do fluxo de campanha não informado.",
		invalid_type_error: "Tipo não válido para o ID do fluxo de campanha.",
	}),
});
export type TDeleteCampaignFlowInput = z.infer<typeof DeleteCampaignFlowInputSchema>;

async function deleteCampaignFlow({ input, session }: { input: TDeleteCampaignFlowInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const [deleted] = await db
		.delete(campaignFlows)
		.where(and(eq(campaignFlows.id, input.id), eq(campaignFlows.organizacaoId, userOrgId)))
		.returning({ id: campaignFlows.id });

	if (!deleted?.id) throw new createHttpError.NotFound("Fluxo de campanha não encontrado.");

	return {
		data: { deletedId: deleted.id },
		message: "Fluxo de campanha excluído com sucesso.",
	};
}
export type TDeleteCampaignFlowOutput = Awaited<ReturnType<typeof deleteCampaignFlow>>;

async function deleteCampaignFlowRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const { searchParams } = new URL(request.url);
	const id = searchParams.get("id");
	if (!id) throw new createHttpError.BadRequest("ID do fluxo de campanha não informado.");

	const input = DeleteCampaignFlowInputSchema.parse({ id });
	const result = await deleteCampaignFlow({ input, session });
	return NextResponse.json(result);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const GET = appApiHandler({ GET: getCampaignFlowsRoute });
export const POST = appApiHandler({ POST: createCampaignFlowRoute });
export const PUT = appApiHandler({ PUT: updateCampaignFlowRoute });
export const DELETE = appApiHandler({ DELETE: deleteCampaignFlowRoute });

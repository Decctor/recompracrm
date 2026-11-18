import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { createManualInteraction, resolvePlannedInteraction } from "@/lib/interactions/create";
import { canEditClients } from "@/lib/permissions/clients";
import { InteractionChannelEnum, InteractionDirectionEnum, InteractionLifecycleStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { interactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, desc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const INTERACTION_WRITE_FORBIDDEN_MESSAGE = "Você não possui permissão para editar clientes.";

// ============================================================================
// GET — timeline de interações por cliente ou por vendedor
// ============================================================================

const GetInteractionsInputSchema = z
	.object({
		clienteId: z
			.string({ invalid_type_error: "Tipo inválido para o ID do cliente." })
			.optional()
			.nullable()
			.transform((v) => v || null),
		vendedorId: z
			.string({ invalid_type_error: "Tipo inválido para o ID do vendedor." })
			.optional()
			.nullable()
			.transform((v) => v || null),
		status: InteractionLifecycleStatusEnum.optional().nullable(),
		page: z
			.string({ invalid_type_error: "Tipo inválido para página." })
			.optional()
			.nullable()
			.transform((v) => (v ? Math.max(1, Number(v)) : 1)),
		limit: z
			.string({ invalid_type_error: "Tipo inválido para limite." })
			.optional()
			.nullable()
			.transform((v) => (v ? Math.min(MAX_PAGE_SIZE, Math.max(1, Number(v))) : DEFAULT_PAGE_SIZE)),
	})
	.refine((input) => input.clienteId || input.vendedorId, { message: "Informe um cliente ou um vendedor para listar interações." });
export type TGetInteractionsInput = z.infer<typeof GetInteractionsInputSchema>;

async function getInteractions({ input, session }: { input: TGetInteractionsInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const conditions = [eq(interactions.organizacaoId, organizacaoId)];
	if (input.clienteId) conditions.push(eq(interactions.clienteId, input.clienteId));
	if (input.vendedorId) conditions.push(eq(interactions.vendedorId, input.vendedorId));
	if (input.status) conditions.push(eq(interactions.status, input.status));
	const where = and(...conditions);

	const [totalResult] = await db
		.select({ total: count(interactions.id) })
		.from(interactions)
		.where(where);
	const total = totalResult?.total ?? 0;

	const rows = await db.query.interactions.findMany({
		where,
		columns: {
			id: true,
			clienteId: true,
			campanhaId: true,
			titulo: true,
			descricao: true,
			canal: true,
			direcao: true,
			iniciadoPor: true,
			status: true,
			statusEnvio: true,
			dataInteracao: true,
			dataInsercao: true,
			metadados: true,
		},
		with: {
			cliente: { columns: { id: true, nome: true } },
			campanha: { columns: { id: true, titulo: true } },
			vendedor: { columns: { id: true, nome: true, avatarUrl: true } },
			autor: { columns: { id: true, nome: true } },
		},
		orderBy: [desc(interactions.dataInteracao), desc(interactions.dataInsercao)],
		limit: input.limit,
		offset: (input.page - 1) * input.limit,
	});

	return {
		data: {
			interactions: rows,
			pagination: {
				total,
				totalPages: Math.max(1, Math.ceil(total / input.limit)),
				page: input.page,
			},
		},
		message: "Interações carregadas com sucesso.",
	};
}
export type TGetInteractionsOutput = Awaited<ReturnType<typeof getInteractions>>;

async function getInteractionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const { searchParams } = new URL(request.url);
	const input = GetInteractionsInputSchema.parse({
		clienteId: searchParams.get("clienteId"),
		vendedorId: searchParams.get("vendedorId"),
		status: searchParams.get("status") || undefined,
		page: searchParams.get("page"),
		limit: searchParams.get("limit"),
	});
	const result = await getInteractions({ input, session });
	return NextResponse.json(result, { status: 200 });
}

// ============================================================================
// POST — registro manual de interação (+ follow-up opcional)
// ============================================================================

const CreateInteractionInputSchema = z.object({
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo inválido para o ID do cliente.",
	}),
	vendedorId: z.string({ invalid_type_error: "Tipo inválido para o ID do vendedor." }).optional().nullable(),
	canal: InteractionChannelEnum,
	direcao: InteractionDirectionEnum.optional().default("SAIDA"),
	descricao: z.string({ invalid_type_error: "Tipo inválido para a nota." }).optional().nullable(),
	dataInteracao: z
		.string({ invalid_type_error: "Tipo inválido para a data da interação." })
		.datetime({ message: "Tipo inválido para a data da interação." })
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	planejada: z.boolean({ invalid_type_error: "Tipo inválido para o indicador de planejamento." }).optional().default(false),
	// Follow-up opcional: cria uma segunda interação PLANEJADA para a data informada.
	followUpEm: z
		.string({ invalid_type_error: "Tipo inválido para a data do follow-up." })
		.datetime({ message: "Tipo inválido para a data do follow-up." })
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	followUpDescricao: z.string({ invalid_type_error: "Tipo inválido para a nota do follow-up." }).optional().nullable(),
});
export type TCreateInteractionInput = z.infer<typeof CreateInteractionInputSchema>;

async function createInteraction({ input, session }: { input: TCreateInteractionInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const vendedorId = input.vendedorId ?? session.membership?.usuarioVendedorId;
	if (!vendedorId) throw new createHttpError.BadRequest("Informe o vendedor da interação (seu usuário não está vinculado a um vendedor).");

	const created = await createManualInteraction({
		organizacaoId,
		clienteId: input.clienteId,
		vendedorId,
		autorId: session.user.id,
		canal: input.canal,
		direcao: input.direcao,
		dataInteracao: input.dataInteracao ?? undefined,
		planejada: input.planejada,
		descricao: input.descricao,
	});

	let followUp = null;
	if (input.followUpEm) {
		followUp = await createManualInteraction({
			organizacaoId,
			clienteId: input.clienteId,
			vendedorId,
			autorId: session.user.id,
			canal: input.canal,
			dataInteracao: input.followUpEm,
			planejada: true,
			titulo: `Retorno agendado — ${dayjs(input.followUpEm).format("DD/MM")}`,
			descricao: input.followUpDescricao ?? input.descricao,
		});
	}

	return {
		data: { insertedId: created.id, followUpId: followUp?.id ?? null },
		message: input.planejada ? "Follow-up agendado com sucesso." : "Interação registrada com sucesso.",
	};
}
export type TCreateInteractionOutput = Awaited<ReturnType<typeof createInteraction>>;

async function createInteractionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	// Registrar um contato (ou agendar/resolver um retorno) escreve no histórico do cliente: clientes.editar.
	if (!canEditClients(session.membership.permissoes)) throw new createHttpError.Forbidden(INTERACTION_WRITE_FORBIDDEN_MESSAGE);

	const body = await request.json();
	const input = CreateInteractionInputSchema.parse(body);
	const result = await createInteraction({ input, session });
	return NextResponse.json(result, { status: 201 });
}

// ============================================================================
// PATCH — resolver interação planejada (realizar/cancelar)
// ============================================================================

const ResolveInteractionInputSchema = z.object({
	id: z.string({
		required_error: "ID da interação não informado.",
		invalid_type_error: "Tipo inválido para o ID da interação.",
	}),
	resolution: z.enum(["REALIZADA", "CANCELADA"], {
		required_error: "Resolução não informada.",
		invalid_type_error: "Tipo inválido para a resolução.",
	}),
	descricao: z.string({ invalid_type_error: "Tipo inválido para a nota." }).optional().nullable(),
});
export type TResolveInteractionInput = z.infer<typeof ResolveInteractionInputSchema>;

async function resolveInteraction({ input, session }: { input: TResolveInteractionInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const updated = await resolvePlannedInteraction({
		organizacaoId,
		interactionId: input.id,
		resolution: input.resolution,
		descricao: input.descricao,
	});

	return {
		data: { updatedId: updated?.id ?? input.id },
		message: input.resolution === "REALIZADA" ? "Follow-up marcado como realizado." : "Follow-up cancelado.",
	};
}
export type TResolveInteractionOutput = Awaited<ReturnType<typeof resolveInteraction>>;

async function resolveInteractionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canEditClients(session.membership.permissoes)) throw new createHttpError.Forbidden(INTERACTION_WRITE_FORBIDDEN_MESSAGE);

	const body = await request.json();
	const input = ResolveInteractionInputSchema.parse(body);
	const result = await resolveInteraction({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getInteractionsRoute });
export const POST = appApiHandler({ POST: createInteractionRoute });
export const PATCH = appApiHandler({ PATCH: resolveInteractionRoute });

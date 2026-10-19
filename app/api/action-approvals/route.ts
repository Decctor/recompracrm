import { appApiHandler } from "@/lib/app-api";
import { getActionApprovalExpirationDate, getActionApprovalHandler } from "@/lib/action-approvals";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { ActionApprovalPayloadSchema } from "@/schemas/action-approvals";
import { ActionApprovalStatusEnum, ActionApprovalTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { actionApprovalRequests, users } from "@/services/drizzle/schema";
import { and, eq, exists, gte, ilike, lte, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

/**
 * Expiração lazy (sem job): solicitações PENDENTES vencidas viram EXPIRADA na leitura.
 * Aprovações vencidas são tratadas como inválidas na validação do consumo.
 */
async function expireStaleActionApprovals(orgId: string) {
	await db
		.update(actionApprovalRequests)
		.set({ status: "EXPIRADA" })
		.where(
			and(
				eq(actionApprovalRequests.organizacaoId, orgId),
				eq(actionApprovalRequests.status, "PENDENTE"),
				lt(actionApprovalRequests.dataExpiracao, new Date()),
			),
		);
}

// ============================================================================
// POST — Criar solicitação de aprovação
// ============================================================================

const CreateActionApprovalInputSchema = z.object({
	tipo: ActionApprovalTypeEnum,
	payload: ActionApprovalPayloadSchema,
});
export type TCreateActionApprovalInput = z.infer<typeof CreateActionApprovalInputSchema>;

async function createActionApproval({ input, session }: { input: TCreateActionApprovalInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;
	if (input.tipo !== input.payload.tipo) throw new createHttpError.BadRequest("O tipo da solicitação não corresponde ao payload.");

	const handler = getActionApprovalHandler(input.tipo);
	handler.validarCriacao({ payload: input.payload, permissoes: session.membership!.permissoes });

	const [request] = await db
		.insert(actionApprovalRequests)
		.values({
			organizacaoId: orgId,
			tipo: input.tipo,
			status: "PENDENTE",
			payload: input.payload,
			resumo: handler.montarResumo(input.payload),
			solicitanteId: session.user.id,
			dataExpiracao: getActionApprovalExpirationDate(),
		})
		.returning();
	if (!request) throw new createHttpError.InternalServerError("Erro ao criar a solicitação de aprovação.");

	return {
		data: { request },
		message: "Solicitação de aprovação criada com sucesso.",
	};
}
export type TCreateActionApprovalOutput = Awaited<ReturnType<typeof createActionApproval>>;

// ============================================================================
// GET — byId (solicitante acompanha a própria solicitação) / default (fila por status)
// ============================================================================

const GetActionApprovalsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo não válido para o ID da solicitação." }).optional().nullable(),
	status: ActionApprovalStatusEnum.optional().nullable(),
	scope: z.enum(["QUEUE", "HISTORY"]).optional().default("QUEUE"),
	search: z
		.string()
		.optional()
		.nullable()
		.transform((value) => value?.trim() || null),
	periodAfter: z
		.string()
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	periodBefore: z
		.string()
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
});
export type TGetActionApprovalsInput = z.infer<typeof GetActionApprovalsInputSchema>;

async function getActionApprovals({ input, session }: { input: TGetActionApprovalsInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;
	await expireStaleActionApprovals(orgId);

	if (input.id) {
		const request = await db.query.actionApprovalRequests.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.id as string), eq(fields.organizacaoId, orgId)),
			with: {
				solicitante: { columns: { id: true, nome: true } },
				solicitanteDispositivo: { columns: { id: true, nome: true } },
				decididaPor: { columns: { id: true, nome: true } },
			},
		});
		if (!request) throw new createHttpError.NotFound("Solicitação de aprovação não encontrada.");
		return { data: { byId: request, default: null }, message: "Solicitação encontrada." };
	}

	// Fila: quem não pode decidir nenhum tipo vê somente as próprias solicitações.
	const canDecideAny = Object.values(ActionApprovalTypeEnum.Values).some((tipo) =>
		getActionApprovalHandler(tipo).autorizaDecisao(session.membership!.permissoes),
	);
	const status = input.status ?? "PENDENTE";
	const solicitante = alias(users, "action_approval_solicitante_search");
	const decisor = alias(users, "action_approval_decisor_search");
	const searchPattern = input.search ? `%${input.search}%` : null;
	const requests = await db.query.actionApprovalRequests.findMany({
		where: (fields) => {
			const filters = [
				eq(fields.organizacaoId, orgId),
				input.scope === "HISTORY" ? ne(fields.status, "PENDENTE") : eq(fields.status, status),
				...(searchPattern
					? [
							or(
								ilike(fields.tipo, searchPattern),
								sql`${fields.status}::text ILIKE ${searchPattern}`,
								sql`${fields.resumo}::text ILIKE ${searchPattern}`,
								ilike(fields.motivoDecisao, searchPattern),
								exists(
									db
										.select({ id: solicitante.id })
										.from(solicitante)
										.where(and(eq(solicitante.id, fields.solicitanteId), ilike(solicitante.nome, searchPattern))),
								),
								exists(
									db
										.select({ id: decisor.id })
										.from(decisor)
										.where(and(eq(decisor.id, fields.decididaPorId), ilike(decisor.nome, searchPattern))),
								),
							)!,
						]
					: []),
				...(input.periodAfter ? [gte(fields.dataInsercao, input.periodAfter)] : []),
				...(input.periodBefore ? [lte(fields.dataInsercao, input.periodBefore)] : []),
				...(canDecideAny ? [] : [eq(fields.solicitanteId, session.user.id)]),
			];
			return and(...filters);
		},
		with: {
			solicitante: { columns: { id: true, nome: true } },
			solicitanteDispositivo: { columns: { id: true, nome: true } },
			decididaPor: { columns: { id: true, nome: true } },
		},
		orderBy: (fields, { desc }) => [desc(fields.dataInsercao)],
		limit: input.scope === "HISTORY" ? 100 : 50,
	});

	return { data: { byId: null, default: requests }, message: "Solicitações encontradas." };
}
export type TGetActionApprovalsOutput = Awaited<ReturnType<typeof getActionApprovals>>;

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

async function createActionApprovalRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const body = await request.json();
	const input = CreateActionApprovalInputSchema.parse(body);
	const result = await createActionApproval({ input, session });
	return NextResponse.json(result);
}

async function getActionApprovalsRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const { searchParams } = new URL(request.url);
	const input = GetActionApprovalsInputSchema.parse({
		id: searchParams.get("id"),
		status: searchParams.get("status"),
		scope: searchParams.get("scope") ?? undefined,
		search: searchParams.get("search"),
		periodAfter: searchParams.get("periodAfter"),
		periodBefore: searchParams.get("periodBefore"),
	});
	const result = await getActionApprovals({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: createActionApprovalRoute });
export const GET = appApiHandler({ GET: getActionApprovalsRoute });

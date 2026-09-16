import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import {
	loadSaleClientReassignmentContext,
	processSaleClientReassignmentInTransaction,
	processSaleClientReassignmentPostCommit,
} from "@/lib/sales/sale-processing/process-sale-client-reassignment";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

const GetSaleClientReassignmentInputSchema = z.object({
	saleId: z.string({ required_error: "ID da venda não informado.", invalid_type_error: "Tipo não válido para ID da venda." }),
	// Candidato a novo cliente: só afeta o acúmulo previsto na prévia.
	clienteId: z
		.string({ invalid_type_error: "Tipo não válido para ID do cliente." })
		.optional()
		.nullable()
		.transform((value) => (value ? value : null)),
});
export type TGetSaleClientReassignmentInput = z.infer<typeof GetSaleClientReassignmentInputSchema>;

const ReassignSaleClientInputSchema = z.object({
	saleId: z.string({ required_error: "ID da venda não informado.", invalid_type_error: "Tipo não válido para ID da venda." }),
	// null = desvincular a venda do cliente atual.
	clienteId: z.string({ invalid_type_error: "Tipo não válido para ID do cliente." }).nullable(),
	confirmacoes: z
		.object({
			fiscal: z.boolean({ invalid_type_error: "Tipo não válido para a confirmação fiscal." }).default(false),
		})
		.default({ fiscal: false }),
});
export type TReassignSaleClientInput = z.infer<typeof ReassignSaleClientInputSchema>;

// ============================================================================
// SERVICES
// ============================================================================

async function getSaleClientReassignment({ input, session }: { input: TGetSaleClientReassignmentInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;
	const context = await loadSaleClientReassignmentContext({ organizationId: orgId, saleId: input.saleId, nextClientId: input.clienteId });
	return { data: context, message: "Prévia da alteração de cliente carregada." };
}
export type TGetSaleClientReassignmentOutput = Awaited<ReturnType<typeof getSaleClientReassignment>>;

async function reassignSaleClient({ input, session }: { input: TReassignSaleClientInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;
	const organization = await db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, orgId) });
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const result = await db.transaction((tx) =>
		processSaleClientReassignmentInTransaction({
			tx,
			input: {
				organization,
				saleId: input.saleId,
				saleAuthorId: session.user.id,
				nextClientId: input.clienteId,
				fiscalConfirmed: input.confirmacoes.fiscal,
			},
		}),
	);

	const fiscal = await processSaleClientReassignmentPostCommit({
		organization,
		saleId: input.saleId,
		saleAuthorId: session.user.id,
		clientIds: [result.clienteAnteriorId, result.clienteNovoId],
	});

	return {
		data: { ...result, fiscal },
		message: input.clienteId ? "Cliente da venda atualizado com sucesso." : "Venda desvinculada do cliente com sucesso.",
	};
}
export type TReassignSaleClientOutput = Awaited<ReturnType<typeof reassignSaleClient>>;

// ============================================================================
// HANDLERS
// ============================================================================

function getSessionWithEditPermission(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!session.membership.permissoes.vendas.editar) throw new createHttpError.Forbidden("Você não possui permissão para editar vendas.");
	return session;
}

async function getSaleClientReassignmentRoute(request: NextRequest) {
	const session = getSessionWithEditPermission(await getCurrentSessionUncached());
	const input = GetSaleClientReassignmentInputSchema.parse({
		saleId: request.nextUrl.searchParams.get("saleId"),
		clienteId: request.nextUrl.searchParams.get("clienteId"),
	});
	const result = await getSaleClientReassignment({ input, session });
	return NextResponse.json(result);
}

async function reassignSaleClientRoute(request: NextRequest) {
	const session = getSessionWithEditPermission(await getCurrentSessionUncached());
	const body = await request.json();
	const input = ReassignSaleClientInputSchema.parse(body);
	const result = await reassignSaleClient({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSaleClientReassignmentRoute });
export const PATCH = appApiHandler({ PATCH: reassignSaleClientRoute });

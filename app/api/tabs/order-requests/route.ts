import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { approveTabOrderRequest } from "@/lib/tabs";
import { TabOrderRequestStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { tabOrderRequests } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// Inbox de solicitacoes de pedido via QR (aprovacao do operador).
// A aprovacao vive em lib/tabs/approve-tab-order-request.ts, compartilhada
// com o modo DIRETO (aprovacao automatica na rota publica).
// ============================================================================

const GetTabOrderRequestsInputSchema = z.object({
	status: z
		.string({ invalid_type_error: "Tipo nao valido para status." })
		.optional()
		.nullable()
		.transform((value) => (value ? TabOrderRequestStatusEnum.array().parse(value.split(",")) : ["PENDENTE" as const])),
});
export type TGetTabOrderRequestsInput = z.infer<typeof GetTabOrderRequestsInputSchema>;

const ApprovalDestinationSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("EXISTING"),
		tabId: z.string({ required_error: "ID da conta nao informado.", invalid_type_error: "Tipo nao valido para ID da conta." }),
	}),
	z.object({
		type: z.literal("NEW"),
		code: z
			.string({ required_error: "Codigo da comanda nao informado.", invalid_type_error: "Tipo nao valido para codigo da comanda." })
			.trim()
			.min(1)
			.max(100),
	}),
]);

const DecideTabOrderRequestInputSchema = z.discriminatedUnion("action", [
	z.object({
		requestId: z.string({ required_error: "ID da solicitacao nao informado." }),
		action: z.literal("APPROVE"),
		destination: ApprovalDestinationSchema.optional().nullable(),
	}),
	z.object({
		requestId: z.string({ required_error: "ID da solicitacao nao informado." }),
		action: z.literal("REJECT"),
		rejectionReason: z.string({ invalid_type_error: "Tipo nao valido para motivo." }).optional().nullable(),
	}),
]);
export type TDecideTabOrderRequestInput = z.infer<typeof DecideTabOrderRequestInputSchema>;

// ============================================================================
// SERVICES
// ============================================================================

async function getTabOrderRequests({ input, orgId }: { input: TGetTabOrderRequestsInput; orgId: string }) {
	const requests = await db.query.tabOrderRequests.findMany({
		where: and(eq(tabOrderRequests.organizacaoId, orgId), inArray(tabOrderRequests.status, input.status)),
		with: {
			servicePoint: { columns: { id: true, rotulo: true } },
			tab: { columns: { id: true, codigo: true, status: true } },
		},
		orderBy: (fields, { asc }) => asc(fields.dataInsercao),
	});

	return {
		data: { requests },
		message: "Solicitacoes carregadas com sucesso.",
	};
}
export type TGetTabOrderRequestsOutput = Awaited<ReturnType<typeof getTabOrderRequests>>;
export type TTabOrderRequestListItem = TGetTabOrderRequestsOutput["data"]["requests"][number];

async function decideTabOrderRequest({ input, session }: { input: TDecideTabOrderRequestInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	if (input.action === "REJECT") {
		const request = await db.query.tabOrderRequests.findFirst({
			where: and(eq(tabOrderRequests.id, input.requestId), eq(tabOrderRequests.organizacaoId, orgId)),
			columns: { id: true },
		});
		if (!request) throw new createHttpError.NotFound("Solicitacao nao encontrada.");
		const rejected = await db
			.update(tabOrderRequests)
			.set({ status: "REJEITADA", motivoRejeicao: input.rejectionReason ?? null, operadorAprovadorId: session.user.id })
			.where(and(eq(tabOrderRequests.id, request.id), eq(tabOrderRequests.status, "PENDENTE")))
			.returning({ id: tabOrderRequests.id });
		if (rejected.length === 0) throw new createHttpError.Conflict("A solicitacao ja foi processada por outra operacao.");
		return { data: { requestId: request.id, status: "REJEITADA" as const, tabOrderId: null }, message: "Solicitacao rejeitada." };
	}

	// APROVAR — mesmo servico da aprovacao automatica (modo DIRETO), com o operador como ator.
	const approved = await approveTabOrderRequest({
		orgId,
		requestId: input.requestId,
		operatorId: session.user.id,
		destination: input.destination ?? null,
	});
	return {
		data: { requestId: approved.requestId, status: approved.status, tabOrderId: approved.tabOrderId },
		message: `Pedido ${approved.tabOrderNumero} lancado a partir da solicitacao.`,
	};
}
export type TDecideTabOrderRequestOutput = Awaited<ReturnType<typeof decideTabOrderRequest>>;

// ============================================================================
// HANDLERS
// ============================================================================

async function getTabOrderRequestsRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const { searchParams } = new URL(request.url);
	const input = GetTabOrderRequestsInputSchema.parse({ status: searchParams.get("status") });
	const result = await getTabOrderRequests({ input, orgId: session.membership!.organizacao.id });
	return NextResponse.json(result);
}

async function decideTabOrderRequestRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const body = await request.json();
	const input = DecideTabOrderRequestInputSchema.parse(body);
	const result = await decideTabOrderRequest({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getTabOrderRequestsRoute });
export const POST = appApiHandler({ POST: decideTabOrderRequestRoute });

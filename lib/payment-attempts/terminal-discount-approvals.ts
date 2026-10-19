import { getActionApprovalExpirationDate, getActionApprovalHandler, isActionApprovalExpired } from "@/lib/action-approvals";
import { resolveSaleDiscountAuthority } from "@/lib/sales/sale-discount-authorization";
import type { TVendaDescontoApprovalPayload } from "@/schemas/action-approvals";
import { db } from "@/services/drizzle";
import { type TActionApprovalRequestEntity, actionApprovalRequests, sellers } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { PaymentTerminalError } from "./errors";
import { buildTerminalCartItems } from "./terminal-benefits";
import type { TTerminalSaleItemInput } from "./terminal-cart-item";
import { roundCents } from "./terminal-cart-item";
import { resolveTerminalDiscount, terminalDiscountNeedsApproval, toTerminalDiscountLimit } from "./terminal-discount-policy";

// Aprovação remota de desconto pedida pela maquininha. Mesmo primitivo do PDV web
// (`action_approval_requests`, tipo VENDA_DESCONTO, fila em /dashboard): o gestor decide na
// plataforma e o terminal acompanha por consulta. O solicitante é o dispositivo
// (`solicitanteDispositivoId`), e só ele consome a aprovação. Base e desconto são calculados aqui,
// sobre os itens precificados pelo servidor — nunca com valores do aparelho.

export type TTerminalDiscountApprovalInput = {
	vendedorId?: string | null;
	itens: TTerminalSaleItemInput[];
	descontosTotal: number;
};

export function buildTerminalDiscountApprovalView(
	request: TActionApprovalRequestEntity & { decididaPor?: { nome: string } | null },
	now: Date = new Date(),
) {
	if (request.payload.tipo !== "VENDA_DESCONTO") throw new createHttpError.BadRequest("A solicitação não é de desconto.");
	// Pendente ou aprovada depois do prazo já não serve: o app pede de novo.
	const expired = (request.status === "PENDENTE" || request.status === "APROVADA") && isActionApprovalExpired(request, now);
	return {
		id: request.id,
		status: expired ? ("EXPIRADA" as const) : request.status,
		vendedorId: request.payload.vendedorId,
		valorBase: request.payload.valorBase,
		descontoSolicitado: request.payload.descontoSolicitado,
		descontoPercentual: request.payload.descontoPercentual,
		decididaPorNome: request.decididaPor?.nome ?? null,
		motivoDecisao: request.motivoDecisao,
		dataExpiracao: request.dataExpiracao,
	};
}
export type TTerminalDiscountApprovalView = ReturnType<typeof buildTerminalDiscountApprovalView>;

/**
 * Pede a aprovação. Desconto dentro do teto do vendedor não precisa dela (`approval: null`); um
 * pedido pendente idêntico deste terminal é devolvido em vez de duplicar a fila.
 */
export async function requestTerminalDiscountApproval({
	organizationId,
	deviceId,
	input,
}: {
	organizationId: string;
	deviceId: string;
	input: TTerminalDiscountApprovalInput;
}) {
	if (input.itens.length === 0) throw new PaymentTerminalError(400, "VALIDATION_ERROR", "Adicione itens antes de pedir desconto.");
	const itens = await buildTerminalCartItems({ organizationId, itens: input.itens });
	const valorBase = roundCents(itens.reduce((sum, item) => sum + item.valorTotalBruto, 0));
	const itemsTotal = roundCents(itens.reduce((sum, item) => sum + item.valorTotalLiquido, 0));
	const descontoSolicitado = resolveTerminalDiscount({ descontosTotal: input.descontosTotal, itemsTotal });
	if (descontoSolicitado <= 0) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "Informe o desconto antes de pedir aprovação.");

	const seller = input.vendedorId
		? await db.query.sellers.findFirst({
				where: and(eq(sellers.id, input.vendedorId), eq(sellers.organizacaoId, organizationId)),
				columns: { id: true },
			})
		: null;
	if (input.vendedorId && !seller) throw new PaymentTerminalError(404, "NOT_FOUND", "Vendedor não encontrado nesta organização.");
	const vendedorId = seller?.id ?? null;

	const authority = await resolveSaleDiscountAuthority({ orgId: organizationId, session: null, vendedorId });
	if (!terminalDiscountNeedsApproval({ authority, valorBase, descontoTotal: descontoSolicitado })) {
		return { data: { approval: null }, message: "Desconto dentro do limite: não precisa de aprovação." };
	}

	const pending = await db.query.actionApprovalRequests.findMany({
		where: (fields, { and, eq }) =>
			and(
				eq(fields.organizacaoId, organizationId),
				eq(fields.solicitanteDispositivoId, deviceId),
				eq(fields.status, "PENDENTE"),
				eq(fields.tipo, "VENDA_DESCONTO"),
			),
		orderBy: (fields, { desc }) => [desc(fields.dataInsercao)],
		limit: 10,
	});
	const same = pending.find(
		(request) =>
			!isActionApprovalExpired(request) &&
			request.payload.tipo === "VENDA_DESCONTO" &&
			(request.payload.vendedorId ?? null) === vendedorId &&
			Math.abs(request.payload.valorBase - valorBase) <= 0.01 &&
			Math.abs(request.payload.descontoSolicitado - descontoSolicitado) <= 0.01,
	);
	if (same) return { data: { approval: buildTerminalDiscountApprovalView(same) }, message: "Pedido de aprovação já enviado." };

	const payload: TVendaDescontoApprovalPayload = {
		tipo: "VENDA_DESCONTO",
		vendedorId,
		valorBase,
		descontoSolicitado,
		descontoPercentual: valorBase > 0 ? (descontoSolicitado / valorBase) * 100 : 0,
		// Snapshot do teto avaliado (do vendedor, ou zero do dispositivo) para a auditoria da fila.
		limiteSolicitante: toTerminalDiscountLimit(authority),
	};
	const [request] = await db
		.insert(actionApprovalRequests)
		.values({
			organizacaoId: organizationId,
			tipo: "VENDA_DESCONTO",
			status: "PENDENTE",
			payload,
			resumo: getActionApprovalHandler("VENDA_DESCONTO").montarResumo(payload),
			solicitanteId: null,
			solicitanteDispositivoId: deviceId,
			dataExpiracao: getActionApprovalExpirationDate(),
		})
		.returning();
	if (!request) throw new createHttpError.InternalServerError("Erro ao criar a solicitação de aprovação.");
	return { data: { approval: buildTerminalDiscountApprovalView(request) }, message: "Pedido enviado ao gestor." };
}
export type TRequestTerminalDiscountApprovalOutput = Awaited<ReturnType<typeof requestTerminalDiscountApproval>>;

async function findDeviceApproval({ organizationId, deviceId, approvalId }: { organizationId: string; deviceId: string; approvalId: string }) {
	const request = await db.query.actionApprovalRequests.findFirst({
		where: (fields, { and, eq }) =>
			and(eq(fields.id, approvalId), eq(fields.organizacaoId, organizationId), eq(fields.solicitanteDispositivoId, deviceId)),
		with: { decididaPor: { columns: { nome: true } } },
	});
	if (!request) throw new PaymentTerminalError(404, "NOT_FOUND", "Pedido de aprovação não encontrado para este terminal.");
	return request;
}

/** Acompanhamento do pedido (o app consulta a cada poucos segundos enquanto espera). */
export async function getTerminalDiscountApproval(params: { organizationId: string; deviceId: string; approvalId: string }) {
	const request = await findDeviceApproval(params);
	if (request.status === "PENDENTE" && isActionApprovalExpired(request)) {
		// Expiração preguiçosa, como na fila da plataforma.
		await db
			.update(actionApprovalRequests)
			.set({ status: "EXPIRADA" })
			.where(and(eq(actionApprovalRequests.id, request.id), eq(actionApprovalRequests.status, "PENDENTE")));
	}
	return { data: { approval: buildTerminalDiscountApprovalView(request) }, message: "Pedido de aprovação carregado." };
}
export type TGetTerminalDiscountApprovalOutput = Awaited<ReturnType<typeof getTerminalDiscountApproval>>;

/** O operador desistiu (tirou o desconto, mudou a venda): o pedido sai da fila do gestor. */
export async function cancelTerminalDiscountApproval(params: { organizationId: string; deviceId: string; approvalId: string }) {
	const request = await findDeviceApproval(params);
	if (request.status !== "PENDENTE")
		return { data: { approval: buildTerminalDiscountApprovalView(request) }, message: "O pedido já não estava pendente." };
	const [updated] = await db
		.update(actionApprovalRequests)
		.set({ status: "CANCELADA", dataDecisao: new Date() })
		.where(and(eq(actionApprovalRequests.id, request.id), eq(actionApprovalRequests.status, "PENDENTE")))
		.returning();
	return {
		data: { approval: buildTerminalDiscountApprovalView({ ...(updated ?? request), decididaPor: request.decididaPor }) },
		message: updated ? "Pedido cancelado." : "O pedido já foi decidido.",
	};
}
export type TCancelTerminalDiscountApprovalOutput = Awaited<ReturnType<typeof cancelTerminalDiscountApproval>>;

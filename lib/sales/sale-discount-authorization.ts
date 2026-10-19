import { isActionApprovalExpired } from "@/lib/action-approvals";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { DEVICE_DISCOUNT_AUTHORITY, evaluateDiscount, resolveDiscountAuthority, type TDiscountAuthority } from "@/lib/permissions/discounts";
import { SALE_PRICING_CENT_TOLERANCE, saleValuesDiverge } from "@/lib/sales/sale-pricing-validation";
import { type DBTransaction, db } from "@/services/drizzle";
import { actionApprovalRequests } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";

/**
 * Trava permissionada de desconto por venda (espelho do desenho de `resolveSaleFiscalEmissionOverride`).
 * A identidade avaliada é o VENDEDOR da venda (`vendedorId` → membership via `usuarioVendedorId`),
 * suportando terminal compartilhado; sem vendedor com membership vinculada, cai para a membership
 * da sessão. Nunca confie no cliente: valores e permissões vêm do banco/sessão.
 */

type TSaleDiscountComputationInput = {
	itens: { valorTotalBruto: number; valorDesconto: number }[];
	descontosGerais: number;
	cupomResgate?: { valorDesconto: number; validacaoModo?: string | null } | null;
};

/**
 * Grandeza que o teto limita: desconto agregado sobre o bruto dos itens.
 * Cupom MANUAL entra no cômputo (é desconto livre com outro nome); cashback e cupom AUTOMATICA
 * ficam fora — têm regras próprias validadas pelo motor.
 */
export function computeSaleAggregatedDiscount({ itens, descontosGerais, cupomResgate }: TSaleDiscountComputationInput): {
	valorBase: number;
	descontoTotal: number;
} {
	const valorBase = itens.reduce((sum, item) => sum + item.valorTotalBruto, 0);
	const descontoItens = itens.reduce((sum, item) => sum + item.valorDesconto, 0);
	const cupomManual = cupomResgate && cupomResgate.validacaoModo === "MANUAL" ? cupomResgate.valorDesconto : 0;
	return { valorBase, descontoTotal: Math.max(0, descontosGerais) + descontoItens + cupomManual };
}

/**
 * Resolve a autoridade de desconto da identidade avaliada: o vendedor da venda (via membership) e,
 * na falta dele, a sessão humana. `session` nulo é o ator dispositivo (DEVICE_DISCOUNT_AUTHORITY).
 */
export async function resolveSaleDiscountAuthority({
	orgId,
	session,
	vendedorId,
}: {
	orgId: string;
	session: TAuthUserSession | null;
	vendedorId: string | null | undefined;
}): Promise<TDiscountAuthority> {
	if (vendedorId) {
		const membership = await db.query.organizationMembers.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, orgId), eq(fields.usuarioVendedorId, vendedorId)),
			columns: { permissoes: true },
		});
		if (membership) return resolveDiscountAuthority(membership.permissoes);
	}
	if (!session) return DEVICE_DISCOUNT_AUTHORITY;
	return resolveDiscountAuthority(session.membership!.permissoes);
}

/**
 * Autoriza o desconto agregado da venda. Dentro do teto ⇒ retorna null (nada a consumir).
 * Acima do teto ⇒ exige uma aprovação VENDA_DESCONTO válida (mesma org, APROVADA, não expirada,
 * mesmo vendedor, desconto dentro do aprovado e valorBase dentro da tolerância) e retorna seu id
 * para consumo one-shot na mesma transação da venda via `consumeSaleDiscountApproval`.
 */
export async function authorizeSaleDiscount({
	orgId,
	session,
	deviceId = null,
	vendedorId,
	valorBase,
	descontoTotal,
	aprovacaoId,
}: {
	orgId: string;
	session: TAuthUserSession | null;
	/** Ator dispositivo (a maquininha): só consome aprovação pedida por ele mesmo. */
	deviceId?: string | null;
	vendedorId: string | null | undefined;
	valorBase: number;
	descontoTotal: number;
	aprovacaoId: string | null | undefined;
}): Promise<string | null> {
	const authority = await resolveSaleDiscountAuthority({ orgId, session, vendedorId });
	if (evaluateDiscount({ authority, valorBase, descontoTotal }) === "PERMITIDO") return null;

	if (!aprovacaoId) {
		throw new createHttpError.Forbidden("O desconto aplicado excede o limite do operador. Solicite a aprovação de um gestor para finalizar a venda.");
	}

	const approval = await db.query.actionApprovalRequests.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, aprovacaoId), eq(fields.organizacaoId, orgId)),
	});
	if (!approval || approval.tipo !== "VENDA_DESCONTO" || approval.payload.tipo !== "VENDA_DESCONTO") {
		throw new createHttpError.Forbidden("Aprovação de desconto não encontrada para esta organização.");
	}
	// Aprovação pedida pela maquininha vale só para ela; a do PDV web, só para o PDV web.
	if ((approval.solicitanteDispositivoId ?? null) !== (deviceId ?? null)) {
		throw new createHttpError.Forbidden(deviceId ? "A aprovação de desconto foi pedida por outro terminal." : "A aprovação de desconto foi pedida por um terminal.");
	}
	if (approval.status !== "APROVADA") {
		throw new createHttpError.Forbidden("A aprovação de desconto informada não está aprovada ou já foi utilizada.");
	}
	if (isActionApprovalExpired(approval)) {
		throw new createHttpError.Forbidden("A aprovação de desconto expirou. Solicite uma nova aprovação.");
	}
	if ((approval.payload.vendedorId ?? null) !== (vendedorId ?? null)) {
		throw new createHttpError.Forbidden("A aprovação de desconto pertence a outro vendedor.");
	}
	if (descontoTotal > approval.payload.descontoSolicitado + SALE_PRICING_CENT_TOLERANCE) {
		throw new createHttpError.Forbidden("O desconto aplicado excede o valor aprovado. Solicite uma nova aprovação.");
	}
	if (saleValuesDiverge(valorBase, approval.payload.valorBase)) {
		throw new createHttpError.Forbidden("A venda foi alterada após a aprovação do desconto. Solicite uma nova aprovação.");
	}

	return approval.id;
}

/**
 * Consumo one-shot: carimba a aprovação como CONSUMIDA com a venda que a utilizou, na MESMA
 * transação da venda. O update condicionado a APROVADA impede reuso em outra venda sob corrida.
 */
export async function consumeSaleDiscountApproval({
	tx,
	aprovacaoId,
	vendaId,
}: {
	tx: DBTransaction;
	aprovacaoId: string;
	vendaId: string;
}): Promise<void> {
	const [consumed] = await tx
		.update(actionApprovalRequests)
		.set({ status: "CONSUMIDA", consumo: { vendaId }, dataConsumo: new Date() })
		.where(and(eq(actionApprovalRequests.id, aprovacaoId), eq(actionApprovalRequests.status, "APROVADA")))
		.returning({ id: actionApprovalRequests.id });
	if (!consumed) throw new createHttpError.Conflict("A aprovação de desconto já foi utilizada em outra venda.");
}

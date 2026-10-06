import type { TPaymentInstallmentPartyEnum } from "@/schemas/enums";
import { type DB, type DBTransaction, db } from "@/services/drizzle";
import { type TPaymentAttemptEntity, paymentAttempts } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import { PaymentTerminalError } from "./errors";
import { OPEN_PAYMENT_ATTEMPT_STATUSES, isNewPaymentAttemptAllowed, resolvePaymentAttemptNextAction, toCents } from "./state-machine";

// Projeções da tentativa para a API do terminal (docs/04). Envelope estrutural em inglês
// (`attempt`, `sale`, `command`, `nextAction`); campos das entidades em português.

export type TPaymentAttemptSaleRow = {
	id: string;
	idExterno: string;
	valorTotal: number;
	statusVenda: "ORCAMENTO" | "CONDICIONAL" | "CONFIRMADA" | "CANCELADA" | null;
	cliente: { nome: string } | null;
};

export type TPaymentAttemptWithSale = TPaymentAttemptEntity & { venda: TPaymentAttemptSaleRow };

const SALE_COLUMNS = { id: true, idExterno: true, valorTotal: true, statusVenda: true } as const;

export async function findPaymentAttemptForDevice({
	organizationId,
	deviceId,
	attemptId,
	database = db,
}: {
	organizationId: string;
	deviceId: string;
	attemptId: string;
	database?: DB | DBTransaction;
}): Promise<TPaymentAttemptWithSale> {
	const attempt = await database.query.paymentAttempts.findFirst({
		where: and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.organizacaoId, organizationId), eq(paymentAttempts.dispositivoId, deviceId)),
		with: { venda: { columns: SALE_COLUMNS, with: { cliente: { columns: { nome: true } } } } },
	});
	// Tentativa de outra organização/dispositivo é indistinguível de inexistente para o terminal.
	if (!attempt) {
		throw new PaymentTerminalError(404, "PAYMENT_ATTEMPT_NOT_FOUND", "Cobrança não encontrada ou não atribuída a este terminal.", { attemptId });
	}
	return attempt as TPaymentAttemptWithSale;
}

export async function listOpenPaymentAttemptsForDevice({ organizationId, deviceId }: { organizationId: string; deviceId: string }) {
	const rows = await db.query.paymentAttempts.findMany({
		where: and(
			eq(paymentAttempts.organizacaoId, organizationId),
			eq(paymentAttempts.dispositivoId, deviceId),
			inArray(paymentAttempts.status, [...OPEN_PAYMENT_ATTEMPT_STATUSES]),
		),
		with: { venda: { columns: SALE_COLUMNS, with: { cliente: { columns: { nome: true } } } } },
		orderBy: (fields, { asc }) => [asc(fields.dataInsercao)],
	});
	return rows as TPaymentAttemptWithSale[];
}

export function buildPaymentAttemptView(attempt: TPaymentAttemptEntity) {
	return {
		id: attempt.id,
		status: attempt.status,
		operacao: attempt.operacao,
		provedor: attempt.provedor,
		metodo: attempt.metodo,
		valor: attempt.valor,
		moeda: attempt.moeda,
		totalParcelas: attempt.totalParcelas ?? 1,
		// bigint serializado como string: é o `order_id` que o adapter envia à adquirente.
		ordemProvedorId: attempt.ordemProvedorId === null ? null : String(attempt.ordemProvedorId),
		motivo: attempt.motivoNaoAprovacao,
		novaTentativaPermitida: isNewPaymentAttemptAllowed(attempt.status),
	};
}
export type TPaymentAttemptView = ReturnType<typeof buildPaymentAttemptView>;

export function buildPaymentAttemptSaleView(sale: TPaymentAttemptSaleRow) {
	return {
		id: sale.id,
		identificacao: `Venda #${sale.id.slice(-6).toUpperCase()}`,
		clienteNome: sale.cliente?.nome ?? null,
		total: sale.valorTotal,
		statusVenda: sale.statusVenda,
	};
}

// Comando normalizado: o backend não constrói URI da adquirente — isso pertence ao adapter Android.
export function buildPaymentAttemptCommand(attempt: TPaymentAttemptEntity) {
	return {
		tipo: attempt.operacao,
		provedor: attempt.provedor,
		valorCentavos: toCents(attempt.valor),
		metodo: attempt.metodo,
		totalParcelas: attempt.totalParcelas ?? 1,
		parcelamentoResponsavel: (attempt.parcelamentoResponsavel ?? "LOJISTA") as TPaymentInstallmentPartyEnum,
		ordemProvedorId: attempt.ordemProvedorId === null ? null : String(attempt.ordemProvedorId),
	};
}

export function buildChargeView(attempt: TPaymentAttemptWithSale, now = new Date()) {
	return {
		attempt: buildPaymentAttemptView(attempt),
		sale: buildPaymentAttemptSaleView(attempt.venda),
		command: buildPaymentAttemptCommand(attempt),
		nextAction: resolvePaymentAttemptNextAction({ status: attempt.status, dataInicio: attempt.dataInicio, now }),
		assignedAt: attempt.dataInsercao,
	};
}
export type TChargeView = ReturnType<typeof buildChargeView>;

export function buildAttemptStatusView(attempt: TPaymentAttemptWithSale, now = new Date()) {
	return {
		attempt: buildPaymentAttemptView(attempt),
		sale: buildPaymentAttemptSaleView(attempt.venda),
		nextAction: resolvePaymentAttemptNextAction({ status: attempt.status, dataInicio: attempt.dataInicio, now }),
	};
}
export type TAttemptStatusView = ReturnType<typeof buildAttemptStatusView>;

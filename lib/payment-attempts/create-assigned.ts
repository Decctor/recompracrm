import type { TPaymentAttemptProviderEnum, TPaymentInstallmentPartyEnum, TPaymentMethodEnum } from "@/schemas/enums";
import { type DB, type DBTransaction, db } from "@/services/drizzle";
import { accessClients, accessPrincipals, financialTransactions, paymentAttempts, sales } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import { PAYMENT_TERMINAL_CLIENT_CODE } from "./constants";
import { PaymentTerminalError } from "./errors";
import { recordPaymentAttemptEvent } from "./events";
import { OPEN_PAYMENT_ATTEMPT_STATUSES } from "./state-machine";

// Métodos que o terminal executa no marco 1: débito, crédito à vista e crédito parcelado pelo
// lojista. PIX, voucher e parcelamento pelo emissor ficam fora do MVP (docs/00).
export const PAYMENT_TERMINAL_METHODS = ["CARTAO_CREDITO", "CARTAO_DEBITO"] as const satisfies readonly TPaymentMethodEnum[];

export function isPaymentTerminalMethod(metodo: TPaymentMethodEnum): metodo is (typeof PAYMENT_TERMINAL_METHODS)[number] {
	return (PAYMENT_TERMINAL_METHODS as readonly TPaymentMethodEnum[]).includes(metodo);
}

// Policy do MVP: uma tentativa ativa por venda. Aplicada aqui e na atribuição, não como constraint
// estrutural — split tender futuro não pode ficar bloqueado pelo schema.
export async function findActivePaymentAttemptForSale({
	organizationId,
	saleId,
	database = db,
}: {
	organizationId: string;
	saleId: string;
	database?: DB | DBTransaction;
}) {
	return database.query.paymentAttempts.findFirst({
		where: and(
			eq(paymentAttempts.organizacaoId, organizationId),
			eq(paymentAttempts.vendaId, saleId),
			inArray(paymentAttempts.status, [...OPEN_PAYMENT_ATTEMPT_STATUSES]),
		),
	});
}

// Dispositivo elegível a receber cobranças: principal DISPOSITIVO ativo, da mesma organização,
// instalado pelo cliente nativo do terminal de pagamento. FKs isoladas não garantem nada disso.
export async function findAssignablePaymentTerminalDevice({
	organizationId,
	deviceId,
	database = db,
}: {
	organizationId: string;
	deviceId: string;
	database?: DB | DBTransaction;
}) {
	const [row] = await database
		.select({ id: accessPrincipals.id, nome: accessPrincipals.nome, status: accessPrincipals.status, tipo: accessPrincipals.tipo, clientCode: accessClients.codigo })
		.from(accessPrincipals)
		.innerJoin(accessClients, eq(accessClients.id, accessPrincipals.accessClientId))
		.where(and(eq(accessPrincipals.id, deviceId), eq(accessPrincipals.organizacaoId, organizationId)))
		.limit(1);
	if (!row || row.tipo !== "DISPOSITIVO" || row.clientCode !== PAYMENT_TERMINAL_CLIENT_CODE) return null;
	return row;
}

export type TCreateAssignedPaymentAttemptParams = {
	tx: DBTransaction;
	organizationId: string;
	saleId: string;
	deviceId: string;
	// Transação financeira PENDENTE (dataEfetivacao nula) criada na mesma transação da confirmação.
	financialTransactionId: string;
	provedor?: TPaymentAttemptProviderEnum;
	metodo: TPaymentMethodEnum;
	valor: number;
	totalParcelas?: number | null;
	parcelamentoResponsavel?: TPaymentInstallmentPartyEnum | null;
	// Usuário da plataforma que atribuiu a cobrança — fica nos eventos, não na tentativa.
	actorUserId?: string | null;
};

// Fluxo B: a tentativa nasce CRIADA, dentro da transação que confirma a venda, já atribuída ao
// dispositivo e vinculada à transação pendente. Nenhuma chamada externa acontece aqui; a
// idempotência da criação é herdada da confirmação da venda.
export async function createAssignedPaymentAttempt(params: TCreateAssignedPaymentAttemptParams) {
	const { tx, organizationId, saleId, deviceId, financialTransactionId, actorUserId } = params;
	const provedor = params.provedor ?? "STONE";
	const totalParcelas = params.totalParcelas ?? 1;

	if (!isPaymentTerminalMethod(params.metodo)) {
		throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "O terminal de pagamento só executa cobranças em cartão de débito ou crédito.");
	}
	if (!Number.isFinite(params.valor) || params.valor <= 0) {
		throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "O valor da cobrança no terminal deve ser maior que zero.");
	}
	if (!Number.isInteger(totalParcelas) || totalParcelas < 1 || totalParcelas > 99) {
		throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "Parcelamento inválido para a cobrança no terminal.");
	}
	if (params.metodo === "CARTAO_DEBITO" && totalParcelas !== 1) {
		throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "Cartão de débito não admite parcelamento.");
	}
	if (params.parcelamentoResponsavel === "EMISSOR") {
		throw new PaymentTerminalError(422, "UNSUPPORTED_PAYMENT_OPERATION", "Parcelamento pelo emissor não é suportado neste marco.");
	}

	const device = await findAssignablePaymentTerminalDevice({ organizationId, deviceId, database: tx });
	if (!device) throw new PaymentTerminalError(404, "NOT_FOUND", "Terminal de pagamento não encontrado nesta organização.");
	if (device.status !== "ATIVO") throw new PaymentTerminalError(409, "CONFLICT", `O terminal "${device.nome}" não está ativo.`);

	const sale = await tx.query.sales.findFirst({
		where: and(eq(sales.id, saleId), eq(sales.organizacaoId, organizationId)),
		columns: { id: true, sessaoVendaId: true },
	});
	if (!sale) throw new PaymentTerminalError(404, "NOT_FOUND", "Venda não encontrada.");

	const active = await findActivePaymentAttemptForSale({ organizationId, saleId, database: tx });
	if (active) {
		throw new PaymentTerminalError(409, "ACTIVE_PAYMENT_ATTEMPT_EXISTS", "Esta venda já possui uma cobrança em andamento no terminal.", { attemptId: active.id });
	}

	const transaction = await tx.query.financialTransactions.findFirst({
		where: and(eq(financialTransactions.id, financialTransactionId), eq(financialTransactions.organizacaoId, organizationId)),
		columns: { id: true, valor: true, metodo: true, dataEfetivacao: true, tentativaPagamentoId: true },
	});
	if (!transaction) throw new PaymentTerminalError(404, "NOT_FOUND", "Transação financeira da cobrança não encontrada.");
	if (transaction.dataEfetivacao || transaction.tentativaPagamentoId) {
		throw new PaymentTerminalError(409, "CONFLICT", "A transação financeira desta cobrança já foi efetivada.");
	}
	if (Math.abs(transaction.valor - params.valor) > 0.005 || transaction.metodo !== params.metodo) {
		throw new PaymentTerminalError(422, "PAYMENT_RESULT_MISMATCH", "Valor ou método da cobrança divergem da transação financeira pendente.");
	}

	const [attempt] = await tx
		.insert(paymentAttempts)
		.values({
			organizacaoId: organizationId,
			vendaId: saleId,
			dispositivoId: deviceId,
			sessaoVendaId: sale.sessaoVendaId ?? null,
			operacao: "COBRANCA",
			provedor,
			metodo: params.metodo,
			valor: params.valor,
			moeda: "BRL",
			totalParcelas,
			parcelamentoResponsavel: totalParcelas > 1 ? (params.parcelamentoResponsavel ?? "LOJISTA") : null,
			status: "CRIADA",
			transacaoFinanceiraId: financialTransactionId,
		})
		.returning();

	await recordPaymentAttemptEvent({
		tx,
		organizationId,
		attemptId: attempt.id,
		origem: "PLATAFORMA",
		tipo: "CRIACAO",
		statusAnterior: null,
		statusPosterior: "CRIADA",
		usuarioId: actorUserId ?? null,
		descricao: `Cobrança atribuída ao terminal "${device.nome}".`,
	});

	return attempt;
}

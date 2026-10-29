import createHttpError from "http-errors";
import {
	FinancialAccountConfigurationSchema,
	PaymentReceiptConditionsSchema,
	type TFinancialAccountConfiguration,
	type TPaymentReceiptConditions,
} from "@/schemas/financial";
import type { TPaymentInstallmentBehaviorEnum } from "@/schemas/enums";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TPaymentSplit, TResolvedPaymentSplit } from "./types";

type TMethodConfig = TOrganizationConfiguration["defaults"]["pagamentos"]["metodos"][TPaymentSplit["metodo"]];

// Behavior for a payment with no account rule (no account at all, or an account saved before
// `recebimentos` existed): the pre-feature behavior, so nothing changes until the account says so.
// Migration 0142 backfills existing accounts with this same choice.
function getLegacyInstallmentBehavior(metodo: TPaymentSplit["metodo"]): TPaymentInstallmentBehaviorEnum {
	return metodo === "CARTAO_CREDITO" ? "TRANSACOES_PARCELADAS" : "TRANSACAO_UNICA";
}

/**
 * Server-derived receipt conditions. Nothing the client sends decides the behavior: it comes from the
 * persisted account rule, or — when editing — from the conditions already stored on the original
 * transaction, so changing the account later never rewrites an existing sale.
 */
export function resolvePaymentReceiptConditions({
	payment,
	methodConfig,
	accountConfiguration,
	previousConditions,
}: {
	payment: TPaymentSplit;
	methodConfig: TMethodConfig;
	accountConfiguration: TFinancialAccountConfiguration | null;
	previousConditions?: TPaymentReceiptConditions | null;
}): TResolvedPaymentSplit {
	const valueCents = Math.round(payment.valor * 100);
	if (!Number.isFinite(payment.valor) || valueCents < 1 || Math.abs(payment.valor * 100 - valueCents) > 0.00001 || !Number.isSafeInteger(valueCents)) {
		throw new createHttpError.BadRequest("Valor de pagamento inválido.");
	}

	const installmentsCount = payment.totalParcelas ?? 1;
	if (!Number.isInteger(installmentsCount) || installmentsCount < 1 || (payment.metodo !== "CARTAO_CREDITO" && installmentsCount !== 1)) {
		throw new createHttpError.BadRequest("Quantidade de parcelas inválida para o método de pagamento.");
	}
	// Edits keep the installments already agreed on, even if the organization tightened its limits since.
	if (installmentsCount > 1 && !previousConditions) {
		const { permitido, minParcelas, maxParcelas } = methodConfig.parcelamento;
		if (!permitido || maxParcelas == null || installmentsCount < Math.max(1, minParcelas) || installmentsCount > maxParcelas) {
			throw new createHttpError.BadRequest("Quantidade de parcelas fora dos limites configurados.");
		}
	}
	if (installmentsCount > valueCents) throw new createHttpError.BadRequest("Cada parcela deve ter valor de pelo menos um centavo.");
	if (payment.dispositivoId && payment.metodo !== "CARTAO_CREDITO" && payment.metodo !== "CARTAO_DEBITO") {
		throw new createHttpError.BadRequest("O terminal só aceita pagamentos em cartão.");
	}

	const configuration = accountConfiguration ? FinancialAccountConfigurationSchema.parse(accountConfiguration) : null;
	const rule = configuration?.recebimentos?.metodos.find((entry) => entry.metodo === payment.metodo);
	// An account with an explicit list that leaves the method out refuses it.
	if (configuration?.recebimentos && !rule && !previousConditions) {
		throw new createHttpError.BadRequest("A conta financeira não aceita este método de pagamento.");
	}

	// Integrated terminals confirm the whole charge at once: their installments belong to the acquirer.
	const behavior: TPaymentInstallmentBehaviorEnum = payment.dispositivoId
		? "TRANSACAO_UNICA"
		: (previousConditions?.comportamentoParcelas ?? rule?.comportamentoParcelas ?? getLegacyInstallmentBehavior(payment.metodo));
	const generatesInstallments = behavior === "TRANSACOES_PARCELADAS" && installmentsCount > 1;
	// Future installments can never be settled up front, whatever `efetivacaoTipo` the client sent.
	const isPending =
		generatesInstallments || payment.metodo === "FIADO_NOTA" || payment.metodo === "A_DEFINIR" || payment.efetivacaoTipo === "PENDENTE";
	// Installment due dates are computed from the forecast, so it is mandatory there. A single pending
	// transaction keeps the provider's fallback to "now"; a forecast that was sent must still be a date.
	const hasValidForecast = payment.dataPrevisao != null && Number.isFinite(new Date(payment.dataPrevisao).getTime());
	if (!payment.dispositivoId && isPending && (generatesInstallments || payment.dataPrevisao != null) && !hasValidForecast) {
		throw new createHttpError.BadRequest("Informe uma data de previsão válida para o pagamento pendente.");
	}

	const condicoesRecebimento = PaymentReceiptConditionsSchema.parse({
		versao: 1,
		comportamentoParcelas: behavior,
		intervaloMeses:
			behavior === "TRANSACOES_PARCELADAS" ? (previousConditions?.intervaloMeses ?? methodConfig.parcelamento.intervaloMeses ?? 1) : null,
	});
	return {
		...payment,
		efetivacaoTipo: payment.dispositivoId || isPending ? "PENDENTE" : "IMEDIATA",
		condicoesRecebimento,
	};
}

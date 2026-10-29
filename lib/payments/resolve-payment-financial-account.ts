import { PaymentReceiptConditionsSchema, type TPaymentReceiptConditions } from "@/schemas/financial";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import createHttpError from "http-errors";
import { and, eq, inArray } from "drizzle-orm";
import { db, type DBTransaction } from "@/services/drizzle";
import { financialAccounts } from "@/services/drizzle/schema";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { getOrganizationPaymentMethodsConfig } from "./defaults";
import type { TCheckoutPaymentSplit } from "./schemas";
import { resolvePaymentReceiptConditions } from "./receipt-conditions";
import type { TResolvedPaymentSplit, TPaymentSplit } from "./types";

type TPaymentMethodsConfig = TOrganizationConfiguration["defaults"]["pagamentos"]["metodos"];

type TResolvablePayment = Pick<TCheckoutPaymentSplit, "metodo" | "valor" | "efetivacaoTipo"> &
	Partial<Pick<TCheckoutPaymentSplit, "totalParcelas" | "dataPrevisao" | "observacoes" | "contaFinanceiraId" | "dispositivoId" | "transacaoOrigemId">>;

/** Alguma configuração de método deixa o operador escolher a conta? */
export function hasEditableFinancialAccountMethod(methodsConfig: TPaymentMethodsConfig): boolean {
	return Object.values(methodsConfig).some((methodConfig) => methodConfig?.contaFinanceiraEditavel ?? false);
}

/**
 * Contas ofertáveis ao operador no PDV. Retorna vazio quando nenhum método é editável — o caso de
 * toda organização que não usa a feature, e que assim não paga nenhuma consulta.
 *
 * Carregada no server component da página em vez de `/api/finances/financial-accounts`, que exige
 * permissão do módulo financeiro — permissão que operadores de caixa normalmente não têm.
 */
export async function getSelectableFinancialAccounts({
	organizationId,
	configuracao,
}: {
	organizationId: string;
	configuracao?: Pick<TOrganizationConfiguration, "defaults"> | null;
}): Promise<{ id: string; nome: string }[]> {
	const methodsConfig = getOrganizationPaymentMethodsConfig(configuracao);
	if (!hasEditableFinancialAccountMethod(methodsConfig)) return [];

	return db
		.select({ id: financialAccounts.id, nome: financialAccounts.nome })
		.from(financialAccounts)
		.where(and(eq(financialAccounts.organizacaoId, organizationId), eq(financialAccounts.ativo, true)))
		.orderBy(financialAccounts.nome);
}

/**
 * Núcleo puro da resolução: aplica a precedência "escolha do operador > conta padrão do método"
 * contra um conjunto de contas já sabidas ativas e da organização.
 *
 * Um id enviado com `contaFinanceiraEditavel` desabilitado é erro explícito, não fallback
 * silencioso: cair na conta padrão sem avisar é exatamente o desvio de dinheiro que esta feature
 * existe para evitar.
 */
export function resolvePaymentFinancialAccountsAgainstAccounts({
	methodsConfig,
	payments,
	activeAccountIds,
}: {
	methodsConfig: TPaymentMethodsConfig;
	payments: TResolvablePayment[];
	activeAccountIds: ReadonlySet<string>;
}): TPaymentSplit[] {
	return payments.map((payment) => {
		const methodConfig = methodsConfig[payment.metodo];
		if (!methodConfig?.suportado) {
			throw new createHttpError.BadRequest(`O método de pagamento ${payment.metodo} não está habilitado para esta organização.`);
		}
		if (payment.contaFinanceiraId) {
			if (!(methodConfig.contaFinanceiraEditavel ?? false)) {
				throw new createHttpError.BadRequest(`O método de pagamento ${payment.metodo} não permite escolher a conta financeira.`);
			}
			if (!activeAccountIds.has(payment.contaFinanceiraId)) {
				throw new createHttpError.BadRequest("Conta financeira não encontrada ou inativa para esta organização.");
			}
		}

		const accountId = payment.contaFinanceiraId ?? methodConfig.contaFinanceiraPadraoId ?? null;
		if (accountId && !activeAccountIds.has(accountId)) {
			throw new createHttpError.BadRequest("Conta financeira não encontrada ou inativa para esta organização.");
		}
		return {
			transacaoOrigemId: payment.transacaoOrigemId,
			metodo: payment.metodo,
			valor: payment.valor,
			totalParcelas: payment.totalParcelas ?? undefined,
			efetivacaoTipo: payment.efetivacaoTipo,
			dataPrevisao: payment.dataPrevisao ?? undefined,
			observacoes: payment.observacoes ?? undefined,
			contaFinanceiraId: payment.contaFinanceiraId ?? methodConfig.contaFinanceiraPadraoId ?? null,
			dispositivoId: payment.dispositivoId ?? null,
		};
	});
}

/**
 * Resolve a conta financeira de cada pagamento do checkout, validando os métodos habilitados e as
 * contas escolhidas pelo operador (posse pela organização + conta ativa).
 */
export async function resolvePaymentFinancialAccounts({
	organization,
	payments,
	tx,
	previousTransactions = [],
}: {
	organization: Pick<TOrganizationEntity, "id" | "configuracao">;
	payments: TResolvablePayment[];
	tx?: DBTransaction;
	// Trusted rows loaded by the editing service, scoped to this sale and organization.
	previousTransactions?: { id: string; metodo: TPaymentMethodEnum; contaFinanceiraId: string | null; dataEfetivacao: Date | null; provedorStatus: string | null; tipo: string; condicoesRecebimento: TPaymentReceiptConditions | null; parcela: number | null; totalParcelas: number | null }[];
}): Promise<TResolvedPaymentSplit[]> {
	const methodsConfig = getOrganizationPaymentMethodsConfig(organization.configuracao);
	const accountIds = [...new Set(payments.map((payment) => payment.contaFinanceiraId ?? methodsConfig[payment.metodo]?.contaFinanceiraPadraoId).filter((id): id is string => Boolean(id)))];
	const executor = tx ?? db;
	const accounts = accountIds.length === 0 ? [] : await executor
		.select({ id: financialAccounts.id, configuracao: financialAccounts.configuracao })
		.from(financialAccounts)
		.where(and(eq(financialAccounts.organizacaoId, organization.id), eq(financialAccounts.ativo, true), inArray(financialAccounts.id, accountIds)));
	const resolved = resolvePaymentFinancialAccountsAgainstAccounts({
		methodsConfig, payments, activeAccountIds: new Set(accounts.map((account) => account.id)),
	});
	const usedReferences = new Set<string>();
	return resolved.map((payment) => {
		const previous = payment.transacaoOrigemId ? previousTransactions.find((row) => row.id === payment.transacaoOrigemId) : null;
		if (payment.transacaoOrigemId && (!previous || previous.dataEfetivacao || previous.tipo !== "ENTRADA" || ["CANCELADO", "ESTORNADO"].includes(previous.provedorStatus ?? "") || usedReferences.has(previous.id))) {
			throw new createHttpError.BadRequest("Transação de origem inválida para a edição deste pagamento.");
		}
		if (previous) usedReferences.add(previous.id);
		const sameOperation = previous && previous.metodo === payment.metodo && previous.contaFinanceiraId === payment.contaFinanceiraId;
		const previousConditions = sameOperation ? PaymentReceiptConditionsSchema.parse(previous.condicoesRecebimento ?? {
			versao: 1,
			comportamentoParcelas: previous.parcela != null && (previous.totalParcelas ?? 1) > 1 ? "TRANSACOES_PARCELADAS" : "TRANSACAO_UNICA",
			intervaloMeses: previous.parcela != null && (previous.totalParcelas ?? 1) > 1 ? 1 : null,
		}) : null;
		return resolvePaymentReceiptConditions({
			payment, previousConditions,
			methodConfig: methodsConfig[payment.metodo],
			accountConfiguration: accounts.find((account) => account.id === payment.contaFinanceiraId)?.configuracao ?? null,
		});
	});
}

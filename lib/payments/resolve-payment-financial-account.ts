import createHttpError from "http-errors";
import { and, eq, inArray } from "drizzle-orm";
import { db, type DBTransaction } from "@/services/drizzle";
import { financialAccounts } from "@/services/drizzle/schema";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { getOrganizationPaymentMethodsConfig } from "./defaults";
import type { TCheckoutPaymentSplit } from "./schemas";
import type { TPaymentSplit } from "./types";

type TPaymentMethodsConfig = TOrganizationConfiguration["defaults"]["pagamentos"]["metodos"];

type TResolvablePayment = Pick<TCheckoutPaymentSplit, "metodo" | "valor" | "efetivacaoTipo"> &
	Partial<Pick<TCheckoutPaymentSplit, "totalParcelas" | "dataPrevisao" | "observacoes" | "contaFinanceiraId" | "dispositivoId">>;

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

		return {
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
}: {
	organization: Pick<TOrganizationEntity, "id" | "configuracao">;
	payments: TResolvablePayment[];
	tx?: DBTransaction;
}): Promise<TPaymentSplit[]> {
	const methodsConfig = getOrganizationPaymentMethodsConfig(organization.configuracao);
	const chosenAccountIds = [...new Set(payments.map((payment) => payment.contaFinanceiraId).filter((id): id is string => Boolean(id)))];

	// Sem escolha explícita nenhuma consulta é feita — o caso de toda organização que não usa a feature.
	if (chosenAccountIds.length === 0) {
		return resolvePaymentFinancialAccountsAgainstAccounts({ methodsConfig, payments, activeAccountIds: new Set() });
	}

	const executor = tx ?? db;
	const accounts = await executor
		.select({ id: financialAccounts.id })
		.from(financialAccounts)
		.where(
			and(eq(financialAccounts.organizacaoId, organization.id), eq(financialAccounts.ativo, true), inArray(financialAccounts.id, chosenAccountIds)),
		);

	return resolvePaymentFinancialAccountsAgainstAccounts({
		methodsConfig,
		payments,
		activeAccountIds: new Set(accounts.map((account) => account.id)),
	});
}

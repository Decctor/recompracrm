import type { TGetSalesInput } from "@/app/api/sales/route";
import { appRoutes } from "@/lib/navigation/routes";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { DeliveryModeEnum, PaymentMethodEnum, SaleFinancialDerivedStatusEnum, SaleFiscalDerivedStatusEnum, SaleStatusEnum } from "@/schemas/enums";
import {
	createSerializer,
	parseAsArrayOf,
	parseAsBoolean,
	parseAsFloat,
	parseAsInteger,
	parseAsIsoDateTime,
	parseAsString,
	parseAsStringEnum,
} from "nuqs";

/**
 * Filtros do histórico de vendas como estado na URL (nuqs). Uma única definição serve ao
 * `useQueryStates` da página e ao `buildSalesHistoryHref`, usado por outras telas (ex.: resultados)
 * para abrir o histórico já filtrado. Os nomes das chaves são os do `TGetSalesInput`, então o
 * objeto lido da URL vira o input da API sem mapeamento.
 */
export const salesHistoryParsers = {
	page: parseAsInteger.withDefault(1),
	pageSize: parseAsInteger.withDefault(DEFAULT_PAGE_SIZE),
	search: parseAsString.withDefault(""),
	periodAfter: parseAsIsoDateTime,
	periodBefore: parseAsIsoDateTime,
	sellersIds: parseAsArrayOf(parseAsString).withDefault([]),
	partnersIds: parseAsArrayOf(parseAsString).withDefault([]),
	integrationsIds: parseAsArrayOf(parseAsString).withDefault([]),
	productGroups: parseAsArrayOf(parseAsString).withDefault([]),
	productIds: parseAsArrayOf(parseAsString).withDefault([]),
	totalMin: parseAsFloat,
	totalMax: parseAsFloat,
	financialStatuses: parseAsArrayOf(parseAsStringEnum(SaleFinancialDerivedStatusEnum.options)).withDefault([]),
	fiscalStatuses: parseAsArrayOf(parseAsStringEnum(SaleFiscalDerivedStatusEnum.options)).withDefault([]),
	paymentMethods: parseAsArrayOf(parseAsStringEnum(PaymentMethodEnum.options)).withDefault([]),
	deliveryModes: parseAsArrayOf(parseAsStringEnum(DeliveryModeEnum.options)).withDefault([]),
	saleStatuses: parseAsArrayOf(parseAsStringEnum(SaleStatusEnum.options)).withDefault([]),
	/** `true` só vendas com desconto, `false` só sem; `null` não filtra. */
	hasDiscount: parseAsBoolean,
};

export type TSalesHistoryUrlState = {
	[K in keyof typeof salesHistoryParsers]: NonNullable<ReturnType<(typeof salesHistoryParsers)[K]["parse"]>> extends infer V
		? (typeof salesHistoryParsers)[K] extends { defaultValue: unknown }
			? V
			: V | null
		: never;
};

/** Estado da URL → input da API do histórico (o histórico nunca filtra por cliente). */
export function toSalesHistoryInput(state: TSalesHistoryUrlState): TGetSalesInput {
	return { ...state, clientId: null };
}

const serializeSalesHistory = createSerializer(salesHistoryParsers);

/** Link para o histórico de vendas com filtros ativos; chaves omitidas ficam no padrão. */
export function buildSalesHistoryHref(filters: Partial<TSalesHistoryUrlState>) {
	return serializeSalesHistory(appRoutes.sales.root(), filters);
}

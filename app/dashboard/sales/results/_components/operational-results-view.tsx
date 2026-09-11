"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { StatEmptyState } from "@/components/SalesStats/StatEmptyState";
import { getErrorMessage } from "@/lib/errors";
import { useSalesResults } from "@/lib/queries/sales-results";
import dayjs from "dayjs";
import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { parseAsArrayOf, parseAsIsoDateTime, parseAsString, useQueryStates } from "nuqs";
import { DeliveryModesBlock } from "./delivery-modes-block";
import { FiscalHealthBlock } from "./fiscal-health-block";
import { PaymentMethodsBlock } from "./payment-methods-block";
import { ResultsFilters } from "./results-filters";
import { SellersBlock } from "./sellers-block";
import { SummaryBlock } from "./summary-block";

type OperationalResultsViewProps = {
	/** Membro com escopo de resultados enxerga só os próprios vendedores; o filtro some e o servidor aplica o escopo. */
	hasResultsScope: boolean;
	canViewSensitive: boolean;
};

// Período padrão: hoje. A pergunta que esta página responde primeiro é "como foi o dia".
const defaultAfter = dayjs().startOf("day").toDate();
const defaultBefore = dayjs().endOf("day").toDate();

/**
 * Visão operacional (ERP): recebimentos por método, modalidade, vendedor e emissão fiscal do período.
 * A API `/api/sales/results` exige o módulo de ERP — quem monta esta view só a renderiza com acesso.
 */
export function OperationalResultsView({ hasResultsScope, canViewSensitive }: OperationalResultsViewProps) {
	const [params, setParams] = useQueryStates(
		{
			after: parseAsIsoDateTime.withDefault(defaultAfter),
			before: parseAsIsoDateTime.withDefault(defaultBefore),
			sellersIds: parseAsArrayOf(parseAsString).withDefault([]),
			channels: parseAsArrayOf(parseAsString).withDefault([]),
			excludedFinancialAccountIds: parseAsArrayOf(parseAsString).withDefault([]),
		},
		{ history: "replace" },
	);

	const { data, isLoading, isError, error } = useSalesResults(params);
	// Recorte do relatório levado para o histórico ao clicar num cartão. Canal não existe lá.
	const historyFilters = {
		periodAfter: params.after,
		periodBefore: params.before,
		sellersIds: params.sellersIds,
		saleStatuses: ["CONFIRMADA" as const],
	};

	const hasSales = (data?.resumo.qtdeVendas.atual ?? 0) > 0 || (data?.resumo.canceladas.qtde ?? 0) > 0;

	return (
		<div className="flex w-full flex-col gap-4">
			<ResultsFilters
				params={params}
				updateParams={(next) => setParams(next)}
				channelOptions={data?.filterOptions.canais ?? []}
				financialAccountOptions={data?.filterOptions.contasFinanceiras ?? []}
				showSellersFilter={!hasResultsScope}
			/>

			{isLoading ? (
				<LoadingComponent />
			) : isError ? (
				<ErrorComponent msg={getErrorMessage(error)} />
			) : !data ? null : !hasSales ? (
				<StatEmptyState
					icon={ChartNoAxesColumnIncreasing}
					title="Nenhuma venda no período"
					description="Ajuste o período ou os filtros para ver os resultados."
				/>
			) : (
				<>
					<SummaryBlock resumo={data.resumo} canViewSensitive={canViewSensitive} historyFilters={historyFilters} />
					<div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-2">
						<PaymentMethodsBlock porMetodo={data.porMetodo} faturamento={data.resumo.faturamento.atual ?? 0} historyFilters={historyFilters} />
						<FiscalHealthBlock fiscal={data.fiscal} qtdeVendas={data.resumo.qtdeVendas.atual ?? 0} historyFilters={historyFilters} />
					</div>
					<DeliveryModesBlock porModalidade={data.porModalidade} canViewSensitive={canViewSensitive} historyFilters={historyFilters} />
					<SellersBlock porVendedor={data.porVendedor} canViewSensitive={canViewSensitive} historyFilters={historyFilters} />
				</>
			)}
		</div>
	);
}

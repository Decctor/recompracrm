"use client";
import GroupedStatsBlock from "@/components/SalesStats/Blocks/GroupedStatsBlock";
import OverallStatsBlock from "@/components/SalesStats/Blocks/OverallStatsBlock";
import SalesGraphBlock from "@/components/SalesStats/Blocks/SalesGraphBlock";
import { CommercialInlineFilters } from "@/components/Stats/CommercialInlineFilters";
import { ComparisonPeriodFilter } from "@/components/Stats/ComparisonPeriodFilter";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { DEFAULT_COMPARISON_SELECTION, type TComparisonSelection, resolveComparisonPeriod } from "@/lib/period-presets";
import type { TSaleStatsGeneralQueryParams } from "@/schemas/query-params-utils";
import dayjs from "dayjs";
import { useState } from "react";

const initialPeriodStart = dayjs().startOf("month").toISOString();
const initialPeriodEnd = dayjs().endOf("day").toISOString();

function createDefaultParams(initialSellersIds: string[]): TSaleStatsGeneralQueryParams {
	return {
		period: { after: initialPeriodStart, before: initialPeriodEnd },
		total: {},
		integrationsIds: [],
		sellersIds: initialSellersIds,
		clientRFMTitles: [],
		excludedSalesIds: [],
	};
}

type CommercialStatsSectionProps = {
	user: TAuthUserSession["user"];
	userOrg: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	membership: NonNullable<TAuthUserSession["membership"]>;
	/** Ids de vendedor já resolvidos a partir de `resultados.escopo` (que guarda ids de usuário). */
	scopeSellersIds: string[] | null;
};

export function CommercialStatsSection({ user, userOrg, membership, scopeSellersIds }: CommercialStatsSectionProps) {
	const initialSellersIds = scopeSellersIds ?? [];
	const [generalQueryParams, setGeneralQueryParams] = useState<TSaleStatsGeneralQueryParams>(createDefaultParams(initialSellersIds));

	const [comparison, setComparison] = useState<TComparisonSelection>(DEFAULT_COMPARISON_SELECTION);

	function updateGeneralQueryParams(newParams: Partial<TSaleStatsGeneralQueryParams>) {
		setGeneralQueryParams((prev) => ({ ...prev, ...newParams }));
	}

	// A comparação vive fora de `generalQueryParams`: só os cards a usam, e trocá-la não deve
	// recarregar o gráfico e os agrupamentos. O "agora" vai ao minuto para a chave da consulta não
	// mudar a cada render.
	const base = { after: new Date(generalQueryParams.period.after), before: new Date(generalQueryParams.period.before) };
	const referenceDate = dayjs().startOf("minute").toDate();
	const comparisonPeriod = resolveComparisonPeriod(comparison, base, referenceDate);

	return (
		<div className="w-full flex flex-col gap-3">
			<CommercialInlineFilters scopeSellersIds={scopeSellersIds} queryParams={generalQueryParams} updateQueryParams={updateGeneralQueryParams}>
				<ComparisonPeriodFilter base={base} referenceDate={referenceDate} value={comparison} onChange={setComparison} allowNone />
			</CommercialInlineFilters>
			<OverallStatsBlock
				generalQueryParams={generalQueryParams}
				comparisonPeriod={comparisonPeriod ? { after: comparisonPeriod.after.toISOString(), before: comparisonPeriod.before.toISOString() } : null}
				user={user}
				userMembership={membership}
				userOrg={userOrg}
			/>
			<SalesGraphBlock generalQueryParams={generalQueryParams} user={user} />
			<GroupedStatsBlock generalQueryParams={generalQueryParams} user={user} userOrg={userOrg} />
		</div>
	);
}

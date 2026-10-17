"use client";
import GroupedStatsBlock from "@/components/SalesStats/Blocks/GroupedStatsBlock";
import OverallStatsBlock from "@/components/SalesStats/Blocks/OverallStatsBlock";
import SalesGraphBlock from "@/components/SalesStats/Blocks/SalesGraphBlock";
import { CommercialInlineFilters } from "@/components/Stats/CommercialInlineFilters";
import type { TAuthUserSession } from "@/lib/authentication/types";
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

	function updateGeneralQueryParams(newParams: Partial<TSaleStatsGeneralQueryParams>) {
		setGeneralQueryParams((prev) => ({ ...prev, ...newParams }));
	}

	return (
		<div className="w-full flex flex-col gap-3">
			<CommercialInlineFilters scopeSellersIds={scopeSellersIds} queryParams={generalQueryParams} updateQueryParams={updateGeneralQueryParams} />
			<OverallStatsBlock generalQueryParams={generalQueryParams} user={user} userMembership={membership} userOrg={userOrg} />
			<SalesGraphBlock generalQueryParams={generalQueryParams} user={user} />
			<GroupedStatsBlock generalQueryParams={generalQueryParams} user={user} userOrg={userOrg} />
		</div>
	);
}

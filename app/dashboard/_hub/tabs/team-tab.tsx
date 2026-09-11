"use client";

import { canAccessDashboardCapability, type TCapabilityContext } from "@/lib/access/capabilities";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { useTeamRoutine } from "@/lib/queries/dashboard-hub";
import { useGroupedSalesStats } from "@/lib/queries/stats/grouped";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { Panel } from "../panel";
import { resolveTodayRange, useDayKey } from "../use-day-key";

/**
 * A aba de Equipe: quem vendeu hoje e como anda a rotina das carteiras.
 *
 * O ranking sai de `sales-grouped`, o mesmo agrupamento da tela de Resultados — o dashboard mostra
 * a leitura do dia, a análise por período continua vivendo lá.
 */

const RANKING_LIMIT = 6;

export function TeamTab({ context, scopeSellersIds }: { context: TCapabilityContext; scopeSellersIds: string[] | null }) {
	const canViewSales = canAccessDashboardCapability("salesResults", context);
	const canViewPortfolios = canAccessDashboardCapability("portfolios", context);

	return (
		<div className="grid w-full items-start gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
			{canViewSales ? <SellerRanking scopeSellersIds={scopeSellersIds} /> : null}
			{canViewPortfolios ? <PortfolioRoutine /> : null}
		</div>
	);
}

function SellerRanking({ scopeSellersIds }: { scopeSellersIds: string[] | null }) {
	const dayKey = useDayKey();
	const filters = useMemo(() => {
		const { after, before } = resolveTodayRange(dayKey);
		return {
			period: { after: after.toISOString(), before: before.toISOString() },
			total: { min: null, max: null },
			integrationsIds: [],
			sellersIds: scopeSellersIds ?? [],
			clientRFMTitles: [],
			excludedSalesIds: [],
		};
	}, [dayKey, scopeSellersIds]);

	const { data, isPending, isError, error } = useGroupedSalesStats(filters);
	const sellers = useMemo(() => [...(data?.porVendedor ?? [])].sort((a, b) => b.total - a.total).slice(0, RANKING_LIMIT), [data]);
	const leader = sellers[0]?.total ?? 0;

	return (
		<Panel>
			<Panel.Header title="Vendas por vendedor hoje" href={appRoutes.sales.results()} hrefLabel="Ver resultados" />
			<Panel.Body>
				{isPending ? (
					<Panel.Loading rows={4} />
				) : isError ? (
					<Panel.Error error={error} />
				) : sellers.length === 0 ? (
					<Panel.Empty message="Nenhuma venda registrada hoje." />
				) : (
					<ul className="flex flex-col gap-3">
						{sellers.map((row, index) => (
							<li key={row.vendedor.id} className="flex items-center gap-3">
								{/* Ouro só no primeiro lugar: é o momento de celebração que a paleta reserva ao âmbar. */}
								<span
									className={cn("w-4 shrink-0 text-center font-extrabold text-xs", index === 0 ? "text-warning-surface-foreground" : "text-muted-foreground")}
								>
									{index + 1}
								</span>
								<span className="min-w-0 flex-1 truncate font-bold text-sm">{row.vendedor.nome}</span>
								<span className="text-micro hidden w-20 shrink-0 font-normal text-muted-foreground sm:block">
									{formatDecimalPlaces(row.qtde)} {row.qtde === 1 ? "venda" : "vendas"}
								</span>
								<span className="hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-muted md:block">
									<span className="block h-full rounded-full bg-primary" style={{ width: `${leader > 0 ? (row.total / leader) * 100 : 0}%` }} />
								</span>
								<span className="w-24 shrink-0 text-right font-bold text-sm">{formatToMoney(row.total)}</span>
							</li>
						))}
					</ul>
				)}
			</Panel.Body>
		</Panel>
	);
}

function PortfolioRoutine() {
	const dayKey = useDayKey();
	const dayStart = useMemo(() => resolveTodayRange(dayKey).after.toDate(), [dayKey]);
	const { data, isPending, isError, error } = useTeamRoutine({ dayStart });

	return (
		<Panel>
			<Panel.Header title="Rotina das carteiras" hint="hoje" href={appRoutes.customers.portfolios()} hrefLabel="Ver carteiras" />
			<Panel.Body>
				{isPending ? (
					<Panel.Loading rows={3} />
				) : isError ? (
					<Panel.Error error={error} />
				) : !data ? (
					<Panel.Empty message="Nenhum contato planejado." />
				) : (
					<dl className="flex flex-col gap-3">
						<RoutineLine label="Contatos previstos hoje" value={data.previstos} />
						<RoutineLine label="Feitos até agora" value={data.feitos} tone={data.feitos > 0 ? "success" : "default"} />
						<RoutineLine label="Atrasados de dias anteriores" value={data.atrasados} tone={data.atrasados > 0 ? "destructive" : "default"} />
					</dl>
				)}
			</Panel.Body>
		</Panel>
	);
}

function RoutineLine({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "success" | "destructive" }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<dt className="min-w-0 truncate font-medium text-sm">{label}</dt>
			<dd
				className={cn(
					"shrink-0 font-extrabold text-base",
					tone === "success" && "text-success-surface-foreground",
					tone === "destructive" && "text-destructive-surface-foreground",
				)}
			>
				{formatDecimalPlaces(value)}
			</dd>
		</div>
	);
}

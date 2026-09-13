"use client";

import type { TGetCouponRedemptionsOutputItem } from "@/app/api/coupons/redemptions/route";
import type { TGetCouponsOutputById } from "@/app/api/coupons/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { COUPON_REDEMPTION_SOURCES, getCouponRedemptionSourceMeta } from "@/lib/coupons/redemption-sources";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { useCouponRedemptions } from "@/lib/queries/coupons";
import { cn } from "@/lib/utils";
import type { TCouponRedemptionSourceEnum, TCouponRedemptionStatusEnum } from "@/schemas/enums";
import { ArrowUpRight, Clock, Receipt, ShoppingCart, UserRound } from "lucide-react";
import Link from "next/link";

type CouponRedemptionsTabProps = {
	coupon: TGetCouponsOutputById;
	enabled: boolean;
};

const STATUS_META: Record<TCouponRedemptionStatusEnum, { label: string; className: string }> = {
	UTILIZADO: { label: "UTILIZADO", className: "bg-green-500/15 text-green-600 dark:text-green-400" },
	CANCELADO: { label: "CANCELADO", className: "bg-destructive/10 text-destructive" },
};

/** Rótulo de origem da atribuição — de onde o cliente ganhou este cupom. */
function describeGrant(redemption: TGetCouponRedemptionsOutputItem): string {
	if (!redemption.atribuicao) return "Cupom global";
	if (redemption.atribuicao.campanha) return `Campanha: ${redemption.atribuicao.campanha.titulo}`;
	if (redemption.atribuicao.origem === "MANUAL") return "Atribuição manual";
	if (redemption.atribuicao.origem === "SISTEMA") return "Atribuição automática";
	return "Campanha";
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-1.5 rounded-xl border border-transparent px-2.5 py-1 text-[0.65rem] font-bold uppercase transition-colors",
				active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/70",
			)}
		>
			{label}
		</button>
	);
}

/**
 * Ledger de resgates do cupom: quem usou, em que venda, por qual superfície e quanto custou.
 *
 * Os cancelados aparecem — esmaecidos e marcados — porque quem audita um cupom precisa ver o
 * resgate desfeito. Os números das estatísticas continuam contando só o que foi utilizado.
 */
export default function CouponRedemptionsTab({ coupon, enabled }: CouponRedemptionsTabProps) {
	const { data, isLoading, isError, error, queryParams, updateQueryParams } = useCouponRedemptions({ couponId: coupon.id, enabled });

	function toggleStatus(status: TCouponRedemptionStatusEnum) {
		const active = queryParams.statuses.includes(status);
		updateQueryParams({ statuses: active ? queryParams.statuses.filter((item) => item !== status) : [...queryParams.statuses, status], page: 1 });
	}

	function toggleSource(source: TCouponRedemptionSourceEnum) {
		const active = queryParams.sources.includes(source);
		updateQueryParams({ sources: active ? queryParams.sources.filter((item) => item !== source) : [...queryParams.sources, source], page: 1 });
	}

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Receipt className="h-4 w-4 min-h-4 min-w-4" />
				</Section.Icon>
				<Section.Title>RESGATES DO CUPOM</Section.Title>
				{data ? <Section.Count>{formatDecimalPlaces(data.redemptionsMatched)}</Section.Count> : null}
			</Section.Header>
			<Section.Body>
				<div className="flex w-full flex-col gap-1.5">
					<Input
						value={queryParams.search ?? ""}
						placeholder="Pesquisar por cliente, venda ou operador..."
						onChange={(event) => updateQueryParams({ search: event.target.value, page: 1 })}
					/>
					<div className="flex w-full flex-wrap items-center gap-1.5">
						{(["UTILIZADO", "CANCELADO"] as const).map((status) => (
							<FilterChip
								key={status}
								label={STATUS_META[status].label}
								active={queryParams.statuses.includes(status)}
								onClick={() => toggleStatus(status)}
							/>
						))}
						{COUPON_REDEMPTION_SOURCES.map((source) => (
							<FilterChip
								key={source}
								label={getCouponRedemptionSourceMeta(source).label}
								active={queryParams.sources.includes(source)}
								onClick={() => toggleSource(source)}
							/>
						))}
					</div>
				</div>

				{isLoading ? <LoadingComponent /> : null}
				{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}

				{data ? (
					data.resgates.length > 0 ? (
						<div className="flex w-full flex-col gap-1.5">
							{data.resgates.map((redemption) => {
								const meta = getCouponRedemptionSourceMeta(redemption.origemResgate);
								const SourceIcon = meta.icon;
								const canceled = redemption.status === "CANCELADO";
								return (
									<div
										key={redemption.id}
										className={cn("flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-2xs", canceled && "opacity-60")}
									>
										<div className="flex w-full flex-wrap items-center justify-between gap-2">
											<div className="flex flex-wrap items-center gap-2">
												<div className="flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-1.5">
													<UserRound className="h-4 w-4" />
													<p className={cn("text-[0.65rem] font-medium uppercase tracking-tight", canceled && "line-through")}>
														{redemption.cliente?.nome ?? "Cliente não identificado"}
													</p>
												</div>
												{redemption.venda ? (
													<Link
														href={appRoutes.sales.details(redemption.venda.id)}
														className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-2.5 py-1 text-[0.65rem] font-bold uppercase text-primary hover:bg-primary/20"
													>
														<ShoppingCart className="h-3 w-3" />
														VENDA #{redemption.venda.idExterno}
													</Link>
												) : null}
												<span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
													<SourceIcon className="h-3.5 w-3.5" style={{ color: meta.color }} />
													{meta.label}
												</span>
											</div>
											<div className="flex items-center gap-2.5">
												<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
													<Clock className="h-3.5 w-3.5" />
													{formatDateAsLocale(redemption.dataInsercao, true)}
												</span>
												<span className={cn("flex h-5 items-center rounded-full px-2 text-xs font-semibold", STATUS_META[redemption.status].className)}>
													{STATUS_META[redemption.status].label}
												</span>
											</div>
										</div>
										<div className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-2">
											<div className="flex items-center gap-1.5">
												<span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Desconto</span>
												<span className="text-sm font-bold tabular-nums">{formatToMoney(redemption.valorDesconto)}</span>
											</div>
											<div className="flex items-center gap-1.5">
												<span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Venda</span>
												<span className="text-sm font-semibold text-muted-foreground tabular-nums">
													{redemption.vendaValor != null ? formatToMoney(redemption.vendaValor) : "—"}
												</span>
											</div>
											<div className="flex items-center gap-1.5">
												<span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Operador</span>
												<span className="text-sm font-semibold">{redemption.operadorNome ?? "—"}</span>
											</div>
											<div className="flex items-center gap-1.5">
												<span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Origem da atribuição</span>
												<span className="text-sm font-semibold">{describeGrant(redemption)}</span>
											</div>
											{redemption.venda ? (
												<Link
													href={appRoutes.sales.details(redemption.venda.id)}
													className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
												>
													VER VENDA
													<ArrowUpRight className="h-3.5 w-3.5" />
												</Link>
											) : null}
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<p className="py-8 text-center text-sm text-muted-foreground">
							{queryParams.search || queryParams.statuses.length > 0 || queryParams.sources.length > 0
								? "Nenhum resgate encontrado com os filtros aplicados."
								: "Este cupom ainda não foi resgatado."}
						</p>
					)
				) : null}

				{data && data.totalPages > 1 ? (
					<GeneralPaginationComponent
						activePage={queryParams.page ?? 1}
						totalPages={data.totalPages}
						selectPage={(page) => updateQueryParams({ page })}
						queryLoading={isLoading}
						itemsMatchedText={`${formatDecimalPlaces(data.redemptionsMatched)} resgates encontrados.`}
						itemsShowingText={`Mostrando ${formatDecimalPlaces(data.resgates.length)} resgates.`}
						pageIconSize="sm"
					/>
				) : null}
			</Section.Body>
		</Section.Root>
	);
}

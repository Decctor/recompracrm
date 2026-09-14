"use client";

import type { TGetCouponsOutputById } from "@/app/api/coupons/route";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Section } from "@/components/ui/section";
import { getCouponRedemptionSourceMeta } from "@/lib/coupons/redemption-sources";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useCouponStats } from "@/lib/queries/coupons";
import dayjs from "dayjs";
import { BadgeDollarSign, BadgePercent, ChartColumn, GitCompareArrows, Percent, Scale, ShoppingCart, Store, Ticket, Users } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

type CouponStatsTabProps = {
	coupon: TGetCouponsOutputById;
	enabled: boolean;
};

type DailyTooltipProps = {
	active?: boolean;
	payload?: Array<{ payload: { fullLabel: string; resgates: number; descontoConcedido: number } }>;
};

function DailyRedemptionsTooltip({ active, payload }: DailyTooltipProps) {
	if (!active || !payload?.length) return null;
	const point = payload[0].payload;
	return (
		<div className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3 shadow-lg">
			<p className="text-xs font-semibold text-foreground">{point.fullLabel}</p>
			<p className="text-xs text-muted-foreground">
				Resgates: <span className="font-semibold text-foreground tabular-nums">{formatDecimalPlaces(point.resgates)}</span>
			</p>
			<p className="text-xs text-muted-foreground">
				Desconto: <span className="font-semibold text-foreground tabular-nums">{formatToMoney(point.descontoConcedido)}</span>
			</p>
		</div>
	);
}

const chartConfig = {
	resgates: { label: "Resgates", color: "#e3b042" },
} satisfies ChartConfig;

/**
 * Estatísticas do cupom no período: o placar comparado, a série diária, de onde vieram os resgates
 * e o que aconteceu com o que foi entregue.
 *
 * O período de comparação acompanha o filtro — a janela imediatamente anterior, do mesmo tamanho —,
 * que é a leitura que o resto do app já usa nas estatísticas de campanha.
 */
export default function CouponStatsTab({ coupon, enabled }: CouponStatsTabProps) {
	const [period, setPeriod] = useState<{ after: Date; before: Date }>({
		after: dayjs().startOf("month").toDate(),
		before: dayjs().endOf("month").toDate(),
	});
	const [comparingPeriod, setComparingPeriod] = useState<{ after: Date; before: Date }>({
		after: dayjs().startOf("month").subtract(1, "month").toDate(),
		before: dayjs().endOf("month").subtract(1, "month").toDate(),
	});

	function handlePeriodChange(value: { after?: Date; before?: Date }) {
		const after = value.after ? new Date(value.after) : period.after;
		const before = value.before ? new Date(value.before) : period.before;
		setPeriod({ after, before });
		const days = dayjs(before).diff(dayjs(after), "day");
		setComparingPeriod({
			after: dayjs(after)
				.subtract(days + 1, "day")
				.toDate(),
			before: dayjs(after).subtract(1, "day").toDate(),
		});
	}

	const {
		data: stats,
		isLoading,
		isError,
		error,
	} = useCouponStats({
		couponId: coupon.id,
		periodAfter: period.after,
		periodBefore: period.before,
		comparingPeriodAfter: comparingPeriod.after,
		comparingPeriodBefore: comparingPeriod.before,
		enabled,
	});

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!stats) return null;

	const { resumo, resumoAnterior, ticketMedioLoja, porDia, porOrigem, cicloDeVida, limite } = stats;
	const custoSobreReceita = resumo.receitaInfluenciada > 0 ? (resumo.descontoConcedido / resumo.receitaInfluenciada) * 100 : null;
	const descontoMedio = resumo.resgates > 0 ? resumo.descontoConcedido / resumo.resgates : null;

	// O eixo mostra dia/mês: com a data completa os rótulos colidem já numa janela de duas semanas.
	// A data por extenso aparece no tooltip, onde há espaço para ela.
	const chartData = porDia.map((day) => ({
		label: dayjs(day.dia).format("DD/MM"),
		fullLabel: formatDateAsLocale(day.dia) ?? day.dia,
		resgates: day.resgates,
		descontoConcedido: day.descontoConcedido,
	}));

	return (
		<div className="flex w-full min-w-0 flex-col gap-3">
			<div className="flex w-full justify-end">
				<DateIntervalInput
					label="Período"
					labelClassName="hidden"
					className="shrink-0 border-none shadow-none hover:bg-accent hover:text-accent-foreground"
					value={{ after: period.after, before: period.before }}
					handleChange={handlePeriodChange}
				/>
			</div>

			<div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
				<StatUnitCard
					title="RESGATES"
					icon={<Ticket className="h-4 w-4 min-h-4 min-w-4" />}
					current={{ value: resumo.resgates, format: (n) => formatDecimalPlaces(n) }}
					previous={resumoAnterior ? { value: resumoAnterior.resgates, format: (n) => formatDecimalPlaces(n) } : undefined}
					previousLabel="NO PERÍODO ANTERIOR"
				/>
				<StatUnitCard
					title="CLIENTES ÚNICOS"
					icon={<Users className="h-4 w-4 min-h-4 min-w-4" />}
					current={{ value: resumo.clientesUnicos, format: (n) => formatDecimalPlaces(n) }}
					previous={resumoAnterior ? { value: resumoAnterior.clientesUnicos, format: (n) => formatDecimalPlaces(n) } : undefined}
					previousLabel="NO PERÍODO ANTERIOR"
				/>
				<StatUnitCard
					title="DESCONTO CONCEDIDO"
					icon={<BadgePercent className="h-4 w-4 min-h-4 min-w-4" />}
					subtitle="custo do benefício"
					current={{ value: resumo.descontoConcedido, format: (n) => formatToMoney(n) }}
					previous={resumoAnterior ? { value: resumoAnterior.descontoConcedido, format: (n) => formatToMoney(n) } : undefined}
					previousLabel="NO PERÍODO ANTERIOR"
					lowerIsBetter
				/>
				<StatUnitCard
					title="RECEITA INFLUENCIADA"
					icon={<BadgeDollarSign className="h-4 w-4 min-h-4 min-w-4" />}
					subtitle="vendas com o cupom"
					current={{ value: resumo.receitaInfluenciada, format: (n) => formatToMoney(n) }}
					previous={resumoAnterior ? { value: resumoAnterior.receitaInfluenciada, format: (n) => formatToMoney(n) } : undefined}
					previousLabel="NO PERÍODO ANTERIOR"
				/>
				<StatUnitCard
					title="TICKET MÉDIO COM CUPOM"
					icon={<ShoppingCart className="h-4 w-4 min-h-4 min-w-4" />}
					current={{ value: resumo.ticketMedio ?? 0, format: (n) => (resumo.ticketMedio == null ? "—" : formatToMoney(n)) }}
					previous={ticketMedioLoja != null ? { value: ticketMedioLoja, format: (n) => formatToMoney(n) } : undefined}
					previousLabel="TICKET MÉDIO DA LOJA"
				/>
			</div>

			<div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-3">
				<StatUnitCard
					variant="horizontal"
					title="APROVEITAMENTO DO LIMITE"
					icon={<Percent className="h-4 w-4 min-h-4 min-w-4" />}
					subtitle={
						limite
							? `${formatDecimalPlaces(limite.consumidos)} de ${formatDecimalPlaces(limite.total)} resgates · ${formatDecimalPlaces(limite.disponiveis)} disponíveis`
							: "Cupom sem limite total de resgates."
					}
					current={{ value: limite?.percentualConsumido ?? 0, format: (n) => (limite ? `${formatDecimalPlaces(n, 1, 1)}%` : "—") }}
					temporalScope={{ tipo: "ACUMULADO" }}
				/>
				<StatUnitCard
					variant="horizontal"
					title="DESCONTO MÉDIO POR RESGATE"
					icon={<BadgePercent className="h-4 w-4 min-h-4 min-w-4" />}
					subtitle={
						coupon.beneficioDescontoMaximo ? `Teto do benefício: ${formatToMoney(coupon.beneficioDescontoMaximo)}` : "Benefício sem teto de desconto."
					}
					current={{ value: descontoMedio ?? 0, format: (n) => (descontoMedio == null ? "—" : formatToMoney(n)) }}
				/>
				<StatUnitCard
					variant="horizontal"
					title="CUSTO SOBRE RECEITA"
					icon={<Scale className="h-4 w-4 min-h-4 min-w-4" />}
					subtitle={
						custoSobreReceita != null
							? `${formatToMoney(resumo.descontoConcedido)} de desconto sobre ${formatToMoney(resumo.receitaInfluenciada)}`
							: "Sem receita apurada no período."
					}
					current={{ value: custoSobreReceita ?? 0, format: (n) => (custoSobreReceita == null ? "—" : `${formatDecimalPlaces(n, 1, 1)}%`) }}
					lowerIsBetter
				/>
			</div>

			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<ChartColumn className="h-4 w-4 min-h-4 min-w-4" />
					</Section.Icon>
					<Section.Title>RESGATES POR DIA</Section.Title>
				</Section.Header>
				<Section.Body>
					{chartData.length > 0 ? (
						<div className="h-[240px] w-full min-w-0 sm:h-[280px]">
							<ChartContainer className="aspect-auto h-full w-full min-h-0 min-w-0" config={chartConfig}>
								<BarChart accessibilityLayer data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
									<CartesianGrid vertical={false} />
									<XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tick={{ fontSize: 10 }} />
									<YAxis width={36} tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 10 }} />
									<ChartTooltip cursor={false} content={<DailyRedemptionsTooltip />} />
									<Bar dataKey="resgates" fill={chartConfig.resgates.color} radius={[8, 8, 0, 0]} />
								</BarChart>
							</ChartContainer>
						</div>
					) : (
						<p className="py-8 text-center text-sm text-muted-foreground">Nenhum resgate no período selecionado.</p>
					)}
				</Section.Body>
			</Section.Root>

			<div className="flex w-full flex-col gap-3 lg:flex-row">
				<Section.Root className="lg:w-[58%]">
					<Section.Header>
						<Section.Icon>
							<Store className="h-4 w-4 min-h-4 min-w-4" />
						</Section.Icon>
						<Section.Title>RESGATES POR ORIGEM</Section.Title>
						<Section.Count>{formatDecimalPlaces(resumo.resgates)}</Section.Count>
					</Section.Header>
					<Section.Body>
						{porOrigem.length > 0 ? (
							porOrigem.map((source) => {
								const meta = getCouponRedemptionSourceMeta(source.origem);
								const SourceIcon = meta.icon;
								return (
									<div key={source.origem} className="flex w-full min-w-0 items-center gap-2.5">
										<span
											className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
											style={{ backgroundColor: meta.softBackground, color: meta.color }}
										>
											<SourceIcon className="h-4 w-4" />
										</span>
										<div className="flex min-w-0 flex-1 flex-col gap-1">
											<div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
												<span className="text-xs font-semibold">{meta.label}</span>
												<div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
													<span className="whitespace-nowrap text-muted-foreground tabular-nums">{formatDecimalPlaces(source.resgates)} resg.</span>
													<span className="font-bold tabular-nums" style={{ color: meta.color }}>
														{formatDecimalPlaces(source.participacao, 0, 0)}%
													</span>
													<span className="whitespace-nowrap text-muted-foreground tabular-nums">{formatToMoney(source.descontoConcedido)} desc.</span>
													<span className="whitespace-nowrap font-semibold text-primary tabular-nums">{formatToMoney(source.receitaInfluenciada)}</span>
												</div>
											</div>
											<div className="h-2 w-full rounded-full bg-secondary">
												<div className="h-2 rounded-full" style={{ width: `${source.participacao}%`, backgroundColor: meta.color }} />
											</div>
										</div>
									</div>
								);
							})
						) : (
							<p className="py-8 text-center text-sm text-muted-foreground">Nenhum resgate no período selecionado.</p>
						)}
					</Section.Body>
				</Section.Root>

				<Section.Root className="lg:w-[42%]">
					<Section.Header>
						<Section.Icon>
							<GitCompareArrows className="h-4 w-4 min-h-4 min-w-4" />
						</Section.Icon>
						<Section.Title>CICLO DE VIDA DOS RESGATES</Section.Title>
					</Section.Header>
					<Section.Body>
						<p className="text-xs text-muted-foreground">Números de vida toda do cupom — atribuição e resgate acontecem em momentos diferentes.</p>
						<dl className="flex w-full flex-col">
							{[
								{ label: "ATRIBUIÇÕES CRIADAS", value: cicloDeVida.atribuicoesCriadas },
								{ label: "ATRIBUIÇÕES ATIVAS SEM USO", value: cicloDeVida.atribuicoesAtivasSemUso },
								{ label: "ATRIBUIÇÕES EXPIRADAS", value: cicloDeVida.atribuicoesExpiradas },
								{ label: "RESGATES UTILIZADOS", value: cicloDeVida.resgatesUtilizados },
								{ label: "RESGATES CANCELADOS", value: cicloDeVida.resgatesCancelados },
							].map((line) => (
								<div key={line.label} className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-b-0">
									<dt className="shrink-0 text-xs font-semibold text-muted-foreground">{line.label}</dt>
									<dd className="min-w-0 text-right text-xs font-bold tabular-nums">{formatDecimalPlaces(line.value)}</dd>
								</div>
							))}
						</dl>
					</Section.Body>
				</Section.Root>
			</div>
		</div>
	);
}

"use client";

import type { TGetClientStatsInput, TGetClientStatsOutput } from "@/app/api/clients/stats/by-client/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import StatUnitCard from "@/components/Stats/StatUnitCard";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { InteractiveFilter } from "@/components/ui/interactive-filter";
import { formatInteractiveDateRangeSummary } from "@/components/ui/interactive-filter-formatting";
import { Section } from "@/components/ui/section";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { BadgeDollarSign, Calendar, CirclePlus, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { BsCart, BsTicketPerforated } from "react-icons/bs";

type TClientStats = TGetClientStatsOutput["data"];
type TGroupedResults = TClientStats["resultadosAgrupados"];
type TStatsFilters = Omit<TGetClientStatsInput, "clientId">;

const MONTH_MAP: Record<number, string> = {
	1: "Janeiro",
	2: "Fevereiro",
	3: "Março",
	4: "Abril",
	5: "Maio",
	6: "Junho",
	7: "Julho",
	8: "Agosto",
	9: "Setembro",
	10: "Outubro",
	11: "Novembro",
	12: "Dezembro",
};

const WEEKDAY_MAP: Record<number, string> = {
	0: "Domingo",
	1: "Segunda",
	2: "Terça",
	3: "Quarta",
	4: "Quinta",
	5: "Sexta",
	6: "Sábado",
};

type TPurchaseRhythm = "dia" | "mes" | "semana";
type TPreferenceDimension = "produtos" | "grupos" | "vendedores";
type TSortMode = "value" | "quantity";

type ClientStatsTabProps = {
	stats: TClientStats | undefined;
	filters: TStatsFilters;
	updateFilters: (filters: Partial<TStatsFilters>) => void;
	isLoading: boolean;
	isError: boolean;
	errorMessage: string | null;
};

/**
 * Estatísticas do cliente no período.
 *
 * Seis cartões viraram dois. As três leituras de "quando ele compra" (dia do mês, mês, dia da
 * semana) respondem à mesma pergunta e nunca são lidas juntas — lado a lado só competiam por
 * largura, e cada grade ficava estreita demais para os rótulos. O mesmo vale para produtos, grupos
 * e vendedores. Um cartão por pergunta, com o recorte no cabeçalho.
 *
 * O filtro de período mora aqui, não na barra de abas: ele não governa o cabeçalho da página nem as
 * outras abas, e um controle que só afeta parte da tela precisa estar perto dessa parte.
 */
export default function ClientStatsTab({ stats, filters, updateFilters, isLoading, isError, errorMessage }: ClientStatsTabProps) {
	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex w-full flex-wrap items-center gap-2">
				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<Calendar className="h-4 w-4" />
							<InteractiveFilter.Label>PERÍODO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>
							{formatInteractiveDateRangeSummary(
								filters.periodAfter ? new Date(filters.periodAfter) : null,
								filters.periodBefore ? new Date(filters.periodBefore) : null,
							)}
						</InteractiveFilter.Value>
						<InteractiveFilter.Clear onClear={() => updateFilters({ periodAfter: null, periodBefore: null })} />
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0">
						<InteractiveFilter.DateRangeContent
							value={{
								from: filters.periodAfter ? new Date(filters.periodAfter) : undefined,
								to: filters.periodBefore ? new Date(filters.periodBefore) : undefined,
							}}
							onChange={(period) => updateFilters({ periodAfter: period.from?.toISOString() ?? null, periodBefore: period.to?.toISOString() ?? null })}
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			</div>

			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={errorMessage ?? "Não foi possível carregar as estatísticas."} /> : null}

			{!isLoading && !isError && stats ? (
				<>
					<div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
						<StatUnitCard
							variant="horizontal"
							title="Número de compras"
							subtitle="no período filtrado"
							icon={<CirclePlus />}
							current={{ value: stats.qtdeCompras, format: (n) => formatDecimalPlaces(n) }}
						/>
						<StatUnitCard
							variant="horizontal"
							title="Valor compro"
							subtitle="no período filtrado"
							icon={<BadgeDollarSign />}
							current={{ value: stats.valorComproTotal, format: (n) => formatToMoney(n) }}
						/>
						<StatUnitCard
							variant="horizontal"
							title="Ticket médio"
							subtitle="no período filtrado"
							icon={<BsTicketPerforated />}
							current={{ value: stats.ticketMedio, format: (n) => formatToMoney(n) }}
						/>
						<StatUnitCard
							variant="horizontal"
							title="Valor diário compro"
							subtitle="média dos dias entre a primeira e a última compra"
							icon={<BsCart />}
							current={{ value: stats.valorComproGrupoPeriodo.dia ?? 0, format: (n) => formatToMoney(n) }}
						/>
					</div>

					<PurchaseRhythmSection grouped={stats.resultadosAgrupados} />
					<PurchasePreferencesSection grouped={stats.resultadosAgrupados} />
				</>
			) : null}
		</div>
	);
}

function SwitcherToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
	return (
		<Button type="button" size="xs" variant={active ? "default" : "ghost"} className="rounded-full text-[0.65rem] font-bold" onClick={onClick}>
			{children}
		</Button>
	);
}

/** Intensidade do âmbar proporcional ao faturamento — a mesma escala das três grades. */
function createHeatScale(values: number[]) {
	const maxValue = Math.max(...values, 0);
	const minValue = Math.min(...values, 0);
	const range = maxValue - minValue;

	return (value: number | undefined) => {
		if (value === undefined) return "transparent";
		const intensity = range === 0 ? 0.3 : 0.1 + ((value - minValue) / range) * 0.9;
		return `rgba(254, 173, 0, ${intensity})`;
	};
}

function PurchaseRhythmSection({ grouped }: { grouped: TGroupedResults }) {
	const [rhythm, setRhythm] = useState<TPurchaseRhythm>("dia");

	const rows = rhythm === "dia" ? grouped.dia : rhythm === "mes" ? grouped.mes : grouped.diaSemana;
	const getHeat = createHeatScale(rows.map((row) => row.total));

	const best = rows.length > 0 ? rows.reduce((max, row) => (row.total > max.total ? row : max), rows[0]) : null;
	const worst = rows.length > 0 ? rows.reduce((min, row) => (row.total < min.total ? row : min), rows[0]) : null;

	function labelFor(row: TGroupedResults["dia"][number] | TGroupedResults["mes"][number] | TGroupedResults["diaSemana"][number] | null) {
		if (!row) return null;
		if ("dia" in row) return `dia ${row.dia}`;
		if ("mes" in row) return MONTH_MAP[row.mes];
		return WEEKDAY_MAP[row.diaSemana];
	}

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Calendar />
				</Section.Icon>
				<Section.Title>Quando ele compra</Section.Title>
				<Section.Actions>
					<SwitcherToggle active={rhythm === "dia"} onClick={() => setRhythm("dia")}>
						DIA DO MÊS
					</SwitcherToggle>
					<SwitcherToggle active={rhythm === "mes"} onClick={() => setRhythm("mes")}>
						MÊS
					</SwitcherToggle>
					<SwitcherToggle active={rhythm === "semana"} onClick={() => setRhythm("semana")}>
						DIA DA SEMANA
					</SwitcherToggle>
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				{rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">Nenhuma compra no período.</p>
				) : (
					<>
						<div className="flex w-full flex-wrap items-center gap-1.5">
							{best ? (
								<Chip.Root size="md" shape="lg" variant="success">
									<Chip.Label>O período preferido para compra foi {labelFor(best)}</Chip.Label>
								</Chip.Root>
							) : null}
							{worst && worst !== best ? (
								<Chip.Root size="md" shape="lg" variant="destructive">
									<Chip.Label>O pior período para compra foi {labelFor(worst)}</Chip.Label>
								</Chip.Root>
							) : null}
						</div>

						<TooltipProvider>
							{rhythm === "dia" ? (
								<div className="grid w-full grid-cols-7 gap-2">
									{Array.from({ length: 31 }).map((_, index) => {
										const result = grouped.dia.find((row) => row.dia === index + 1);
										return (
											<RhythmCell
												key={`dia-${index + 1}`}
												label={String(index + 1)}
												title={`DIA ${index + 1}`}
												result={result}
												background={getHeat(result?.total)}
											/>
										);
									})}
								</div>
							) : null}
							{rhythm === "mes" ? (
								<div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
									{Array.from({ length: 12 }).map((_, index) => {
										const result = grouped.mes.find((row) => row.mes === index + 1);
										return (
											<RhythmCell
												key={`mes-${index + 1}`}
												label={MONTH_MAP[index + 1] ?? ""}
												title={MONTH_MAP[index + 1] ?? ""}
												result={result}
												background={getHeat(result?.total)}
											/>
										);
									})}
								</div>
							) : null}
							{rhythm === "semana" ? (
								<div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
									{Array.from({ length: 7 }).map((_, index) => {
										const result = grouped.diaSemana.find((row) => row.diaSemana === index);
										return (
											<RhythmCell
												key={`semana-${index}`}
												label={WEEKDAY_MAP[index] ?? ""}
												title={WEEKDAY_MAP[index] ?? ""}
												result={result}
												background={getHeat(result?.total)}
											/>
										);
									})}
								</div>
							) : null}
						</TooltipProvider>
					</>
				)}
			</Section.Body>
		</Section.Root>
	);
}

function RhythmCell({
	label,
	title,
	result,
	background,
}: {
	label: string;
	title: string;
	result: { quantidade: number; total: number } | undefined;
	background: string;
}) {
	const ticketMedio = result && result.quantidade > 0 ? result.total / result.quantidade : 0;

	return (
		<Tooltip>
			<TooltipTrigger
				delay={200}
				render={
					<div
						className="border-border flex min-h-[52px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md border p-2 transition-all hover:scale-[1.02]"
						style={{ backgroundColor: background }}
					>
						<h3 className="text-numeric text-center text-xs font-bold uppercase tracking-tight">{label}</h3>
					</div>
				}
			/>
			<TooltipContent className="bg-primary text-foreground-foreground min-w-[180px] p-3">
				<div className="flex flex-col gap-2">
					<h3 className="mb-1 text-sm font-semibold uppercase">{title}</h3>
					{result ? (
						<>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-1">
									<CirclePlus className="h-5 w-5 min-h-5 min-w-5" />
									<span className="text-xs font-medium tracking-tight">VENDAS</span>
								</div>
								<span className="text-sm font-bold">{formatDecimalPlaces(result.quantidade)}</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-1">
									<BadgeDollarSign className="h-5 w-5 min-h-5 min-w-5" />
									<span className="text-xs font-medium tracking-tight">FATURAMENTO</span>
								</div>
								<span className="text-sm font-bold">{formatToMoney(result.total)}</span>
							</div>
							<div className="border-border-foreground/80 mt-1 flex items-center justify-between gap-4 border-t pt-2">
								<span className="text-xs font-medium tracking-tight">TICKET MÉDIO</span>
								<span className="text-sm font-bold">{formatToMoney(ticketMedio)}</span>
							</div>
						</>
					) : (
						<span className="text-xs">SEM DADOS</span>
					)}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}

type TPreferenceRow = { key: string; nome: string; total: number; quantidade: number };

function toPreferenceRows(grouped: TGroupedResults, dimension: TPreferenceDimension): TPreferenceRow[] {
	if (dimension === "grupos") {
		return grouped.grupo.map((row) => ({
			key: row.grupo ?? "SEM GRUPO",
			nome: row.grupo ?? "SEM GRUPO",
			total: row.total,
			quantidade: row.quantidade,
		}));
	}
	if (dimension === "vendedores") {
		return grouped.vendedor.map((row) => ({
			key: row.vendedorId ?? "SEM VENDEDOR",
			nome: row.vendedorNome ?? "VENDEDOR NÃO INFORMADO",
			total: row.total,
			quantidade: row.quantidade,
		}));
	}
	return grouped.produto.map((row) => ({
		key: row.produtoId ?? row.produtoNome,
		nome: row.produtoNome,
		total: row.total,
		quantidade: row.quantidade,
	}));
}

function PurchasePreferencesSection({ grouped }: { grouped: TGroupedResults }) {
	const [dimension, setDimension] = useState<TPreferenceDimension>("produtos");
	const [sortMode, setSortMode] = useState<TSortMode>("value");

	const rows = [...toPreferenceRows(grouped, dimension)]
		.sort((a, b) => (sortMode === "value" ? b.total - a.total : b.quantidade - a.quantidade))
		.slice(0, 10);
	const highest = Math.max(...rows.map((row) => (sortMode === "value" ? row.total : row.quantidade)), 0);

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<ShoppingBag />
				</Section.Icon>
				<Section.Title>O que ele compra</Section.Title>
				<Section.Actions>
					<SwitcherToggle active={dimension === "produtos"} onClick={() => setDimension("produtos")}>
						PRODUTOS
					</SwitcherToggle>
					<SwitcherToggle active={dimension === "grupos"} onClick={() => setDimension("grupos")}>
						GRUPOS
					</SwitcherToggle>
					<SwitcherToggle active={dimension === "vendedores"} onClick={() => setDimension("vendedores")}>
						VENDEDORES
					</SwitcherToggle>
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				<div className="flex w-full items-center gap-1">
					<Button
						type="button"
						size="xs"
						variant={sortMode === "value" ? "default" : "secondary"}
						className="text-[0.65rem]"
						onClick={() => setSortMode("value")}
					>
						VALOR
					</Button>
					<Button
						type="button"
						size="xs"
						variant={sortMode === "quantity" ? "default" : "secondary"}
						className="text-[0.65rem]"
						onClick={() => setSortMode("quantity")}
					>
						QUANTIDADE
					</Button>
				</div>

				{rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">Nenhuma compra no período.</p>
				) : (
					<div className="flex w-full flex-col gap-2.5">
						{rows.map((row, index) => {
							const value = sortMode === "value" ? row.total : row.quantidade;
							const share = highest > 0 ? Math.max(4, Math.round((value / highest) * 100)) : 0;
							return (
								<div key={row.key} className="flex w-full flex-col gap-1">
									<div className="flex w-full items-center justify-between gap-2">
										<div className="flex min-w-0 flex-1 items-center gap-1.5">
											<div className="border-border text-numeric flex h-6 w-6 min-h-6 min-w-6 items-center justify-center rounded-full border text-xs">
												{index + 1}º
											</div>
											<h3 className="truncate text-xs font-medium uppercase tracking-tight">{row.nome}</h3>
										</div>
										<span className="text-numeric shrink-0 text-xs font-bold tracking-tight">
											{sortMode === "value" ? formatToMoney(row.total) : formatDecimalPlaces(row.quantidade)}
										</span>
									</div>
									<div className="bg-secondary relative h-1 w-full overflow-hidden rounded-full">
										<div className="bg-primary/45 absolute inset-y-0 left-0 rounded-full" style={{ width: `${share}%` }} />
									</div>
								</div>
							);
						})}
					</div>
				)}
			</Section.Body>
		</Section.Root>
	);
}

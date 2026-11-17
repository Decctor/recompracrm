"use client";

import type { TGetProductionStatsOutput } from "@/app/api/productions/stats/route";
import { Section } from "@/components/ui/section";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { BadgeDollarSign, Package, Scale } from "lucide-react";
import { useState } from "react";
import { MetricToggle, type TMetricToggleOption } from "./metric-toggle";
import { formatUnitQuantity, getInputInitials } from "./stats-format";

type TInputRow = TGetProductionStatsOutput["data"]["inputs"][number];
type TInputsMetric = "valor" | "quantidade";

const INPUT_METRICS: TMetricToggleOption<TInputsMetric>[] = [
	{ value: "valor", label: "Valor", icon: BadgeDollarSign },
	{ value: "quantidade", label: "Quantidade", icon: Scale },
];

/**
 * Matéria-prima nova consumida nas produções concluídas (o saldo reincorporado fica de fora). O valor
 * é custo: sem `dadosSensiveis.visualizarCustos` ele chega `null` e a lista fica só em quantidade.
 */
export function InputsConsumed({ inputs, canViewCosts }: { inputs: TInputRow[]; canViewCosts: boolean }) {
	const [selectedMetric, setMetric] = useState<TInputsMetric>("valor");
	const metric: TInputsMetric = canViewCosts ? selectedMetric : "quantidade";
	const metricValue = (row: TInputRow) => (metric === "valor" ? (row.valor ?? 0) : row.quantidade);

	const rows = [...inputs].sort((a, b) => metricValue(b) - metricValue(a) || a.nome.localeCompare(b.nome, "pt-BR"));
	// Quantidades só se comparam dentro da mesma unidade: a barra de "kg" mede contra o maior em kg.
	const maxByUnit = new Map<string, number>();
	for (const row of inputs) maxByUnit.set(row.unidade, Math.max(maxByUnit.get(row.unidade) ?? 0, row.quantidade));
	const maxValue = Math.max(...inputs.map((row) => row.valor ?? 0), 0);
	const barWidth = (row: TInputRow) => {
		const max = metric === "valor" ? maxValue : (maxByUnit.get(row.unidade) ?? 0);
		return max > 0 ? (metricValue(row) / max) * 100 : 0;
	};

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Package />
				</Section.Icon>
				<Section.Title>Insumos consumidos</Section.Title>
				<Section.Count>{formatDecimalPlaces(inputs.length)}</Section.Count>
				<Section.Actions>
					{canViewCosts ? <MetricToggle options={INPUT_METRICS} value={metric} onChange={setMetric} ariaLabel="Métrica dos insumos" /> : null}
				</Section.Actions>
			</Section.Header>
			<Section.Bleed className="max-h-[560px] overflow-y-auto">
				{rows.length === 0 ? (
					<p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum consumo no período.</p>
				) : (
					<ol className="divide-y divide-border">
						{rows.map((row) => {
							const quantity = formatUnitQuantity(row.quantidade, row.unidade);
							const value = row.valor != null ? formatToMoney(row.valor) : null;
							return (
								<li
									key={`${row.produtoId}:${row.produtoVarianteId ?? ""}`}
									className="grid grid-cols-[minmax(0,1fr)_minmax(4rem,8rem)_auto] items-center gap-3 px-4 py-2.5"
								>
									<div className="flex min-w-0 items-center gap-2.5">
										<span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-[0.65rem] font-bold text-muted-foreground">
											{getInputInitials(row.nome)}
										</span>
										<div className="flex min-w-0 flex-col">
											<span className="truncate text-sm font-bold">{row.nome}</span>
											<span className="truncate text-[0.7rem] text-muted-foreground tabular-nums">
												{metric === "valor" ? `${quantity} · ` : value ? `${value} · ` : ""}em {formatDecimalPlaces(row.producoes)} {row.producoes === 1 ? "produção" : "produções"}
											</span>
										</div>
									</div>
									<div className="h-1.5 overflow-hidden rounded-full bg-muted">
										<div className="h-full rounded-full bg-primary" style={{ width: `${barWidth(row)}%` }} />
									</div>
									<span className="text-right text-sm font-bold whitespace-nowrap tabular-nums">{metric === "valor" ? value : quantity}</span>
								</li>
							);
						})}
					</ol>
				)}
			</Section.Bleed>
		</Section.Root>
	);
}

"use client";

import { Panel } from "@/app/dashboard/_hub/panel";
import { useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { Section } from "@/components/ui/section";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TMetaAdsBreakdown, TMetaAdsBreakdownType, TMetaAdsRichMetrics } from "@/lib/integrations/meta/ads/types";
import {
	META_RESULT_LABELS,
	costPer,
	formatAdsCurrency,
	formatAdsFraction,
	formatAdsNumber,
	formatAdsPercent,
	getDeviceLabel,
	getGenderLabel,
	getPlatformLabel,
	getPositionLabel,
	type TMetaResultKey,
} from "@/lib/paid-media/format";
import { useMetaAdsBreakdown } from "@/lib/queries/meta-ads";
import { cn } from "@/lib/utils";
import { SplitSquareHorizontal } from "lucide-react";
import { useState } from "react";
import { usePaidMedia } from "./paid-media-context";
import { ProportionBar } from "./paid-media-ui";

type TBreakdownMetric = "spend" | "results" | "costPerResult" | "ctr";

type TMetricDef = {
	label: string;
	get: (m: TMetaAdsRichMetrics) => number | null;
	format: (value: number | null) => string;
	lowerIsBetter?: boolean;
};

function buildMetricDefs(resultKey: TMetaResultKey, currency: string): Record<TBreakdownMetric, TMetricDef> {
	return {
		spend: { label: "Investimento", get: (m) => m.spend, format: (value) => formatAdsCurrency(value, currency) },
		results: { label: META_RESULT_LABELS[resultKey].plural, get: (m) => m[resultKey], format: (value) => formatAdsNumber(value) },
		costPerResult: {
			label: META_RESULT_LABELS[resultKey].costLabel,
			get: (m) => costPer(m.spend, m[resultKey]),
			format: (value) => formatAdsCurrency(value, currency),
			lowerIsBetter: true,
		},
		ctr: { label: "CTR", get: (m) => m.ctr, format: (value) => formatAdsPercent(value) },
	};
}

const BREAKDOWN_TABS: { value: TMetaAdsBreakdownType; label: string }[] = [
	{ value: "demographics", label: "Público" },
	{ value: "geography", label: "Região" },
	{ value: "placements", label: "Posicionamento" },
	{ value: "dayparting", label: "Horário" },
];

type TBarRow = { key: string; label: string; metrics: TMetaAdsRichMetrics };

/** Quem viu, onde, em que posição e a que horas. `objectId` recorta um anúncio ou campanha. */
export function BreakdownsSection({ objectId, compact = false }: { objectId?: string | null; compact?: boolean }) {
	const { scope, currency, resultKey } = usePaidMedia();
	const [type, setType] = useState<TMetaAdsBreakdownType>("demographics");
	const [metric, setMetric] = useState<TBreakdownMetric>("spend");
	const breakdown = useMetaAdsBreakdown({ scope, type, objectId });
	const defs = buildMetricDefs(resultKey, currency);
	const def = defs[metric];

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<SplitSquareHorizontal />
				</Section.Icon>
				<Section.Title>Recortes</Section.Title>
				<Section.Actions>
					<Tabs value={metric} onValueChange={(value) => setMetric(value as TBreakdownMetric)}>
						<TabsList>
							{(Object.keys(defs) as TBreakdownMetric[]).map((key) => (
								<TabsTrigger key={key} value={key}>
									{key === "costPerResult" ? "Custo" : defs[key].label}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</Section.Actions>
			</Section.Header>
			<Section.Body className="gap-4">
				<Tabs value={type} onValueChange={(value) => setType(value as TMetaAdsBreakdownType)}>
					<TabsList variant="page">
						{BREAKDOWN_TABS.map((tab) => (
							<TabsTrigger key={tab.value} value={tab.value}>
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				{breakdown.isLoading ? (
					<Panel.Loading rows={6} />
				) : breakdown.isError || !breakdown.data ? (
					<Panel.Error error={breakdown.error} />
				) : (
					<BreakdownView breakdown={breakdown.data} def={def} compact={compact} />
				)}
			</Section.Body>
		</Section.Root>
	);
}

function BreakdownView({ breakdown, def, compact }: { breakdown: TMetaAdsBreakdown; def: TMetricDef; compact: boolean }) {
	switch (breakdown.type) {
		case "demographics":
			return (
				<div className={cn("grid grid-cols-1 gap-6", !compact && "lg:grid-cols-[2fr_1fr]")}>
					<BarList
						title="Faixa etária"
						rows={breakdown.byAge.map((row) => ({ key: row.key, label: row.key, metrics: row.metrics }))}
						def={def}
						keepOrder
					/>
					<BarList
						title="Gênero"
						rows={breakdown.byGender.map((row) => ({ key: row.key, label: getGenderLabel(row.key), metrics: row.metrics }))}
						def={def}
					/>
				</div>
			);
		case "geography":
			return (
				<div className={cn("grid grid-cols-1 gap-6", !compact && "lg:grid-cols-[2fr_1fr]")}>
					<BarList
						title="Estado / região"
						rows={breakdown.byRegion.map((row) => ({ key: row.key, label: row.key, metrics: row.metrics }))}
						def={def}
						limit={12}
					/>
					<BarList title="País" rows={breakdown.byCountry.map((row) => ({ key: row.key, label: row.key, metrics: row.metrics }))} def={def} limit={6} />
				</div>
			);
		case "placements":
			return (
				<div className={cn("grid grid-cols-1 gap-6", !compact && "lg:grid-cols-[2fr_1fr]")}>
					<BarList
						title="Posição"
						rows={breakdown.byPosition.map((row) => ({
							key: `${row.platform}|${row.position}`,
							label: `${getPlatformLabel(row.platform)} · ${getPositionLabel(row.position)}`,
							metrics: row.metrics,
						}))}
						def={def}
						limit={12}
					/>
					<div className="flex flex-col gap-6">
						<BarList
							title="Plataforma"
							rows={breakdown.byPlatform.map((row) => ({ key: row.key, label: getPlatformLabel(row.key), metrics: row.metrics }))}
							def={def}
						/>
						<BarList
							title="Dispositivo"
							rows={breakdown.byDevice.map((row) => ({ key: row.key, label: getDeviceLabel(row.key), metrics: row.metrics }))}
							def={def}
						/>
					</div>
				</div>
			);
		case "dayparting":
			return <HourChart rows={breakdown.byHour} def={def} />;
	}
}

function BarList({
	title,
	rows,
	def,
	limit,
	keepOrder = false,
}: {
	title: string;
	rows: TBarRow[];
	def: TMetricDef;
	limit?: number;
	keepOrder?: boolean;
}) {
	const { colors } = useOrgColors();
	const withValue = rows.map((row) => ({ ...row, value: def.get(row.metrics) }));
	const sorted = keepOrder
		? withValue
		: [...withValue].sort((a, b) => {
				if (a.value == null) return 1;
				if (b.value == null) return -1;
				return def.lowerIsBetter ? a.value - b.value : b.value - a.value;
			});
	const visible = limit ? sorted.slice(0, limit) : sorted;
	const max = Math.max(0, ...visible.map((row) => row.value ?? 0));
	const totalSpend = rows.reduce((sum, row) => sum + row.metrics.spend, 0);

	return (
		<div className="text-numeric flex min-w-0 flex-col gap-2.5">
			<span className="text-label text-muted-foreground">{title}</span>
			{visible.length === 0 ? (
				<p className="text-sm text-muted-foreground">Sem dados para este recorte.</p>
			) : (
				visible.map((row) => (
					<div key={row.key} className="flex flex-col gap-1">
						<div className="flex items-baseline justify-between gap-3">
							<span className="min-w-0 truncate text-sm">{row.label}</span>
							<span className="flex shrink-0 items-baseline gap-2">
								<span className="text-micro text-muted-foreground">
									{formatAdsFraction(totalSpend > 0 ? row.metrics.spend / totalSpend : null)} do invest.
								</span>
								<span className="text-sm font-bold">{def.format(row.value)}</span>
							</span>
						</div>
						<ProportionBar value={row.value ?? 0} max={max} color={colors.primary} />
					</div>
				))
			)}
		</div>
	);
}

/** 24 colunas no fuso da conta. O melhor horário fica destacado; o pior, apagado. */
function HourChart({ rows, def }: { rows: { key: string; metrics: TMetaAdsRichMetrics }[]; def: TMetricDef }) {
	const { colors } = useOrgColors();
	const byHour = new Map(rows.map((row) => [row.key, row.metrics]));
	const hours = Array.from({ length: 24 }, (_, hour) => {
		const key = String(hour).padStart(2, "0");
		const metrics = byHour.get(key);
		return { key, value: metrics ? def.get(metrics) : null };
	});
	const values = hours.map((hour) => hour.value).filter((value): value is number => value != null && value > 0);
	const max = Math.max(0, ...values);
	const best = values.length > 0 ? (def.lowerIsBetter ? Math.min(...values) : Math.max(...values)) : null;
	const bestHour = hours.find((hour) => hour.value === best)?.key ?? null;

	if (values.length === 0) return <p className="text-sm text-muted-foreground">Sem dados por horário no período.</p>;

	return (
		<div className="text-numeric flex flex-col gap-3">
			{bestHour ? (
				<p className="text-sm">
					Melhor horário em {def.label.toLowerCase()}: <b>{bestHour}h</b> ({def.format(best)})
				</p>
			) : null}
			<div className="flex h-40 items-end gap-0.5 sm:gap-1">
				{hours.map((hour) => {
					const height = max > 0 && hour.value ? Math.max(3, (hour.value / max) * 100) : 0;
					return (
						<div
							key={hour.key}
							className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
							title={`${hour.key}h · ${def.format(hour.value)}`}
						>
							<div
								className="w-full rounded-t-sm transition-opacity group-hover:opacity-80"
								style={{ height: `${height}%`, background: colors.primary, opacity: hour.key === bestHour ? 1 : 0.45 }}
							/>
						</div>
					);
				})}
			</div>
			<div className="text-micro flex justify-between text-muted-foreground">
				<span>00h</span>
				<span>06h</span>
				<span>12h</span>
				<span>18h</span>
				<span>23h</span>
			</div>
		</div>
	);
}

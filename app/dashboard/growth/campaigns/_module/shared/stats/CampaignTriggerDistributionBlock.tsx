"use client";
import type { TGetCampaignStatsOverallOutput } from "@/app/api/campaigns/stats/overall/route";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useMemo } from "react";

type TriggerGroup = {
	gatilho: string;
	label: string;
	interacoes: number;
	conversoes: number;
	receita: number;
	receitaIncremental: number;
};

const TRIGGER_LABELS: Record<string, string> = {
	"NOVA-COMPRA": "Nova compra",
	"PRIMEIRA-COMPRA": "Primeira compra",
	"CASHBACK-EXPIRANDO": "Cashback expirando",
	"CASHBACK-ACUMULADO": "Cashback acumulado",
	"PERMANÊNCIA-SEGMENTAÇÃO": "Reativação",
	"ENTRADA-SEGMENTAÇÃO": "Entrada na segmentação",
	"QUANTIDADE-TOTAL-COMPRAS": "Marco de compras",
	"VALOR-TOTAL-COMPRAS": "Marco de valor",
	"USO-UNICO": "Uso único",
	"PROMOCAO-PRODUTOS": "Promoção de produtos",
	RECORRENTE: "Recorrente",
	ANIVERSARIO_CLIENTE: "Aniversário",
	"PIOR-DIA-VENDAS": "Pior dia de vendas",
};

type CampaignTriggerDistributionBlockProps = {
	overall: TGetCampaignStatsOverallOutput["data"] | undefined;
	isLoading: boolean;
};

const PALETTE = ["#24549C", "#1a3d7a", "#FFB900", "#e3b042", "#c98a2c", "#0ea5e9", "#16a34a", "#9a691e"];

export function CampaignTriggerDistributionBlock({ overall, isLoading }: CampaignTriggerDistributionBlockProps) {
	const groups: TriggerGroup[] = useMemo(() => {
		if (!overall?.campanhas) return [];
		const map = new Map<string, TriggerGroup>();
		for (const c of overall.campanhas) {
			const gatilho = c.gatilhoTipo ?? "DESCONHECIDO";
			if (!map.has(gatilho)) {
				map.set(gatilho, {
					gatilho,
					label: TRIGGER_LABELS[gatilho] ?? gatilho,
					interacoes: 0,
					conversoes: 0,
					receita: 0,
					receitaIncremental: 0,
				});
			}
			const entry = map.get(gatilho)!;
			entry.interacoes += Number(c.interacoes ?? 0);
			entry.conversoes += Number(c.conversoes ?? 0);
			entry.receita += Number(c.receitaTotal ?? 0);
			entry.receitaIncremental += Number(c.receitaIncremental ?? 0);
		}
		return [...map.values()].sort((a, b) => b.receita - a.receita);
	}, [overall]);

	const maxReceita = Math.max(...groups.map((g) => g.receita), 1);

	return (
		<div className="bg-card border-border flex w-full flex-col gap-4 rounded-xl border px-4 py-4 shadow-2xs">
			<h2 className="text-xs font-bold uppercase tracking-wide text-foreground shrink-0">Receita por tipo de gatilho</h2>

			{isLoading ? (
				<div className="flex flex-col gap-3">
					{[...Array(5)].map((_, i) => (
						<div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse" />
					))}
				</div>
			) : groups.length > 0 ? (
				<div className="flex flex-col gap-3">
					{groups.map((group, index) => {
						const widthPct = maxReceita > 0 ? (group.receita / maxReceita) * 100 : 0;
						const color = PALETTE[index % PALETTE.length];

						return (
							<div key={group.gatilho} className="flex flex-col gap-1">
								<div className="flex items-center justify-between gap-2 text-xs">
									<div className="flex items-center gap-2 min-w-0">
										<div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
										<span className="font-semibold text-foreground truncate">{group.label}</span>
									</div>
									<div className="flex items-center gap-4 shrink-0 text-[0.65rem] text-muted-foreground">
										<span>{formatDecimalPlaces(group.interacoes)} msg</span>
										<span>{formatDecimalPlaces(group.conversoes)} conv.</span>
										<span className="font-bold text-foreground">{formatToMoney(group.receita)}</span>
										<span className="font-bold text-primary">{formatToMoney(group.receitaIncremental)} incr.</span>
									</div>
								</div>
								<div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
									<div className="h-full rounded-full transition-all duration-500" style={{ width: `${widthPct}%`, backgroundColor: color }} />
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<p className="text-sm text-muted-foreground py-6 text-center">Nenhum dado de campanhas disponível.</p>
			)}
		</div>
	);
}

"use client";
import type { TGetCampaignStatsOverallOutput } from "@/app/api/campaigns/stats/overall/route";
import { getTriggerMeta } from "@/app/dashboard/growth/campaigns/_module/builder/helpers/triggers";
import { Section } from "@/components/ui/section";
import type { TCampaignTriggerTypeEnum } from "@/schemas/enums";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { Megaphone, Zap } from "lucide-react";
import { useMemo } from "react";

type TriggerGroup = {
	gatilho: string;
	label: string;
	interacoes: number;
	conversoes: number;
	receita: number;
	receitaIncremental: number;
};

// Nomes de negócio para a leitura de resultado (a permanência em segmentação é, na prática, a
// campanha de reativação). Ícones vêm do TRIGGER_META, o mesmo do construtor.
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
	PESQUISA: "Pesquisa",
	RECORRENTE: "Recorrente",
	ANIVERSARIO_CLIENTE: "Aniversário",
	"PIOR-DIA-VENDAS": "Pior dia de vendas",
};

type CampaignTriggerDistributionBlockProps = {
	overall: TGetCampaignStatsOverallOutput["data"] | undefined;
	isLoading: boolean;
};

/** Receita agrupada por tipo de gatilho, com a parte incremental destacada dentro de cada barra. */
export function CampaignTriggerDistributionBlock({ overall, isLoading }: CampaignTriggerDistributionBlockProps) {
	const groups: TriggerGroup[] = useMemo(() => {
		if (!overall?.campanhas) return [];
		const map = new Map<string, TriggerGroup>();
		for (const c of overall.campanhas) {
			const gatilho = c.gatilhoTipo ?? "DESCONHECIDO";
			const entry = map.get(gatilho) ?? {
				gatilho,
				label: TRIGGER_LABELS[gatilho] ?? gatilho,
				interacoes: 0,
				conversoes: 0,
				receita: 0,
				receitaIncremental: 0,
			};
			entry.interacoes += Number(c.interacoes ?? 0);
			entry.conversoes += Number(c.conversoes ?? 0);
			entry.receita += Number(c.receitaTotal ?? 0);
			entry.receitaIncremental += Number(c.receitaIncremental ?? 0);
			map.set(gatilho, entry);
		}
		return [...map.values()].filter((group) => group.receita > 0 || group.interacoes > 0).sort((a, b) => b.receita - a.receita);
	}, [overall]);

	const maxReceita = Math.max(...groups.map((g) => g.receita), 1);

	return (
		<Section.Root className="h-full">
			<Section.Header>
				<Section.Icon>
					<Zap />
				</Section.Icon>
				<Section.Title>Receita por tipo de gatilho</Section.Title>
				<Section.Actions>
					<div className="flex items-center gap-3 text-[0.65rem] font-semibold text-muted-foreground uppercase">
						<span className="flex items-center gap-1">
							<span className="size-2 rounded-full bg-[#FFB900]" />
							Incremental
						</span>
						<span className="flex items-center gap-1">
							<span className="size-2 rounded-full bg-muted-foreground/40" />
							Demais
						</span>
					</div>
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				{isLoading ? (
					<div className="flex flex-col gap-3">
						{[0, 1, 2, 3, 4].map((i) => (
							<div key={i} className="h-10 animate-pulse rounded-lg bg-muted/40" />
						))}
					</div>
				) : groups.length > 0 ? (
					<ul className="flex flex-col gap-4">
						{groups.map((group) => {
							const Icon = getTriggerMeta(group.gatilho as TCampaignTriggerTypeEnum)?.icon ?? Megaphone;
							const totalWidth = (group.receita / maxReceita) * 100;
							const incrementalShare = group.receita > 0 ? Math.min(group.receitaIncremental / group.receita, 1) : 0;
							return (
								<li key={group.gatilho} className="flex items-start gap-2.5">
									<span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
										<Icon className="size-4 min-h-4 min-w-4" />
									</span>
									<div className="flex min-w-0 flex-1 flex-col gap-1">
										<div className="flex items-baseline justify-between gap-2">
											<span className="truncate text-sm font-semibold">{group.label}</span>
											<span className="shrink-0 text-sm font-bold tabular-nums">{formatToMoney(group.receita)}</span>
										</div>
										<div className="flex h-1.5 gap-0.5" style={{ width: `${Math.max(totalWidth, 2)}%` }}>
											{incrementalShare > 0 ? <div className="h-full rounded-full bg-[#FFB900]" style={{ width: `${incrementalShare * 100}%` }} /> : null}
											{incrementalShare < 1 ? <div className="h-full flex-1 rounded-full bg-muted-foreground/25" /> : null}
										</div>
										<div className="flex flex-wrap items-center gap-x-3 text-[0.7rem] text-muted-foreground tabular-nums">
											<span className="font-bold text-[#B98500] dark:text-[#FFB900]">{formatToMoney(group.receitaIncremental)} incr.</span>
											<span>{formatDecimalPlaces(group.conversoes)} conv.</span>
											<span>{formatDecimalPlaces(group.interacoes)} msg</span>
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="py-6 text-center text-sm text-muted-foreground">Nenhum dado de campanhas disponível.</p>
				)}
			</Section.Body>
		</Section.Root>
	);
}

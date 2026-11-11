"use client";

import type { TGetConversionQualityOutput } from "@/app/api/campaigns/stats/conversion-quality/route";
import { Section } from "@/components/ui/section";
import { formatDecimalPlaces } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { ArrowLeftRight, Diamond, RefreshCw, Rocket, Ticket, UserPlus, Zap } from "lucide-react";
import type { ComponentType } from "react";

type TBucket = {
	key: string;
	label: string;
	hint: string;
	icon: ComponentType<{ className?: string }>;
	barClass: string;
	iconClass: string;
	quantidade: number;
};

/**
 * Que tipo de conversão as campanhas trouxeram: cliente novo, cliente resgatado, compra antecipada
 * e o resto (regulares e atrasadas, que só contam o que excedeu o ticket habitual).
 */
export function ConversionQualityBand({ quality, isLoading }: { quality: TGetConversionQualityOutput["data"] | undefined; isLoading?: boolean }) {
	const byType = (tipo: string) => quality?.distribuicaoTipos.find((item) => item.tipo === tipo)?.quantidade ?? 0;
	const buckets: TBucket[] = [
		{
			key: "AQUISICAO",
			label: "Aquisições",
			hint: "Novos clientes",
			icon: UserPlus,
			barClass: "bg-green-500",
			iconClass: "text-green-600 dark:text-green-400",
			quantidade: byType("AQUISICAO"),
		},
		{
			key: "REATIVACAO",
			label: "Reativações",
			hint: "Clientes resgatados",
			icon: RefreshCw,
			barClass: "bg-blue-500",
			iconClass: "text-blue-600 dark:text-blue-400",
			quantidade: byType("REATIVACAO"),
		},
		{
			key: "ACELERACAO",
			label: "Acelerações",
			hint: "Compraram mais rápido",
			icon: Zap,
			barClass: "bg-yellow-500",
			iconClass: "text-yellow-600 dark:text-yellow-400",
			quantidade: byType("ACELERACAO"),
		},
		{
			key: "DEMAIS",
			label: "Demais",
			hint: "Regulares e atrasadas",
			icon: ArrowLeftRight,
			barClass: "bg-muted-foreground/40",
			iconClass: "text-muted-foreground",
			quantidade: byType("REGULAR") + byType("ATRASADA"),
		},
	];
	const total = buckets.reduce((acc, bucket) => acc + bucket.quantidade, 0);
	const ticketDelta = quality?.impactoMonetario.deltaMonetarioPercentualMedio ?? 0;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Diamond />
				</Section.Icon>
				<Section.Title>Qualidade das conversões</Section.Title>
				<Section.Count>{formatDecimalPlaces(total)}</Section.Count>
			</Section.Header>
			<Section.Bleed>
				<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem]">
					<div className={cn("flex flex-col gap-4 px-4 py-5", isLoading && "animate-pulse")}>
						<div className="flex h-6 w-full gap-1">
							{total > 0 ? (
								buckets
									.filter((bucket) => bucket.quantidade > 0)
									.map((bucket) => {
										const share = (bucket.quantidade / total) * 100;
										return (
											<div
												key={bucket.key}
												className={cn("flex h-full min-w-6 items-center rounded-md px-2 text-[0.65rem] font-bold text-white", bucket.barClass)}
												style={{ width: `${share}%` }}
												title={`${bucket.label}: ${formatDecimalPlaces(share)}%`}
											>
												<span className="truncate">{formatDecimalPlaces(share)}%</span>
											</div>
										);
									})
							) : (
								<div className="h-full w-full rounded-md bg-muted" />
							)}
						</div>
						<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
							{buckets.map((bucket) => {
								const Icon = bucket.icon;
								return (
									<div key={bucket.key} className="flex flex-col gap-0.5">
										<span className="flex items-center gap-1.5 text-label">
											<Icon className={cn("size-3.5 min-h-3.5 min-w-3.5", bucket.iconClass)} />
											{bucket.label}
										</span>
										<span className="text-2xl font-extrabold tracking-tight tabular-nums">{formatDecimalPlaces(bucket.quantidade)}</span>
										<span className="text-[0.7rem] text-muted-foreground">{bucket.hint}</span>
									</div>
								);
							})}
						</div>
					</div>
					<div className="flex flex-col border-t border-border lg:border-t-0 lg:border-l">
						<div className="flex flex-1 flex-col gap-0.5 px-4 py-4">
							<div className="flex items-start justify-between gap-2">
								<span className="text-label text-muted-foreground">Antecipação média</span>
								<Rocket className="size-4 min-h-4 min-w-4 text-muted-foreground" />
							</div>
							<span className="text-2xl font-extrabold tracking-tight tabular-nums">
								{formatDecimalPlaces(quality?.impactoFrequencia.mediasDiasAntecipados ?? 0)} dias
							</span>
							<span className="text-[0.7rem] text-muted-foreground">Dias economizados</span>
						</div>
						<div className="flex flex-1 flex-col gap-0.5 border-t border-border px-4 py-4">
							<div className="flex items-start justify-between gap-2">
								<span className="text-label text-muted-foreground">Impacto no ticket</span>
								<Ticket className="size-4 min-h-4 min-w-4 text-muted-foreground" />
							</div>
							<span
								className={cn(
									"text-2xl font-extrabold tracking-tight tabular-nums",
									ticketDelta > 0 && "text-green-600 dark:text-green-400",
									ticketDelta < 0 && "text-red-600 dark:text-red-400",
								)}
							>
								{ticketDelta > 0 ? "+" : ""}
								{formatDecimalPlaces(ticketDelta)}%
							</span>
							<span className="text-[0.7rem] text-muted-foreground">Variação média</span>
						</div>
					</div>
				</div>
			</Section.Bleed>
		</Section.Root>
	);
}

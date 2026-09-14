"use client";

import { CalendarClock } from "lucide-react";
import type { TGetStoreCreditStatsOutput } from "@/app/api/finances/store-credit/stats/route";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";

type StoreCreditAgingProps = {
	faixas: TGetStoreCreditStatsOutput["data"]["faixas"] | undefined;
	isLoading: boolean;
};

/**
 * Distribuição do que está em aberto por idade da dívida. É informação, não controle: o recorte por
 * faixa mora no filtro "FAIXA DE ATRASO", que é o componente que o app inteiro usa para filtrar.
 */
export function StoreCreditAging({ faixas, isLoading }: StoreCreditAgingProps) {
	const total = (faixas ?? []).reduce((acc, faixa) => acc + faixa.valor, 0);

	return (
		<div className="text-numeric bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex items-center justify-start gap-2">
				<CalendarClock className="h-4 w-4 min-h-4 min-w-4" />
				<h1 className="text-xs font-medium leading-none tracking-tight">IDADE DA DÍVIDA</h1>
			</div>
			<div className="flex w-full flex-col gap-2">
				{(faixas ?? []).map((faixa) => {
					const share = total > 0 ? (faixa.valor / total) * 100 : 0;
					const isOverdue = faixa.chave !== "A_VENCER";
					return (
						<div key={faixa.chave} className="flex w-full flex-col gap-1">
							<div className="flex w-full items-center justify-between gap-2">
								<h2 className={cn("text-xs font-medium tracking-tight", isOverdue ? "text-red-700 dark:text-red-400" : "text-foreground")}>{faixa.rotulo}</h2>
								<div className="flex items-center gap-2">
									<span className="text-[0.65rem] text-muted-foreground">
										{faixa.titulos} {faixa.titulos === 1 ? "venda" : "vendas"}
									</span>
									<span className="text-xs font-medium">{isLoading ? "..." : formatToMoney(faixa.valor)}</span>
								</div>
							</div>
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
								<div
									className={cn("h-full rounded-full transition-[width] duration-500 ease-out", isOverdue ? "bg-red-500" : "bg-primary")}
									style={{ width: `${share}%` }}
								/>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

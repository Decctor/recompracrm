"use client";

import type { TGetProductionsOutputDefault } from "@/app/api/productions/route";
import { RecipeCover } from "@/app/dashboard/production/_components/recipe-cover";
import { formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { getProductionItemQuantity } from "@/lib/productions/valuation";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { ChevronRight, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { formatMinutesAsDuration, formatProductionDay, formatProductionQuantity } from "./production-format";
import { PRODUCTION_STATUS_META } from "./production-status-meta";

type TProductionListItem = TGetProductionsOutputDefault["productions"][number];

function sumQuantities(items: { quantidadePrevista: number | null; quantidadeReal: number | null }[], pick: "prevista" | "real") {
	return items.reduce((total, item) => total + ((pick === "real" ? item.quantidadeReal : item.quantidadePrevista) ?? 0), 0);
}

function getStatusCaption(production: TProductionListItem, now: number) {
	switch (production.status) {
		case "RASCUNHO":
			return "continue de onde parou";
		case "PLANEJADA": {
			// `dataInicio` guarda o início previsto enquanto a produção não começa.
			if (!production.dataInicio) return "aguardando início";
			const start = dayjs(production.dataInicio);
			return start.isSame(dayjs(now), "day")
				? `início previsto às ${start.format("HH:mm")}`
				: `início previsto em ${formatProductionDay(production.dataInicio)} às ${start.format("HH:mm")}`;
		}
		case "EM_PRODUCAO": {
			const startedAt = production.dataInicio ?? production.dataInsercao;
			return `iniciada há ${formatMinutesAsDuration(dayjs(now).diff(dayjs(startedAt), "minute"))}`;
		}
		case "CONCLUIDA": {
			const day = `em ${formatProductionDay(production.dataConclusao ?? production.dataInsercao)}`;
			const expected = sumQuantities(production.saidas, "prevista");
			const actual = sumQuantities(production.saidas, "real");
			return expected > 0 && actual > 0 ? `${day} · rendeu ${Math.round((actual / expected) * 100)}%` : day;
		}
		// Não há data de cancelamento gravada: o rótulo do status basta.
		case "CANCELADA":
			return null;
	}
}

function getValuationLine(production: TProductionListItem) {
	if (production.status === "CANCELADA") return "sem baixa de estoque";
	const { valores } = production;
	const margin = valores.margemPercentual !== null ? `${Math.round(valores.margemPercentual)}%` : "—";
	const line = `custo ${formatToMoney(valores.custoTotal)} · margem ${margin}`;
	// Só a concluída tem valores congelados; as demais são projeção pelo catálogo.
	return valores.origemValores === "SNAPSHOT" ? line : `previsto · ${line}`;
}

export default function ProductionListCard({ production, now }: { production: TProductionListItem; now: number }) {
	const meta = PRODUCTION_STATUS_META[production.status];
	const StatusIcon = meta.icon;
	const isDraft = production.status === "RASCUNHO";
	const isCancelled = production.status === "CANCELADA";
	const caption = getStatusCaption(production, now);

	const mainOutput = production.saidas[0] ?? null;
	const unit = mainOutput?.produto?.unidade ?? null;
	const outputQuantity = mainOutput
		? production.status === "CONCLUIDA"
			? getProductionItemQuantity(mainOutput)
			: (mainOutput.quantidadePrevista ?? mainOutput.quantidadeReal ?? 0)
		: null;

	const reincorporatedInputs = production.entradas.filter((input) => input.reincorporado);
	const reincorporatedQuantity = reincorporatedInputs.reduce((total, input) => total + getProductionItemQuantity(input), 0);

	const authorship = `Criada em ${formatProductionDay(production.dataInsercao)}`;

	return (
		<Link
			href={appRoutes.productions.detail(production.id)}
			className={cn(
				"group flex w-full flex-wrap items-center gap-x-5 gap-y-3.5 rounded-3xl border border-border bg-card px-4 py-4 shadow-2xs transition-all hover:shadow-sm sm:px-[18px]",
				isDraft && "border-dashed",
			)}
		>
			<div className="flex min-w-0 flex-[1_1_240px] items-center gap-3.5">
				<RecipeCover recipe={production.receita} className="h-11 w-11 shrink-0 rounded-[14px]" iconClassName="size-5" />
				<div className="flex min-w-0 flex-col gap-1">
					<span className="truncate text-[15px] font-bold tracking-tight">{production.titulo}</span>
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-muted-foreground">
						<span>{production.receita?.titulo ?? "Produção manual"}</span>
						{reincorporatedInputs.length > 0 ? (
							<span className="inline-flex items-center gap-1 rounded-full bg-warning-surface px-2 py-0.5 text-[11px] font-semibold text-warning-surface-foreground">
								<RefreshCcw className="h-3 w-3" />
								Saldo {formatProductionQuantity(reincorporatedQuantity, unit)}
							</span>
						) : null}
					</div>
					<span className="text-[11px] font-semibold text-muted-foreground">
						{production.autor?.nome ? `${authorship} por ${production.autor.nome}` : authorship}
					</span>
				</div>
			</div>

			<div className="flex min-w-0 flex-[1_1_340px] items-center gap-5">
				<div className="flex min-w-[150px] max-w-[280px] flex-auto flex-col gap-2.5">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
						<span className={cn("inline-flex items-center gap-1.5 rounded-full py-[3px] pl-2 pr-2.5 text-xs font-bold", meta.chipClassName)}>
							<StatusIcon className="h-3.5 w-3.5" />
							{meta.label}
						</span>
						{caption ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
					</div>
					<div className="grid grid-cols-4 gap-1" aria-hidden>
						{[1, 2, 3, 4].map((step) => (
							<span key={step} className={cn("h-1.5 rounded-full", !isCancelled && step <= meta.step ? meta.barClassName : "bg-border")} />
						))}
					</div>
				</div>
				<div className="ml-auto flex items-center gap-4">
					<div className="flex min-w-[120px] flex-col items-end gap-0.5">
						<span
							className={cn("whitespace-nowrap text-[17px] font-extrabold tracking-tight tabular-nums", isCancelled && "text-muted-foreground line-through")}
						>
							{outputQuantity !== null ? formatProductionQuantity(outputQuantity, unit) : "—"}
						</span>
						<span className="text-right text-[11px] font-semibold text-muted-foreground">{getValuationLine(production)}</span>
					</div>
					<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
				</div>
			</div>
		</Link>
	);
}

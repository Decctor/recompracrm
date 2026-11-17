"use client";

import { Chip } from "@/components/ui/chip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TValuationOrigin } from "@/lib/productions/valuation";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { AlertTriangle, Coins, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

type ValuationChipsProps = {
	valores: {
		/** `null` para quem não vê custos (dadosSensiveis.visualizarCustos): o chip some, junto com o da margem. */
		custoTotal: number | null;
		retornoEsperado: number;
		margem: number | null;
		margemPercentual: number | null;
		custoCompleto: boolean;
		retornoCompleto: boolean;
		origemValores: TValuationOrigin;
		/** Só a valoração de produção carrega este campo, e só quando a origem é `SNAPSHOT`. */
		dataSnapshotValores?: string | Date | null;
	};
};

const ORIGIN_HINT: Record<TValuationOrigin, string> = {
	SNAPSHOT: "Valores congelados na conclusão da produção.",
	PROJECAO: "Estimativa pelos preços atuais do catálogo — a valoração definitiva é congelada na conclusão da produção.",
	CATALOGO: "Calculado com os preços atuais do catálogo.",
};

/**
 * Pills de custo, retorno esperado e margem — mesma geometria da linha de metadados dos cards; o que
 * varia é a cor da margem e o tracejado, que marca produções ainda não concluídas (valores projetados).
 */
export function ValuationChips({ valores }: ValuationChipsProps) {
	const isProjection = valores.origemValores === "PROJECAO";
	const marginIsNegative = valores.margem != null && valores.margem < 0;
	const originHint = buildOriginHint(valores);

	return (
		<>
			{valores.custoTotal != null ? (
			<ValuationChip
				variant="muted"
				isProjection={isProjection}
				icon={valores.custoCompleto ? <Coins /> : <AlertTriangle />}
				label={`CUSTO: ${formatToMoney(valores.custoTotal)}`}
				tooltip={
					valores.custoCompleto
						? `Custo dos insumos. ${originHint}`
						: `Custo dos insumos, subestimado: há insumo sem preço de custo cadastrado. ${originHint}`
				}
			/>
			) : null}
			<ValuationChip
				variant="muted"
				isProjection={isProjection}
				icon={valores.retornoCompleto ? <TrendingUp /> : <AlertTriangle />}
				label={`RETORNO: ${formatToMoney(valores.retornoEsperado)}`}
				tooltip={
					valores.retornoCompleto
						? `Retorno esperado das saídas. ${originHint}`
						: `Retorno esperado das saídas, subestimado: há saída sem preço de venda cadastrado. ${originHint}`
				}
			/>
			{valores.margem != null ? (
			<ValuationChip
				variant={marginIsNegative ? "destructive" : "success"}
				isProjection={isProjection}
				icon={marginIsNegative ? <TrendingDown /> : <TrendingUp />}
				label={`MARGEM: ${formatToMoney(valores.margem)}${
					valores.margemPercentual !== null ? ` (${formatDecimalPlaces(valores.margemPercentual, 0, 1)}%)` : ""
				}`}
				tooltip={`Retorno esperado menos custo dos insumos. ${originHint}`}
			/>
			) : null}
		</>
	);
}

function buildOriginHint(valores: ValuationChipsProps["valores"]) {
	if (valores.origemValores !== "SNAPSHOT") return ORIGIN_HINT[valores.origemValores];

	const snapshotDate = formatDateAsLocale(valores.dataSnapshotValores, true);
	return snapshotDate ? `Valores congelados na conclusão, em ${snapshotDate}.` : ORIGIN_HINT.SNAPSHOT;
}

function ValuationChip({
	variant,
	icon,
	label,
	tooltip,
	isProjection,
}: {
	variant: "muted" | "success" | "destructive";
	icon: ReactNode;
	label: string;
	tooltip: string;
	isProjection: boolean;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Chip.Root variant={variant} size="xs" shape="pill" className={cn("cursor-default", isProjection && "border-dashed border-current/40")}>
						<Chip.Icon>{icon}</Chip.Icon>
						<Chip.Label caps weight="bold">
							{label}
						</Chip.Label>
					</Chip.Root>
				}
			/>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	);
}

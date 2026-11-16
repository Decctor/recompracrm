"use client";

import { Input } from "@/components/ui/input";
import {
	describeConvertedLine,
	formatConversionFactor,
	getMeasureConversionFactor,
	inferPackFactorFromDescription,
	normalizeUnit,
	parseConversionFactor,
	unitsAreEquivalent,
} from "@/lib/purchase/units";
import { cn } from "@/lib/utils";
import { Ruler, Sparkles } from "lucide-react";
import type { TReviewLine } from "../helpers/review-lines";
import { TONE_CLASSES } from "./builder-ui";

export type TConversionTarget = {
	/** Product + unit the factor is answered for: a typed factor only survives while this stays the same. */
	key: string;
	/** Unit the product is stocked in, as registered. Null when the product has none. */
	unit: string | null;
	defaultFactor: number | null;
	suggestion: { fator: number; label: string } | null;
};

/**
 * What the proportion of a line starts at, for a given stock unit: the factor already answered,
 * the one learned from earlier invoices, 1 for the same unit, or the physical conversion
 * (1 KG = 1000 G). Pack sizes read from the description are only offered, never assumed.
 * `isLineProduct` = the unit belongs to the product the line already carries, so its answered
 * and learned factors still apply.
 */
export function buildConversionTarget({
	line,
	unit,
	productKey,
	isLineProduct,
}: {
	line: TReviewLine;
	unit: string | null;
	productKey: string;
	isLineProduct: boolean;
}): TConversionTarget {
	const equivalent = unitsAreEquivalent(line.unidade, unit);
	const measure = getMeasureConversionFactor(line.unidade, unit);
	const learned = isLineProduct && line.matchTipo === "MAPEADO" && !line.manualOverride ? line.fatorConversaoSugerido : null;
	const pack = equivalent ? null : inferPackFactorFromDescription(line.descricao);
	const answered = isLineProduct && line.fatorConversao && line.fatorConversao > 0 ? line.fatorConversao : null;
	return {
		key: `${productKey}|${normalizeUnit(unit) ?? ""}`,
		unit,
		defaultFactor: answered ?? learned ?? (equivalent ? 1 : measure),
		suggestion: learned
			? { fator: learned, label: "aprendido nas notas anteriores" }
			: measure
				? { fator: measure, label: "conversão de medida" }
				: pack
					? { fator: pack, label: "lido na descrição do item" }
					: null,
	};
}

/** Same unit and 1:1 is the default, not a conversion: stored as null like any line that needs none. */
export function toStoredFactor({ line, unit, fator }: { line: TReviewLine; unit: string | null; fator: number | null }) {
	if (fator === null) return null;
	return fator === 1 && unitsAreEquivalent(line.unidade, unit) ? null : fator;
}

export function ConversionField({
	line,
	conversion,
	text,
	onChange,
	autoFocus,
}: {
	line: TReviewLine;
	conversion: TConversionTarget;
	text: string;
	onChange: (text: string) => void;
	autoFocus?: boolean;
}) {
	const documentUnit = line.unidade?.trim() || "UN";
	const productUnit = conversion.unit?.trim() || "UN";
	const fator = parseConversionFactor(text);
	const equivalent = unitsAreEquivalent(line.unidade, conversion.unit);
	return (
		<div className="flex flex-col gap-2.5 rounded-xl border border-border px-3.5 py-3">
			<div className="flex flex-col gap-0.5">
				<p className="flex items-center gap-1.5 text-[0.7rem] font-extrabold uppercase tracking-widest text-muted-foreground">
					<Ruler className="h-3 w-3" />
					Proporção
				</p>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{equivalent ? (
						<>
							Cada <strong className="text-foreground">{documentUnit}</strong> da nota entra como 1 {productUnit} no estoque. Mude se vier mais
							de um por embalagem (uma caixa com 12, por exemplo).
						</>
					) : (
						<>
							A nota fatura em <strong className="text-foreground">{documentUnit}</strong> e o produto é estocado em{" "}
							<strong className="text-foreground">{productUnit}</strong>.
						</>
					)}
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-2 text-sm font-medium">
				<span>1 {documentUnit} =</span>
				<Input
					value={text}
					onChange={(event) => onChange(event.target.value.replace(/[^\d.,]/g, ""))}
					placeholder="?"
					inputMode="decimal"
					aria-label={`Quantos ${productUnit} há em 1 ${documentUnit}`}
					className="h-9 w-24 text-center font-semibold"
					autoFocus={autoFocus}
				/>
				<span>{productUnit}</span>
				{conversion.suggestion && fator !== conversion.suggestion.fator ? (
					<button
						type="button"
						onClick={() => onChange(formatConversionFactor(conversion.suggestion?.fator ?? null))}
						className={cn("flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", TONE_CLASSES.info)}
					>
						<Sparkles className="h-3 w-3" />
						Usar {formatConversionFactor(conversion.suggestion.fator)} · {conversion.suggestion.label}
					</button>
				) : null}
			</div>
			<div className="flex flex-wrap justify-between gap-2 rounded-md bg-muted/70 px-2.5 py-2 text-xs">
				<span className="text-muted-foreground">Entra no estoque como</span>
				<span className="font-mono font-semibold">
					{fator !== null
						? describeConvertedLine({ quantidade: line.quantidade, valorUnitario: line.valorUnitario, fatorConversao: fator, unit: productUnit })
						: "—"}
				</span>
			</div>
		</div>
	);
}

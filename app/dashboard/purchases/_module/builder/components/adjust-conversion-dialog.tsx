"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatConversionFactor, parseConversionFactor } from "@/lib/purchase/units";
import { useState } from "react";
import { getLineInternalUnit, type TReviewLine } from "../helpers/review-lines";
import { buildConversionTarget, ConversionField, toStoredFactor } from "./conversion-field";

type AdjustConversionDialogProps = {
	line: TReviewLine;
	/** Supplier the link is remembered for, when the line will be remembered. */
	rememberedFor: string | null;
	onClose: () => void;
	onSave: (fatorConversao: number | null) => void;
};

/**
 * Changes the proportion of a line that is already linked, including the ones that arrived ready
 * (same code, same unit) and never went through the queue.
 */
export default function AdjustConversionDialog({ line, rememberedFor, onClose, onSave }: AdjustConversionDialogProps) {
	const unit = getLineInternalUnit(line);
	const conversion = buildConversionTarget({ line, unit, productKey: "line", isLineProduct: true });
	const [text, setText] = useState(() => formatConversionFactor(conversion.defaultFactor));
	const fator = parseConversionFactor(text);
	const productName = line.produtoVariante ? `${line.produto?.nome} - ${line.produtoVariante.nome}` : (line.produto?.nome ?? line.produtoNovo?.nome ?? "");

	function save() {
		if (fator === null) return;
		onSave(toStoredFactor({ line, unit, fator }));
		onClose();
	}

	return (
		<Dialog
			open
			onOpenChange={(isOpen) => {
				if (!isOpen) onClose();
			}}
		>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>AJUSTAR PROPORÇÃO</DialogTitle>
					<DialogDescription className="[overflow-wrap:anywhere]">
						{line.descricao} → <strong className="text-foreground">{productName}</strong>
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-2.5"
					onSubmit={(event) => {
						event.preventDefault();
						save();
					}}
				>
					<ConversionField line={line} conversion={conversion} text={text} onChange={setText} autoFocus />
					{rememberedFor ? (
						<p className="text-xs text-muted-foreground">
							A proporção fica lembrada com o vínculo: as próximas notas de <strong className="text-foreground">{rememberedFor}</strong> já chegam
							convertidas.
						</p>
					) : null}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							CANCELAR
						</Button>
						<Button type="submit" disabled={fator === null}>
							SALVAR PROPORÇÃO
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

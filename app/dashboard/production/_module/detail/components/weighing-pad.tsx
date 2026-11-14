"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight, Delete, Lock } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cn } from "@/lib/utils";
import {
	formatPadValue,
	formatQuantity,
	getItemName,
	getItemUnit,
	isWeighed,
	pressPadKey,
	type TProductionInputRow,
	type TProductionOutputRow,
	type TWeighItemKind,
} from "../helpers/production-detail";
import { PlannedChip } from "./items-panel";
import { PanelEmptyState } from "./panel-empty-state";

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"] as const;

type WeighingPadProps = {
	current: { kind: TWeighItemKind; item: TProductionInputRow | TProductionOutputRow };
	/** Há item não conferido depois do atual — muda o rótulo para "CONFIRMAR E PRÓXIMO". */
	pendingAfter: boolean;
	onConfirm: (quantidadeReal: number) => void;
	/** Desfaz a conferência (`quantidadeReal` volta a nulo). */
	onReset: () => void;
};

/**
 * Teclado da pesagem. Os dígitos enchem um buffer de centésimos (valor = buffer / 100). Vazio, o visor
 * mostra o previsto (ou o já pesado) em tom apagado, e confirmar grava esse valor.
 */
export function WeighingPad({ current, pendingAfter, onConfirm, onReset }: WeighingPadProps) {
	const [buffer, setBuffer] = useState("");
	const { kind, item } = current;
	const unit = getItemUnit(item);
	const weighed = isWeighed(item);
	const fallbackValue = item.quantidadeReal ?? item.quantidadePrevista ?? 0;
	const typedValue = buffer !== "" ? Number.parseInt(buffer, 10) / 100 : null;
	const padKind = kind === "SAIDA" ? "Saída" : "reincorporado" in item && item.reincorporado ? "Saldo reincorporado" : "Insumo";

	// Trocar de item descarta o que estava digitado.
	const [bufferOwner, setBufferOwner] = useState(item.id);
	if (bufferOwner !== item.id) {
		setBufferOwner(item.id);
		setBuffer("");
	}

	function confirm() {
		const value = typedValue ?? fallbackValue;
		if (Number.isNaN(value)) return;
		setBuffer("");
		onConfirm(value);
	}

	function reset() {
		setBuffer("");
		if (weighed) onReset();
	}

	// Teclado físico (ou balança que digita): dígitos, Backspace e Enter, fora de campos de texto e diálogos.
	const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
		if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
		const target = event.target as HTMLElement | null;
		if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
		if (document.querySelector("[role='dialog'], [role='alertdialog']")) return;
		if (/^\d$/.test(event.key)) {
			event.preventDefault();
			setBuffer((previous) => pressPadKey(previous, event.key));
		} else if (event.key === "Backspace") {
			event.preventDefault();
			setBuffer((previous) => previous.slice(0, -1));
		} else if (event.key === "Enter" && !(target instanceof HTMLButtonElement)) {
			event.preventDefault();
			confirm();
		}
	});
	useEffect(() => {
		const listener = (event: KeyboardEvent) => handleKeyDown(event);
		window.addEventListener("keydown", listener);
		return () => window.removeEventListener("keydown", listener);
	}, []);

	return (
		<>
			<div className="flex flex-col gap-0.5 px-1 py-0.5">
				<span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{padKind}</span>
				<span className="text-base font-bold">{getItemName(item)}</span>
				<span className="text-xs text-muted-foreground">Previsto {formatQuantity(item.quantidadePrevista, unit)}</span>
			</div>
			<div className="flex flex-col gap-1.5">
				<output aria-live="polite" className="flex items-center justify-end gap-2 rounded-xl border-2 border-primary bg-primary/[0.04] px-4 py-3">
					{buffer === "" && !weighed ? (
						<span className="mr-auto">
							<PlannedChip />
						</span>
					) : null}
					<span
						className={cn(
							"text-[44px] font-extrabold leading-none tracking-tight tabular-nums",
							buffer !== "" || weighed ? "text-foreground" : "text-muted-foreground",
						)}
					>
						{formatPadValue(typedValue ?? fallbackValue)}
					</span>
					<span className="text-base font-semibold text-muted-foreground">{unit}</span>
				</output>
				<span className="px-1 text-xs text-muted-foreground">
					{buffer === ""
						? weighed
							? "Conferido. Digite para corrigir."
							: "Preenchido com o previsto. Digite para substituir ou confirme."
						: "Novo valor"}
				</span>
			</div>
			<div className="grid grid-cols-3 gap-2">
				{PAD_KEYS.map((key) => (
					<button
						key={key}
						type="button"
						aria-label={key === "back" ? "Apagar" : key}
						onClick={() => setBuffer((previous) => (key === "back" ? previous.slice(0, -1) : pressPadKey(previous, key)))}
						className="flex h-[60px] items-center justify-center rounded-xl border border-border bg-card text-2xl font-semibold shadow-xs transition-colors hover:bg-muted/40 active:bg-muted"
					>
						{key === "back" ? <Delete className="h-5.5 w-5.5" /> : key}
					</button>
				))}
			</div>
			<div className="grid grid-cols-[auto_1fr] gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={reset}
					disabled={buffer === "" && !weighed}
					className="h-14 rounded-full px-3.5 text-[13px] font-semibold"
				>
					REDEFINIR
				</Button>
				<Button type="button" onClick={confirm} className="h-14 gap-2 rounded-full text-[15px] font-bold">
					{pendingAfter ? "CONFIRMAR E PRÓXIMO" : "CONFIRMAR"}
					<ArrowRight className="h-4.5 w-4.5" />
				</Button>
			</div>
		</>
	);
}

/** Pesagem antes de iniciar, sem permissão ou sem itens: o painel explica em vez de sumir. */
export function WeighingLocked({ text }: { text: string }) {
	return <PanelEmptyState icon={Lock} text={text} />;
}

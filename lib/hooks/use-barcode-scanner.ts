"use client";

import { useEffect, useRef, type RefObject } from "react";
import { BARCODE_SCAN_TERMINATOR_KEYS, createBarcodeScanDetector } from "@/lib/pos/barcode-scan-detector";

// Cola entre o detector puro (lib/pos/barcode-scan-detector.ts) e o `window`. Ouve `keydown` na
// fase de captura para agir antes de qualquer handler do React: o Enter do leitor não pode
// confirmar a busca nem "clicar" o botão que estiver focado, e o Tab não pode mover o foco.
// Quando a rajada caiu dentro de um campo de texto, o texto do leitor é removido dele — os
// caracteres já entraram antes de sabermos que eram uma leitura.

export type TBarcodeScanBlockedReason = "DIALOG";

type UseBarcodeScannerOptions = {
	onScan: (code: string) => void;
	enabled?: boolean;
	/**
	 * Elemento dono da leitura. Com um dialog aberto (builder, aprovação de desconto, cadastro de
	 * cliente), a leitura só vale se o dono estiver dentro dele — senão o código viraria item sem
	 * o operador ver, ou cairia num PIN. Sem dono, qualquer dialog aberto bloqueia.
	 */
	ownerRef?: RefObject<HTMLElement | null>;
	onBlocked?: (reason: TBarcodeScanBlockedReason) => void;
};

type TBurstField = { element: HTMLInputElement | HTMLTextAreaElement; valueBefore: string };

const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image", "hidden"]);

function asTextField(target: EventTarget | null): TBurstField["element"] | null {
	if (target instanceof HTMLTextAreaElement) return target;
	if (target instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(target.type)) return target;
	return null;
}

/**
 * Remove do campo o que o leitor digitou e avisa o React pelo evento nativo `input` — atribuir
 * `.value` direto não passa pelo `onChange` de um campo controlado.
 */
function stripScannedText(field: TBurstField, code: string) {
	const { element, valueBefore } = field;
	if (!element.isConnected) return;
	const current = element.value;
	let next: string | null = null;
	try {
		const end = element.selectionStart ?? current.length;
		const start = end - code.length;
		if (start >= 0 && current.slice(start, end) === code) next = current.slice(0, start) + current.slice(end);
	} catch {
		// `selectionStart` lança em `type="number"`; cai no caminho abaixo.
	}
	if (next === null && current === valueBefore + code) next = valueBefore;
	if (next === null) return; // O campo mudou de outro jeito: foi o usuário, não mexe.

	const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
	const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
	if (setter) setter.call(element, next);
	else element.value = next;
	element.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Toda camada de dialog aberta precisa conter o dono; senão a leitura é de outra janela. */
function isScanAllowed(owner: HTMLElement | null) {
	const openDialogs = document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
	if (openDialogs.length === 0) return true;
	if (!owner) return false;
	for (const dialog of openDialogs) if (!dialog.contains(owner)) return false;
	return true;
}

export function useBarcodeScanner({ onScan, enabled = true, ownerRef, onBlocked }: UseBarcodeScannerOptions) {
	const onScanRef = useRef(onScan);
	const onBlockedRef = useRef(onBlocked);
	useEffect(() => {
		onScanRef.current = onScan;
		onBlockedRef.current = onBlocked;
	}, [onScan, onBlocked]);

	useEffect(() => {
		if (!enabled) return;
		const detector = createBarcodeScanDetector();
		let burstField: TBurstField | null = null;

		function handleKeyDown(event: KeyboardEvent) {
			if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
				detector.reset();
				burstField = null;
				return;
			}

			if (BARCODE_SCAN_TERMINATOR_KEYS.has(event.key)) {
				const code = detector.terminate(event.timeStamp);
				const field = burstField;
				burstField = null;
				if (!code) return;
				// O sufixo é do leitor: não confirma formulário, não clica botão focado, não move o foco.
				event.preventDefault();
				event.stopPropagation();
				if (field) stripScannedText(field, code);
				if (!isScanAllowed(ownerRef?.current ?? null)) {
					onBlockedRef.current?.("DIALOG");
					return;
				}
				onScanRef.current(code);
				return;
			}

			if (detector.pushKey(event.key, event.timeStamp) === "started") {
				const element = asTextField(event.target);
				burstField = element ? { element, valueBefore: element.value } : null;
			}
		}

		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [enabled, ownerRef]);
}

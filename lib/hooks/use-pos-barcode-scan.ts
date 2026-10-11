"use client";

import { useBarcodeScanner } from "@/lib/hooks/use-barcode-scanner";
import { getErrorMessage } from "@/lib/errors";
import { resolveBarcodeScanAction, type TBarcodeScanAction, type TBarcodeScanResolution } from "@/lib/pos/barcode-scan-action";
import { playScanFeedback } from "@/lib/pos/scan-feedback";
import { fetchPOSProductByBarcode, type TPOSBarcodeMatch } from "@/lib/queries/pos";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";

// Fluxo completo da leitura no PDV, compartilhado pelas cinco telas que montam carrinho a partir
// da grade (nova venda, edição, checkout, pedido de comanda, orçamento no chat): captura a leitura,
// resolve o código no servidor, dá o retorno sonoro e entrega à tela só a decisão final —
// item pronto para o carrinho ou produto para o builder. Código duplicado no cadastro abre o
// seletor (`candidates`), que a tela renderiza com `BarcodeMatchPicker`.

export type TPOSBarcodeCandidates = { code: string; matches: TPOSBarcodeMatch[] };

type UsePOSBarcodeScanOptions = {
	channel: "POS" | "COMANDA";
	enabled?: boolean;
	ownerRef?: RefObject<HTMLElement | null>;
	/** Motivo para recusar leituras neste momento (ex.: montagem de item em andamento). */
	blockedReason?: string | null;
	/** Produto simples ou variante identificada sem adicionais: vai direto ao carrinho. */
	onAddDirect: (item: Extract<TBarcodeScanAction, { type: "ADD_DIRECT" }>["item"], resolution: TBarcodeScanResolution) => void;
	/** Produto com variantes não identificadas ou com adicionais: a tela abre o builder. */
	onOpenBuilder: (resolution: TBarcodeScanResolution) => void;
};

export function usePOSBarcodeScan({ channel, enabled = true, ownerRef, blockedReason = null, onAddDirect, onOpenBuilder }: UsePOSBarcodeScanOptions) {
	const [isResolving, setIsResolving] = useState(false);
	const [candidates, setCandidates] = useState<TPOSBarcodeCandidates | null>(null);
	const queueRef = useRef<string[]>([]);
	const processingRef = useRef(false);
	const mountedRef = useRef(true);
	const callbacksRef = useRef({ onAddDirect, onOpenBuilder, blockedReason });
	useEffect(() => {
		callbacksRef.current = { onAddDirect, onOpenBuilder, blockedReason };
	}, [onAddDirect, onOpenBuilder, blockedReason]);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const applyResolution = useCallback((resolution: TBarcodeScanResolution) => {
		const action = resolveBarcodeScanAction(resolution);
		if (action.type === "ADD_DIRECT") {
			playScanFeedback("SUCESSO");
			callbacksRef.current.onAddDirect(action.item, resolution);
			return;
		}
		playScanFeedback("ATENCAO");
		callbacksRef.current.onOpenBuilder({ product: resolution.product, variantId: action.variantId });
	}, []);

	// Leituras em sequência rápida (operador bipando a sacola inteira) entram numa fila e são
	// resolvidas uma a uma, na ordem — duas requisições paralelas poderiam inverter os itens.
	const drainQueue = useCallback(async () => {
		if (processingRef.current) return;
		processingRef.current = true;
		setIsResolving(true);
		try {
			while (queueRef.current.length > 0 && mountedRef.current) {
				const code = queueRef.current.shift() as string;
				try {
					const result = await fetchPOSProductByBarcode({ code, channel });
					if (!mountedRef.current) return;
					if (result.matches.length === 0) {
						playScanFeedback("ERRO");
						toast.error(`Nenhum produto com o código ${code}.`, { description: "Confira o código de barras no cadastro do produto." });
						continue;
					}
					if (result.matches.length > 1) {
						playScanFeedback("ATENCAO");
						setCandidates({ code, matches: result.matches });
						continue;
					}
					const [match] = result.matches;
					applyResolution({ product: match.product, variantId: match.variantId });
				} catch (error) {
					if (!mountedRef.current) return;
					playScanFeedback("ERRO");
					toast.error(getErrorMessage(error));
				}
			}
		} finally {
			processingRef.current = false;
			if (mountedRef.current) setIsResolving(false);
		}
	}, [channel, applyResolution]);

	const handleScan = useCallback(
		(code: string) => {
			const reason = callbacksRef.current.blockedReason;
			if (reason) {
				playScanFeedback("ERRO");
				toast.message(reason);
				return;
			}
			queueRef.current.push(code);
			void drainQueue();
		},
		[drainQueue],
	);

	const handleBlocked = useCallback(() => {
		playScanFeedback("ERRO");
		toast.message("Conclua a janela aberta antes de ler outro código.");
	}, []);

	useBarcodeScanner({ onScan: handleScan, enabled, ownerRef, onBlocked: handleBlocked });

	const chooseCandidate = useCallback(
		(match: TPOSBarcodeMatch) => {
			setCandidates(null);
			applyResolution({ product: match.product, variantId: match.variantId });
		},
		[applyResolution],
	);

	const dismissCandidates = useCallback(() => setCandidates(null), []);

	return { isResolving, candidates, chooseCandidate, dismissCandidates };
}

export type TUsePOSBarcodeScan = ReturnType<typeof usePOSBarcodeScan>;

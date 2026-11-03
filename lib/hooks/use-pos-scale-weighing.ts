"use client";

import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import { getErrorMessage } from "@/lib/errors";
import { useSerialScale } from "@/lib/hooks/use-serial-scale";
import { resolveBarcodeScanAction, type TBarcodeScanAction, type TBarcodeScanResolution } from "@/lib/pos/barcode-scan-action";
import { playScanFeedback } from "@/lib/pos/scan-feedback";
import type { TScaleBarcodeReading } from "@/lib/pos/scale-barcode";
import { DEFAULT_SERIAL_SCALE_CONFIG, isSoldByWeight, type TSerialScaleConfig } from "@/lib/pos/serial-scale-protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type TPOSProduct = TGetPOSProductsOutput["data"]["products"][number];

type UsePOSScaleWeighingOptions = {
	/** `preferencias.balancaCaixa`; ausente em organizações anteriores ao módulo. */
	config: TSerialScaleConfig | null | undefined;
	enabled?: boolean;
	/**
	 * Mesmo destino da leitura de etiqueta de balança (`usePOSBarcodeScan.onAddDirect`): a pesagem
	 * chega com `resolution.scaleReading` do tipo PESO, então a tela trata as duas do mesmo jeito —
	 * linha nova a cada pesagem, nunca soma na existente.
	 */
	onAddDirect: (item: Extract<TBarcodeScanAction, { type: "ADD_DIRECT" }>["item"], resolution: TBarcodeScanResolution) => void;
};

/**
 * Pesagem na balança do caixa a partir da grade do PDV: o operador põe o produto no prato e toca no
 * botão de pesar do card. A tela recebe o item pronto, com a quantidade em kg e o total pelo preço
 * do sistema — o mesmo cálculo da etiqueta de balança.
 */
export function usePOSScaleWeighing({ config, enabled = true, onAddDirect }: UsePOSScaleWeighingOptions) {
	const scale = useSerialScale({ config: config ?? DEFAULT_SERIAL_SCALE_CONFIG, enabled });
	const [weighingProductId, setWeighingProductId] = useState<string | null>(null);
	const inFlightRef = useRef(false);
	const onAddDirectRef = useRef(onAddDirect);
	useEffect(() => {
		onAddDirectRef.current = onAddDirect;
	}, [onAddDirect]);

	const { isActive, connect, readStableWeight } = scale;

	// Produto com variações precisaria escolher a variação antes de pesar, e o builder não tem onde
	// receber o peso: esses seguem pelo clique normal (ou pela etiqueta com o PLU na variação).
	const canWeighProduct = useCallback(
		(product: TPOSProduct) => isActive && product.variantes.length === 0 && isSoldByWeight(product.unidade),
		[isActive],
	);

	const weighProduct = useCallback(
		async (product: TPOSProduct) => {
			// Um toque duplo não pode lançar a mesma pesagem duas vezes.
			if (inFlightRef.current) return;
			inFlightRef.current = true;
			setWeighingProductId(product.id);
			try {
				if (!(product.precoVenda && product.precoVenda > 0)) {
					playScanFeedback("ERRO");
					toast.error(`${product.nome} está sem preço de venda: não dá para lançar a pesagem.`);
					return;
				}
				// Já conectada, volta na hora; sem porta autorizada, abre o seletor dentro deste clique.
				const connected = await connect("INTERACTIVE");
				if (!connected) return;
				const weightKg = await readStableWeight();
				const scaleReading: TScaleBarcodeReading = { plu: product.codigo, tipoValor: "PESO", valor: weightKg };
				const resolution: TBarcodeScanResolution = { product, variantId: null, scaleReading };
				const action = resolveBarcodeScanAction(resolution);
				if (action.type !== "ADD_DIRECT") {
					playScanFeedback("ERRO");
					toast.error(action.type === "REJECT" ? action.message : `${product.nome} precisa de escolhas antes de pesar.`);
					return;
				}
				playScanFeedback("SUCESSO");
				onAddDirectRef.current(action.item, resolution);
			} catch (error) {
				playScanFeedback("ERRO");
				toast.error(getErrorMessage(error));
			} finally {
				inFlightRef.current = false;
				setWeighingProductId(null);
			}
		},
		[connect, readStableWeight],
	);

	return { scale, canWeighProduct, weighProduct, weighingProductId };
}

export type TUsePOSScaleWeighing = ReturnType<typeof usePOSScaleWeighing>;

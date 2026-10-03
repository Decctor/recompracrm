"use client";

import type { TVisualKitPieceProps } from "@/lib/visual-kits/types";
import type { TVisualKitFormatEnum } from "@/schemas/enums";
import { useMemo } from "react";
import { useKitBuilder } from "./kit-builder-context";

/** Props de renderização de uma peça do kit: itens com preço, chamada (da peça ou do kit) e brand. */
export function usePieceProps(formato: TVisualKitFormatEnum | null): TVisualKitPieceProps | null {
	const { state, pieceItems, brand } = useKitBuilder();
	const piece = state.pecas.find((current) => current.formato === formato);
	return useMemo(() => {
		if (!piece) return null;
		return {
			items: pieceItems,
			chamada: piece.configuracao?.chamada?.trim() || state.kit.chamada,
			validadeFim: state.kit.validadeFim,
			brand,
			configuracao: state.kit.configuracao,
		};
	}, [piece, pieceItems, state.kit.chamada, state.kit.validadeFim, state.kit.configuracao, brand]);
}

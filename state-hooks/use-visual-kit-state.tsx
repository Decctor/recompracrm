import type { TCreateVisualKitInput } from "@/app/api/visual-kits/route";
import { sortVisualKitFormats, VISUAL_KIT_FORMATS } from "@/lib/visual-kits/formats";
import { visualKitItemKey } from "@/lib/visual-kits/types";
import type { TVisualKitFormatEnum } from "@/schemas/enums";
import { DEFAULT_VISUAL_KIT_CONFIG, type TVisualKitConfig, type TVisualKitPiece } from "@/schemas/visual-kits";
import { useCallback, useMemo, useState } from "react";

export type TVisualKitState = {
	kit: {
		nome: string;
		chamada: string;
		validadeFim: string | null; // ISO
		canalVendaId: string | null;
		configuracao: TVisualKitConfig;
	};
	// Ordem canônica dos formatos; `ordem` é derivada no payload.
	pecas: Omit<TVisualKitPiece, "ordem">[];
	// Ordem de escolha = ordem nas peças.
	itens: { produtoId: string; produtoVarianteId: string | null }[];
};

export const EMPTY_VISUAL_KIT_STATE: TVisualKitState = {
	kit: { nome: "", chamada: "Ofertas da semana", validadeFim: null, canalVendaId: null, configuracao: DEFAULT_VISUAL_KIT_CONFIG },
	pecas: [],
	itens: [],
};

function newPiece(formato: TVisualKitFormatEnum): Omit<TVisualKitPiece, "ordem"> {
	return { formato, saida: VISUAL_KIT_FORMATS[formato].outputs[0].id, configuracao: null };
}

export function buildVisualKitPayload(state: TVisualKitState): TCreateVisualKitInput {
	return {
		kit: state.kit,
		pieces: state.pecas.map((piece, index) => ({ ...piece, ordem: index })),
		items: state.itens.map((item, index) => ({ ...item, ordem: index })),
	};
}

export function useVisualKitState(initialState: TVisualKitState = EMPTY_VISUAL_KIT_STATE) {
	const [state, setState] = useState<TVisualKitState>(initialState);

	const updateKit = useCallback((changes: Partial<Omit<TVisualKitState["kit"], "configuracao">>) => {
		setState((prev) => ({ ...prev, kit: { ...prev.kit, ...changes } }));
	}, []);

	const updateConfig = useCallback((changes: Partial<TVisualKitConfig>) => {
		setState((prev) => ({ ...prev, kit: { ...prev.kit, configuracao: { ...prev.kit.configuracao, ...changes } } }));
	}, []);

	const togglePiece = useCallback((formato: TVisualKitFormatEnum) => {
		setState((prev) => {
			const exists = prev.pecas.some((piece) => piece.formato === formato);
			const pecas = exists ? prev.pecas.filter((piece) => piece.formato !== formato) : sortVisualKitFormats([...prev.pecas, newPiece(formato)]);
			return { ...prev, pecas };
		});
	}, []);

	// Pacote pronto: troca o conjunto, preservando saída e sobrescritas das peças que continuam.
	const setPieces = useCallback((formatos: TVisualKitFormatEnum[]) => {
		setState((prev) => {
			const current = new Map(prev.pecas.map((piece) => [piece.formato, piece]));
			return { ...prev, pecas: sortVisualKitFormats(formatos.map((formato) => current.get(formato) ?? newPiece(formato))) };
		});
	}, []);

	const updatePiece = useCallback((formato: TVisualKitFormatEnum, changes: Partial<Omit<TVisualKitPiece, "formato" | "ordem">>) => {
		setState((prev) => ({ ...prev, pecas: prev.pecas.map((piece) => (piece.formato === formato ? { ...piece, ...changes } : piece)) }));
	}, []);

	const toggleItem = useCallback((item: { produtoId: string; produtoVarianteId: string | null }) => {
		setState((prev) => {
			const key = visualKitItemKey(item);
			const exists = prev.itens.some((current) => visualKitItemKey(current) === key);
			return {
				...prev,
				itens: exists
					? prev.itens.filter((current) => visualKitItemKey(current) !== key)
					: [...prev.itens, { produtoId: item.produtoId, produtoVarianteId: item.produtoVarianteId }],
			};
		});
	}, []);

	const addItems = useCallback((items: { produtoId: string; produtoVarianteId: string | null }[]) => {
		setState((prev) => {
			const keys = new Set(prev.itens.map(visualKitItemKey));
			const additions = items
				.filter((item) => !keys.has(visualKitItemKey(item)))
				.map(({ produtoId, produtoVarianteId }) => ({ produtoId, produtoVarianteId }));
			return additions.length ? { ...prev, itens: [...prev.itens, ...additions] } : prev;
		});
	}, []);

	const clearItems = useCallback(() => setState((prev) => ({ ...prev, itens: [] })), []);

	const redefineState = useCallback((next: TVisualKitState) => setState(next), []);
	const resetState = useCallback(() => setState(EMPTY_VISUAL_KIT_STATE), []);

	const itemKeys = useMemo(() => state.itens.map(visualKitItemKey), [state.itens]);

	// Objeto estável entre renders: quem depende dele (contexto do construtor, salvamento automático)
	// só re-executa quando o estado muda de verdade.
	return useMemo(
		() => ({
			state,
			itemKeys,
			updateKit,
			updateConfig,
			togglePiece,
			setPieces,
			updatePiece,
			toggleItem,
			addItems,
			clearItems,
			redefineState,
			resetState,
		}),
		[state, itemKeys, updateKit, updateConfig, togglePiece, setPieces, updatePiece, toggleItem, addItems, clearItems, redefineState, resetState],
	);
}
export type TUseVisualKitState = ReturnType<typeof useVisualKitState>;

"use client";

import { cycleAvailabilityChoice } from "@/components/SalesChannels/ProductChannelControls";
import { getErrorMessage } from "@/lib/errors";
import { updateSalesChannelMatrix } from "@/lib/mutations/sales-channels";
import {
	type TMatrixCell,
	type TMatrixChannelDraft,
	buildMatrixCellMap,
	diffMatrixCells,
	diffMatrixChannels,
	displayedMatrixGroups,
	isInheritingCell,
	moveGroupInOrder,
	renameGroupInOrder,
} from "@/lib/products/sales-channels-matrix";
import type { TSalesChannelMatrix } from "@/lib/queries/sales-channels";
import type { TSalesChannelCatalogModeEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDirtyFlag, wrapWithDirty } from "./use-product-section-editor";

/**
 * Rascunho da matriz de canais. Só o que se EDITA vive aqui: as células (overrides por nó) e o
 * modo/ordem de cada canal. Produtos, variantes e vínculos ficam na consulta — são chaves e
 * rótulos, não estado — e por isso uma renomeação de grupo ou um refetch de produtos não
 * conflita com o rascunho aberto.
 */
export type TSalesChannelMatrixState = {
	channels: Map<string, TMatrixChannelDraft>;
	cells: Map<string, TMatrixCell>;
};

export function hydrateMatrixState(matrix: TSalesChannelMatrix): TSalesChannelMatrixState {
	return {
		channels: new Map(matrix.channels.map((channel) => [channel.id, { catalogoModo: channel.catalogoModo, ordemGrupos: channel.ordemGrupos }])),
		cells: buildMatrixCellMap(matrix.settings),
	};
}

export function useInternalSalesChannelMatrixState({ initialState }: { initialState: TSalesChannelMatrixState }) {
	const [state, setState] = useState<TSalesChannelMatrixState>(initialState);

	// O mapa só guarda desvios: uma célula que voltou a herdar nos dois campos sai do mapa, para que
	// o diff contra a base não a veja como mudança e a tela não a pinte como override.
	const patchCell = useCallback((key: string, patch: (cell: TMatrixCell) => TMatrixCell) => {
		setState((prev) => {
			const cells = new Map(prev.cells);
			const next = patch(cells.get(key) ?? { disponivel: null, precoVenda: null });
			if (isInheritingCell(next)) cells.delete(key);
			else cells.set(key, next);
			return { ...prev, cells };
		});
	}, []);

	const cycleAvailability = useCallback(
		(key: string) => patchCell(key, (cell) => ({ ...cell, disponivel: cycleAvailabilityChoice(cell.disponivel) })),
		[patchCell],
	);

	const updatePrice = useCallback((key: string, precoVenda: number | null) => patchCell(key, (cell) => ({ ...cell, precoVenda })), [patchCell]);

	const clearCell = useCallback((key: string) => patchCell(key, () => ({ disponivel: null, precoVenda: null })), [patchCell]);

	const patchChannel = useCallback((canalVendaId: string, patch: (channel: TMatrixChannelDraft) => TMatrixChannelDraft) => {
		setState((prev) => {
			const current = prev.channels.get(canalVendaId);
			if (!current) return prev;
			const channels = new Map(prev.channels);
			channels.set(canalVendaId, patch(current));
			return { ...prev, channels };
		});
	}, []);

	const setChannelCatalogMode = useCallback(
		(canalVendaId: string, catalogoModo: TSalesChannelCatalogModeEnum) => patchChannel(canalVendaId, (channel) => ({ ...channel, catalogoModo })),
		[patchChannel],
	);

	/**
	 * Move um grupo na ordem exibida do canal. `displayed` é a ordem que a tela mostra agora
	 * (curada + cauda alfabética): o resultado inteiro vira ordem explícita, como na vitrine.
	 */
	const moveChannelGroup = useCallback(
		({ canalVendaId, displayed, grupo, direction }: { canalVendaId: string; displayed: string[]; grupo: string; direction: "up" | "down" }) => {
			const next = moveGroupInOrder({ displayed, grupo, direction });
			if (!next) return;
			patchChannel(canalVendaId, (channel) => ({ ...channel, ordemGrupos: next }));
		},
		[patchChannel],
	);

	/** Espelha no rascunho um grupo JÁ renomeado no banco — em todos os canais de uma vez. */
	const syncRenamedGroup = useCallback((grupoAtual: string, grupoNovo: string) => {
		setState((prev) => {
			const channels = new Map<string, TMatrixChannelDraft>();
			for (const [canalVendaId, channel] of prev.channels) {
				channels.set(canalVendaId, { ...channel, ordemGrupos: renameGroupInOrder(channel.ordemGrupos, grupoAtual, grupoNovo) });
			}
			return { ...prev, channels };
		});
	}, []);

	const redefineState = useCallback((next: TSalesChannelMatrixState) => setState(next), []);
	const resetState = useCallback(() => setState(initialState), [initialState]);

	return { state, cycleAvailability, updatePrice, clearCell, setChannelCatalogMode, moveChannelGroup, syncRenamedGroup, redefineState, resetState };
}
export type TUseInternalSalesChannelMatrixState = ReturnType<typeof useInternalSalesChannelMatrixState>;

type MatrixEditorCallbacks = {
	onSuccess?: () => void;
	onError?: (error: Error) => void;
};

/**
 * Editor da aba "Canais": mesmo desenho da vitrine e das seções do cadastro — estado local, barra
 * de aplicar própria e re-hidratação que só acontece enquanto não há edição pendente. O apply
 * envia só o diff (nós e canais que mudaram) numa única mutation.
 */
export function useSalesChannelMatrixEditor({ matrix, callbacks }: { matrix: TSalesChannelMatrix; callbacks?: MatrixEditorCallbacks }) {
	const queryClient = useQueryClient();
	const { isDirty, isDirtyRef, markDirty, clearDirty } = useDirtyFlag();
	const baseline = useMemo(() => hydrateMatrixState(matrix), [matrix]);
	const matrixState = useInternalSalesChannelMatrixState({ initialState: baseline });
	const { state, redefineState } = matrixState;

	useEffect(() => {
		if (!isDirtyRef.current) redefineState(baseline);
	}, [baseline, isDirtyRef, redefineState]);

	const discard = useCallback(() => {
		redefineState(baseline);
		clearDirty();
	}, [baseline, clearDirty, redefineState]);

	const { mutate: applyMutation, isPending } = useMutation({
		mutationKey: ["apply-sales-channel-matrix"],
		mutationFn: async () => {
			const products = diffMatrixCells({ baseline: baseline.cells, draft: state.cells });
			const channels = diffMatrixChannels({ baseline: baseline.channels, draft: state.channels });
			if (products.length === 0 && channels.length === 0) return { message: "Nenhuma alteração para aplicar." };
			return updateSalesChannelMatrix({ channels, products });
		},
		onSuccess: (data) => {
			clearDirty();
			callbacks?.onSuccess?.();
			toast.success(data.message);
		},
		onError: (error) => {
			callbacks?.onError?.(error as Error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ["sales-channel-matrix"] });
			queryClient.invalidateQueries({ queryKey: ["sales-channels"] });
			// A vitrine da loja e a matriz da página do produto leem as mesmas linhas.
			queryClient.invalidateQueries({ queryKey: ["sales-channel-showcase"] });
			queryClient.invalidateQueries({ queryKey: ["product-channel-settings"] });
		},
	});

	const apply = useCallback(() => applyMutation(), [applyMutation]);

	/**
	 * O grupo foi renomeado no cadastro (rota própria, já persistida). O rascunho é corrigido sem
	 * `markDirty` e a consulta é invalidada para trazer os produtos com o nome novo.
	 */
	const renameGroup = useCallback(
		(grupoAtual: string, grupoNovo: string) => {
			matrixState.syncRenamedGroup(grupoAtual, grupoNovo);
			queryClient.invalidateQueries({ queryKey: ["sales-channel-matrix"] });
			queryClient.invalidateQueries({ queryKey: ["sales-channel-showcase"] });
			queryClient.invalidateQueries({ queryKey: ["products"] });
			queryClient.invalidateQueries({ queryKey: ["product-groups"] });
		},
		[matrixState, queryClient],
	);

	const displayedGroupsFor = useCallback(
		(canalVendaId: string) => displayedMatrixGroups(matrix.products, state.channels.get(canalVendaId)?.ordemGrupos ?? []),
		[matrix.products, state.channels],
	);

	const updaters = useMemo(
		() => ({
			cycleAvailability: wrapWithDirty(matrixState.cycleAvailability, markDirty),
			updatePrice: wrapWithDirty(matrixState.updatePrice, markDirty),
			clearCell: wrapWithDirty(matrixState.clearCell, markDirty),
			setChannelCatalogMode: wrapWithDirty(matrixState.setChannelCatalogMode, markDirty),
			moveChannelGroup: wrapWithDirty(matrixState.moveChannelGroup, markDirty),
		}),
		[markDirty, matrixState],
	);

	return { state, isDirty, isPending, apply, discard, renameGroup, displayedGroupsFor, ...updaters };
}
export type TUseSalesChannelMatrixEditor = ReturnType<typeof useSalesChannelMatrixEditor>;

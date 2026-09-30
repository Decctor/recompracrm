import type { TUpdateAddOnChannelSettingsInput } from "@/app/api/products/add-ons/channel-settings/route";
import { useAddOnChannelSettings } from "@/lib/queries/product-channel-settings";
import {
	addOnChannelCellsDiffer,
	rebaseAddOnChannelDraft,
	type TAddOnChannelCell,
	type TAddOnChannelCells,
} from "@/lib/products/add-on-channel-draft";
import { useCallback, useEffect, useState } from "react";

export type { TAddOnChannelCell } from "@/lib/products/add-on-channel-draft";

const EMPTY_CELL: TAddOnChannelCell = { precoDelta: null, disponivel: null };
const EMPTY_CELLS: TAddOnChannelCells = {};

export function addOnChannelCellKey(canalVendaId: string, opcaoId: string) {
	return `${canalVendaId}:${opcaoId}`;
}

/**
 * Rascunho dos preços/disponibilidade das opções de um grupo por canal. Vive ao lado do estado do
 * grupo e é salvo pela mesma ação do modal: o `buildPatch` devolve só os nós que mudaram, com os
 * dois campos nulos quando a célula voltou a herdar (a rota remove a linha).
 */
export function useAddOnChannelSettingsState({ produtoAddOnId, enabled }: { produtoAddOnId: string; enabled: boolean }) {
	const query = useAddOnChannelSettings({ produtoAddOnId, enabled });
	const [cellsState, setCellsState] = useState<{ produtoAddOnId: string; baseline: TAddOnChannelCells; draft: TAddOnChannelCells }>({
		produtoAddOnId,
		baseline: {},
		draft: {},
	});
	const { baseline, draft } = cellsState.produtoAddOnId === produtoAddOnId ? cellsState : { baseline: EMPTY_CELLS, draft: EMPTY_CELLS };

	// Refetch atualiza a base sem sobrescrever células editadas pelo operador.
	useEffect(() => {
		if (!query.data) return;
		const cells = Object.fromEntries(
			query.data.settings.map((setting) => [
				addOnChannelCellKey(setting.canalVendaId, setting.produtoAddOnOpcaoId),
				{ precoDelta: setting.precoDelta, disponivel: setting.disponivel },
			]),
		);
		setCellsState((prev) => ({
			produtoAddOnId,
			baseline: cells,
			draft: prev.produtoAddOnId === produtoAddOnId ? rebaseAddOnChannelDraft(prev.baseline, prev.draft, cells) : cells,
		}));
	}, [query.data, produtoAddOnId]);

	const getCell = useCallback((canalVendaId: string, opcaoId: string) => draft[addOnChannelCellKey(canalVendaId, opcaoId)] ?? EMPTY_CELL, [draft]);

	const updateCell = useCallback(
		(canalVendaId: string, opcaoId: string, partial: Partial<TAddOnChannelCell>) => {
			const key = addOnChannelCellKey(canalVendaId, opcaoId);
			setCellsState((prev) => {
				const current = prev.produtoAddOnId === produtoAddOnId ? prev : { produtoAddOnId, baseline: {}, draft: {} as TAddOnChannelCells };
				return { ...current, draft: { ...current.draft, [key]: { ...(current.draft[key] ?? EMPTY_CELL), ...partial } } };
			});
		},
		[produtoAddOnId],
	);

	const updateCells = useCallback(
		(canalVendaId: string, updates: { opcaoId: string; partial: Partial<TAddOnChannelCell> }[]) => {
			setCellsState((prev) => {
				const current = prev.produtoAddOnId === produtoAddOnId ? prev : { produtoAddOnId, baseline: {}, draft: {} as TAddOnChannelCells };
				const next = { ...current.draft };
				for (const { opcaoId, partial } of updates) {
					const key = addOnChannelCellKey(canalVendaId, opcaoId);
					next[key] = { ...(next[key] ?? EMPTY_CELL), ...partial };
				}
				return { ...current, draft: next };
			});
		},
		[produtoAddOnId],
	);

	/** Nós alterados, restritos às opções que continuam no grupo (uma opção removida no mesmo save não existe mais para a rota). */
	const buildPatch = useCallback(
		(liveOptionIds: Set<string>): TUpdateAddOnChannelSettingsInput["settings"] => {
			const keys = new Set([...Object.keys(baseline), ...Object.keys(draft)]);
			const patch: TUpdateAddOnChannelSettingsInput["settings"] = [];
			for (const key of keys) {
				if (!addOnChannelCellsDiffer(baseline[key], draft[key])) continue;
				const [canalVendaId, produtoAddOnOpcaoId] = key.split(":");
				if (!liveOptionIds.has(produtoAddOnOpcaoId)) continue;
				const cell = draft[key] ?? EMPTY_CELL;
				patch.push({ canalVendaId, produtoAddOnOpcaoId, precoDelta: cell.precoDelta, disponivel: cell.disponivel });
			}
			return patch;
		},
		[baseline, draft],
	);

	const overrideCount = useCallback(
		(canalVendaId: string) =>
			Object.entries(draft).filter(([key, cell]) => key.startsWith(`${canalVendaId}:`) && (cell.precoDelta != null || cell.disponivel != null)).length,
		[draft],
	);

	return { ...query, getCell, updateCell, updateCells, buildPatch, overrideCount };
}

export type TUseAddOnChannelSettingsState = ReturnType<typeof useAddOnChannelSettingsState>;

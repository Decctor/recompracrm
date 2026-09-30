export type TAddOnChannelCell = { precoDelta: number | null; disponivel: boolean | null };
export type TAddOnChannelCells = Record<string, TAddOnChannelCell>;

export function addOnChannelCellsDiffer(a: TAddOnChannelCell | undefined, b: TAddOnChannelCell | undefined) {
	return (a?.precoDelta ?? null) !== (b?.precoDelta ?? null) || (a?.disponivel ?? null) !== (b?.disponivel ?? null);
}

/** Refetch atualiza células intactas, preservando inclusive o pedido local de voltar a herdar. */
export function rebaseAddOnChannelDraft(baseline: TAddOnChannelCells, draft: TAddOnChannelCells, incoming: TAddOnChannelCells) {
	const next = { ...incoming };
	for (const key of Object.keys(draft)) {
		if (addOnChannelCellsDiffer(baseline[key], draft[key])) next[key] = draft[key];
	}
	return next;
}

"use client";

import type { TMetaAdsScope } from "@/lib/queries/meta-ads";
import type { TMetaResultKey } from "@/lib/paid-media/format";
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Contexto da página de Mídia paga: o escopo (conta + período + comparação) que toda consulta usa,
 * a moeda da conta e o resultado principal, mais a pilha de navegação do painel de detalhe.
 *
 * O escopo vive aqui, e não em props, porque o painel lateral monta as mesmas chaves de query que as
 * seções da página — é isso que faz abrir um item não refazer a busca.
 */

export type TPaidMediaSheetEntry = { type: "campaign"; id: string; name: string | null } | { type: "ad"; id: string; name: string | null };

type TSheetFrame = { entry: TPaidMediaSheetEntry; siblings: TPaidMediaSheetEntry[] };

type TPaidMediaContextValue = {
	scope: TMetaAdsScope;
	currency: string;
	adAccountNumericId: string | null;
	/** Resultado principal da conta no período: compras, leads ou conversas. */
	resultKey: TMetaResultKey;
	sheet: {
		current: TSheetFrame | null;
		index: number;
		canGoBack: boolean;
		/** Abre um item. Sem `push`, reinicia a pilha (abrir pela página); com `push`, empilha (navegar dentro do painel). */
		open: (entry: TPaidMediaSheetEntry, options?: { siblings?: TPaidMediaSheetEntry[]; push?: boolean }) => void;
		back: () => void;
		/** Anterior/próximo dentro da lista de onde o item foi aberto. */
		step: (direction: 1 | -1) => void;
		close: () => void;
	};
};

const PaidMediaContext = createContext<TPaidMediaContextValue | null>(null);

export function usePaidMedia() {
	const context = useContext(PaidMediaContext);
	if (!context) throw new Error("usePaidMedia precisa estar dentro de PaidMediaProvider.");
	return context;
}

function sameEntry(a: TPaidMediaSheetEntry, b: TPaidMediaSheetEntry) {
	return a.type === b.type && a.id === b.id;
}

type PaidMediaProviderProps = {
	scope: TMetaAdsScope;
	currency: string;
	adAccountNumericId: string | null;
	resultKey: TMetaResultKey;
	children: ReactNode;
};

export function PaidMediaProvider({ scope, currency, adAccountNumericId, resultKey, children }: PaidMediaProviderProps) {
	const [stack, setStack] = useState<TSheetFrame[]>([]);

	const open = useCallback<TPaidMediaContextValue["sheet"]["open"]>((entry, options) => {
		const siblings = options?.siblings?.some((sibling) => sameEntry(sibling, entry)) ? options.siblings : [entry];
		const frame = { entry, siblings };
		setStack((previous) => (options?.push ? [...previous, frame] : [frame]));
	}, []);
	const back = useCallback(() => setStack((previous) => previous.slice(0, -1)), []);
	const close = useCallback(() => setStack([]), []);
	const step = useCallback((direction: 1 | -1) => {
		setStack((previous) => {
			const top = previous[previous.length - 1];
			if (!top) return previous;
			const index = top.siblings.findIndex((sibling) => sameEntry(sibling, top.entry));
			const next = top.siblings[index + direction];
			if (!next) return previous;
			return [...previous.slice(0, -1), { entry: next, siblings: top.siblings }];
		});
	}, []);

	const current = stack[stack.length - 1] ?? null;
	const index = current ? current.siblings.findIndex((sibling) => sameEntry(sibling, current.entry)) : -1;

	const value = useMemo<TPaidMediaContextValue>(
		() => ({
			scope,
			currency,
			adAccountNumericId,
			resultKey,
			sheet: { current, index, canGoBack: stack.length > 1, open, back, step, close },
		}),
		[scope, currency, adAccountNumericId, resultKey, current, index, stack.length, open, back, step, close],
	);

	return <PaidMediaContext.Provider value={value}>{children}</PaidMediaContext.Provider>;
}

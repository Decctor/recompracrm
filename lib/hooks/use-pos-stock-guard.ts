import type { TBuilderStockContext } from "@/components/Products/ProductBuilderForm";
import { resolvePOSProductStock } from "@/lib/pos/product-stock-display";
import { countReservedStock, describeCartIncrementShortage, describeStockShortage, resolveAvailableStock } from "@/lib/pos/stock-availability";
import { useCallback, useEffect, useMemo, useRef } from "react";

// Guarda de estoque das telas que montam carrinho (PDV e pedido de conta). Uma regra para os três
// caminhos de entrada: toque na grade e código de barras (item direto), builder (variante e
// adicionais) e o "+" da linha. Todos descontam o que o carrinho já reserva.

type TStockLine = {
	produtoId: string;
	produtoVarianteId?: string | null;
	quantidade: number;
	quantidadeEntregue?: number | null;
	saldoEstoque?: number | null;
};

type TStockEntity = { quantidade?: number | null; rastreamentoEstoqueAtivo?: boolean | null };

export function usePOSStockGuard({ lines, orgTracksStock }: { lines: TStockLine[]; orgTracksStock: boolean }) {
	// O toque na grade fica estável entre edições do carrinho (a grade é memoizada sobre ele): o
	// handler lê o carrinho mais recente por ref em vez de depender dele.
	const linesRef = useRef(lines);
	useEffect(() => {
		linesRef.current = lines;
	}, [lines]);

	const builderStock = useMemo<TBuilderStockContext>(
		() => ({ orgTracksStock, reservedFor: (key) => countReservedStock(lines, key) }),
		[lines, orgTracksStock],
	);

	/** Item que entra direto: o saldo a carimbar na linha e, se não couber, o motivo da recusa. */
	const checkDirectAdd = useCallback(
		(entity: TStockEntity, item: { produtoId: string; produtoVarianteId?: string | null; nome: string; quantidade: number }) => {
			const saldoEstoque = resolvePOSProductStock({
				product: { quantidade: entity.quantidade ?? null, rastreamentoEstoqueAtivo: entity.rastreamentoEstoqueAtivo ?? null },
				orgTracksStock,
			});
			const available = resolveAvailableStock({ stock: saldoEstoque, reserved: countReservedStock(linesRef.current, item) });
			return { saldoEstoque, shortage: describeStockShortage({ nome: item.nome, available, quantity: item.quantidade }) };
		},
		[orgTracksStock],
	);

	/** Motivo para o "+" de uma linha do carrinho não somar, ou `null`. */
	const incrementShortage = useCallback((line: TStockLine & { nome: string }) => describeCartIncrementShortage(lines, line), [lines]);

	return { builderStock, checkDirectAdd, incrementShortage };
}

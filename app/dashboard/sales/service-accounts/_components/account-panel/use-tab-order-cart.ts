import type { TTabDetails } from "@/app/api/tabs/route";
import type { TCreateTabOrderInput } from "@/app/api/tabs/orders/route";
import type { TBuiltOrderItem } from "@/components/Products/ProductBuilderForm";
import { useCallback, useMemo, useState } from "react";

// Carrinho do "Lançar pedido", dono no painel da conta: o compositor monta e envia, e a aba
// Pedidos usa o mesmo carrinho para "pedir mais um" de um item já lançado. O painel é remontado
// por conta (key), então o carrinho nunca vaza para outra mesa.

export type TCartItem = TCreateTabOrderInput["itens"][number] & { cartKey: string };

type TTabOrderItem = TTabDetails["pedidos"][number]["itens"][number];

function modifierSignature(modifiers: TBuiltOrderItem["modificadores"]) {
	return modifiers
		.map((modifier) => `${modifier.opcaoId}x${modifier.quantidade}`)
		.sort()
		.join("|");
}

function cartKeyFor(item: Pick<TBuiltOrderItem, "produtoId" | "produtoVarianteId" | "modificadores" | "observacoes">) {
	return `${item.produtoId}:${item.produtoVarianteId ?? ""}:${modifierSignature(item.modificadores)}:${item.observacoes ?? ""}`;
}

function withQuantity(item: TCartItem, quantidade: number): TCartItem {
	const valorTotalBruto = item.valorUnitarioFinal * quantidade;
	return { ...item, quantidade, valorTotalBruto, valorTotalLiquido: valorTotalBruto - item.valorDesconto };
}

// Uma unidade do item já lançado, com a mesma variante, adicionais e observação. Os valores são
// os gravados no pedido; o lançamento revalida contra o catálogo do canal COMANDA. Item sem
// produto ou com opção de adicional removida do catálogo não tem como ser repetido.
export function toRepeatOrderItem(item: TTabOrderItem): TBuiltOrderItem | null {
	if (!item.produtoId) return null;
	if (item.adicionais.some((modifier) => !modifier.opcaoId)) return null;

	const metadata = (item.metadados ?? {}) as { nome?: string; codigo?: string; imagemUrl?: string | null };
	const modificadores = item.adicionais.map((modifier) => ({
		opcaoId: modifier.opcaoId as string,
		nome: modifier.nome,
		quantidade: modifier.quantidade,
		valorUnitario: modifier.valorUnitario,
		valorTotal: modifier.valorTotal,
	}));
	const valorModificadores = modificadores.reduce((sum, modifier) => sum + modifier.valorTotal, 0);
	const valorUnitarioFinal = item.valorVendaUnitario;

	return {
		produtoId: item.produtoId,
		produtoVarianteId: item.produtoVarianteId ?? null,
		nome: metadata.nome ?? "Item",
		codigo: metadata.codigo ?? "",
		imagemUrl: metadata.imagemUrl ?? null,
		quantidade: 1,
		valorUnitarioBase: valorUnitarioFinal - valorModificadores,
		valorModificadores,
		valorUnitarioFinal,
		valorTotalBruto: valorUnitarioFinal,
		valorDesconto: 0,
		valorTotalLiquido: valorUnitarioFinal,
		observacoes: item.observacoes?.trim() || null,
		modificadores,
	};
}

export function useTabOrderCart() {
	const [cart, setCart] = useState<TCartItem[]>([]);
	const [observacoes, setObservacoes] = useState("");
	// Um id por "intenção de pedido": permanece o mesmo em retries, muda apenas após sucesso.
	const [tabOrderId, setTabOrderId] = useState<string>(() => crypto.randomUUID());

	const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.valorTotalLiquido, 0), [cart]);
	const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantidade, 0), [cart]);
	const cartQtyByProduct = useMemo(() => {
		const map = new Map<string, number>();
		for (const item of cart) map.set(item.produtoId, (map.get(item.produtoId) ?? 0) + item.quantidade);
		return map;
	}, [cart]);

	const addItem = useCallback((item: TBuiltOrderItem) => {
		const cartKey = cartKeyFor(item);
		setCart((prev) => {
			const existing = prev.find((entry) => entry.cartKey === cartKey);
			if (existing) return prev.map((entry) => (entry.cartKey === cartKey ? withQuantity(entry, entry.quantidade + item.quantidade) : entry));
			return [...prev, withQuantity({ ...item, cartKey }, item.quantidade)];
		});
	}, []);

	const changeQuantity = useCallback((cartKey: string, delta: number) => {
		setCart((prev) =>
			prev.map((item) => (item.cartKey === cartKey ? withQuantity(item, item.quantidade + delta) : item)).filter((item) => item.quantidade > 0),
		);
	}, []);

	const clearCart = useCallback(() => setCart([]), []);

	// Pedido lançado: carrinho limpo e nova intenção de pedido.
	const resetAfterLaunch = useCallback(() => {
		setCart([]);
		setObservacoes("");
		setTabOrderId(crypto.randomUUID());
	}, []);

	return {
		cart,
		observacoes,
		setObservacoes,
		tabOrderId,
		cartTotal,
		cartCount,
		cartQtyByProduct,
		addItem,
		changeQuantity,
		clearCart,
		resetAfterLaunch,
	};
}
export type TUseTabOrderCart = ReturnType<typeof useTabOrderCart>;

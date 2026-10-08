import createHttpError from "http-errors";

// ============================================================================
// Monta um item de pedido a partir de um produto DE CATÁLOGO já projetado para o canal
// (preço do nó, grupos com as regras do vínculo e do canal, opções com preço e presença do
// canal). É a mesma conta que a loja fazia inline na rota de pedidos; vive aqui porque a
// solicitação pública da comanda, a aprovação do operador e a loja precisam aplicar
// exatamente as mesmas regras de grupo — mínimo, máximo, quantidade por opção — sobre o
// mesmo catálogo que a tela exibiu.
//
// Esta função não consulta o banco e não conhece o canal: quem a chama entrega o produto
// como o canal o vê. Por isso ela é pura e testável, e o "preço autoritativo" continua sendo
// o do catálogo carregado pelo servidor, nunca o do cliente.
// ============================================================================

export type TCatalogOrderItemOption = {
	id: string;
	nome: string;
	precoDelta: number;
	maxQtdePorItem?: number | null;
};

export type TCatalogOrderItemReference = {
	grupo: {
		nome: string;
		minOpcoes: number;
		maxOpcoes: number;
		opcoes: TCatalogOrderItemOption[];
	};
};

export type TCatalogOrderItemVariant = {
	id: string;
	nome: string;
	codigo?: string | null;
	imagemCapaUrl?: string | null;
	precoVenda: number;
	precoCusto?: number | null;
	addOnsReferencias: TCatalogOrderItemReference[];
};

export type TCatalogOrderItemProduct = {
	id: string;
	nome: string;
	codigo?: string | null;
	grupo?: string | null;
	imagemCapaUrl?: string | null;
	precoVenda: number | null;
	precoCusto?: number | null;
	variantes: TCatalogOrderItemVariant[];
	addOnsReferencias: TCatalogOrderItemReference[];
};

export type TCatalogOrderItemModifierInput = { opcaoId: string; quantidade: number };

export type TResolvedCatalogOrderItemModifier = {
	opcaoId: string;
	nome: string;
	quantidade: number;
	valorUnitario: number;
	valorTotal: number;
};

export type TResolvedCatalogOrderItem = {
	produtoId: string;
	produtoVarianteId: string | null;
	nome: string;
	codigo: string;
	imagemUrl: string | null;
	grupo: string | null;
	quantidade: number;
	valorUnitarioBase: number;
	valorModificadores: number;
	valorUnitarioFinal: number;
	valorTotalBruto: number;
	valorDesconto: number;
	valorTotalLiquido: number;
	valorCustoUnitario: number;
	valorCustoTotal: number;
	observacoes: string | null;
	modificadores: TResolvedCatalogOrderItemModifier[];
};

/** Grupos que valem para a montagem: os do produto mais os da variante escolhida. */
export function getCatalogOrderItemReferences(product: TCatalogOrderItemProduct, variantId: string | null) {
	const variant = variantId ? product.variantes.find((candidate) => candidate.id === variantId) : null;
	return [...product.addOnsReferencias, ...(variant?.addOnsReferencias ?? [])];
}

export function resolveCatalogOrderItem({
	product,
	variantId,
	quantity,
	modifiers,
	observacoes = null,
}: {
	product: TCatalogOrderItemProduct;
	variantId: string | null;
	quantity: number;
	modifiers: TCatalogOrderItemModifierInput[];
	observacoes?: string | null;
}): TResolvedCatalogOrderItem {
	if (!Number.isFinite(quantity) || quantity <= 0) throw new createHttpError.BadRequest(`Quantidade inválida para "${product.nome}".`);

	const variant = variantId ? product.variantes.find((candidate) => candidate.id === variantId) : null;
	if (variantId && !variant) throw new createHttpError.BadRequest(`A variante de "${product.nome}" não está disponível.`);
	if (product.variantes.length > 0 && !variant) throw new createHttpError.BadRequest(`Selecione uma variante para "${product.nome}".`);

	const references = getCatalogOrderItemReferences(product, variant?.id ?? null);

	// A mesma opção pode chegar repetida (duas linhas do cliente): soma antes de validar.
	const requestedByOption = new Map<string, number>();
	for (const modifier of modifiers) {
		if (!Number.isFinite(modifier.quantidade) || modifier.quantidade <= 0) {
			throw new createHttpError.BadRequest(`Quantidade inválida em um adicional de "${product.nome}".`);
		}
		requestedByOption.set(modifier.opcaoId, (requestedByOption.get(modifier.opcaoId) ?? 0) + modifier.quantidade);
	}

	const optionMap = new Map<string, TCatalogOrderItemOption>();
	for (const reference of references) {
		const grupo = reference.grupo;
		let selectedQuantity = 0;
		for (const option of grupo.opcoes) {
			if (!optionMap.has(option.id)) optionMap.set(option.id, option);
			const requested = requestedByOption.get(option.id) ?? 0;
			if (requested === 0) continue;
			selectedQuantity += requested;
			if (option.maxQtdePorItem != null && requested > option.maxQtdePorItem) {
				throw new createHttpError.BadRequest(`Quantidade máxima excedida para "${option.nome}" em "${product.nome}".`);
			}
		}
		if (selectedQuantity < grupo.minOpcoes) {
			throw new createHttpError.BadRequest(
				grupo.minOpcoes > 1
					? `Escolha ao menos ${grupo.minOpcoes} opções em "${grupo.nome}" para "${product.nome}".`
					: `Escolha uma opção em "${grupo.nome}" para "${product.nome}".`,
			);
		}
		if (grupo.maxOpcoes >= 1 && selectedQuantity > grupo.maxOpcoes) {
			throw new createHttpError.BadRequest(`Escolha no máximo ${grupo.maxOpcoes} opções em "${grupo.nome}" para "${product.nome}".`);
		}
	}

	const modificadores: TResolvedCatalogOrderItemModifier[] = [];
	for (const [opcaoId, requested] of requestedByOption) {
		// Opção fora dos grupos do produto (ou pausada no canal — já saiu da projeção): recusa.
		const option = optionMap.get(opcaoId);
		if (!option) throw new createHttpError.BadRequest(`Um adicional de "${product.nome}" não está disponível.`);
		modificadores.push({
			opcaoId: option.id,
			nome: option.nome,
			quantidade: requested,
			valorUnitario: option.precoDelta,
			valorTotal: option.precoDelta * requested,
		});
	}

	const basePrice = variant?.precoVenda ?? product.precoVenda ?? 0;
	const modifiersPrice = modificadores.reduce((sum, modifier) => sum + modifier.valorTotal, 0);
	const unitFinal = basePrice + modifiersPrice;
	const cost = variant?.precoCusto ?? product.precoCusto ?? 0;

	return {
		produtoId: product.id,
		produtoVarianteId: variant?.id ?? null,
		nome: variant ? `${product.nome} - ${variant.nome}` : product.nome,
		codigo: variant?.codigo ?? product.codigo ?? "",
		imagemUrl: variant?.imagemCapaUrl ?? product.imagemCapaUrl ?? null,
		grupo: product.grupo ?? null,
		quantidade: quantity,
		valorUnitarioBase: basePrice,
		valorModificadores: modifiersPrice,
		valorUnitarioFinal: unitFinal,
		valorTotalBruto: unitFinal * quantity,
		valorDesconto: 0,
		valorTotalLiquido: unitFinal * quantity,
		valorCustoUnitario: cost,
		valorCustoTotal: cost * quantity,
		observacoes: observacoes?.trim() ? observacoes.trim() : null,
		modificadores,
	};
}

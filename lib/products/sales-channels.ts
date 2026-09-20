import type { TSalesChannelCatalogModeEnum, TSalesChannelTypeEnum } from "@/schemas/enums";

export type TChannel = { canal: TSalesChannelTypeEnum; catalogoModo: TSalesChannelCatalogModeEnum };
export type TChannelOverride = { disponivel?: boolean | null; precoVenda?: number | null } | null;
export type TChannelOverrides = { product?: TChannelOverride; variant?: TChannelOverride };
export type TChannelProduct = {
	ativo?: boolean | null;
	vendavel: boolean;
	precoVenda?: number | null;
	rastreamentoEstoqueAtivo?: boolean | null;
	quantidade?: number | null;
};
export type TChannelVariant = {
	ativo?: boolean | null;
	precoVenda?: number | null;
	rastreamentoEstoqueAtivo?: boolean | null;
	quantidade?: number | null;
};

// Canais internos que toda organização tem. iFood entra só quando há integração conectada.
export const DEFAULT_SALES_CHANNELS = [
	{ canal: "POS", catalogoModo: "TODOS" },
	{ canal: "SHOP", catalogoModo: "TODOS" },
	{ canal: "COMANDA", catalogoModo: "TODOS" },
] as const satisfies readonly TChannel[];

export const SALES_CHANNEL_TYPES = ["POS", "SHOP", "COMANDA", "IFOOD"] as const;

// Rótulo do grupo dos produtos sem `grupo` preenchido. É o mesmo texto que a vitrine pública usa
// no balde final (app/shop/[slug]/_components/MenuModeView.tsx): a curadoria e a loja precisam
// chamar a mesma coisa pelo mesmo nome.
export const UNGROUPED_PRODUCTS_LABEL = "Outros";

/**
 * Ordena os grupos pela ordem curada do canal. Grupos fora da lista vão depois, em ordem
 * alfabética: um grupo novo (produto acabou de ganhar um grupo inédito) aparece na loja sem
 * depender de alguém abrir o painel, e uma entrada órfã (grupo renomeado) simplesmente não
 * encontra par — não some com o grupo nem trava a ordenação do resto.
 */
export function sortGroupsByChannelOrder(groups: string[], ordemGrupos: string[]) {
	const position = new Map(ordemGrupos.map((group, index) => [group, index]));
	return [...groups].sort((a, b) => {
		const positionA = position.get(a);
		const positionB = position.get(b);
		if (positionA !== undefined && positionB !== undefined) return positionA - positionB;
		if (positionA !== undefined) return -1;
		if (positionB !== undefined) return 1;
		return a.localeCompare(b, "pt-BR");
	});
}

export type TShowcaseExistingRow = { id: string; disponivel: boolean | null; precoVenda: number | null };
export type TShowcaseResolvedNode = { produtoId: string; disponivel: boolean | null; precoVenda: number | null };

/**
 * Traduz a vitrine declarada (modo + lista de produtos) para as linhas esparsas do canal.
 *
 * SELECIONADOS: a presença é opt-in, então o produto listado vira linha `disponivel=true` e o que
 * saiu volta a herdar (= fora do catálogo). TODOS: a presença é o padrão, então quem saiu da
 * vitrine vira linha `disponivel=false` e o listado volta a herdar. Trocar de modo, por isso,
 * preserva o que está visível hoje — muda só o destino dos produtos FUTUROS.
 *
 * Um override de preço não é disponibilidade: quem sai da vitrine mantém o `precoVenda` guardado,
 * e a linha só é apagada quando não sobra nem preço nem disponibilidade para gravar.
 */
export function resolveShowcaseChannelRows({
	catalogoModo,
	listed,
	touchedIds,
	existing,
}: {
	catalogoModo: TSalesChannelCatalogModeEnum;
	/** Produtos na vitrine, com o preço do canal (nulo = herda o preço base). */
	listed: Map<string, number | null>;
	/** Produtos elegíveis ao canal somados aos listados — só eles entram no diff. */
	touchedIds: Iterable<string>;
	existing: Map<string, TShowcaseExistingRow>;
}) {
	const rowIdsToDelete: string[] = [];
	const nodesToUpsert: TShowcaseResolvedNode[] = [];

	for (const produtoId of touchedIds) {
		const isListed = listed.has(produtoId);
		const row = existing.get(produtoId);
		const disponivel = catalogoModo === "SELECIONADOS" ? (isListed ? true : null) : isListed ? null : false;
		const precoVenda = isListed ? (listed.get(produtoId) ?? null) : (row?.precoVenda ?? null);

		if (disponivel === null && precoVenda === null) {
			if (row) rowIdsToDelete.push(row.id);
			continue;
		}
		if (!row || row.disponivel !== disponivel || row.precoVenda !== precoVenda) {
			nodesToUpsert.push({ produtoId, disponivel, precoVenda });
		}
	}

	return { rowIdsToDelete, nodesToUpsert };
}

/** Converte o `sales.canal` (texto livre) para o tipo do registro de canais, quando reconhecido. */
export function toSalesChannelType(canal: string | null | undefined): TSalesChannelTypeEnum | undefined {
	return (SALES_CHANNEL_TYPES as readonly string[]).includes(canal ?? "") ? (canal as TSalesChannelTypeEnum) : undefined;
}

/** Um nó da matriz canal × (produto | variante), como o PUT de configurações e o POST de produto recebem. */
export type TChannelSettingNode = {
	canalVendaId: string;
	produtoVarianteId?: string | null;
	disponivel?: boolean | null;
	precoVenda?: number | null;
};

export function channelSettingNodeKey(node: Pick<TChannelSettingNode, "canalVendaId" | "produtoVarianteId">) {
	return `${node.canalVendaId}:${node.produtoVarianteId ?? ""}`;
}

/**
 * Regras de escrita das configurações por canal, compartilhadas entre o PUT do produto já
 * cadastrado e o POST que cria o produto com a matriz junto. As duas rotas precisam recusar o
 * mesmo payload pelo mesmo motivo, senão o que a criação aceita a edição rejeita depois.
 *
 * `variantIds` são os ids reais no PUT e as referências locais (referenciaId) no POST — para as
 * regras tanto faz, desde que os nós usem o mesmo espaço de ids. `hasVariants` existe porque no
 * POST uma variante pode vir sem referência (chamador que não configura canais) e ainda assim
 * tornar o preço nível-produto ambíguo; por padrão deriva do próprio conjunto. Devolve a mensagem
 * do erro, ou null quando o conjunto é válido.
 */
export function validateChannelSettingNodes({
	settings,
	ownedChannelIds,
	variantIds,
	hasVariants = variantIds.size > 0,
}: {
	settings: TChannelSettingNode[];
	ownedChannelIds: Set<string>;
	variantIds: Set<string>;
	hasVariants?: boolean;
}): string | null {
	// Um nó só pode aparecer uma vez: duas linhas para o mesmo nó violariam
	// unq_product_channel_settings_node no insert e virariam 500 no lugar de um erro de payload.
	if (settings.length !== new Set(settings.map(channelSettingNodeKey)).size) {
		return "Há configurações repetidas para o mesmo canal e variante.";
	}
	if (settings.some((setting) => !ownedChannelIds.has(setting.canalVendaId))) {
		return "Um canal de venda não pertence à organização.";
	}
	if (settings.some((setting) => setting.produtoVarianteId && !variantIds.has(setting.produtoVarianteId))) {
		return "Uma variante não pertence ao produto.";
	}
	// Preço nível-produto com variantes é ambíguo (ver resolveChannelPrice): qual variante ele vale?
	if (hasVariants && settings.some((setting) => !setting.produtoVarianteId && setting.precoVenda != null)) {
		return "Defina o preço por canal em cada variante deste produto.";
	}
	return null;
}

/**
 * Separa os nós que viram linha dos que voltam a herdar. A linha é esparsa: sem disponibilidade
 * nem preço não há o que guardar, então o nó com os dois campos nulos é uma remoção no PUT e
 * simplesmente não é inserido no POST.
 */
export function splitChannelSettingNodes<TNode extends TChannelSettingNode>(settings: TNode[]) {
	const upserts: TNode[] = [];
	const clears: TNode[] = [];
	for (const setting of settings) {
		if (setting.disponivel != null || setting.precoVenda != null) upserts.push(setting);
		else clears.push(setting);
	}
	return { upserts, clears };
}

// Preço é node-scoped: o override da variante vale para a variante, o do produto só para produto
// sem variante. Sem fallback cruzado — produto-com-variantes + override nível-produto é ambíguo
// e é rejeitado na escrita (PUT /api/products/channel-settings).
export function resolveChannelPrice(product: TChannelProduct, variant: TChannelVariant | null | undefined, overrides?: TChannelOverrides) {
	return variant ? (overrides?.variant?.precoVenda ?? variant.precoVenda ?? null) : (overrides?.product?.precoVenda ?? product.precoVenda ?? null);
}

// Disponibilidade herda em cadeia: o produto decide sua presença no canal (override do produto,
// senão o modo do canal); a variante só RESTRINGE dentro de um produto visível — uma linha
// disponivel=true numa variante não ressuscita um produto excluído do canal.
export function resolveChannelAvailability({
	product,
	variant,
	channel,
	overrides,
}: {
	product: TChannelProduct;
	variant?: TChannelVariant | null;
	channel: TChannel;
	overrides?: TChannelOverrides;
}) {
	if (!product.ativo || !product.vendavel) return false;
	if (!(overrides?.product?.disponivel ?? channel.catalogoModo === "TODOS")) return false;
	if (variant) {
		if (!variant.ativo) return false;
		if (overrides?.variant?.disponivel === false) return false;
	}
	if (channel.canal !== "SHOP") return true;

	// Política do canal SHOP: sem preço não lista, sem estoque rastreado não lista.
	const node = variant ?? product;
	const price = resolveChannelPrice(product, variant, overrides);
	return (price ?? 0) > 0 && (!node.rastreamentoEstoqueAtivo || (node.quantidade ?? 0) > 0);
}

/**
 * Projeta os grupos de adicionais para as regras DO CANAL: quando o canal não exige os mínimos,
 * todo grupo vira opcional (`minOpcoes` 0) para quem lê este catálogo. Os máximos não se movem —
 * relaxar a exigência é sobre poder seguir sem escolher, não sobre poder escolher demais.
 *
 * A projeção acontece no catálogo, e não em cada tela, porque o catálogo é a fonte comum: o
 * builder do PDV, a sacola da loja e a validação do pedido leem os mesmos grupos, então a regra
 * não pode divergir entre o que a tela bloqueia e o que o servidor aceita.
 *
 * Canal ausente (org ainda não materializada) preserva o comportamento legado: exige.
 */
export function channelAddOnReferences<TReference extends { grupo: { minOpcoes: number } }>(
	channel: { exigirAdicionaisMinimos: boolean } | null | undefined,
	references: TReference[],
): TReference[] {
	if (channel?.exigirAdicionaisMinimos !== false) return references;
	// A cópia só sobrescreve `minOpcoes`; o resto do grupo (opções, máximos, ordem) segue intacto,
	// então a asserção devolve o mesmo shape que entrou — o genérico é que não consegue provar isso.
	return references.map((reference) => ({ ...reference, grupo: { ...reference.grupo, minOpcoes: 0 } }) as TReference);
}

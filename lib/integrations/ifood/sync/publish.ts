import { getIfoodItemFlat } from "@/lib/integrations/ifood/catalog";
import { IFOOD_IMAGE_ALLOWED_TYPES } from "@/lib/integrations/ifood/catalog-types";
import { uploadIfoodImage } from "@/lib/integrations/ifood/image";
import { upsertIfoodItem } from "@/lib/integrations/ifood/catalog-items";
import { resolveChannelAvailability, resolveChannelPrice, type TChannel } from "@/lib/products/sales-channels";
import { loadChannelState } from "@/lib/products/sales-channels-store";
import type { TCatalogLinkSnapshot } from "@/schemas/catalog-links";
import { db } from "@/services/drizzle";
import { catalogLinks, products } from "@/services/drizzle/schema";
import type { AxiosInstance } from "axios";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { associationSnapshot, buildItemOptionGroupsPayload, loadAddOnLinks, recordAddOnLinksFromFlatItem, resolveProductAddOnNodes } from "./add-ons";
import { upsertCatalogLink } from "./links";

/** Nó publicável: um produto sem variantes, ou uma variante (que vira um item próprio no iFood). */
export type TPublishNode = {
	produtoId: string;
	produtoVarianteId: string | null;
	nome: string;
	descricao: string | null;
	codigo: string;
	imagemCapaUrl: string | null;
	preco: number;
	disponivel: boolean;
};

/**
 * Resolve o que publicar para um produto, aplicando a primitiva de canais no canal daquela loja.
 *
 * Decisão D2: **um item do iFood por variante**. O iFood não tem conceito nativo de variante, e a
 * alternativa (eixo como optionGroup) exigiria converter preços absolutos em deltas — o que não
 * casa com os overrides por variante de `product_channel_settings`. Produto sem variantes publica
 * um único item.
 */
export async function resolvePublishNodes({
	orgId,
	merchantId,
	produtoId,
}: {
	orgId: string;
	merchantId: string;
	produtoId: string;
}): Promise<TPublishNode[]> {
	const product = await db.query.products.findFirst({
		where: and(eq(products.id, produtoId), eq(products.organizacaoId, orgId)),
		with: { variantes: { where: (fields, { eq: eqOp }) => eqOp(fields.ativo, true) } },
	});
	if (!product) throw new createHttpError.NotFound("Produto não encontrado.");
	if (!product.vendavel) throw new createHttpError.BadRequest("Produtos não vendáveis (matéria-prima) não podem ser publicados no iFood.");

	const channelState = await loadChannelState({ orgId, canal: "IFOOD", refExterno: merchantId });
	const channel: TChannel = { canal: "IFOOD", catalogoModo: channelState?.channel.catalogoModo ?? "SELECIONADOS" };
	const overridesFor = (variantId: string | null) => ({
		product: channelState?.productOverrides.get(product.id) ?? null,
		variant: variantId ? (channelState?.variantOverrides.get(variantId) ?? null) : null,
	});

	if (product.variantes.length === 0) {
		const overrides = overridesFor(null);
		const preco = resolveChannelPrice(product, null, overrides);
		if (preco == null || preco <= 0) throw new createHttpError.BadRequest(`O produto "${product.nome}" não tem preço definido para o iFood.`);
		return [
			{
				produtoId: product.id,
				produtoVarianteId: null,
				nome: product.nome,
				descricao: product.descricao,
				codigo: product.codigo,
				imagemCapaUrl: product.imagemCapaUrl,
				preco,
				// O publish force-inclui o nó no canal: em SELECIONADOS, publicar É a decisão de
				// incluir. A disponibilidade só reflete um "indisponível" explícito na matriz.
				disponivel: resolveChannelAvailability({ product, channel: { ...channel, catalogoModo: "TODOS" }, overrides }),
			},
		];
	}

	return product.variantes.map((variant) => {
		const overrides = overridesFor(variant.id);
		const preco = resolveChannelPrice(product, variant, overrides);
		if (preco == null || preco <= 0) {
			throw new createHttpError.BadRequest(`A variante "${variant.nome}" de "${product.nome}" não tem preço definido para o iFood.`);
		}
		return {
			produtoId: product.id,
			produtoVarianteId: variant.id,
			nome: `${product.nome} - ${variant.nome}`,
			descricao: product.descricao,
			codigo: variant.codigo ?? product.codigo,
			imagemCapaUrl: variant.imagemCapaUrl ?? product.imagemCapaUrl,
			preco,
			disponivel: resolveChannelAvailability({ product, variant, channel: { ...channel, catalogoModo: "TODOS" }, overrides }),
		};
	});
}

function snapshotOf(node: TPublishNode): TCatalogLinkSnapshot {
	return { nome: node.nome, descricao: node.descricao, imagemUrl: node.imagemCapaUrl, preco: node.preco, disponivel: node.disponivel };
}

/**
 * Busca a imagem do storage e sobe para o iFood (que aceita upload, não URL). Devolve o `imagePath`
 * a gravar no produto. Lança: quem chama decide se a foto é acessória (publicação) ou é a mudança
 * sendo enviada (push), caso em que o vínculo precisa ficar em ERRO para tentar de novo.
 */
export async function uploadIfoodImageFromUrl({ client, merchantId, imagemUrl }: { client: AxiosInstance; merchantId: string; imagemUrl: string }) {
	const response = await fetch(imagemUrl);
	if (!response.ok) throw new Error(`Falha ao baixar a imagem do produto (HTTP ${response.status}).`);
	const file = await response.blob();
	// Uma URL que responde 200 com HTML (página de bloqueio, login, 404 "bonito") passaria no
	// `ok` e subiria lixo como se fosse imagem — o iFood devolveria "NotABase64" sem dizer que o
	// problema era a origem. Checar o content-type transforma isso num aviso claro aqui.
	if (!IFOOD_IMAGE_ALLOWED_TYPES.includes(file.type)) {
		throw new Error(`A imagem do produto não é PNG/JPEG (content-type: ${file.type || "desconhecido"}, ${file.size} bytes).`);
	}
	const fileName = imagemUrl.split("/").pop() || "produto.png";
	const { path } = await uploadIfoodImage(client, merchantId, { file, fileName });
	return path;
}

/** Na publicação a foto é acessória: sem ela o item ainda vende, então a falha vira aviso. */
async function uploadNodeImage({
	client,
	merchantId,
	imagemUrl,
	produtoId,
}: {
	client: AxiosInstance;
	merchantId: string;
	imagemUrl: string;
	produtoId: string;
}): Promise<string | null> {
	try {
		return await uploadIfoodImageFromUrl({ client, merchantId, imagemUrl });
	} catch (error) {
		console.warn("[IFOOD_PUBLISH] Falha ao subir imagem, publicando sem ela.", { produtoId, imagemUrl, error });
		return null;
	}
}

/**
 * Lê de volta o item recém-publicado para descobrir o productId que o iFood realmente usou — e os
 * ids dos grupos/opções de complemento criados na mesma chamada. Falha na leitura cai no id
 * enviado — melhor um vínculo com id possivelmente errado (detectável na reconciliação) do que
 * perder a publicação inteira.
 */
export async function readBackPublishedItem({
	client,
	merchantId,
	itemId,
	fallbackProductId,
}: {
	client: AxiosInstance;
	merchantId: string;
	itemId: string;
	fallbackProductId: string;
}) {
	try {
		const flat = await getIfoodItemFlat(client, merchantId, itemId);
		return { produtoId: flat.produtoId ?? fallbackProductId, flat };
	} catch (error) {
		console.warn("[IFOOD_PUBLISH] Não foi possível reler o item para confirmar o productId.", { itemId, error });
		return { produtoId: fallbackProductId, flat: null };
	}
}

/**
 * Publica um produto interno no iFood: cria `product` + `item` por nó e grava os vínculos.
 *
 * A imagem só sobe quando a política pede — o upload é a chamada mais cara do fluxo e o
 * `imagePath` retornado é o que o iFood aceita (não a URL pública).
 */
export async function publishProductToIfood({
	client,
	orgId,
	merchantId,
	categoriaId,
	produtoId,
	autorId,
}: {
	client: AxiosInstance;
	orgId: string;
	merchantId: string;
	categoriaId: string;
	produtoId: string;
	autorId?: string | null;
}) {
	const nodes = await resolvePublishNodes({ orgId, merchantId, produtoId });
	const published: { produtoVarianteId: string | null; itemId: string; externoProdutoId: string }[] = [];

	// Complementos vão na mesma chamada: grupos/opções já vinculados com os ids remotos, os demais
	// nascem aqui e ganham vínculo na releitura. Um produto com variantes publica N itens que
	// compartilham os mesmos grupos — o iFood reusa o optionGroup pelo id a partir do segundo.
	const channelState = await loadChannelState({ orgId, canal: "IFOOD", refExterno: merchantId });
	const addOnNodes = await resolveProductAddOnNodes({ orgId, produtoId, channelState });
	let addOnLinks = await loadAddOnLinks({ orgId, merchantId });

	for (const node of nodes) {
		// Imagem é acessório: um item sem foto ainda vende. Falhar a publicação inteira por causa
		// dela seria pior do que publicar sem — por isso o erro é engolido com aviso.
		const imagemPath = node.imagemCapaUrl ? await uploadNodeImage({ client, merchantId, imagemUrl: node.imagemCapaUrl, produtoId }) : null;

		const { itemId, productId: enviadoProdutoId } = await upsertIfoodItem(client, merchantId, {
			categoriaId,
			status: node.disponivel ? "AVAILABLE" : "UNAVAILABLE",
			preco: node.preco,
			codigoExterno: node.codigo,
			produto: { nome: node.nome, descricao: node.descricao, imagemPath },
			gruposComplementos: addOnNodes.length ? buildItemOptionGroupsPayload({ nodes: addOnNodes, links: addOnLinks, remote: null }) : undefined,
		});

		// O iFood NÃO garante o productId que enviamos: medido ao vivo, um item publicado com
		// productId gerado por nós apareceu depois sob outro id, e o `PUT /products/{id}` com o id
		// enviado respondia 404 — o que quebraria o push de nome/descrição. Relemos o item para
		// gravar o id autoritativo. O itemId, esse sim, é respeitado. A mesma leitura traz os ids
		// dos grupos/opções recém-criados.
		const { produtoId: externoProdutoId, flat } = await readBackPublishedItem({ client, merchantId, itemId, fallbackProductId: enviadoProdutoId });
		if (flat && addOnNodes.length) {
			addOnLinks = await recordAddOnLinksFromFlatItem({ orgId, merchantId, nodes: addOnNodes, links: addOnLinks, flat, autorId });
		}

		await upsertCatalogLink({
			orgId,
			merchantId,
			node: {
				tipo: node.produtoVarianteId ? "VARIANTE" : "PRODUTO",
				produtoId: node.produtoId,
				produtoVarianteId: node.produtoVarianteId,
			},
			externalRefs: { externoItemId: itemId, externoProdutoId, externoCategoriaId: categoriaId },
			autorId,
		});

		// O snapshot é o que permite ao push seguinte saber que nada mudou e não chamar a API.
		await db
			.update(catalogLinks)
			.set({
				status: "SINCRONIZADO",
				ultimoSnapshot: { ...snapshotOf(node), gruposComplementos: associationSnapshot({ nodes: addOnNodes, links: addOnLinks }) },
				dataUltimaSincronizacao: new Date(),
				ultimoErro: null,
			})
			.where(and(eq(catalogLinks.organizacaoId, orgId), eq(catalogLinks.merchantId, merchantId), eq(catalogLinks.externoItemId, itemId)));

		published.push({ produtoVarianteId: node.produtoVarianteId, itemId, externoProdutoId });
	}

	return { published };
}

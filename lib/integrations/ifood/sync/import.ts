import { getIfoodItemFlat } from "@/lib/integrations/ifood/catalog";
import type { TCatalogLinkSnapshot } from "@/schemas/catalog-links";
import { db } from "@/services/drizzle";
import { catalogLinks, productChannelSettings, products } from "@/services/drizzle/schema";
import type { AxiosInstance } from "axios";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { ensureIfoodSalesChannel } from "@/lib/products/sales-channels-store";
import { itemContextIdsOfFlat } from "./item-context-ids";
import { upsertCatalogLink } from "./links";

/**
 * Importa um item do iFood para o cadastro interno e cria o vínculo.
 *
 * O preço do item entra como OVERRIDE do canal iFood, não como `precoVenda` base: o preço no
 * iFood normalmente embute a comissão, e escrevê-lo na raiz contaminaria PDV, loja e comanda com
 * um preço que só faz sentido lá. O preço base fica nulo até alguém defini-lo — o produto
 * simplesmente não aparece nos outros canais até lá (gate de preço > 0).
 */
export async function importIfoodItem({
	client,
	orgId,
	integracaoId,
	merchantId,
	itemId,
	autorId,
}: {
	client: AxiosInstance;
	orgId: string;
	integracaoId: string;
	merchantId: string;
	itemId: string;
	autorId?: string | null;
}) {
	const item = await getIfoodItemFlat(client, merchantId, itemId);
	if (!item.id) throw new createHttpError.BadRequest("Item do iFood sem identificador.");
	if (!item.nome) throw new createHttpError.BadRequest("Item do iFood sem nome — não é possível importar.");

	const existingLink = await db.query.catalogLinks.findFirst({
		where: and(eq(catalogLinks.organizacaoId, orgId), eq(catalogLinks.merchantId, merchantId), eq(catalogLinks.externoItemId, item.id)),
	});
	if (existingLink && existingLink.status !== "DESVINCULADO") {
		throw new createHttpError.Conflict("Este item do iFood já está vinculado a um produto.");
	}

	const codigo = item.codigoExterno?.trim() || `IFOOD-${item.id.slice(0, 8)}`;
	const existingByCode = await db.query.products.findFirst({
		where: and(eq(products.organizacaoId, orgId), eq(products.codigo, codigo)),
		columns: { id: true },
	});

	const produtoId =
		existingByCode?.id ??
		(
			await db
				.insert(products)
				.values({
					organizacaoId: orgId,
					nome: item.nome,
					descricao: item.descricao ?? null,
					codigo,
					unidade: "UN",
					ncm: "N/A",
					tipo: "PRODUTO",
					grupo: "iFood",
					vendavel: true,
					// precoVenda fica nulo de propósito — ver docstring.
					precoVenda: null,
					imagemCapaUrl: item.imagemUrl ?? null,
				})
				.returning({ id: products.id })
		)[0].id;

	// O preço do iFood vira override do canal daquela loja.
	const channel = await ensureIfoodSalesChannel({ orgId, integracaoId, merchantId });
	if (item.preco != null && item.preco > 0) {
		await db
			.insert(productChannelSettings)
			.values({ organizacaoId: orgId, canalVendaId: channel.id, produtoId, disponivel: true, precoVenda: item.preco })
			.onConflictDoUpdate({
				target: [productChannelSettings.canalVendaId, productChannelSettings.produtoId, productChannelSettings.produtoVarianteId],
				set: { disponivel: true, precoVenda: item.preco, dataAtualizacao: new Date() },
			});
	}

	const link = await upsertCatalogLink({
		orgId,
		merchantId,
		node: { tipo: "PRODUTO", produtoId },
		externalRefs: {
			externoItemId: item.id,
			externoProdutoId: item.produtoId ?? null,
			externoCategoriaId: item.categoriaId ?? null,
			externoItemContextoIds: itemContextIdsOfFlat(item),
		},
		autorId,
	});

	const snapshot: TCatalogLinkSnapshot = {
		nome: item.nome,
		descricao: item.descricao,
		imagemUrl: item.imagemUrl,
		preco: item.preco,
		disponivel: item.status === "AVAILABLE",
	};
	await db
		.update(catalogLinks)
		.set({ status: "SINCRONIZADO", ultimoSnapshot: snapshot, dataUltimaSincronizacao: new Date(), ultimoErro: null })
		.where(eq(catalogLinks.id, link.id));

	return { produtoId, linkId: link.id, criouProduto: !existingByCode };
}

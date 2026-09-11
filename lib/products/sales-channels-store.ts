import type { TShopSettingsConfiguration } from "@/schemas/shop";
import { db } from "@/services/drizzle";
import { productChannelSettings, products, salesChannels, type TSalesChannelEntity } from "@/services/drizzle/schema";
import { and, eq, inArray, isNull, notInArray, type SQL } from "drizzle-orm";
import { DEFAULT_SALES_CHANNELS, type TChannel } from "./sales-channels";

function findInternalChannel(rows: TSalesChannelEntity[], canal: TChannel["canal"]) {
	return rows.find((row) => row.canal === canal && !row.integracaoId && !row.refExterno);
}

/**
 * Traduz o bloco `produtos.{modo, produtoIds}` do jsonb da loja para o estado do canal SHOP:
 * ATIVOS → TODOS sem linhas; INCLUIR → SELECIONADOS + linhas disponivel=true; EXCLUIR → TODOS +
 * linhas disponivel=false. `destaqueIds` fica de fora — é merchandising, não disponibilidade.
 */
export function mapShopProductsConfigToChannelState(produtos: TShopSettingsConfiguration["produtos"]) {
	if (produtos.modo === "INCLUIR") {
		return { catalogoModo: "SELECIONADOS" as const, disponivel: true, produtoIds: produtos.produtoIds };
	}
	if (produtos.modo === "EXCLUIR") {
		return { catalogoModo: "TODOS" as const, disponivel: false, produtoIds: produtos.produtoIds };
	}
	return { catalogoModo: "TODOS" as const, disponivel: true, produtoIds: [] as string[] };
}

/**
 * Traduz o bloco legado de produtos do jsonb da loja para o canal SHOP. É uma migração de uma vez
 * só: hoje o único chamador é `ensureSalesChannels`, quando materializa o canal de uma organização
 * que ainda não o tinha. O painel NÃO chama mais isto — a vitrine edita o canal direto
 * (PUT /api/sales-channels/showcase), e um sync a cada save apagaria a curadoria.
 *
 * Reescreve `disponivel` das linhas nível-produto mas PRESERVA `preco_venda`: um override de preço
 * não é disponibilidade. Não toca em `ordem_grupos`.
 */
export async function syncShopSalesChannel({ orgId, produtos }: { orgId: string; produtos: TShopSettingsConfiguration["produtos"] }) {
	const desired = mapShopProductsConfigToChannelState(produtos);

	// Ids do jsonb podem apontar para produtos já excluídos — o insert com FK falharia.
	const validIds = desired.produtoIds.length
		? (
				await db
					.select({ id: products.id })
					.from(products)
					.where(and(eq(products.organizacaoId, orgId), inArray(products.id, desired.produtoIds)))
			).map((row) => row.id)
		: [];

	return db.transaction(async (tx) => {
		const [channel] = await tx
			.insert(salesChannels)
			.values({ organizacaoId: orgId, canal: "SHOP", catalogoModo: desired.catalogoModo })
			.onConflictDoUpdate({
				target: [salesChannels.organizacaoId, salesChannels.canal, salesChannels.integracaoId, salesChannels.refExterno],
				set: { catalogoModo: desired.catalogoModo, dataAtualizacao: new Date() },
			})
			.returning();

		const existingRows = await tx.query.productChannelSettings.findMany({
			where: and(eq(productChannelSettings.canalVendaId, channel.id), isNull(productChannelSettings.produtoVarianteId)),
			columns: { id: true, produtoId: true, precoVenda: true },
		});

		const desiredIds = new Set(validIds);
		const staleRows = existingRows.filter((row) => !desiredIds.has(row.produtoId));
		const staleToDelete = staleRows.filter((row) => row.precoVenda == null).map((row) => row.id);
		const staleToClear = staleRows.filter((row) => row.precoVenda != null).map((row) => row.id);

		if (staleToDelete.length) await tx.delete(productChannelSettings).where(inArray(productChannelSettings.id, staleToDelete));
		if (staleToClear.length) {
			await tx
				.update(productChannelSettings)
				.set({ disponivel: null, dataAtualizacao: new Date() })
				.where(inArray(productChannelSettings.id, staleToClear));
		}
		if (validIds.length) {
			await tx
				.insert(productChannelSettings)
				.values(validIds.map((produtoId) => ({ organizacaoId: orgId, canalVendaId: channel.id, produtoId, disponivel: desired.disponivel })))
				.onConflictDoUpdate({
					target: [productChannelSettings.canalVendaId, productChannelSettings.produtoId, productChannelSettings.produtoVarianteId],
					set: { disponivel: desired.disponivel, dataAtualizacao: new Date() },
				});
		}

		return channel;
	});
}

/**
 * Estado de um canal interno para leitura de catálogo: a linha do canal + mapas esparsos de
 * disponibilidade por produto e por variante. Nulo quando a organização ainda não tem a linha
 * (migração não aplicada / org não materializada) — o chamador decide o fallback.
 * Nesta fase só a DISPONIBILIDADE é consumida; preço por canal entra na fase 3.
 */
export async function loadChannelState({ orgId, canal, refExterno }: { orgId: string; canal: TChannel["canal"]; refExterno?: string | null }) {
	// Canais internos são identificados pela ausência de integração/ref; canais de integração
	// (iFood) por merchant, já que preço e disponibilidade podem divergir entre lojas.
	const channel = await db.query.salesChannels.findFirst({
		where: refExterno
			? and(eq(salesChannels.organizacaoId, orgId), eq(salesChannels.canal, canal), eq(salesChannels.refExterno, refExterno))
			: and(
					eq(salesChannels.organizacaoId, orgId),
					eq(salesChannels.canal, canal),
					isNull(salesChannels.integracaoId),
					isNull(salesChannels.refExterno),
				),
	});
	if (!channel) return null;

	const overrides = await db.query.productChannelSettings.findMany({
		where: eq(productChannelSettings.canalVendaId, channel.id),
		columns: { produtoId: true, produtoVarianteId: true, disponivel: true, precoVenda: true },
	});

	const productOverrides = new Map<string, { disponivel: boolean | null; precoVenda: number | null }>();
	const variantOverrides = new Map<string, { disponivel: boolean | null; precoVenda: number | null }>();
	for (const override of overrides) {
		const entry = { disponivel: override.disponivel, precoVenda: override.precoVenda };
		if (override.produtoVarianteId) variantOverrides.set(override.produtoVarianteId, entry);
		else productOverrides.set(override.produtoId, entry);
	}

	return { channel, productOverrides, variantOverrides };
}
export type TChannelState = NonNullable<Awaited<ReturnType<typeof loadChannelState>>>;

/**
 * Presença de produtos no canal, em forma de filtro para a query: em SELECIONADOS só entram os
 * ids com linha disponivel=true (lista vazia = catálogo vazio); em TODOS saem os ids com linha
 * disponivel=false. Variantes são filtradas depois, no resultado (só restringem — ver resolver).
 */
export function channelProductFilter(state: TChannelState) {
	if (state.channel.catalogoModo === "SELECIONADOS") {
		return {
			includeIds: [...state.productOverrides.entries()].filter(([, override]) => override.disponivel === true).map(([id]) => id),
			excludeIds: null,
		};
	}
	const excluded = [...state.productOverrides.entries()].filter(([, override]) => override.disponivel === false).map(([id]) => id);
	return { includeIds: null, excludeIds: excluded.length ? excluded : null };
}

/**
 * Condições SQL de "produto vendável neste canal": cadastro ativo, marcado como vendável e presente
 * no canal (matriz esparsa — ver `channelProductFilter`). Existe para que toda superfície de venda
 * responda ao MESMO conjunto: derivar a barra de categorias de um filtro mais frouxo do que o da
 * grade é justamente o que produz a categoria que abre vazia.
 *
 * Devolve `null` quando o catálogo do canal é vazio (modo SELECIONADOS sem nenhum produto liberado):
 * o chamador retorna cedo em vez de montar um `inArray(..., [])`.
 */
export function buildChannelCatalogConditions({ orgId, channelState }: { orgId: string; channelState: TChannelState | null }): SQL[] | null {
	const conditions: SQL[] = [eq(products.organizacaoId, orgId), eq(products.ativo, true), eq(products.vendavel, true)];

	// Canal ausente = organização não materializada ainda — comporta-se como TODOS sem overrides.
	if (!channelState) return conditions;

	const filter = channelProductFilter(channelState);
	if (filter.includeIds) {
		if (filter.includeIds.length === 0) return null;
		conditions.push(inArray(products.id, filter.includeIds));
	}
	if (filter.excludeIds) conditions.push(notInArray(products.id, filter.excludeIds));

	return conditions;
}

/** Preço resolvido de um nó no canal (node-scoped — ver resolver): override do nó, senão o base. */
export function channelNodePrice(
	state: TChannelState | null,
	node: { produtoId: string; produtoVarianteId?: string | null; precoVenda: number | null },
) {
	if (!state) return node.precoVenda;
	const override = node.produtoVarianteId ? state.variantOverrides.get(node.produtoVarianteId) : state.productOverrides.get(node.produtoId);
	return override?.precoVenda ?? node.precoVenda;
}

/**
 * Materializa o canal de uma loja iFood. Diferente dos internos, canais de integração não nascem
 * por padrão: só existem quando há uma conexão, e um por merchant (o `ref_externo` é o merchantId),
 * porque disponibilidade e preço podem divergir entre lojas da mesma organização.
 *
 * `catalogoModo` nasce SELECIONADOS: o catálogo do iFood é opt-in por vínculo — jogar o cadastro
 * inteiro para uma loja pública por padrão seria o oposto do princípio 1 do doc de sync.
 */
export async function ensureIfoodSalesChannel({ orgId, integracaoId, merchantId }: { orgId: string; integracaoId: string; merchantId: string }) {
	const [channel] = await db
		.insert(salesChannels)
		.values({ organizacaoId: orgId, canal: "IFOOD", integracaoId, refExterno: merchantId, catalogoModo: "SELECIONADOS" })
		.onConflictDoUpdate({
			target: [salesChannels.organizacaoId, salesChannels.canal, salesChannels.integracaoId, salesChannels.refExterno],
			set: { dataAtualizacao: new Date() },
		})
		.returning();
	return channel;
}

/**
 * Provisiona os canais internos na primeira leitura e devolve todos os canais da organização.
 *
 * A matriz por produto grava overrides contra o id do canal, então devolver linhas sintéticas
 * (id nulo) obrigaria a UI a materializar o canal num PUT prévio — uma dependência de ordem que
 * nada garante. O canal SHOP não nasce com default cego: ele nasce já traduzindo o modo do jsonb
 * da loja (migração on-provision) — senão uma org de cardápio curado (INCLUIR) exporia o catálogo
 * inteiro no intervalo entre o provisionamento e a migração.
 *
 * Devolve as linhas persistidas SEM filtrar por canal: um canal configurado (iFood por merchant,
 * ou um POS com refExterno) precisa aparecer na gestão, senão vira override invisível.
 */
export async function ensureSalesChannels({ orgId }: { orgId: string }) {
	const existing = await db.query.salesChannels.findMany({ where: eq(salesChannels.organizacaoId, orgId) });
	const missing = DEFAULT_SALES_CHANNELS.filter((channel) => !findInternalChannel(existing, channel.canal));
	if (missing.length === 0) return existing;

	const shopMissing = missing.some((channel) => channel.canal === "SHOP");
	const plainMissing = missing.filter((channel) => channel.canal !== "SHOP");

	if (plainMissing.length) {
		await db
			.insert(salesChannels)
			.values(plainMissing.map((channel) => ({ organizacaoId: orgId, ...channel })))
			.onConflictDoNothing();
	}
	if (shopMissing) {
		const shopRow = await db.query.shopSettings.findFirst({ where: (fields, { eq: eqOp }) => eqOp(fields.organizacaoId, orgId) });
		const produtos = parseShopProductsConfig(shopRow?.configuracoes);
		await syncShopSalesChannel({ orgId, produtos });
	}

	return db.query.salesChannels.findMany({ where: eq(salesChannels.organizacaoId, orgId) });
}

// O jsonb pode estar em formato legado; para o canal só importa o bloco de produtos, então a
// leitura é tolerante: qualquer coisa fora do esperado cai no default ATIVOS (= TODOS).
function parseShopProductsConfig(configuracoes: unknown): TShopSettingsConfiguration["produtos"] {
	const produtos = (configuracoes as { produtos?: { modo?: unknown; produtoIds?: unknown; destaqueIds?: unknown } } | null | undefined)?.produtos;
	const modo = produtos?.modo === "INCLUIR" || produtos?.modo === "EXCLUIR" ? produtos.modo : "ATIVOS";
	const produtoIds = Array.isArray(produtos?.produtoIds) ? produtos.produtoIds.filter((id): id is string => typeof id === "string") : [];
	const destaqueIds = Array.isArray(produtos?.destaqueIds) ? produtos.destaqueIds.filter((id): id is string => typeof id === "string") : [];
	return { modo, produtoIds, destaqueIds };
}

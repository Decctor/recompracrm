import { appApiHandler } from "@/lib/app-api";
import { requireOrgSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { schedulePushForProduct } from "@/lib/integrations/ifood/sync/push";
import { splitChannelSettingNodes, validateChannelSettingNodes } from "@/lib/products/sales-channels";
import { productsTouchingChannels } from "@/lib/products/sales-channels-matrix";
import { ensureSalesChannels } from "@/lib/products/sales-channels-store";
import { SalesChannelCatalogModeEnum } from "@/schemas/enums";
import { ProductChannelSettingSchema } from "@/schemas/sales-channels";
import { db } from "@/services/drizzle";
import { catalogLinks, productChannelSettings, products, salesChannels } from "@/services/drizzle/schema";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// A matriz é a aba "Canais" de Produtos: TODOS os produtos vendáveis × TODOS os canais da
// organização (internos e um por merchant iFood), lidos de uma vez e gravados como patches
// esparsos por produto — a mesma semântica do PUT unitário de /api/products/channel-settings, que a
// página do produto continua usando. Ver docs/catalog-channels-matrix-design.md.

const MatrixChannelInputSchema = z.object({
	canalVendaId: z
		.string({
			required_error: "ID do canal de venda não informado.",
			invalid_type_error: "Tipo não válido para ID do canal de venda.",
		})
		.min(1, { message: "ID do canal de venda não informado." }),
	catalogoModo: SalesChannelCatalogModeEnum.optional(),
	ordemGrupos: z
		.array(z.string({ invalid_type_error: "Tipo não válido para grupo do canal." }).trim().min(1, { message: "Grupo do canal sem nome." }))
		.optional(),
});

// Os dois campos nulos = voltar a herdar (a linha esparsa é removida).
const MatrixSettingInputSchema = ProductChannelSettingSchema.pick({
	canalVendaId: true,
	produtoVarianteId: true,
	disponivel: true,
	precoVenda: true,
}).partial({ produtoVarianteId: true, disponivel: true, precoVenda: true });

const MatrixProductInputSchema = z.object({
	produtoId: z
		.string({
			required_error: "ID do produto não informado.",
			invalid_type_error: "Tipo não válido para ID do produto.",
		})
		.min(1, { message: "ID do produto não informado." }),
	settings: z.array(MatrixSettingInputSchema),
});

const UpdateSalesChannelMatrixInputSchema = z
	.object({
		channels: z.array(MatrixChannelInputSchema),
		products: z.array(MatrixProductInputSchema),
	})
	.superRefine((data, ctx) => {
		if (new Set(data.channels.map((channel) => channel.canalVendaId)).size !== data.channels.length) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["channels"], message: "Há canais repetidos na matriz." });
		}
		if (new Set(data.products.map((product) => product.produtoId)).size !== data.products.length) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["products"], message: "Há produtos repetidos na matriz." });
		}
		for (const channel of data.channels) {
			if (channel.ordemGrupos && new Set(channel.ordemGrupos).size !== channel.ordemGrupos.length) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["channels"], message: "Há grupos repetidos na ordem de um canal." });
			}
		}
	});
export type TUpdateSalesChannelMatrixInput = z.infer<typeof UpdateSalesChannelMatrixInputSchema>;

async function getSalesChannelMatrix({ orgId }: { orgId: string }) {
	// `ensureSalesChannels` materializa os internos que faltarem e devolve TODOS os canais da org,
	// inclusive os do iFood (um por merchant): um canal configurado precisa aparecer na gestão,
	// senão vira override invisível.
	const channels = await ensureSalesChannels({ orgId });
	const channelIds = channels.map((channel) => channel.id);

	// Sem os portões de preço e estoque de propósito (mesma decisão da vitrine): quem monta o
	// cardápio precisa ver o produto sem preço com o aviso, não vê-lo sumir sem explicação.
	const matrixProducts = await db.query.products.findMany({
		where: and(eq(products.organizacaoId, orgId), eq(products.ativo, true), eq(products.vendavel, true)),
		columns: {
			id: true,
			nome: true,
			codigo: true,
			grupo: true,
			imagemCapaUrl: true,
			precoVenda: true,
			rastreamentoEstoqueAtivo: true,
			quantidade: true,
		},
		with: {
			// Todas as variantes: quem tem variante precifica por variante, e essa regra não muda
			// porque a variante está desligada hoje. A grade só expande as ativas.
			variantes: {
				columns: { id: true, nome: true, codigo: true, precoVenda: true, ativo: true, rastreamentoEstoqueAtivo: true, quantidade: true },
				orderBy: (fields, { asc }) => asc(fields.nome),
			},
			// Só o suficiente para o chip "Adicionais" da grade (contagem e nomes). A edição abre o
			// diálogo, que carrega o produto completo por conta própria — adicionais não são por
			// canal, então não entram no rascunho da matriz. Referências nível produto, como a
			// página do produto (o fluxo por variante ainda não carrega as regras próprias).
			addOnsReferencias: {
				where: (fields, { isNull: isNullOp }) => isNullOp(fields.produtoVarianteId),
				columns: { id: true, ordem: true },
				with: { grupo: { columns: { id: true, nome: true, internoNome: true, ativo: true } } },
				orderBy: (fields, { asc }) => asc(fields.ordem),
			},
		},
		orderBy: (fields, { asc }) => asc(fields.nome),
	});
	const productIds = new Set(matrixProducts.map((product) => product.id));

	const [settings, links] = await Promise.all([
		channelIds.length
			? db.query.productChannelSettings.findMany({
					where: inArray(productChannelSettings.canalVendaId, channelIds),
					columns: { produtoId: true, canalVendaId: true, produtoVarianteId: true, disponivel: true, precoVenda: true },
				})
			: Promise.resolve([]),
		db.query.catalogLinks.findMany({
			where: and(eq(catalogLinks.organizacaoId, orgId), eq(catalogLinks.provider, "IFOOD"), ne(catalogLinks.status, "DESVINCULADO")),
			columns: {
				id: true,
				merchantId: true,
				tipo: true,
				produtoId: true,
				produtoVarianteId: true,
				externoItemId: true,
				status: true,
				divergencias: true,
				sincronizar: true,
				ultimoErro: true,
				dataUltimaSincronizacao: true,
			},
		}),
	]);

	// Poda na leitura (como a vitrine): um grupo renomeado deixa a entrada órfã na ordem do canal.
	const presentGroups = new Set(matrixProducts.map((product) => product.grupo).filter((grupo) => grupo.trim().length > 0));

	return {
		data: {
			channels: channels.map((channel) => ({
				id: channel.id,
				canal: channel.canal,
				integracaoId: channel.integracaoId,
				refExterno: channel.refExterno,
				catalogoModo: channel.catalogoModo,
				exigirAdicionaisMinimos: channel.exigirAdicionaisMinimos,
				ordemGrupos: channel.ordemGrupos.filter((grupo, index, list) => presentGroups.has(grupo) && list.indexOf(grupo) === index),
			})),
			products: matrixProducts,
			// Linhas de produtos fora da grade (inativos, não vendáveis) ficam intactas no banco, mas
			// não têm célula para ocupar.
			settings: settings.filter((setting) => productIds.has(setting.produtoId)),
			links: links.filter((link) => link.produtoId && productIds.has(link.produtoId)),
		},
		message: "Matriz de canais carregada com sucesso.",
	};
}
export type TGetSalesChannelMatrixOutput = Awaited<ReturnType<typeof getSalesChannelMatrix>>;

async function updateSalesChannelMatrix({ orgId, input }: { orgId: string; input: TUpdateSalesChannelMatrixInput }) {
	const ownedChannels = await db.query.salesChannels.findMany({
		where: eq(salesChannels.organizacaoId, orgId),
		columns: { id: true, canal: true },
	});
	const ownedChannelIds = new Set(ownedChannels.map((channel) => channel.id));
	if (input.channels.some((channel) => !ownedChannelIds.has(channel.canalVendaId))) {
		throw new createHttpError.BadRequest("Um canal de venda não pertence à organização.");
	}

	const productIds = input.products.map((product) => product.produtoId);
	const ownedProducts = productIds.length
		? await db.query.products.findMany({
				where: and(eq(products.organizacaoId, orgId), inArray(products.id, productIds)),
				columns: { id: true },
				with: { variantes: { columns: { id: true } } },
			})
		: [];
	const ownedProductById = new Map(ownedProducts.map((product) => [product.id, product]));

	// As mesmas regras do PUT unitário e do POST de produto, produto a produto: a grade precisa
	// recusar o mesmo payload pelo mesmo motivo que a página do produto.
	for (const patch of input.products) {
		const product = ownedProductById.get(patch.produtoId);
		if (!product) throw new createHttpError.NotFound("Um produto da matriz não foi encontrado.");
		const validationError = validateChannelSettingNodes({
			settings: patch.settings,
			ownedChannelIds,
			variantIds: new Set(product.variantes.map((variant) => variant.id)),
		});
		if (validationError) throw new createHttpError.BadRequest(validationError);
	}

	const clears: { produtoId: string; canalVendaId: string; produtoVarianteId: string | null }[] = [];
	const upserts: (typeof productChannelSettings.$inferInsert)[] = [];
	for (const patch of input.products) {
		const split = splitChannelSettingNodes(patch.settings);
		for (const node of split.clears)
			clears.push({ produtoId: patch.produtoId, canalVendaId: node.canalVendaId, produtoVarianteId: node.produtoVarianteId ?? null });
		for (const node of split.upserts) {
			upserts.push({
				organizacaoId: orgId,
				produtoId: patch.produtoId,
				canalVendaId: node.canalVendaId,
				produtoVarianteId: node.produtoVarianteId ?? null,
				disponivel: node.disponivel ?? null,
				precoVenda: node.precoVenda ?? null,
			});
		}
	}

	await db.transaction(async (tx) => {
		for (const channel of input.channels) {
			if (channel.catalogoModo === undefined && channel.ordemGrupos === undefined) continue;
			await tx
				.update(salesChannels)
				.set({
					...(channel.catalogoModo !== undefined ? { catalogoModo: channel.catalogoModo } : {}),
					...(channel.ordemGrupos !== undefined ? { ordemGrupos: channel.ordemGrupos } : {}),
					dataAtualizacao: new Date(),
				})
				.where(and(eq(salesChannels.id, channel.canalVendaId), eq(salesChannels.organizacaoId, orgId)));
		}

		if (clears.length) {
			await tx
				.delete(productChannelSettings)
				.where(
					and(
						eq(productChannelSettings.organizacaoId, orgId),
						or(
							...clears.map((node) =>
								and(
									eq(productChannelSettings.produtoId, node.produtoId),
									eq(productChannelSettings.canalVendaId, node.canalVendaId),
									node.produtoVarianteId
										? eq(productChannelSettings.produtoVarianteId, node.produtoVarianteId)
										: isNull(productChannelSettings.produtoVarianteId),
								),
							),
						),
					),
				);
		}
		if (upserts.length) {
			await tx
				.insert(productChannelSettings)
				.values(upserts)
				.onConflictDoUpdate({
					target: [productChannelSettings.canalVendaId, productChannelSettings.produtoId, productChannelSettings.produtoVarianteId],
					set: { disponivel: sql`excluded.disponivel`, precoVenda: sql`excluded.preco_venda`, dataAtualizacao: new Date() },
				});
		}
	});

	// Só quem tocou um canal iFood dispara push: mudar um override do canal iFood É uma mudança de
	// preço/disponibilidade lá, mas uma edição no PDV não é — e o push custa contexto por merchant.
	const ifoodChannelIds = new Set(ownedChannels.filter((channel) => channel.canal === "IFOOD").map((channel) => channel.id));
	for (const produtoId of productsTouchingChannels(input.products, ifoodChannelIds)) {
		schedulePushForProduct({ orgId, produtoId });
	}

	return {
		data: { updatedProducts: input.products.length, updatedChannels: input.channels.length },
		message: "Matriz de canais atualizada com sucesso.",
	};
}
export type TUpdateSalesChannelMatrixOutput = Awaited<ReturnType<typeof updateSalesChannelMatrix>>;

async function getSalesChannelMatrixRoute() {
	const session = requireOrgSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const result = await getSalesChannelMatrix({ orgId });
	return NextResponse.json(result);
}

async function updateSalesChannelMatrixRoute(request: NextRequest) {
	const session = requireOrgSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = UpdateSalesChannelMatrixInputSchema.parse(await request.json());
	const result = await updateSalesChannelMatrix({ orgId, input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSalesChannelMatrixRoute });
export const PUT = appApiHandler({ PUT: updateSalesChannelMatrixRoute });

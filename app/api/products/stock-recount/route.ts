import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { DEFAULT_PAGE_SIZE, pageSizeInputSchema } from "@/lib/pagination";
import { canAdjustInventory, canViewInventory } from "@/lib/permissions/inventory";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { applyStockMovement } from "@/lib/stock/apply-stock-movement";
import { consumeStockLotsByFefo } from "@/lib/stock/consume-stock-lots-fefo";
import { db } from "@/services/drizzle";
import { products, productVariants } from "@/services/drizzle/schema";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Chave composta de uma entidade recontável: "produtoId" (saldo do produto) ou
// "produtoId::varianteId" (saldo de uma variante rastreada).
const ENTITY_KEY_SEPARATOR = "::";

const GetStockRecountInputSchema = z.object({
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
	pageSize: pageSizeInputSchema(),
	search: z.string({ invalid_type_error: "Tipo inválido para busca." }).optional().nullable(),
	// Modo "byEntityIds": saldos frescos das chaves informadas, para o passo de confirmação.
	entityIds: z
		.string({ invalid_type_error: "Tipo inválido para IDs das entidades." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",") : [])),
	// Modo "byProductId": linhas de um único produto + variantes rastreadas, para o modal de recontagem rápida.
	productId: z.string({ invalid_type_error: "Tipo inválido para ID do produto." }).optional().nullable(),
});
export type TGetStockRecountInput = z.infer<typeof GetStockRecountInputSchema>;

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

type TStockRecountRow = {
	produtoId: string;
	produtoVarianteId: string | null;
	nome: string;
	varianteNome: string | null;
	codigo: string | null;
	unidade: string;
	imagemCapaUrl: string | null;
	quantidade: number;
	rastreamentoEstoqueAtivo: boolean;
};

function buildProductRow(product: {
	id: string;
	nome: string;
	codigo: string;
	unidade: string;
	imagemCapaUrl: string | null;
	quantidade: number | null;
	rastreamentoEstoqueAtivo: boolean | null;
}): TStockRecountRow {
	return {
		produtoId: product.id,
		produtoVarianteId: null,
		nome: product.nome,
		varianteNome: null,
		codigo: product.codigo,
		unidade: product.unidade,
		imagemCapaUrl: product.imagemCapaUrl,
		quantidade: product.quantidade ?? 0,
		rastreamentoEstoqueAtivo: !!product.rastreamentoEstoqueAtivo,
	};
}

function buildVariantRow(
	variant: {
		id: string;
		produtoId: string;
		nome: string;
		codigo: string | null;
		imagemCapaUrl: string | null;
		quantidade: number | null;
		rastreamentoEstoqueAtivo: boolean | null;
	},
	product: { nome: string; codigo: string; unidade: string; imagemCapaUrl: string | null },
): TStockRecountRow {
	return {
		produtoId: variant.produtoId,
		produtoVarianteId: variant.id,
		nome: product.nome,
		varianteNome: variant.nome,
		codigo: variant.codigo ?? product.codigo,
		unidade: product.unidade,
		imagemCapaUrl: variant.imagemCapaUrl ?? product.imagemCapaUrl,
		quantidade: variant.quantidade ?? 0,
		rastreamentoEstoqueAtivo: !!variant.rastreamentoEstoqueAtivo,
	};
}

const PRODUCT_ROW_COLUMNS = {
	id: products.id,
	nome: products.nome,
	codigo: products.codigo,
	unidade: products.unidade,
	imagemCapaUrl: products.imagemCapaUrl,
	quantidade: products.quantidade,
	rastreamentoEstoqueAtivo: products.rastreamentoEstoqueAtivo,
};

const VARIANT_ROW_COLUMNS = {
	id: productVariants.id,
	produtoId: productVariants.produtoId,
	nome: productVariants.nome,
	codigo: productVariants.codigo,
	imagemCapaUrl: productVariants.imagemCapaUrl,
	quantidade: productVariants.quantidade,
	rastreamentoEstoqueAtivo: productVariants.rastreamentoEstoqueAtivo,
};

// Expande produtos + variantes em linhas recontáveis: linha do produto quando ele próprio é
// rastreado, mais uma linha por variante rastreada (saldos independentes entre os dois níveis).
function expandRecountRows(
	pageProducts: Array<{
		id: string;
		nome: string;
		codigo: string;
		unidade: string;
		imagemCapaUrl: string | null;
		quantidade: number | null;
		rastreamentoEstoqueAtivo: boolean | null;
	}>,
	trackedVariants: Array<{
		id: string;
		produtoId: string;
		nome: string;
		codigo: string | null;
		imagemCapaUrl: string | null;
		quantidade: number | null;
		rastreamentoEstoqueAtivo: boolean | null;
	}>,
) {
	const variantsByProductId = new Map<string, typeof trackedVariants>();
	for (const variant of trackedVariants) {
		const list = variantsByProductId.get(variant.produtoId) ?? [];
		list.push(variant);
		variantsByProductId.set(variant.produtoId, list);
	}

	const rows: TStockRecountRow[] = [];
	for (const product of pageProducts) {
		if (product.rastreamentoEstoqueAtivo) rows.push(buildProductRow(product));
		const variants = variantsByProductId.get(product.id) ?? [];
		for (const variant of variants) rows.push(buildVariantRow(variant, product));
	}
	return rows;
}

async function getStockRecountRows({ input, session }: { input: TGetStockRecountInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	const PAGE_SIZE = input.pageSize ?? DEFAULT_PAGE_SIZE;

	// Modo "byEntityIds": saldos frescos para o passo de confirmação. Chaves ausentes na resposta
	// significam entidade indisponível (excluída ou de outra organização).
	if (input.entityIds.length > 0) {
		const productIds = new Set<string>();
		const variantIds = new Set<string>();
		for (const key of input.entityIds.slice(0, 500)) {
			const [produtoId, produtoVarianteId] = key.split(ENTITY_KEY_SEPARATOR);
			if (!produtoId) continue;
			if (produtoVarianteId) variantIds.add(produtoVarianteId);
			else productIds.add(produtoId);
		}

		const [foundProducts, foundVariants] = await Promise.all([
			productIds.size > 0
				? db
						.select(PRODUCT_ROW_COLUMNS)
						.from(products)
						.where(and(eq(products.organizacaoId, organizationId), inArray(products.id, [...productIds])))
				: Promise.resolve([]),
			variantIds.size > 0
				? db
						.select({
							...VARIANT_ROW_COLUMNS,
							produtoNome: products.nome,
							produtoCodigo: products.codigo,
							produtoUnidade: products.unidade,
							produtoImagemCapaUrl: products.imagemCapaUrl,
						})
						.from(productVariants)
						.innerJoin(products, eq(products.id, productVariants.produtoId))
						.where(and(eq(productVariants.organizacaoId, organizationId), inArray(productVariants.id, [...variantIds])))
				: Promise.resolve([]),
		]);

		const rows: TStockRecountRow[] = [
			...foundProducts.map(buildProductRow),
			...foundVariants.map((variant) =>
				buildVariantRow(variant, {
					nome: variant.produtoNome,
					codigo: variant.produtoCodigo,
					unidade: variant.produtoUnidade,
					imagemCapaUrl: variant.produtoImagemCapaUrl,
				}),
			),
		];

		return {
			data: { default: undefined, byEntityIds: rows, byProductId: undefined },
			message: "Saldos atuais encontrados com sucesso.",
		};
	}

	// Modo "byProductId": linhas de um único produto para o modal de recontagem rápida.
	if (input.productId) {
		const [product] = await db
			.select(PRODUCT_ROW_COLUMNS)
			.from(products)
			.where(and(eq(products.organizacaoId, organizationId), eq(products.id, input.productId)));
		if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

		const trackedVariants = await db
			.select(VARIANT_ROW_COLUMNS)
			.from(productVariants)
			.where(
				and(
					eq(productVariants.organizacaoId, organizationId),
					eq(productVariants.produtoId, product.id),
					eq(productVariants.rastreamentoEstoqueAtivo, true),
				),
			)
			.orderBy(asc(productVariants.nome));

		return {
			data: { default: undefined, byEntityIds: undefined, byProductId: expandRecountRows([product], trackedVariants) },
			message: "Linhas de recontagem do produto encontradas com sucesso.",
		};
	}

	// Modo padrão: produtos recontáveis paginados — o próprio produto rastreado OU ao menos uma
	// variante rastreada.
	const trackedVariantExists = sql`EXISTS (SELECT 1 FROM ${productVariants} WHERE ${productVariants.produtoId} = ${products.id} AND ${productVariants.rastreamentoEstoqueAtivo} = true)`;
	const conditions = [eq(products.organizacaoId, organizationId), or(eq(products.rastreamentoEstoqueAtivo, true), trackedVariantExists)!];
	if (input.search) {
		// Insensível a acentos via unaccent() em ambos os lados (requer extensão `unaccent`, migration 0033).
		conditions.push(
			sql`(unaccent(${products.nome}) ILIKE unaccent('%' || ${input.search} || '%') OR unaccent(${products.codigo}) ILIKE unaccent('%' || ${input.search} || '%'))`,
		);
	}

	const [totalResult, pageProducts] = await Promise.all([
		db
			.select({ total: sql<number>`COUNT(*)` })
			.from(products)
			.where(and(...conditions)),
		db
			.select(PRODUCT_ROW_COLUMNS)
			.from(products)
			.where(and(...conditions))
			.orderBy(asc(products.nome))
			.limit(PAGE_SIZE)
			.offset((input.page - 1) * PAGE_SIZE),
	]);

	const trackedVariants =
		pageProducts.length > 0
			? await db
					.select(VARIANT_ROW_COLUMNS)
					.from(productVariants)
					.where(
						and(
							eq(productVariants.organizacaoId, organizationId),
							inArray(
								productVariants.produtoId,
								pageProducts.map((product) => product.id),
							),
							eq(productVariants.rastreamentoEstoqueAtivo, true),
						),
					)
					.orderBy(asc(productVariants.nome))
			: [];

	const productsMatched = Number(totalResult[0]?.total ?? 0);

	return {
		data: {
			default: {
				rows: expandRecountRows(pageProducts, trackedVariants),
				productsMatched,
				totalPages: Math.max(1, Math.ceil(productsMatched / PAGE_SIZE)),
			},
			byEntityIds: undefined,
			byProductId: undefined,
		},
		message: "Linhas de recontagem encontradas com sucesso.",
	};
}
export type TGetStockRecountOutput = Awaited<ReturnType<typeof getStockRecountRows>>;
export type TGetStockRecountOutputDefault = Exclude<TGetStockRecountOutput["data"]["default"], undefined>;
export type TGetStockRecountOutputRow = Exclude<TGetStockRecountOutput["data"]["byEntityIds"], undefined>[number];

async function getStockRecountRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canViewInventory(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para visualizar o estoque.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetStockRecountInputSchema.parse({
		page: searchParams.get("page"),
		pageSize: searchParams.get("pageSize"),
		search: searchParams.get("search"),
		entityIds: searchParams.get("entityIds"),
		productId: searchParams.get("productId"),
	});
	const result = await getStockRecountRows({ input, session });
	return NextResponse.json(result);
}

const ApplyStockRecountInputSchema = z.object({
	itens: z
		.array(
			z.object({
				produtoId: z.string({
					required_error: "ID do produto não informado.",
					invalid_type_error: "Tipo inválido para ID do produto.",
				}),
				produtoVarianteId: z.string({ invalid_type_error: "Tipo inválido para ID da variante." }).optional().nullable(),
				quantidadeContada: z
					.number({
						required_error: "Quantidade contada não informada.",
						invalid_type_error: "Tipo inválido para quantidade contada.",
					})
					.min(0, { message: "Quantidade contada não pode ser negativa." })
					.finite({ message: "Quantidade contada inválida." }),
			}),
		)
		.min(1, { message: "Nenhum item informado para recontagem." })
		.max(500, { message: "Limite de 500 itens por recontagem." }),
	motivo: z
		.string({ invalid_type_error: "Tipo inválido para motivo." })
		.optional()
		.nullable()
		.transform((value) => value?.trim() || "Recontagem de estoque"),
});
export type TApplyStockRecountInput = z.infer<typeof ApplyStockRecountInputSchema>;

type TStockRecountItemResult = {
	produtoId: string;
	produtoVarianteId: string | null;
	status: "APLICADO" | "SEM_DIFERENCA" | "RASTREAMENTO_INATIVO";
	saldoAnterior: number;
	saldoPosterior: number;
	delta: number;
	// Lotes cujo saldo foi reduzido pela distribuição FEFO de uma redução (sempre 0 em acréscimos).
	lotesAjustados: number;
};

async function applyStockRecount({ input, session }: { input: TApplyStockRecountInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	const userId = session.user.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const seenKeys = new Set<string>();
	for (const item of input.itens) {
		const key = item.produtoVarianteId ? `${item.produtoId}${ENTITY_KEY_SEPARATOR}${item.produtoVarianteId}` : item.produtoId;
		if (seenKeys.has(key)) throw new createHttpError.BadRequest("Itens duplicados na recontagem.");
		seenKeys.add(key);
	}

	// Ordem determinística de travamento das linhas — recontagens concorrentes travam as mesmas
	// entidades na mesma sequência, evitando deadlock.
	const orderedItems = [...input.itens].sort((a, b) =>
		`${a.produtoId}${ENTITY_KEY_SEPARATOR}${a.produtoVarianteId ?? ""}`.localeCompare(
			`${b.produtoId}${ENTITY_KEY_SEPARATOR}${b.produtoVarianteId ?? ""}`,
		),
	);

	return await db.transaction(async (tx) => {
		const itens: TStockRecountItemResult[] = [];

		for (const item of orderedItems) {
			// Leitura travada (FOR UPDATE) do saldo corrente: a contagem é ABSOLUTA, então o delta
			// precisa ser calculado contra o saldo do momento da aplicação — uma venda concorrente
			// entre a leitura e o update produziria um saldo final errado sem o lock.
			let currentQuantity: number;
			let trackingActive: boolean;

			if (item.produtoVarianteId) {
				const [variant] = await tx
					.select({
						quantidade: productVariants.quantidade,
						rastreamentoEstoqueAtivo: productVariants.rastreamentoEstoqueAtivo,
						produtoId: productVariants.produtoId,
					})
					.from(productVariants)
					.where(and(eq(productVariants.id, item.produtoVarianteId), eq(productVariants.organizacaoId, organizationId)))
					.for("update");
				if (!variant) throw new createHttpError.NotFound("Variante de produto não encontrada para recontagem.");
				if (variant.produtoId !== item.produtoId) throw new createHttpError.BadRequest("Variante não pertence ao produto informado.");
				currentQuantity = variant.quantidade ?? 0;
				trackingActive = !!variant.rastreamentoEstoqueAtivo;
			} else {
				const [product] = await tx
					.select({ quantidade: products.quantidade, rastreamentoEstoqueAtivo: products.rastreamentoEstoqueAtivo })
					.from(products)
					.where(and(eq(products.id, item.produtoId), eq(products.organizacaoId, organizationId)))
					.for("update");
				if (!product) throw new createHttpError.NotFound("Produto não encontrado para recontagem.");
				currentQuantity = product.quantidade ?? 0;
				trackingActive = !!product.rastreamentoEstoqueAtivo;
			}

			const base = { produtoId: item.produtoId, produtoVarianteId: item.produtoVarianteId ?? null };

			if (!trackingActive) {
				itens.push({
					...base,
					status: "RASTREAMENTO_INATIVO",
					saldoAnterior: currentQuantity,
					saldoPosterior: currentQuantity,
					delta: 0,
					lotesAjustados: 0,
				});
				continue;
			}

			const signedQuantity = item.quantidadeContada - currentQuantity;
			if (signedQuantity === 0) {
				itens.push({ ...base, status: "SEM_DIFERENCA", saldoAnterior: currentQuantity, saldoPosterior: currentQuantity, delta: 0, lotesAjustados: 0 });
				continue;
			}

			let lotesAjustados = 0;

			if (signedQuantity < 0) {
				// Redução: distribuída entre os lotes ativos não vencidos (FEFO — os itens faltantes
				// quase sempre saíram do estoque mais antigo). Cada lote consumido gera sua própria
				// movimentação AJUSTE vinculada ao lote e o helper decrementa o saldo da entidade.
				// O que os lotes não cobrirem (drift pré-existente ou produto sem lotes) ajusta o
				// saldo da entidade sem vínculo de lote. Lotes vencidos ficam para o fluxo de
				// descarte, que valora a perda contabilmente.
				const consumedLots = await consumeStockLotsByFefo({
					trx: tx,
					organizationId,
					userId,
					produtoId: item.produtoId,
					produtoVarianteId: item.produtoVarianteId ?? null,
					quantidade: Math.abs(signedQuantity),
					reason: input.motivo,
					movementType: "AJUSTE",
					unitCost: null,
					allowPartial: true,
				});
				lotesAjustados = consumedLots.length;
				const consumedTotal = consumedLots.reduce((total, lot) => total + lot.quantidadeConsumida, 0);
				const remainder = Math.abs(signedQuantity) - consumedTotal;
				if (remainder > 1e-9) {
					await applyStockMovement({
						trx: tx,
						organizationId,
						userId,
						produtoId: item.produtoId,
						produtoVarianteId: item.produtoVarianteId ?? null,
						signedQuantity: -remainder,
						movementType: "AJUSTE",
						reason: input.motivo,
						unitCost: null,
						validateSufficientStock: false,
					});
				}
			} else {
				// Acréscimo: não há lote de origem conhecido para as unidades encontradas — apenas o
				// saldo da entidade sobe. A soma dos lotes ficar abaixo do saldo é o sentido inofensivo
				// do desvio (o FEFO nunca consome além do que o lote tem). unitCost null preserva o
				// custo médio móvel corrente — recontagem corrige quantidade, não reavalia custo.
				await applyStockMovement({
					trx: tx,
					organizationId,
					userId,
					produtoId: item.produtoId,
					produtoVarianteId: item.produtoVarianteId ?? null,
					signedQuantity,
					movementType: "AJUSTE",
					reason: input.motivo,
					unitCost: null,
					validateSufficientStock: false,
				});
			}

			itens.push({
				...base,
				status: "APLICADO",
				saldoAnterior: currentQuantity,
				saldoPosterior: currentQuantity + signedQuantity,
				delta: signedQuantity,
				lotesAjustados,
			});
		}

		const aplicados = itens.filter((item) => item.status === "APLICADO").length;
		const semDiferenca = itens.filter((item) => item.status === "SEM_DIFERENCA").length;
		const rastreamentoInativo = itens.filter((item) => item.status === "RASTREAMENTO_INATIVO").length;

		const messageParts = [`${aplicados} ${aplicados === 1 ? "item ajustado" : "itens ajustados"}`];
		if (semDiferenca > 0) messageParts.push(`${semDiferenca} sem diferença`);
		if (rastreamentoInativo > 0) messageParts.push(`${rastreamentoInativo} sem rastreamento ativo`);

		return {
			data: {
				itens,
				resumo: { aplicados, semDiferenca, rastreamentoInativo },
			},
			message: `Recontagem aplicada: ${messageParts.join(", ")}.`,
		};
	});
}
export type TApplyStockRecountOutput = Awaited<ReturnType<typeof applyStockRecount>>;

async function applyStockRecountRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canAdjustInventory(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para recontar o estoque.");
	const input = ApplyStockRecountInputSchema.parse(await request.json());
	const result = await applyStockRecount({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStockRecountRoute });
export const POST = appApiHandler({ POST: applyStockRecountRoute });

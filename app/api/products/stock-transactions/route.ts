import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { applyStockMovement } from "@/lib/stock/apply-stock-movement";
import { consumeStockLotsByFefo } from "@/lib/stock/consume-stock-lots-fefo";
import { getManualStockMovementSignedQuantity, isManualStockInflow } from "@/lib/stock/manual-stock-movements";
import { registerStockLossAccountingEntry, resolveStockLossUnitCost } from "@/lib/stock/stock-loss-accounting";
import { ManualStockMovementTypeEnum, StockMovementOriginEnum, StockMovementTypeEnum } from "@/schemas/enums";
import { db, type DBTransaction } from "@/services/drizzle";
import { productStockLots, productStockTransactions, productVariants, products } from "@/services/drizzle/schema";
import { and, count, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PAGE_SIZE = 50;

const GetProductStockTransactionsInputSchema = z.object({
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
	search: z.string({ invalid_type_error: "Tipo inválido para busca." }).optional().nullable(),
	types: z
		.string({ invalid_type_error: "Tipo inválido para tipo de movimentação." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",") : []))
		.pipe(z.array(StockMovementTypeEnum)),
	origin: z
		.string({ invalid_type_error: "Tipo inválido para origem da movimentação." })
		.optional()
		.nullable()
		.transform((value) => (value ? value : null))
		.pipe(StockMovementOriginEnum.nullable()),
	productId: z.string({ invalid_type_error: "Tipo inválido para ID do produto." }).optional().nullable(),
	productVariantId: z.string({ invalid_type_error: "Tipo inválido para ID da variante." }).optional().nullable(),
	periodAfter: z
		.string({ invalid_type_error: "Tipo inválido para período inicial." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	periodBefore: z
		.string({ invalid_type_error: "Tipo inválido para período final." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
});
export type TGetProductStockTransactionsInput = z.infer<typeof GetProductStockTransactionsInputSchema>;
export type TGetProductStockTransactionsDefaultInput = TGetProductStockTransactionsInput;

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

// A movimentação registra `quantidade` sempre positiva; a direção (entrada/saída) é
// derivada do saldo. Reflete corretamente inclusive AJUSTE, que pode ir para qualquer lado.
function resolveTransactionDirection<
	TTransaction extends { saldoAnterior: number | null; saldoPosterior: number | null; quantidade: number },
>(transaction: TTransaction): "ENTRADA" | "SAIDA" | "NEUTRO" {
	const delta = (transaction.saldoPosterior ?? 0) - (transaction.saldoAnterior ?? 0);
	if (delta > 0) return "ENTRADA";
	if (delta < 0) return "SAIDA";
	return "NEUTRO";
}

function enrichStockTransaction<
	TTransaction extends { saldoAnterior: number | null; saldoPosterior: number | null; quantidade: number },
>(transaction: TTransaction) {
	return {
		...transaction,
		direcao: resolveTransactionDirection(transaction),
	};
}

async function getProductStockTransactions({ input, session }: { input: TGetProductStockTransactionsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const conditions = [eq(productStockTransactions.organizacaoId, organizationId)];
	if (input.productId) conditions.push(eq(productStockTransactions.produtoId, input.productId));
	if (input.productVariantId) conditions.push(eq(productStockTransactions.produtoVarianteId, input.productVariantId));
	if (input.types.length > 0) conditions.push(inArray(productStockTransactions.tipo, input.types));
	if (input.origin) conditions.push(eq(productStockTransactions.origem, input.origin));
	if (input.periodAfter) conditions.push(gte(productStockTransactions.dataInsercao, input.periodAfter));
	if (input.periodBefore) conditions.push(lte(productStockTransactions.dataInsercao, input.periodBefore));
	if (input.search) {
		const term = `%${input.search}%`;
		conditions.push(
			or(
				sql`${productStockTransactions.motivo} ILIKE ${term}`,
				sql`${productStockTransactions.produtoId} IN (SELECT ${products.id} FROM ${products} WHERE ${products.nome} ILIKE ${term} OR ${products.codigo} ILIKE ${term})`,
			)!,
		);
	}

	const [totalResult, resumoResult, transactionsResult] = await Promise.all([
		db
			.select({ total: count(productStockTransactions.id) })
			.from(productStockTransactions)
			.where(and(...conditions)),
		db
			.select({
				totalEntradas: sql<number>`COALESCE(SUM(CASE WHEN COALESCE(${productStockTransactions.saldoPosterior}, 0) > COALESCE(${productStockTransactions.saldoAnterior}, 0) THEN ${productStockTransactions.quantidade} ELSE 0 END), 0)`,
				totalSaidas: sql<number>`COALESCE(SUM(CASE WHEN COALESCE(${productStockTransactions.saldoPosterior}, 0) < COALESCE(${productStockTransactions.saldoAnterior}, 0) THEN ${productStockTransactions.quantidade} ELSE 0 END), 0)`,
			})
			.from(productStockTransactions)
			.where(and(...conditions)),
		db.query.productStockTransactions.findMany({
			where: and(...conditions),
			with: {
				produto: { columns: { id: true, nome: true, codigo: true, unidade: true, imagemCapaUrl: true } },
				produtoVariante: { columns: { id: true, nome: true, codigo: true, imagemCapaUrl: true } },
				venda: { columns: { id: true, idExterno: true, dataVenda: true } },
				compra: { columns: { id: true, titulo: true } },
				producao: { columns: { id: true, titulo: true } },
				lote: { columns: { id: true, codigoLote: true } },
				operador: { columns: { id: true, nome: true, avatarUrl: true } },
			},
			orderBy: (fields, { desc }) => desc(fields.dataInsercao),
			limit: PAGE_SIZE,
			offset: (input.page - 1) * PAGE_SIZE,
		}),
	]);

	const transactionsMatched = Number(totalResult[0]?.total ?? 0);

	return {
		data: {
			default: {
				transactions: transactionsResult.map(enrichStockTransaction),
				transactionsMatched,
				totalPages: Math.max(1, Math.ceil(transactionsMatched / PAGE_SIZE)),
				resumo: {
					totalEntradas: Number(resumoResult[0]?.totalEntradas ?? 0),
					totalSaidas: Number(resumoResult[0]?.totalSaidas ?? 0),
					totalMovimentacoes: transactionsMatched,
				},
			},
		},
		message: "Movimentações de estoque encontradas com sucesso.",
	};
}
export type TGetProductStockTransactionsOutput = Awaited<ReturnType<typeof getProductStockTransactions>>;
export type TGetProductStockTransactionsOutputDefault = TGetProductStockTransactionsOutput["data"]["default"];

async function getProductStockTransactionsRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const searchParams = request.nextUrl.searchParams;
	const input = GetProductStockTransactionsInputSchema.parse({
		page: searchParams.get("page"),
		search: searchParams.get("search"),
		types: searchParams.get("types"),
		origin: searchParams.get("origin"),
		productId: searchParams.get("productId"),
		productVariantId: searchParams.get("productVariantId"),
		periodAfter: searchParams.get("periodAfter"),
		periodBefore: searchParams.get("periodBefore"),
	});
	const result = await getProductStockTransactions({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getProductStockTransactionsRoute });

const CreateStockTransactionsItemInputSchema = z.object({
	productId: z
		.string({ required_error: "ID do produto não informado.", invalid_type_error: "Tipo inválido para ID do produto." })
		.min(1, { message: "ID do produto não informado." }),
	productVariantId: z.string({ invalid_type_error: "Tipo inválido para ID da variante." }).optional().nullable(),
	quantity: z
		.number({ required_error: "Quantidade não informada.", invalid_type_error: "Tipo inválido para quantidade." })
		.positive({ message: "Quantidade deve ser maior que zero." }),
	// Entradas: custo da unidade que entrou, compõe o custo médio. Vazio preserva o custo médio atual.
	unitCost: z
		.number({ invalid_type_error: "Tipo inválido para custo unitário." })
		.min(0, { message: "Custo unitário não pode ser negativo." })
		.optional()
		.nullable(),
	// Saídas: lote específico a baixar. Vazio distribui a baixa entre os lotes por FEFO.
	lotId: z.string({ invalid_type_error: "Tipo inválido para ID do lote." }).optional().nullable(),
	// Entradas: lote a criar para as unidades que entraram.
	newLot: z
		.object({
			code: z.string({ invalid_type_error: "Tipo inválido para código do lote." }).optional().nullable(),
			expirationDate: z
				.string({ invalid_type_error: "Tipo inválido para data de validade do lote." })
				.datetime({ message: "Data de validade do lote inválida." })
				.optional()
				.nullable()
				.transform((value) => (value ? new Date(value) : null)),
		})
		.optional()
		.nullable(),
});

const CreateStockTransactionsInputSchema = z
	.object({
		type: z.enum(ManualStockMovementTypeEnum.options, {
			required_error: "Tipo de movimentação não informado.",
			invalid_type_error: "Tipo de movimentação inválido para lançamento manual.",
		}),
		reason: z
			.string({ required_error: "Motivo da movimentação não informado.", invalid_type_error: "Tipo inválido para motivo da movimentação." })
			.trim()
			.min(1, { message: "Motivo da movimentação não informado." }),
		items: z
			.array(CreateStockTransactionsItemInputSchema, {
				required_error: "Itens da movimentação não informados.",
				invalid_type_error: "Tipo inválido para itens da movimentação.",
			})
			.min(1, { message: "Informe ao menos um item para movimentar." }),
	})
	.superRefine((input, ctx) => {
		const inflow = isManualStockInflow(input.type);
		input.items.forEach((item, index) => {
			if (inflow && item.lotId) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index, "lotId"], message: "Entradas não baixam lote existente." });
			}
			if (!inflow && item.newLot) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items", index, "newLot"], message: "Saídas não criam lote." });
			}
			if (!inflow && item.unitCost != null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["items", index, "unitCost"],
					message: "Saídas usam o custo médio atual; custo unitário não deve ser informado.",
				});
			}
		});
	});
export type TCreateStockTransactionsInput = z.infer<typeof CreateStockTransactionsInputSchema>;

// Trava a linha do produto/variante até o fim da transação: a checagem de saldo e a baixa
// precisam enxergar o mesmo saldo, mesmo com uma venda concorrente.
async function lockStockEntity({
	tx,
	organizationId,
	productId,
	productVariantId,
}: {
	tx: DBTransaction;
	organizationId: string;
	productId: string;
	productVariantId?: string | null;
}) {
	const [product] = await tx
		.select({ nome: products.nome, quantidade: products.quantidade, precoCusto: products.precoCusto, rastreamentoEstoqueAtivo: products.rastreamentoEstoqueAtivo })
		.from(products)
		.where(and(eq(products.id, productId), eq(products.organizacaoId, organizationId)))
		.for("update");
	if (!product) throw new createHttpError.NotFound("Produto não encontrado para movimentação de estoque.");
	if (!productVariantId) {
		return {
			nome: product.nome,
			quantidade: product.quantidade ?? 0,
			precoCusto: product.precoCusto ?? null,
			rastreamentoEstoqueAtivo: !!product.rastreamentoEstoqueAtivo,
		};
	}

	const [variant] = await tx
		.select({
			produtoId: productVariants.produtoId,
			nome: productVariants.nome,
			quantidade: productVariants.quantidade,
			precoCusto: productVariants.precoCusto,
			rastreamentoEstoqueAtivo: productVariants.rastreamentoEstoqueAtivo,
		})
		.from(productVariants)
		.where(and(eq(productVariants.id, productVariantId), eq(productVariants.organizacaoId, organizationId)))
		.for("update");
	if (!variant) throw new createHttpError.NotFound("Variante de produto não encontrada para movimentação de estoque.");
	if (variant.produtoId !== productId) throw new createHttpError.BadRequest("Variante informada não pertence ao produto.");
	return {
		nome: `${product.nome} (${variant.nome})`,
		quantidade: variant.quantidade ?? 0,
		precoCusto: variant.precoCusto ?? null,
		rastreamentoEstoqueAtivo: !!variant.rastreamentoEstoqueAtivo,
	};
}

const QUANTITY_EPSILON = 1e-9;

async function createStockTransactions({ input, session }: { input: TCreateStockTransactionsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	const userId = session.user.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const inflow = isManualStockInflow(input.type);

	return await db.transaction(async (tx) => {
		const items = [];

		for (const item of input.items) {
			const entity = await lockStockEntity({ tx, organizationId, productId: item.productId, productVariantId: item.productVariantId });
			if (!entity.rastreamentoEstoqueAtivo) {
				throw new createHttpError.BadRequest(`"${entity.nome}" não possui rastreamento de estoque ativo.`);
			}

			const signedQuantity = getManualStockMovementSignedQuantity({ type: input.type, quantity: item.quantity });
			const saldoAnterior = entity.quantidade;
			const saldoPosterior = saldoAnterior + signedQuantity;
			// Lançamento manual nunca leva o saldo a negativo: se o saldo do app está abaixo do real,
			// o caminho é a recontagem, não uma saída que esconde a divergência.
			if (saldoPosterior < -QUANTITY_EPSILON) {
				throw new createHttpError.BadRequest(
					`Saldo insuficiente para "${entity.nome}": disponível ${saldoAnterior}, informado ${item.quantity}.`,
				);
			}

			const base = { produtoId: item.productId, produtoVarianteId: item.productVariantId ?? null, saldoAnterior, saldoPosterior };

			if (inflow) {
				let loteId: string | null = null;
				if (item.newLot && (item.newLot.code?.trim() || item.newLot.expirationDate)) {
					const [lot] = await tx
						.insert(productStockLots)
						.values({
							organizacaoId: organizationId,
							produtoId: item.productId,
							produtoVarianteId: item.productVariantId ?? null,
							codigoLote: item.newLot.code?.trim() || null,
							dataValidade: item.newLot.expirationDate ?? null,
							quantidadeInicial: item.quantity,
							quantidadeAtual: item.quantity,
							status: "ATIVO",
						})
						.returning({ id: productStockLots.id });
					loteId = lot?.id ?? null;
					if (!loteId) throw new createHttpError.InternalServerError("Erro ao criar lote da movimentação.");
				}

				await applyStockMovement({
					trx: tx,
					organizationId,
					userId,
					produtoId: item.productId,
					produtoVarianteId: item.productVariantId ?? null,
					signedQuantity,
					movementType: input.type,
					reason: input.reason,
					unitCost: item.unitCost ?? null,
					links: { loteId },
					origin: "MANUAL",
				});

				items.push({ ...base, lotesAfetados: loteId ? 1 : 0, perda: null });
				continue;
			}

			const lot = item.lotId
				? await tx.query.productStockLots.findFirst({
						where: (fields, { and, eq }) => and(eq(fields.id, item.lotId ?? ""), eq(fields.organizacaoId, organizationId)),
					})
				: null;
			if (item.lotId) {
				if (!lot) throw new createHttpError.NotFound("Lote não encontrado.");
				if (lot.produtoId !== item.productId || (lot.produtoVarianteId ?? null) !== (item.productVariantId ?? null)) {
					throw new createHttpError.BadRequest("Lote informado não pertence ao produto da movimentação.");
				}
				if (lot.status === "DESCARTADO" || lot.status === "ESGOTADO" || lot.quantidadeAtual <= 0) {
					throw new createHttpError.BadRequest("Lote informado não possui saldo disponível.");
				}
				if (item.quantity > lot.quantidadeAtual + QUANTITY_EPSILON) {
					throw new createHttpError.BadRequest(`Quantidade maior que o saldo do lote (${lot.quantidadeAtual}).`);
				}
			}

			// Saídas registram o custo médio atual como custo movimentado (valoram a saída sem alterar
			// a média). Descarte segue a mesma valoração do descarte de lote, que também cai no custo
			// de origem do lote quando o produto nunca teve custo.
			const unitCost =
				input.type === "DESCARTE"
					? await resolveStockLossUnitCost({
							trx: tx,
							organizationId,
							produtoId: item.productId,
							produtoVarianteId: item.productVariantId ?? null,
							compraItemId: lot?.compraItemId ?? null,
						})
					: entity.precoCusto;

			let lotesAfetados = 0;
			if (lot) {
				await applyStockMovement({
					trx: tx,
					organizationId,
					userId,
					produtoId: item.productId,
					produtoVarianteId: item.productVariantId ?? null,
					signedQuantity,
					movementType: input.type,
					reason: input.reason,
					unitCost,
					links: { loteId: lot.id, producaoId: lot.producaoId },
					validateSufficientStock: true,
					origin: "MANUAL",
				});
				const nextLotQuantity = Math.max(0, lot.quantidadeAtual - item.quantity);
				await tx
					.update(productStockLots)
					.set({
						quantidadeAtual: nextLotQuantity,
						status: nextLotQuantity <= QUANTITY_EPSILON ? (input.type === "DESCARTE" ? "DESCARTADO" : "ESGOTADO") : lot.status,
					})
					.where(and(eq(productStockLots.id, lot.id), eq(productStockLots.organizacaoId, organizationId)));
				lotesAfetados = 1;
			} else {
				// Sem lote escolhido: a baixa percorre os lotes ativos por FEFO, para o sub-razão de lotes
				// continuar somando o saldo. O que os lotes não cobrirem sai do saldo sem vínculo de lote.
				const consumedLots = await consumeStockLotsByFefo({
					trx: tx,
					organizationId,
					userId,
					produtoId: item.productId,
					produtoVarianteId: item.productVariantId ?? null,
					quantidade: item.quantity,
					reason: input.reason,
					movementType: input.type,
					unitCost,
					allowPartial: true,
					origin: "MANUAL",
				});
				lotesAfetados = consumedLots.length;
				const consumedTotal = consumedLots.reduce((total, consumed) => total + consumed.quantidadeConsumida, 0);
				const remainder = item.quantity - consumedTotal;
				if (remainder > QUANTITY_EPSILON) {
					await applyStockMovement({
						trx: tx,
						organizationId,
						userId,
						produtoId: item.productId,
						produtoVarianteId: item.productVariantId ?? null,
						signedQuantity: -remainder,
						movementType: input.type,
						reason: input.reason,
						unitCost,
						validateSufficientStock: true,
						origin: "MANUAL",
					});
				}
			}

			const perda =
				input.type === "DESCARTE"
					? await registerStockLossAccountingEntry({
							trx: tx,
							organizationId,
							userId,
							unitCost,
							quantity: item.quantity,
							title: `DESCARTE ${entity.nome}`.toUpperCase(),
							notes: input.reason,
							loteId: lot?.id ?? null,
						})
					: null;

			items.push({ ...base, lotesAfetados, perda });
		}

		const lossEntries = items.filter((item) => item.perda?.lancamentoContabilId).length;
		const baseMessage =
			items.length === 1 ? "Movimentação de estoque registrada com sucesso." : `${items.length} movimentações de estoque registradas com sucesso.`;

		return {
			data: { items },
			message: lossEntries > 0 ? `${baseMessage} Lançamento contábil de perda gerado.` : baseMessage,
		};
	});
}
export type TCreateStockTransactionsOutput = Awaited<ReturnType<typeof createStockTransactions>>;

async function createStockTransactionsRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const input = CreateStockTransactionsInputSchema.parse(await request.json());
	const result = await createStockTransactions({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: createStockTransactionsRoute });

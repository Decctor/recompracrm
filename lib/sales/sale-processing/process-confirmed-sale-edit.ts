import { resyncSaleCashbackAccumulation } from "@/lib/cashback/resync-sale-accumulation";
import { type TCouponCartItem, evaluateCouponAgainstCart } from "@/lib/coupons/engine";
import { cancelCouponRedemption } from "@/lib/coupons/redemption";
import { ACCOUNTING_ENTRY_BALANCE_TOLERANCE, getAccountingEntryBalanceError } from "@/lib/finances/accounting-entry-balance";
import { type TPaymentSplit, getPaymentProvider } from "@/lib/payments";
import { validateSalesSessionSeller } from "@/lib/sales-sessions";
import { getSaleChangeTotal } from "@/lib/sales/sale-change";
import { resolveSaleEditability } from "@/lib/sales/sale-editability";
import { consumeSaleDiscountApproval } from "@/lib/sales/sale-discount-authorization";
import { toSalesChannelType } from "@/lib/products/sales-channels";
import { SALE_PRICING_CENT_TOLERANCE, saleValuesDiverge, validateSaleItemsPricing } from "@/lib/sales/sale-pricing-validation";
import { POS_REWARD_SALE_ITEM_ORIGIN } from "@/lib/sales/sale-reward-redemption";
import { readShopDeliveryFee } from "@/lib/shop/config";
import type { TDeliveryModeEnum } from "@/schemas/enums";
import type { DBTransaction } from "@/services/drizzle";
import {
	accountingEntries,
	couponRedemptions,
	financialTransactions,
	saleItemModifiers,
	saleItems,
	sales,
	salesSessions,
} from "@/services/drizzle/schema";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { and, eq, isNull, ne, notInArray, or } from "drizzle-orm";
import createHttpError from "http-errors";
import { processSaleAutomaticFiscalEmissionIfEligible } from "./process-sale-automatic-fiscal-emission";
import { processStockDeduction } from "./process-stock-deduction";
import { registerSaleChangeTransaction } from "./register-sale-change";
import { reverseSaleItemStock } from "./reverse-sale-item-stock";

/**
 * Edição de venda CONFIRMADA com side-effects sincronizados na mesma transação.
 *
 * O contrato de consistência: a cada edição, o lançamento contábil VENDA é atualizado EM PLACE
 * (`valor` = novo total), as transações financeiras pendentes são regeneradas a partir dos novos
 * splits (as efetivadas nunca são tocadas) e o balanço lançamento↔transações é validado antes do
 * commit — qualquer divergência aborta tudo. Estoque já baixado é ressincronizado por movimentos
 * compensatórios no grão do item. Documento fiscal vivo bloqueia a edição na política
 * (`resolveSaleEditability`), re-checada aqui dentro da transação sob lock.
 */

const DELIVERED_ATTENDANCE_STATUSES = new Set(["ENTREGUE", "PARCIALMENTE_ENTREGUE"]);
const REVERSED_TRANSACTION_STATUSES = ["CANCELADO", "ESTORNADO"];

export type TEditSaleItemModifierInput = {
	opcaoId: string;
	nome: string;
	quantidade: number;
	valorUnitario: number;
	valorTotal: number;
};

export type TEditSaleItemInput = {
	id?: string | null;
	deletar?: boolean;
	produtoId: string;
	produtoVarianteId?: string | null;
	nome: string;
	codigo: string;
	imagemUrl?: string | null;
	quantidade: number;
	valorUnitarioBase: number;
	valorModificadores: number;
	valorUnitarioFinal: number;
	valorTotalBruto: number;
	valorDesconto: number;
	valorTotalLiquido: number;
	modificadores: TEditSaleItemModifierInput[];
	observacoes?: string | null;
};

export type TProcessConfirmedSaleEditInput = {
	organization: TOrganizationEntity;
	saleId: string;
	saleAuthorId: string;
	itens: TEditSaleItemInput[];
	descontosTotal?: number | null;
	acrescimosTotal?: number | null;
	taxaEntrega?: number;
	observacoes?: string | null;
	vendedorId?: string | null;
	vendedorNome?: string | null;
	entregaModalidade?: TDeliveryModeEnum | null;
	entregaLocalizacaoId?: string | null;
	comandaNumero?: string | null;
	// Splits novos APENAS para o restante não efetivado — o já recebido permanece intacto.
	pagamentos: TPaymentSplit[];
	// Já resolvido pela rota via resolveSaleFiscalEmissionOverride (null = herda a organização).
	emissaoFiscalAutomatica: boolean | null;
	// Consentimento explícito para derrubar um cupom invalidado pelo carrinho editado.
	removerCupom?: boolean;
	// Aprovação de desconto já autorizada pela rota; consumida one-shot nesta transação.
	descontoAprovacaoId?: string | null;
	// Token de concorrência otimista: o total que o cliente viu ao carregar a edição.
	valorTotalEsperado: number;
	sessaoVendaId?: string | null;
};

function isRewardSaleItem(metadados: unknown): boolean {
	if (!metadados || typeof metadados !== "object" || Array.isArray(metadados)) return false;
	return (metadados as { origem?: unknown }).origem === POS_REWARD_SALE_ITEM_ORIGIN;
}

function modifierIdentityKey(modifiers: { opcaoId: string | null; quantidade: number }[]) {
	return modifiers
		.map((modifier) => `${modifier.opcaoId ?? ""}:${modifier.quantidade}`)
		.sort()
		.join("|");
}

function assertItemInternalConsistency(item: TEditSaleItemInput) {
	for (const modifier of item.modificadores) {
		if (saleValuesDiverge(modifier.valorTotal, modifier.valorUnitario * modifier.quantidade)) {
			throw new createHttpError.BadRequest(`Os valores dos modificadores do item "${item.nome}" não conferem. Atualize o carrinho.`);
		}
	}
	const valorModificadores = item.modificadores.reduce((sum, modifier) => sum + modifier.valorTotal, 0);
	if (
		saleValuesDiverge(item.valorModificadores, valorModificadores) ||
		saleValuesDiverge(item.valorUnitarioFinal, item.valorUnitarioBase + valorModificadores) ||
		saleValuesDiverge(item.valorTotalBruto, item.valorUnitarioFinal * item.quantidade)
	) {
		throw new createHttpError.BadRequest(`Os valores do item "${item.nome}" não conferem. Atualize o carrinho.`);
	}
	if (item.valorDesconto < -SALE_PRICING_CENT_TOLERANCE) {
		throw new createHttpError.BadRequest(`O desconto do item "${item.nome}" não pode ser negativo.`);
	}
	if (item.valorDesconto > item.valorTotalBruto + SALE_PRICING_CENT_TOLERANCE) {
		throw new createHttpError.BadRequest(`O desconto do item "${item.nome}" não pode superar o valor bruto do item.`);
	}
	if (saleValuesDiverge(item.valorTotalLiquido, item.valorTotalBruto - item.valorDesconto)) {
		throw new createHttpError.BadRequest(`O valor líquido do item "${item.nome}" não confere com o bruto menos o desconto. Atualize o carrinho.`);
	}
}

function buildItemMetadataSnapshot(item: TEditSaleItemInput) {
	return {
		nome: item.nome,
		codigo: item.codigo,
		imagemUrl: item.imagemUrl ?? null,
		produtoId: item.produtoId,
		produtoVarianteId: item.produtoVarianteId ?? null,
		valorUnitarioBase: item.valorUnitarioBase,
		valorModificadores: item.valorModificadores,
		modificadores: item.modificadores.map((modifier) => ({
			opcaoId: modifier.opcaoId,
			nome: modifier.nome,
			quantidade: modifier.quantidade,
			valorUnitario: modifier.valorUnitario,
			valorTotal: modifier.valorTotal,
		})),
	};
}

export async function processConfirmedSaleEditInTransaction({ tx, input }: { tx: DBTransaction; input: TProcessConfirmedSaleEditInput }) {
	const organizationId = input.organization.id;

	// Lock da linha da venda: serializa contra transições de atendimento e edições concorrentes —
	// ambas escrevem em `sales` e enfileiram atrás deste lock até o commit.
	await tx
		.select({ id: sales.id })
		.from(sales)
		.where(and(eq(sales.id, input.saleId), eq(sales.organizacaoId, organizationId)))
		.for("update");

	const sale = await tx.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.saleId), eq(fields.organizacaoId, organizationId)),
		with: {
			itens: { with: { adicionais: true } },
			documentosFiscais: { columns: { id: true, statusInterno: true } },
			lancamentosContabeis: {
				columns: { id: true, origemTipo: true, valor: true, titulo: true },
				with: { transacoesFinanceiras: true },
			},
		},
	});
	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");

	// Re-checagem autoritativa da política DENTRO da transação: a editabilidade vista pelo cliente
	// pode ter mudado (nota emitida, entrega concluída, cancelamento) entre o GET e o PUT.
	if (input.sessaoVendaId) {
		const [lockedSession] = await tx
			.select({ status: salesSessions.status, politica: salesSessions.politica, vendedorPadraoId: salesSessions.vendedorPadraoId })
			.from(salesSessions)
			.where(and(eq(salesSessions.id, input.sessaoVendaId), eq(salesSessions.organizacaoId, organizationId)))
			.for("update");
		if (!lockedSession || lockedSession.status !== "ABERTA")
			throw new createHttpError.Conflict("A sessao de venda foi fechada. Selecione outro caixa e tente novamente.");
		validateSalesSessionSeller({ session: lockedSession, vendedorId: input.vendedorId });
	}

	const saleTransactions = sale.lancamentosContabeis.flatMap((entry) => entry.transacoesFinanceiras);
	const editability = resolveSaleEditability({
		statusVenda: sale.statusVenda,
		statusAtendimento: sale.statusAtendimento,
		processamentoOrigem: sale.processamentoOrigem,
		tabId: sale.tabId,
		valorTotal: sale.valorTotal,
		documentosFiscais: sale.documentosFiscais,
		transacoes: saleTransactions,
	});
	if (editability.nivel !== "TOTAL") {
		throw new createHttpError.BadRequest(editability.motivos[0] ?? "Esta venda não pode mais ser editada.");
	}
	if (Math.abs(sale.valorTotal - input.valorTotalEsperado) > 0.001) {
		throw new createHttpError.Conflict("A venda foi alterada por outra operação. Recarregue os dados e tente novamente.");
	}

	const existingItemsById = new Map(sale.itens.map((item) => [item.id, item]));

	// Itens de recompensa resgatada são imutáveis e ficam FORA do recompute pelo payload: todos os
	// seus valores vêm das linhas persistidas. Assim o cliente não altera os totais nem omitindo a
	// linha (custo/desconto sumiriam) nem adulterando-a (o líquido enviado seria somado na base).
	const rewardItems = sale.itens.filter((item) => isRewardSaleItem(item.metadados));
	const rewardItemIds = new Set(rewardItems.map((item) => item.id));
	const rewardValorBase = rewardItems.reduce((sum, item) => sum + item.valorVendaTotalLiquido, 0);
	const rewardDescontoTotal = rewardItems.reduce((sum, item) => sum + item.valorTotalDesconto, 0);
	const rewardCustoTotal = rewardItems.reduce((sum, item) => sum + item.valorCustoTotal, 0);

	const activeItems = input.itens.filter((item) => !item.deletar && !(item.id && rewardItemIds.has(item.id)));
	if (activeItems.length === 0 && rewardItems.length === 0) {
		throw new createHttpError.BadRequest("A venda precisa de pelo menos um item. Para remover tudo, cancele a venda.");
	}

	const itemsForCatalogValidation: TEditSaleItemInput[] = [];
	for (const item of input.itens) {
		if (item.id && !existingItemsById.has(item.id)) {
			throw new createHttpError.BadRequest("Um dos itens enviados não pertence a esta venda. Recarregue os dados e tente novamente.");
		}
		// Item de recompensa é imutável na edição, como cupom e resgate de cashback: alterar
		// quantidade/valores ou removê-lo desfaria um débito de saldo já registrado no ledger.
		const existingReward = item.id ? existingItemsById.get(item.id) : null;
		if (existingReward && isRewardSaleItem(existingReward.metadados)) {
			if (item.deletar) {
				throw new createHttpError.BadRequest("A recompensa resgatada não pode ser removida pela edição. Para desfazer o resgate, cancele a venda.");
			}
			if (
				item.quantidade !== existingReward.quantidade ||
				saleValuesDiverge(item.valorTotalBruto, existingReward.valorVendaTotalBruto) ||
				saleValuesDiverge(item.valorDesconto, existingReward.valorTotalDesconto) ||
				saleValuesDiverge(item.valorTotalLiquido, existingReward.valorVendaTotalLiquido)
			) {
				throw new createHttpError.BadRequest("A recompensa resgatada não pode ser alterada pela edição.");
			}
			continue;
		}
		if (item.deletar) {
			if (!item.id) throw new createHttpError.BadRequest("Item novo não pode ser marcado para remoção.");
			continue;
		}

		assertItemInternalConsistency(item);

		const existing = item.id ? existingItemsById.get(item.id) : null;
		if (!existing) {
			// Item novo: valores validados contra o catálogo atual.
			itemsForCatalogValidation.push(item);
			continue;
		}

		if ((existing.quantidadeEntregue ?? 0) > 0) {
			const identityChanged =
				existing.produtoId !== item.produtoId ||
				(existing.produtoVarianteId ?? null) !== (item.produtoVarianteId ?? null) ||
				modifierIdentityKey(existing.adicionais) !== modifierIdentityKey(item.modificadores);
			if (identityChanged) {
				throw new createHttpError.BadRequest(
					`O item "${item.nome}" já foi entregue: ajuste apenas a quantidade e o desconto, ou remova-o e adicione o item correto.`,
				);
			}
		}

		// Item existente mantém o preço pelo qual foi vendido; se o operador reprecificou, o novo
		// preço precisa bater com o catálogo atual (mesma régua da criação).
		const snapshot =
			existing.metadados && typeof existing.metadados === "object" && !Array.isArray(existing.metadados)
				? (existing.metadados as { valorUnitarioBase?: number; valorModificadores?: number })
				: null;
		const previousUnitBase = snapshot?.valorUnitarioBase ?? existing.valorVendaUnitario;
		const previousModifiersValue = snapshot?.valorModificadores ?? 0;
		if (saleValuesDiverge(item.valorUnitarioBase, previousUnitBase) || saleValuesDiverge(item.valorModificadores, previousModifiersValue)) {
			itemsForCatalogValidation.push(item);
		}
	}
	if (itemsForCatalogValidation.length > 0) {
		// Só itens novos/reprecificados chegam aqui — itens intactos mantêm o preço pelo qual foram
		// vendidos, então o gate do canal não rejeita vendas antigas de produto que saiu do canal.
		await validateSaleItemsPricing({ orgId: organizationId, itens: itemsForCatalogValidation, canal: toSalesChannelType(sale.canal) });
	}

	// ------------------------------------------------------------------
	// Cupom: reavaliação contra o carrinho editado (AUTOMATICA) ou teto pelo bruto novo (MANUAL).
	// ------------------------------------------------------------------
	const couponRedemption = await tx.query.couponRedemptions.findFirst({
		where: and(
			eq(couponRedemptions.organizacaoId, organizationId),
			eq(couponRedemptions.vendaId, input.saleId),
			eq(couponRedemptions.status, "UTILIZADO"),
		),
	});
	let cupomDesconto = 0;
	let cupomRemovido = false;
	if (couponRedemption) {
		if (input.removerCupom) {
			await cancelCouponRedemption({ trx: tx, organizacaoId: organizationId, redemptionId: couponRedemption.id });
			cupomRemovido = true;
		} else {
			const coupon = await tx.query.coupons.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.id, couponRedemption.cupomId), eq(fields.organizacaoId, organizationId)),
				with: { alvos: true },
			});

			if (coupon?.validacaoModo === "AUTOMATICA") {
				const productIds = [...new Set(activeItems.map((item) => item.produtoId))];
				const productsResult =
					productIds.length > 0
						? await tx.query.products.findMany({
								where: (fields, { inArray }) => inArray(fields.id, productIds),
								columns: { id: true, grupo: true },
							})
						: [];
				const productGroupById = new Map(productsResult.map((product) => [product.id, product.grupo]));
				const cartItems: TCouponCartItem[] = activeItems.map((item, index) => ({
					chave: item.id ?? `novo-${index}`,
					produtoId: item.produtoId,
					produtoVarianteId: item.produtoVarianteId ?? null,
					grupo: productGroupById.get(item.produtoId) ?? null,
					quantidade: item.quantidade,
					valorVendaUnitario: item.valorUnitarioFinal,
				}));
				const evaluation = evaluateCouponAgainstCart({ coupon, targets: coupon.alvos, cartItems });
				if (!evaluation.elegivel) {
					throw new createHttpError.BadRequest(
						`O cupom aplicado não é mais elegível para o carrinho editado (${evaluation.motivo}). Remova o cupom para salvar.`,
					);
				}
				if (Math.abs(evaluation.valorDesconto - couponRedemption.valorDesconto) > SALE_PRICING_CENT_TOLERANCE) {
					throw new createHttpError.BadRequest(
						"O desconto do cupom muda com o carrinho editado e não pode ser recalculado na edição. Remova o cupom para salvar.",
					);
				}
				cupomDesconto = couponRedemption.valorDesconto;
			} else {
				// MANUAL (ou cupom removido do catálogo): mantém o valor resgatado, limitado ao bruto novo.
				const grossItemsTotal = activeItems.reduce((sum, item) => sum + item.valorTotalBruto, 0);
				if (couponRedemption.valorDesconto > grossItemsTotal + SALE_PRICING_CENT_TOLERANCE) {
					throw new createHttpError.BadRequest("O desconto do cupom aplicado supera o valor bruto do carrinho editado. Remova o cupom para salvar.");
				}
				cupomDesconto = couponRedemption.valorDesconto;
			}
		}
	}

	// Resgate de cashback é imutável na edição (v1): entra como componente fixo do desconto e o
	// novo total precisa continuar comportando-o. A válvula para desfazê-lo é o cancelamento.
	// SOMENTE resgates-desconto: o RESGATE de recompensa está em moeda cashback (pontos ou R$) e
	// não é um desconto em dinheiro — o desconto comercial do prêmio já vive no item (líquido 0).
	const activeRedemptions = await tx.query.cashbackProgramTransactions.findMany({
		where: (fields, { and, eq, isNull }) =>
			and(
				eq(fields.organizacaoId, organizationId),
				eq(fields.vendaId, input.saleId),
				eq(fields.tipo, "RESGATE"),
				eq(fields.status, "ATIVO"),
				isNull(fields.resgateRecompensaId),
			),
		columns: { valor: true },
	});
	const cashbackResgate = activeRedemptions.reduce((sum, transaction) => sum + Math.abs(transaction.valor), 0);

	// ------------------------------------------------------------------
	// Recompute do dinheiro da venda (mesmas fórmulas da criação).
	// ------------------------------------------------------------------
	const valorBaseItens = activeItems.reduce((sum, item) => sum + item.valorTotalLiquido, 0) + rewardValorBase;
	const descontosGerais = input.descontosTotal ?? 0;
	const acrescimosGerais = input.acrescimosTotal ?? 0;
	const descontosVenda = descontosGerais + cupomDesconto + cashbackResgate;
	const valorAntesCupom = Math.max(0, valorBaseItens - descontosGerais);
	if (cupomDesconto > valorAntesCupom) {
		throw new createHttpError.BadRequest("O desconto do cupom não pode superar o valor da venda.");
	}
	const valorAntesCashback = Math.max(0, valorAntesCupom - cupomDesconto);
	if (cashbackResgate > valorAntesCashback + SALE_PRICING_CENT_TOLERANCE) {
		throw new createHttpError.BadRequest(
			"O novo total não comporta o resgate de cashback aplicado na venda. Para desfazer o resgate, cancele a venda.",
		);
	}
	const valorTotal = Math.max(0, valorBaseItens - descontosVenda) + acrescimosGerais;
	if (valorTotal < editability.valorMinimoEdicao - ACCOUNTING_ENTRY_BALANCE_TOLERANCE) {
		throw new createHttpError.BadRequest(
			`O novo total (R$ ${valorTotal.toFixed(2)}) é menor que o valor já recebido (R$ ${editability.valorMinimoEdicao.toFixed(2)}). Para estornar recebimentos, cancele a venda.`,
		);
	}
	const descontosTotalItens = activeItems.reduce((sum, item) => sum + item.valorDesconto, 0);
	const descontosTotalPersistido = (descontosVenda > 0 ? descontosVenda : descontosTotalItens) + rewardDescontoTotal;

	// Custos atuais do catálogo, como na criação.
	const activeProductIds = [...new Set(activeItems.map((item) => item.produtoId))];
	const activeVariantIds = activeItems.map((item) => item.produtoVarianteId).filter((id): id is string => !!id);
	const [produtosResult, variantesResult] = await Promise.all([
		activeProductIds.length > 0
			? tx.query.products.findMany({
					where: (fields, { inArray }) => inArray(fields.id, activeProductIds),
					columns: { id: true, precoCusto: true },
				})
			: [],
		activeVariantIds.length > 0
			? tx.query.productVariants.findMany({
					where: (fields, { inArray }) => inArray(fields.id, activeVariantIds),
					columns: { id: true, precoCusto: true },
				})
			: [],
	]);
	const productCostMap = new Map(produtosResult.map((product) => [product.id, product.precoCusto ?? 0]));
	const variantCostMap = new Map(variantesResult.map((variant) => [variant.id, variant.precoCusto ?? 0]));
	const resolveUnitCost = (item: TEditSaleItemInput) =>
		item.produtoVarianteId ? (variantCostMap.get(item.produtoVarianteId) ?? 0) : (productCostMap.get(item.produtoId) ?? 0);
	const custoTotal = activeItems.reduce((sum, item) => sum + resolveUnitCost(item) * item.quantidade, 0) + rewardCustoTotal;

	// One-shot: a aprovação de desconto (autorizada na rota) é consumida nesta transação.
	if (input.descontoAprovacaoId) {
		await consumeSaleDiscountApproval({ tx, aprovacaoId: input.descontoAprovacaoId, vendaId: input.saleId });
	}

	// ------------------------------------------------------------------
	// Diff de itens: remoções (com estorno de estoque), atualizações e inserções.
	// ------------------------------------------------------------------
	let itensRemovidos = 0;
	let itensAtualizados = 0;
	let itensInseridos = 0;

	for (const item of input.itens.filter((entry) => entry.deletar && entry.id)) {
		const existing = existingItemsById.get(item.id as string);
		if (!existing) continue;
		if ((existing.quantidadeEntregue ?? 0) > 0) {
			await reverseSaleItemStock({
				tx,
				organizationId,
				saleId: input.saleId,
				saleItemId: existing.id,
				authorId: input.saleAuthorId,
				reason: "Edição de venda: item removido",
			});
		}
		await tx.delete(saleItems).where(and(eq(saleItems.id, existing.id), eq(saleItems.organizacaoId, organizationId)));
		itensRemovidos += 1;
	}

	for (const item of activeItems) {
		const valorCustoUnitario = resolveUnitCost(item);

		if (item.id) {
			const existing = existingItemsById.get(item.id);
			if (!existing) continue;

			await tx
				.update(saleItems)
				.set({
					produtoId: item.produtoId,
					produtoVarianteId: item.produtoVarianteId ?? null,
					quantidade: item.quantidade,
					valorVendaUnitario: item.valorUnitarioFinal,
					valorCustoUnitario,
					valorVendaTotalBruto: item.valorTotalBruto,
					valorTotalDesconto: item.valorDesconto,
					valorVendaTotalLiquido: item.valorTotalLiquido,
					valorCustoTotal: valorCustoUnitario * item.quantidade,
					observacoes: item.observacoes ?? null,
					metadados: buildItemMetadataSnapshot(item),
				})
				.where(and(eq(saleItems.id, existing.id), eq(saleItems.organizacaoId, organizationId)));

			await tx.delete(saleItemModifiers).where(eq(saleItemModifiers.itemVendaId, existing.id));
			if (item.modificadores.length > 0) {
				await tx.insert(saleItemModifiers).values(
					item.modificadores.map((modifier) => ({
						itemVendaId: existing.id,
						opcaoId: modifier.opcaoId,
						nome: modifier.nome,
						quantidade: modifier.quantidade,
						valorUnitario: modifier.valorUnitario,
						valorTotal: modifier.valorTotal,
					})),
				);
			}

			// Redução abaixo do já entregue: devolve a diferença ao estoque (e ajusta o dedup).
			const deliveredQuantity = existing.quantidadeEntregue ?? 0;
			if (deliveredQuantity > item.quantidade) {
				await reverseSaleItemStock({
					tx,
					organizationId,
					saleId: input.saleId,
					saleItemId: existing.id,
					authorId: input.saleAuthorId,
					reason: "Edição de venda: quantidade reduzida",
					quantity: deliveredQuantity - item.quantidade,
				});
			}

			itensAtualizados += 1;
			continue;
		}

		const insertedItem = await tx
			.insert(saleItems)
			.values({
				organizacaoId: organizationId,
				vendaId: input.saleId,
				clienteId: sale.clienteId ?? null,
				produtoId: item.produtoId,
				produtoVarianteId: item.produtoVarianteId ?? null,
				quantidade: item.quantidade,
				valorVendaUnitario: item.valorUnitarioFinal,
				valorCustoUnitario,
				valorVendaTotalBruto: item.valorTotalBruto,
				valorTotalDesconto: item.valorDesconto,
				valorVendaTotalLiquido: item.valorTotalLiquido,
				valorCustoTotal: valorCustoUnitario * item.quantidade,
				observacoes: item.observacoes ?? null,
				metadados: buildItemMetadataSnapshot(item),
			})
			.returning({ id: saleItems.id });

		const newItemId = insertedItem[0]?.id;
		if (!newItemId) throw new createHttpError.InternalServerError("Erro ao inserir item na venda.");

		if (item.modificadores.length > 0) {
			await tx.insert(saleItemModifiers).values(
				item.modificadores.map((modifier) => ({
					itemVendaId: newItemId,
					opcaoId: modifier.opcaoId,
					nome: modifier.nome,
					quantidade: modifier.quantidade,
					valorUnitario: modifier.valorUnitario,
					valorTotal: modifier.valorTotal,
				})),
			);
		}
		itensInseridos += 1;
	}

	// Venda já entregue: aumentos e itens novos baixam AGORA, pelo mesmo ponto único de baixa
	// (o delta por item deduz exatamente o crescimento; estoque insuficiente aborta a transação).
	if (DELIVERED_ATTENDANCE_STATUSES.has(sale.statusAtendimento) && input.organization.configuracao.preferencias.rastreamentoEstoque) {
		const freshItems = await tx.query.saleItems.findMany({
			where: (fields, { and, eq }) => and(eq(fields.vendaId, input.saleId), eq(fields.organizacaoId, organizationId)),
			with: { adicionais: { columns: { id: true, opcaoId: true, quantidade: true } } },
		});
		await processStockDeduction(tx, {
			organizationId,
			saleId: input.saleId,
			saleItems: freshItems,
			saleAuthorId: input.saleAuthorId,
			reason: "Edição de venda",
		});
	}

	// Acúmulo de cashback: ajusta em place quando intocado; caso contrário registra desatualização.
	const cashbackAccumulationResync =
		sale.clienteId != null
			? await resyncSaleCashbackAccumulation({
					tx,
					organizationId,
					saleId: input.saleId,
					newSaleValue: valorTotal,
					reason: "Edição de venda",
				})
			: { ajustados: 0, desatualizados: 0 };

	// ------------------------------------------------------------------
	// Venda: dinheiro + cabeçalho + log de edição em rascunhoMetadados.edicoes[].
	// ------------------------------------------------------------------
	const previousDraftMetadata =
		sale.rascunhoMetadados && typeof sale.rascunhoMetadados === "object" && !Array.isArray(sale.rascunhoMetadados)
			? (sale.rascunhoMetadados as Record<string, unknown>)
			: {};
	const previousEditions = Array.isArray(previousDraftMetadata.edicoes) ? previousDraftMetadata.edicoes : [];
	const previousShopMetadata =
		previousDraftMetadata.shop && typeof previousDraftMetadata.shop === "object" && !Array.isArray(previousDraftMetadata.shop)
			? (previousDraftMetadata.shop as Record<string, unknown>)
			: null;
	const previousShopDelivery =
		previousShopMetadata?.entrega && typeof previousShopMetadata.entrega === "object" && !Array.isArray(previousShopMetadata.entrega)
			? (previousShopMetadata.entrega as Record<string, unknown>)
			: null;
	const resolvedDeliveryMode = input.entregaModalidade ?? sale.entregaModalidade;
	const previousDeliveryFee =
		typeof previousDraftMetadata.taxaEntrega === "number" ? previousDraftMetadata.taxaEntrega : readShopDeliveryFee(sale.rascunhoMetadados);
	const deliveryFee = resolvedDeliveryMode === "ENTREGA" ? Math.min(input.taxaEntrega ?? previousDeliveryFee, input.acrescimosTotal ?? 0) : 0;
	const editionLogEntry = {
		data: new Date().toISOString(),
		autorId: input.saleAuthorId,
		valorAnterior: sale.valorTotal,
		valorNovo: valorTotal,
		itensInseridos,
		itensAtualizados,
		itensRemovidos,
		cupomRemovido,
		cashbackAcumuloDesatualizado: cashbackAccumulationResync.desatualizados > 0,
	};

	await tx
		.update(sales)
		.set({
			valorTotal,
			// Mesma fórmula da criação: descontos da venda (ou dos itens) + desconto comercial das
			// recompensas resgatadas, que a confirmação já havia somado.
			descontosTotal: descontosTotalPersistido > 0 ? descontosTotalPersistido : null,
			acrescimosTotal: input.acrescimosTotal ?? null,
			custoTotal,
			vendedorId: input.vendedorId ?? sale.vendedorId,
			vendedorNome: input.vendedorNome ?? sale.vendedorNome,
			entregaModalidade: input.entregaModalidade ?? sale.entregaModalidade,
			entregaLocalizacaoId: input.entregaModalidade === "ENTREGA" ? (input.entregaLocalizacaoId ?? sale.entregaLocalizacaoId) : null,
			comandaNumero: input.entregaModalidade === "COMANDA" ? (input.comandaNumero ?? sale.comandaNumero) : null,
			observacoes: input.observacoes ?? sale.observacoes,
			emissaoFiscalAutomatica: input.emissaoFiscalAutomatica,
			rascunhoMetadados: {
				...previousDraftMetadata,
				descontoGeral: descontosGerais,
				taxaEntrega: deliveryFee,
				...(previousShopMetadata
					? {
							shop: {
								...previousShopMetadata,
								entrega: {
									...previousShopDelivery,
									modalidade: resolvedDeliveryMode,
									taxa: deliveryFee,
								},
							},
						}
					: {}),
				cupom: cupomRemovido ? null : (previousDraftMetadata.cupom ?? null),
				edicoes: [...previousEditions, editionLogEntry],
			},
		})
		.where(and(eq(sales.id, input.saleId), eq(sales.organizacaoId, organizationId)));

	// ------------------------------------------------------------------
	// Contábil em place + regeneração das transações pendentes + validação de balanço.
	// ------------------------------------------------------------------
	const vendaEntry = sale.lancamentosContabeis.find((entry) => entry.origemTipo === "VENDA");
	if (!vendaEntry) {
		throw new createHttpError.BadRequest("A venda não possui lançamento contábil de origem para sincronizar. Edição não suportada.");
	}

	await tx
		.update(accountingEntries)
		.set({ valor: valorTotal })
		.where(and(eq(accountingEntries.id, vendaEntry.id), eq(accountingEntries.organizacaoId, organizationId)));

	// Apaga só a agenda PENDENTE (não efetivada, não cancelada/estornada, não-CASHBACK) e regenera
	// a partir dos novos splits. Efetivadas nunca são tocadas; a trilha da edição vive no log acima.
	await tx
		.delete(financialTransactions)
		.where(
			and(
				eq(financialTransactions.organizacaoId, organizationId),
				eq(financialTransactions.lancamentoContabilId, vendaEntry.id),
				isNull(financialTransactions.dataEfetivacao),
				ne(financialTransactions.metodo, "CASHBACK"),
				or(isNull(financialTransactions.provedorStatus), notInArray(financialTransactions.provedorStatus, REVERSED_TRANSACTION_STATUSES)),
			),
		);

	const paymentProvider = getPaymentProvider(input.organization);
	const paymentResults =
		input.pagamentos.length > 0
			? await paymentProvider.processPayments(
					{
						vendaId: input.saleId,
						lancamentoContabilId: vendaEntry.id,
						organizacaoId: organizationId,
						pagamentos: input.pagamentos,
						autorId: input.saleAuthorId,
						sessaoVendaId: input.sessaoVendaId ?? null,
						saleLabel: vendaEntry.titulo,
					},
					tx,
				)
			: [];

	// Efetivadas mantidas entram pelo valor bruto recebido; o troco já entregue (SAÍDA de troco do
	// lançamento) abate esse bruto. Os splits novos só precisam cobrir o que falta desse líquido, e
	// o excesso sobre isso vira um novo troco — mesma regra da confirmação.
	const keptTransactions = vendaEntry.transacoesFinanceiras.filter(
		(transaction) =>
			transaction.tipo === "ENTRADA" &&
			!REVERSED_TRANSACTION_STATUSES.includes(transaction.provedorStatus ?? "") &&
			(transaction.dataEfetivacao != null || transaction.metodo === "CASHBACK"),
	);
	const existingChangeTotal = getSaleChangeTotal(vendaEntry.transacoesFinanceiras);
	const keptNetTotal = keptTransactions.reduce((sum, transaction) => sum + transaction.valor, 0) - existingChangeTotal;
	const change =
		input.pagamentos.length > 0
			? await registerSaleChangeTransaction({
					tx,
					organization: input.organization,
					lancamentoContabilId: vendaEntry.id,
					salePayments: input.pagamentos,
					saleTotal: Math.max(0, valorTotal - keptNetTotal),
					sessaoVendaId: input.sessaoVendaId ?? null,
					autorId: input.saleAuthorId,
				})
			: null;

	// Pedra angular da atomicidade: efetivadas mantidas − troco + splits novos − troco novo precisam
	// fechar com o novo valor do lançamento. Divergência = rollback de tudo (itens, estoque, contábil, pagamentos).
	const balanceError = getAccountingEntryBalanceError({
		entryValue: valorTotal,
		transactions: [
			...keptTransactions.map((transaction) => ({ valor: transaction.valor })),
			...(existingChangeTotal > 0 ? [{ valor: -existingChangeTotal }] : []),
			...input.pagamentos.map((payment) => ({ valor: payment.valor })),
			...(change ? [{ valor: -change.valor }] : []),
		],
	});
	if (balanceError) {
		throw new createHttpError.BadRequest(`${balanceError} Ajuste os pagamentos para cobrir o novo total da venda.`);
	}

	return {
		saleId: input.saleId,
		valorTotal,
		lancamentoContabilId: vendaEntry.id,
		pagamentos: paymentResults,
		resumo: { itensInseridos, itensAtualizados, itensRemovidos, cupomRemovido },
		cashbackAcumulo: cashbackAccumulationResync,
	};
}

type TProcessConfirmedSaleEditPostCommitInput = Pick<TProcessConfirmedSaleEditInput, "organization" | "saleId" | "saleAuthorId">;

/**
 * Pós-commit: mesma fonte única de emissão automática usada por confirmação e entrega. Uma edição
 * que completa o pagamento de uma venda entregue emite; a existência de documento vivo é
 * auto-guardada lá dentro (idempotente por referência fiscal).
 */
export async function processConfirmedSaleEditPostCommit(input: TProcessConfirmedSaleEditPostCommitInput) {
	return processSaleAutomaticFiscalEmissionIfEligible({
		organization: input.organization,
		saleId: input.saleId,
		authorId: input.saleAuthorId,
	});
}

import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { validateActiveSeller } from "@/lib/sellers/validate-active-seller";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { CheckoutPaymentSplitSchema, resolvePaymentFinancialAccounts } from "@/lib/payments";
import {
	admitSaleRewardRedemptions,
	buildRewardSaleItemsValues,
	buildRewardSnapshotsMetadataKeys,
	buildSaleRewardDraftSnapshots,
	resolveRewardRedemptionLinesInput,
	sumAdmittedRewardsCost,
	sumAdmittedRewardsSaleValue,
	toSaleRewardRedemptionInputs,
} from "@/lib/sales/sale-reward-redemption";
import { saleRewardRedemptionInputFields } from "@/schemas/cashback-programs";
import { resolveActiveSalesSession, validateSalesSessionSeller } from "@/lib/sales-sessions";
import { authorizeSaleDiscount, computeSaleAggregatedDiscount, consumeSaleDiscountApproval } from "@/lib/sales/sale-discount-authorization";
import { resolveSaleFiscalEmissionOverride } from "@/lib/sales/sale-fiscal-emission-override";
import { validateSaleItemsPricing } from "@/lib/sales/sale-pricing-validation";
import { processSaleConfirmationInTransaction, processSaleConfirmationPostCommit } from "@/lib/sales/sale-processing";
import { AppliedCouponSchema } from "@/schemas/coupons";
import { db } from "@/services/drizzle";
import { saleItemModifiers, saleItems, sales } from "@/services/drizzle/schema";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const CartItemModifierInputSchema = z.object({
	opcaoId: z.string({ required_error: "ID da opção não informado." }),
	nome: z.string({ required_error: "Nome do modificador não informado." }),
	quantidade: z.number({ required_error: "Quantidade do modificador não informada." }),
	valorUnitario: z.number({ required_error: "Valor unitário do modificador não informado." }),
	valorTotal: z.number({ required_error: "Valor total do modificador não informado." }),
});

const CartItemInputSchema = z.object({
	produtoId: z.string({ required_error: "ID do produto não informado." }),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo não válido para ID da variante." }).optional().nullable(),
	nome: z.string({ required_error: "Nome do item não informado." }),
	codigo: z.string({ required_error: "Código do item não informado." }),
	imagemUrl: z.string({ invalid_type_error: "Tipo não válido para URL da imagem." }).optional().nullable(),
	quantidade: z.number({ required_error: "Quantidade não informada." }).min(1),
	valorUnitarioBase: z.number({ required_error: "Valor unitário base não informado." }),
	valorModificadores: z.number({ required_error: "Valor de modificadores não informado." }),
	valorUnitarioFinal: z.number({ required_error: "Valor unitário final não informado." }),
	valorTotalBruto: z.number({ required_error: "Valor total bruto não informado." }),
	valorDesconto: z.number({ invalid_type_error: "Tipo não válido para desconto." }).default(0),
	valorTotalLiquido: z.number({ required_error: "Valor total líquido não informado." }),
	modificadores: z.array(CartItemModifierInputSchema),
	observacoes: z.string({ invalid_type_error: "Tipo não válido para observações do item." }).max(500).optional().nullable(),
});

const CreateAndConfirmSaleInputSchema = z.object({
	clienteId: z.string({ invalid_type_error: "Tipo não válido para ID do cliente." }).optional().nullable(),
	vendedorId: z.string({ invalid_type_error: "Tipo não válido para ID do vendedor." }).optional().nullable(),
	vendedorNome: z.string({ invalid_type_error: "Tipo não válido para nome do vendedor." }).optional().nullable(),
	entregaModalidade: z.enum(["PRESENCIAL", "RETIRADA", "ENTREGA", "COMANDA"]).optional().nullable(),
	entregaLocalizacaoId: z.string({ invalid_type_error: "Tipo não válido para ID da localização." }).optional().nullable(),
	comandaNumero: z.string({ invalid_type_error: "Tipo não válido para comanda." }).optional().nullable(),
	observacoes: z.string({ invalid_type_error: "Tipo não válido para observações." }).optional().nullable(),
	descontosTotal: z.number({ invalid_type_error: "Tipo não válido para desconto." }).optional().nullable(),
	acrescimosTotal: z.number({ invalid_type_error: "Tipo não válido para acréscimo." }).optional().nullable(),
	rascunhoMetadados: z.unknown().optional().nullable(),
	pagamentos: z.array(CheckoutPaymentSplitSchema.omit({ id: true })),
	cashbackResgate: z.number({ invalid_type_error: "Tipo não válido para resgate de cashback." }).default(0),
	cashbackProgramaId: z.string({ invalid_type_error: "Tipo não válido para ID do programa de cashback." }).optional().nullable(),
	cupomResgate: AppliedCouponSchema.optional().nullable(),
	// Resgate de recompensas (prêmios) via saldo de cashback. Os itens das recompensas NÃO vêm
	// em `itens` — o servidor valida cada prêmio contra o catálogo e constrói os itens ele mesmo.
	...saleRewardRedemptionInputFields,
	sessaoVendaId: z.string({ invalid_type_error: "Tipo não válido para o ID da sessão de venda." }).optional().nullable(),
	// Override tri-state da emissão fiscal automática. null/ausente = herda a preferência da organização.
	emissaoFiscalAutomatica: z.boolean({ invalid_type_error: "Tipo não válido para emissão fiscal automática." }).optional().nullable(),
	// Aprovação VENDA_DESCONTO exigida quando o desconto agregado excede o teto do vendedor.
	descontoAprovacaoId: z.string({ invalid_type_error: "Tipo não válido para o ID da aprovação de desconto." }).optional().nullable(),
	// Venda só-recompensas é permitida (carrinho vazio + recompensasResgate); a exigência de
	// pelo menos um item quando não há recompensa é validada no service.
	itens: z.array(CartItemInputSchema),
});
export type TCreateAndConfirmSaleInput = z.infer<typeof CreateAndConfirmSaleInputSchema>;

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

async function createAndConfirmSale({ input, session }: { input: TCreateAndConfirmSaleInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;
	await validateActiveSeller({ orgId, sellerId: input.vendedorId });

	const rewardLines = resolveRewardRedemptionLinesInput(input) ?? [];
	if (input.itens.length === 0 && rewardLines.length === 0) {
		throw new createHttpError.BadRequest("Pelo menos um item é obrigatório.");
	}

	// Nunca confie nos valores do cliente: recalcula os itens contra o catálogo antes de qualquer uso.
	await validateSaleItemsPricing({ orgId, itens: input.itens, canal: "POS" });

	// Resgate de recompensas: admissão + resolução autoritativa de cada prêmio contra o catálogo,
	// com saldo pré-checado sobre a soma. Exclusivo com cupom (espelha o POI) e com
	// resgate-desconto. O desconto comercial dos prêmios fica fora do teto de desconto do
	// vendedor, como cashback e cupom AUTOMATICA — regras próprias validadas aqui.
	const validatedRewards = await admitSaleRewardRedemptions({
		tx: db,
		organizacaoId: orgId,
		clienteId: input.clienteId,
		recompensas: rewardLines,
		hasCoupon: !!input.cupomResgate,
		cashbackResgate: input.cashbackResgate ?? 0,
		surface: "POS",
	});

	const productIds = [...new Set(input.itens.map((item) => item.produtoId))];
	const variantIds = input.itens.map((item) => item.produtoVarianteId).filter((id): id is string => !!id);

	const [produtosResult, variantesResult, organization] = await Promise.all([
		productIds.length > 0
			? db.query.products.findMany({
					where: (fields, { inArray }) => inArray(fields.id, productIds),
					columns: { id: true, precoCusto: true, rastreamentoEstoqueAtivo: true },
				})
			: [],
		variantIds.length > 0
			? db.query.productVariants.findMany({
					where: (fields, { inArray }) => inArray(fields.id, variantIds),
					columns: { id: true, precoCusto: true, rastreamentoEstoqueAtivo: true },
				})
			: [],
		db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, orgId) }),
	]);

	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	// Override fiscal por venda: valida permissão simétrica e resolve o valor a persistir (null = herda org).
	const emissaoFiscalAutomatica = resolveSaleFiscalEmissionOverride({
		requested: input.emissaoFiscalAutomatica,
		organizationDefault: organization.fiscalEmissaoAutomatica,
		session,
	});

	// Sessões de venda (caixa): enforcement opcional/obrigatório + validação da sessão informada pelo cliente.
	const sessaoObrigatoria = organization.configuracao.preferencias.sessoesVenda?.obrigatorio ?? false;
	if (sessaoObrigatoria && !input.sessaoVendaId) {
		throw new createHttpError.BadRequest("Nenhum caixa aberto. Abra uma sessão de venda para continuar.");
	}
	let sessaoVendaId: string | null = null;
	if (input.sessaoVendaId) {
		const activeSession = await resolveActiveSalesSession({ orgId, sessaoVendaId: input.sessaoVendaId });
		if (!activeSession) throw new createHttpError.BadRequest("Sessão de venda inválida ou não está aberta.");
		validateSalesSessionSeller({ session: activeSession, vendedorId: input.vendedorId });
		sessaoVendaId = activeSession.id;
	}

	const organizationSaleDefaults = organization.configuracao.defaults.contabilidade.lancamentosPadrao.vendas;
	const accountingEntryDebitAccountId = organizationSaleDefaults.debitoContaId;
	const accountingEntryCreditAccountId = organizationSaleDefaults.creditoContaId;
	if (!accountingEntryDebitAccountId || !accountingEntryCreditAccountId) {
		throw new createHttpError.InternalServerError("A organizacao nao possui contas padrao de vendas configuradas.");
	}
	const productCostMap = new Map(produtosResult.map((p) => [p.id, p.precoCusto ?? 0]));
	const variantCostMap = new Map(variantesResult.map((v) => [v.id, v.precoCusto ?? 0]));

	const valorBaseItens = input.itens.reduce((sum, item) => sum + item.valorTotalLiquido, 0);
	const descontosGerais = input.descontosTotal ?? 0;
	const cashbackResgate = input.cashbackResgate ?? 0;
	const cupomDesconto = input.cupomResgate?.valorDesconto ?? 0;
	const acrescimosGerais = input.acrescimosTotal ?? 0;
	const descontosVenda = descontosGerais + cupomDesconto + cashbackResgate;
	const valorAntesCupom = Math.max(0, valorBaseItens - descontosGerais);
	if (cupomDesconto > valorAntesCupom) {
		throw new createHttpError.BadRequest("O desconto do cupom não pode superar o valor da venda.");
	}
	const valorAntesCashback = Math.max(0, valorAntesCupom - cupomDesconto);
	if (cashbackResgate > valorAntesCashback) {
		throw new createHttpError.BadRequest("O resgate de cashback não pode superar o valor da venda.");
	}

	// Teto de desconto do vendedor: acima do limite exige aprovação válida, consumida na transação da venda.
	const descontoAgregado = computeSaleAggregatedDiscount({
		itens: input.itens,
		descontosGerais,
		cupomResgate: input.cupomResgate,
	});
	const descontoAprovacaoId = await authorizeSaleDiscount({
		orgId,
		session,
		vendedorId: input.vendedorId,
		valorBase: descontoAgregado.valorBase,
		descontoTotal: descontoAgregado.descontoTotal,
		aprovacaoId: input.descontoAprovacaoId,
	});

	const valorTotal = Math.max(0, valorBaseItens - descontosVenda) + acrescimosGerais;
	const descontosTotalItens = input.itens.reduce((sum, item) => sum + item.valorDesconto, 0);
	// Os itens das recompensas entram com líquido 0 (bruto = desconto = precoVenda × qtd), então
	// não afetam valorTotal — mas o desconto comercial compõe descontosTotal e o custo compõe custoTotal.
	const recompensaDesconto = sumAdmittedRewardsSaleValue(validatedRewards);
	const descontosTotalPersistido = (descontosVenda > 0 ? descontosVenda : descontosTotalItens) + recompensaDesconto;
	const custoTotal =
		input.itens.reduce((sum, item) => {
			const custo = item.produtoVarianteId ? (variantCostMap.get(item.produtoVarianteId) ?? 0) : (productCostMap.get(item.produtoId) ?? 0);
			return sum + custo * item.quantidade;
		}, 0) + sumAdmittedRewardsCost(validatedRewards);

	const salePayments = await resolvePaymentFinancialAccounts({ organization, payments: input.pagamentos });
	const idExterno = `POS-${Date.now()}`;

	const transactionResult = await db.transaction(async (tx) => {
		const insertedSale = await tx
			.insert(sales)
			.values({
				organizacaoId: orgId,
				clienteId: input.clienteId ?? null,
				idExterno,
				valorTotal,
				descontosTotal: descontosTotalPersistido > 0 ? descontosTotalPersistido : null,
				acrescimosTotal: input.acrescimosTotal ?? null,
				custoTotal,
				vendedorNome: input.vendedorNome ?? session.user.nome,
				vendedorId: input.vendedorId ?? null,
				entregaModalidade: input.entregaModalidade ?? null,
				entregaLocalizacaoId: input.entregaLocalizacaoId ?? null,
				comandaNumero: input.comandaNumero ?? null,
				observacoes: input.observacoes ?? null,
				rascunhoMetadados: {
					...((input.rascunhoMetadados as Record<string, unknown> | null) ?? {}),
					cupom: input.cupomResgate ?? null,
					...buildRewardSnapshotsMetadataKeys(buildSaleRewardDraftSnapshots(validatedRewards)),
				},
				parceiro: "",
				chave: "",
				documento: "",
				modelo: "",
				movimento: "RECEITAS",
				natureza: "",
				serie: "SN01",
				situacao: "",
				tipo: "Venda de produtos",
				canal: "POS",
				processamentoOrigem: "INTERNO",
				statusVenda: "ORCAMENTO",
				emissaoFiscalAutomatica,
			})
			.returning({ id: sales.id });

		const newSaleId = insertedSale[0]?.id;
		if (!newSaleId) throw new createHttpError.InternalServerError("Erro ao criar venda.");

		// One-shot: a aprovação de desconto é consumida na mesma transação da venda (impede reuso).
		if (descontoAprovacaoId) {
			await consumeSaleDiscountApproval({ tx, aprovacaoId: descontoAprovacaoId, vendaId: newSaleId });
		}

		for (const item of input.itens) {
			const valorCustoUnitario = item.produtoVarianteId ? (variantCostMap.get(item.produtoVarianteId) ?? 0) : (productCostMap.get(item.produtoId) ?? 0);

			const insertedItem = await tx
				.insert(saleItems)
				.values({
					organizacaoId: orgId,
					vendaId: newSaleId,
					clienteId: input.clienteId ?? null,
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
					metadados: {
						nome: item.nome,
						codigo: item.codigo,
						imagemUrl: item.imagemUrl ?? null,
						produtoId: item.produtoId,
						produtoVarianteId: item.produtoVarianteId ?? null,
						valorUnitarioBase: item.valorUnitarioBase,
						valorModificadores: item.valorModificadores,
						modificadores: item.modificadores.map((mod) => ({
							opcaoId: mod.opcaoId,
							nome: mod.nome,
							quantidade: mod.quantidade,
							valorUnitario: mod.valorUnitario,
							valorTotal: mod.valorTotal,
						})),
					},
				})
				.returning({ id: saleItems.id });

			const newItemId = insertedItem[0]?.id;
			if (!newItemId) throw new createHttpError.InternalServerError("Erro ao criar item da venda.");

			if (item.modificadores.length > 0) {
				await tx.insert(saleItemModifiers).values(
					item.modificadores.map((mod) => ({
						itemVendaId: newItemId,
						opcaoId: mod.opcaoId,
						nome: mod.nome,
						quantidade: mod.quantidade,
						valorUnitario: mod.valorUnitario,
						valorTotal: mod.valorTotal,
					})),
				);
			}
		}

		// Itens das recompensas: construídos pelo servidor (100% de desconto, custo real do catálogo).
		if (validatedRewards.length > 0) {
			await tx.insert(saleItems).values(
				buildRewardSaleItemsValues({
					organizacaoId: orgId,
					vendaId: newSaleId,
					clienteId: input.clienteId ?? null,
					rewards: validatedRewards,
				}),
			);
		}

		const confirmation = await processSaleConfirmationInTransaction({
			tx,
			input: {
				organization,
				saleId: newSaleId,
				salePayments,
				saleAuthorId: session.user.id,
				saleClientId: input.clienteId ?? null,
				saleCashbackProgramId: input.cashbackProgramaId,
				saleCashbackRedemptionValue: input.cashbackResgate,
				saleRewardRedemptions: toSaleRewardRedemptionInputs(validatedRewards),
				saleCouponId: input.cupomResgate?.cupomId ?? null,
				saleCouponDeclaredDiscountValue: input.cupomResgate?.valorDesconto ?? null,
				accountingEntryDebitAccountId,
				accountingEntryCreditAccountId,
				sessaoVendaId,
			},
		});

		return { saleId: newSaleId, confirmation };
	});

	const fiscal = await processSaleConfirmationPostCommit({
		organization,
		saleId: transactionResult.saleId,
		saleAuthorId: session.user.id,
	});
	const confirmation = { ...transactionResult.confirmation, fiscal };
	const saleId = transactionResult.saleId;

	return {
		data: {
			saleId,
			confirmation,
		},
		message: "Venda finalizada com sucesso.",
	};
}
export type TCreateAndConfirmSaleOutput = Awaited<ReturnType<typeof createAndConfirmSale>>;

async function createAndConfirmSaleRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const body = await request.json();
	const input = CreateAndConfirmSaleInputSchema.parse(body);
	const result = await createAndConfirmSale({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: createAndConfirmSaleRoute });

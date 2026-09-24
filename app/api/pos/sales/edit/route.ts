import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { validateActiveSeller } from "@/lib/sellers/validate-active-seller";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { CheckoutPaymentSplitSchema, resolvePaymentFinancialAccounts } from "@/lib/payments";
import { resolveActiveSalesSession, validateSalesSessionSeller } from "@/lib/sales-sessions";
import { resolveSaleEditability } from "@/lib/sales/sale-editability";
import { authorizeSaleDiscount, computeSaleAggregatedDiscount } from "@/lib/sales/sale-discount-authorization";
import { resolveSaleFiscalEmissionOverride } from "@/lib/sales/sale-fiscal-emission-override";
import { processConfirmedSaleEditInTransaction, processConfirmedSaleEditPostCommit } from "@/lib/sales/sale-processing";
import { POS_REWARD_SALE_ITEM_ORIGIN } from "@/lib/sales/sale-reward-redemption";
import { classifySalePaymentTransactions, type SalePaymentTransactionInput } from "@/lib/sales/utils";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

const GetSaleForEditInputSchema = z.object({
	saleId: z.string({ required_error: "ID da venda não informado." }),
});
export type TGetSaleForEditInput = z.infer<typeof GetSaleForEditInputSchema>;

const EditSaleItemModifierInputSchema = z.object({
	opcaoId: z.string({ required_error: "ID da opção não informado." }),
	nome: z.string({ required_error: "Nome do modificador não informado." }),
	quantidade: z.number({ required_error: "Quantidade do modificador não informada." }),
	valorUnitario: z.number({ required_error: "Valor unitário do modificador não informado." }),
	valorTotal: z.number({ required_error: "Valor total do modificador não informado." }),
});

const EditSaleItemInputSchema = z.object({
	// Presente = item existente da venda; ausente = item novo adicionado na edição.
	id: z.string({ invalid_type_error: "Tipo não válido para ID do item." }).optional().nullable(),
	deletar: z.boolean({ invalid_type_error: "Tipo não válido para remoção do item." }).optional(),
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
	modificadores: z.array(EditSaleItemModifierInputSchema),
	observacoes: z.string({ invalid_type_error: "Tipo não válido para observações do item." }).max(500).optional().nullable(),
});

const EditConfirmedSaleInputSchema = z.object({
	saleId: z.string({ required_error: "ID da venda não informado." }),
	// Token de concorrência otimista: o total visto ao carregar a edição.
	valorTotalEsperado: z.number({ required_error: "Total esperado da venda não informado." }),
	vendedorId: z.string({ invalid_type_error: "Tipo não válido para ID do vendedor." }).optional().nullable(),
	vendedorNome: z.string({ invalid_type_error: "Tipo não válido para nome do vendedor." }).optional().nullable(),
	entregaModalidade: z.enum(["PRESENCIAL", "RETIRADA", "ENTREGA", "COMANDA"]).optional().nullable(),
	entregaLocalizacaoId: z.string({ invalid_type_error: "Tipo não válido para ID da localização." }).optional().nullable(),
	comandaNumero: z.string({ invalid_type_error: "Tipo não válido para comanda." }).optional().nullable(),
	observacoes: z.string({ invalid_type_error: "Tipo não válido para observações." }).optional().nullable(),
	descontosTotal: z.number({ invalid_type_error: "Tipo não válido para desconto." }).optional().nullable(),
	acrescimosTotal: z.number({ invalid_type_error: "Tipo não válido para acréscimo." }).optional().nullable(),
	taxaEntrega: z.number({ invalid_type_error: "Tipo não válido para taxa de entrega." }).nonnegative().optional(),
	// Splits novos APENAS para o restante não efetivado (vazio quando nada resta a pagar).
	pagamentos: z.array(CheckoutPaymentSplitSchema.omit({ id: true })),
	emissaoFiscalAutomatica: z.boolean({ invalid_type_error: "Tipo não válido para emissão fiscal automática." }).optional().nullable(),
	// Consentimento explícito para derrubar um cupom invalidado pelo carrinho editado.
	removerCupom: z.boolean({ invalid_type_error: "Tipo não válido para remoção do cupom." }).optional(),
	descontoAprovacaoId: z.string({ invalid_type_error: "Tipo não válido para o ID da aprovação de desconto." }).optional().nullable(),
	sessaoVendaId: z.string({ invalid_type_error: "Tipo não válido para o ID da sessão de venda." }).optional().nullable(),
	itens: z.array(EditSaleItemInputSchema).min(1, { message: "Pelo menos um item é obrigatório." }),
});
export type TEditConfirmedSaleInput = z.infer<typeof EditConfirmedSaleInputSchema>;

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

function isRewardSaleItemMetadata(metadados: unknown): boolean {
	if (!metadados || typeof metadados !== "object" || Array.isArray(metadados)) return false;
	return (metadados as { origem?: unknown }).origem === POS_REWARD_SALE_ITEM_ORIGIN;
}

// ============================================================================
// GET SERVICE — carga da venda para hidratar a superfície de edição no POS
// ============================================================================

async function getSaleForEdit({ input, session }: { input: TGetSaleForEditInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	const sale = await db.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.saleId), eq(fields.organizacaoId, orgId)),
		columns: {
			id: true,
			idExterno: true,
			valorTotal: true,
			descontosTotal: true,
			acrescimosTotal: true,
			statusVenda: true,
			statusAtendimento: true,
			processamentoOrigem: true,
			tabId: true,
			clienteId: true,
			vendedorId: true,
			vendedorNome: true,
			entregaModalidade: true,
			entregaLocalizacaoId: true,
			comandaNumero: true,
			observacoes: true,
			rascunhoMetadados: true,
			emissaoFiscalAutomatica: true,
			dataVenda: true,
		},
		with: {
			cliente: { columns: { id: true, nome: true, telefone: true } },
			itens: {
				columns: {
					id: true,
					produtoId: true,
					produtoVarianteId: true,
					quantidade: true,
					quantidadeEntregue: true,
					valorVendaUnitario: true,
					valorVendaTotalBruto: true,
					valorTotalDesconto: true,
					valorVendaTotalLiquido: true,
					observacoes: true,
					metadados: true,
				},
				with: {
					produto: { columns: { id: true, nome: true, codigo: true, imagemCapaUrl: true } },
					produtoVariante: { columns: { id: true, nome: true, codigo: true } },
					adicionais: { columns: { id: true, opcaoId: true, nome: true, quantidade: true, valorUnitario: true, valorTotal: true } },
				},
			},
			documentosFiscais: { columns: { id: true, tipo: true, statusInterno: true, numero: true, serie: true } },
			lancamentosContabeis: {
				columns: { id: true, origemTipo: true, valor: true },
				with: {
					transacoesFinanceiras: {
						columns: {
							id: true,
							lancamentoContabilId: true,
							titulo: true,
							valor: true,
							tipo: true,
							metodo: true,
							contaFinanceiraId: true,
							parcela: true,
							totalParcelas: true,
							dataEfetivacao: true,
							dataPrevisao: true,
							provedorStatus: true,
							modificadoresMetadata: true,
						},
					},
				},
			},
			transacoesCashback: { columns: { id: true, tipo: true, status: true, valor: true, resgateRecompensaId: true, resgateRecompensaValor: true } },
		},
	});
	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");

	const cupomResgatado = await db.query.couponRedemptions.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.vendaId, sale.id), eq(fields.organizacaoId, orgId), eq(fields.status, "UTILIZADO")),
		columns: { id: true, cupomId: true, valorDesconto: true, cupomTitulo: true, cupomCodigo: true },
	});

	const rawTransactions: SalePaymentTransactionInput[] = sale.lancamentosContabeis.flatMap((entry) =>
		entry.transacoesFinanceiras.map((transaction) => ({ ...transaction, lancamentoContabilId: entry.id })),
	);
	const pagamentos = classifySalePaymentTransactions(rawTransactions);
	const editabilidade = resolveSaleEditability({
		statusVenda: sale.statusVenda,
		statusAtendimento: sale.statusAtendimento,
		processamentoOrigem: sale.processamentoOrigem,
		tabId: sale.tabId,
		valorTotal: sale.valorTotal,
		documentosFiscais: sale.documentosFiscais,
		transacoes: rawTransactions,
	});
	const resgatesAtivos = sale.transacoesCashback.filter((transaction) => transaction.tipo === "RESGATE" && transaction.status === "ATIVO");
	// Somente resgates-desconto compõem o desconto em R$ da venda. O resgate de recompensa está em
	// moeda cashback (pontos ou R$) e seu efeito comercial já vive no item com 100% de desconto —
	// somá-lo aqui descontaria o prêmio duas vezes (e compararia pontos com reais).
	const cashbackResgate = resgatesAtivos
		.filter((transaction) => !transaction.resgateRecompensaId)
		.reduce((sum, transaction) => sum + Math.abs(transaction.valor), 0);
	// Uma linha do ledger por recompensa resgatada; `valor` é o débito TOTAL da linha (unitário × quantidade).
	const recompensasResgatadas = resgatesAtivos
		.filter((transaction) => !!transaction.resgateRecompensaId)
		.map((transaction) => ({
			recompensaId: transaction.resgateRecompensaId as string,
			valor: transaction.resgateRecompensaValor ?? Math.abs(transaction.valor),
		}));

	return {
		data: {
			venda: sale,
			pagamentos,
			editabilidade,
			cupomResgatado: cupomResgatado ?? null,
			cashbackResgate,
			recompensasResgatadas,
		},
		message: "Venda carregada para edição.",
	};
}
export type TGetSaleForEditOutput = Awaited<ReturnType<typeof getSaleForEdit>>;

// ============================================================================
// PUT SERVICE — aplica a edição com side-effects sincronizados
// ============================================================================

async function editConfirmedSale({ input, session }: { input: TEditConfirmedSaleInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;
	await validateActiveSeller({ orgId, sellerId: input.vendedorId });

	const organization = await db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, orgId) });
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const emissaoFiscalAutomatica = resolveSaleFiscalEmissionOverride({
		requested: input.emissaoFiscalAutomatica,
		organizationDefault: organization.fiscalEmissaoAutomatica,
		session,
	});

	// Diferente da criação, a edição não exige caixa aberto: a sessão (se informada e aberta)
	// apenas carimba os splits IMEDIATA regenerados, para o dinheiro cair na gaveta certa.
	let sessaoVendaId: string | null = null;
	if (input.sessaoVendaId) {
		const activeSession = await resolveActiveSalesSession({ orgId, sessaoVendaId: input.sessaoVendaId });
		if (!activeSession) throw new createHttpError.BadRequest("Sessão de venda inválida ou não está aberta.");
		validateSalesSessionSeller({ session: activeSession, vendedorId: input.vendedorId });
		sessaoVendaId = activeSession.id;
	}

	// Teto de desconto do vendedor: mesma régua da criação, sobre o carrinho editado. O desconto de
	// cupom preexistente não entra (foi autorizado na criação e é imutável na edição), nem o item
	// de recompensa resgatada (100% de desconto com regras próprias, como cashback).
	const saleItemsRows = await db.query.saleItems.findMany({
		where: (fields, { and, eq }) => and(eq(fields.vendaId, input.saleId), eq(fields.organizacaoId, orgId)),
		columns: { id: true, metadados: true },
	});
	const rewardItemIds = new Set(saleItemsRows.filter((item) => isRewardSaleItemMetadata(item.metadados)).map((item) => item.id));
	const activeItems = input.itens.filter((item) => !item.deletar && !(item.id && rewardItemIds.has(item.id)));
	const descontoAgregado = computeSaleAggregatedDiscount({
		itens: activeItems,
		descontosGerais: input.descontosTotal ?? 0,
		cupomResgate: null,
	});
	const descontoAprovacaoId = await authorizeSaleDiscount({
		orgId,
		session,
		vendedorId: input.vendedorId,
		valorBase: descontoAgregado.valorBase,
		descontoTotal: descontoAgregado.descontoTotal,
		aprovacaoId: input.descontoAprovacaoId,
	});

	const salePayments = await resolvePaymentFinancialAccounts({ organization, payments: input.pagamentos });

	const result = await db.transaction((tx) =>
		processConfirmedSaleEditInTransaction({
			tx,
			input: {
				organization,
				saleId: input.saleId,
				saleAuthorId: session.user.id,
				itens: input.itens,
				descontosTotal: input.descontosTotal,
				acrescimosTotal: input.acrescimosTotal,
				taxaEntrega: input.taxaEntrega,
				observacoes: input.observacoes,
				vendedorId: input.vendedorId,
				vendedorNome: input.vendedorNome,
				entregaModalidade: input.entregaModalidade,
				entregaLocalizacaoId: input.entregaLocalizacaoId,
				comandaNumero: input.comandaNumero,
				pagamentos: salePayments,
				emissaoFiscalAutomatica,
				removerCupom: input.removerCupom,
				descontoAprovacaoId,
				valorTotalEsperado: input.valorTotalEsperado,
				sessaoVendaId,
			},
		}),
	);

	const fiscal = await processConfirmedSaleEditPostCommit({ organization, saleId: input.saleId, saleAuthorId: session.user.id });

	return {
		data: { ...result, fiscal },
		message: "Venda atualizada com sucesso.",
	};
}
export type TEditConfirmedSaleOutput = Awaited<ReturnType<typeof editConfirmedSale>>;

// ============================================================================
// HANDLERS
// ============================================================================

async function getSaleForEditRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!session.membership!.organizacao.configuracao.recursos.erp.acesso) {
		throw new createHttpError.Forbidden("Sua organização não possui acesso ao módulo de ERP.");
	}
	if (!session.membership!.permissoes.vendas.editar) {
		throw new createHttpError.Forbidden("Você não possui permissão para editar vendas.");
	}
	const input = GetSaleForEditInputSchema.parse({ saleId: request.nextUrl.searchParams.get("saleId") });
	const result = await getSaleForEdit({ input, session });
	return NextResponse.json(result);
}

async function editConfirmedSaleRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!session.membership!.organizacao.configuracao.recursos.erp.acesso) {
		throw new createHttpError.Forbidden("Sua organização não possui acesso ao módulo de ERP.");
	}
	if (!session.membership!.permissoes.vendas.editar) {
		throw new createHttpError.Forbidden("Você não possui permissão para editar vendas.");
	}
	const body = await request.json();
	const input = EditConfirmedSaleInputSchema.parse(body);
	const result = await editConfirmedSale({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSaleForEditRoute });
export const PUT = appApiHandler({ PUT: editConfirmedSaleRoute });

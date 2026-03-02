import { DEFAULT_POS_CONTA_CREDITO_ID, DEFAULT_POS_CONTA_DEBITO_ID } from "@/config";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { processSaleConfirmation } from "@/lib/sale-processing";
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
	quantidade: z.number({ required_error: "Quantidade não informada." }).min(1),
	valorUnitarioBase: z.number({ required_error: "Valor unitário base não informado." }),
	valorModificadores: z.number({ required_error: "Valor de modificadores não informado." }),
	valorUnitarioFinal: z.number({ required_error: "Valor unitário final não informado." }),
	valorTotalBruto: z.number({ required_error: "Valor total bruto não informado." }),
	valorDesconto: z.number({ invalid_type_error: "Tipo não válido para desconto." }).default(0),
	valorTotalLiquido: z.number({ required_error: "Valor total líquido não informado." }),
	modificadores: z.array(CartItemModifierInputSchema),
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
	pagamentos: z
		.array(
			z.object({
				metodo: z.enum(["DINHEIRO", "PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "BOLETO", "TRANSFERENCIA", "CASHBACK", "VALE", "OUTRO"], {
					required_error: "Método de pagamento não informado.",
				}),
				valor: z.number({ required_error: "Valor do pagamento não informado." }),
				parcela: z.number().optional().nullable(),
				totalParcelas: z.number().optional().nullable(),
			}),
		)
		.min(1, { message: "Pelo menos um pagamento é obrigatório." }),
	cashbackResgate: z.number({ invalid_type_error: "Tipo não válido para resgate de cashback." }).default(0),
	cashbackProgramaId: z.string({ invalid_type_error: "Tipo não válido para ID do programa de cashback." }).optional().nullable(),
	itens: z.array(CartItemInputSchema).min(1, { message: "Pelo menos um item é obrigatório." }),
});
export type TCreateAndConfirmSaleInput = z.infer<typeof CreateAndConfirmSaleInputSchema>;

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

async function createAndConfirmSale({ input, session }: { input: TCreateAndConfirmSaleInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	const productIds = [...new Set(input.itens.map((item) => item.produtoId))];
	const variantIds = input.itens.map((item) => item.produtoVarianteId).filter((id): id is string => !!id);

	const [produtosResult, variantesResult, organization] = await Promise.all([
		productIds.length > 0
			? db.query.products.findMany({
					where: (fields, { inArray }) => inArray(fields.id, productIds),
					columns: { id: true, precoCusto: true },
				})
			: [],
		variantIds.length > 0
			? db.query.productVariants.findMany({
					where: (fields, { inArray }) => inArray(fields.id, variantIds),
					columns: { id: true, precoCusto: true },
				})
			: [],
		db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, orgId) }),
	]);

	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const productCostMap = new Map(produtosResult.map((p) => [p.id, p.precoCusto ?? 0]));
	const variantCostMap = new Map(variantesResult.map((v) => [v.id, v.precoCusto ?? 0]));

	const valorBaseItens = input.itens.reduce((sum, item) => sum + item.valorTotalLiquido, 0);
	const descontosGerais = input.descontosTotal ?? 0;
	const acrescimosGerais = input.acrescimosTotal ?? 0;
	const valorTotal = Math.max(0, valorBaseItens - descontosGerais + acrescimosGerais);
	const descontosTotalItens = input.itens.reduce((sum, item) => sum + item.valorDesconto, 0);
	const custoTotal = input.itens.reduce((sum, item) => {
		const custo = item.produtoVarianteId ? (variantCostMap.get(item.produtoVarianteId) ?? 0) : (productCostMap.get(item.produtoId) ?? 0);
		return sum + custo * item.quantidade;
	}, 0);

	const idExterno = `POS-${Date.now()}`;

	const saleId = await db.transaction(async (tx) => {
		const insertedSale = await tx
			.insert(sales)
			.values({
				organizacaoId: orgId,
				clienteId: input.clienteId ?? null,
				idExterno,
				valorTotal,
				descontosTotal: (input.descontosTotal ?? descontosTotalItens) > 0 ? (input.descontosTotal ?? descontosTotalItens) : null,
				acrescimosTotal: input.acrescimosTotal ?? null,
				custoTotal,
				vendedorNome: input.vendedorNome ?? session.user.nome,
				vendedorId: input.vendedorId ?? null,
				entregaModalidade: input.entregaModalidade ?? null,
				entregaLocalizacaoId: input.entregaLocalizacaoId ?? null,
				comandaNumero: input.comandaNumero ?? null,
				observacoes: input.observacoes ?? null,
				rascunhoMetadados: input.rascunhoMetadados ?? null,
				parceiro: "",
				chave: "",
				documento: "",
				modelo: "",
				movimento: "RECEITAS",
				natureza: "",
				serie: "",
				situacao: "",
				tipo: "Venda de produtos",
				canal: "POS",
				processamentoOrigem: "INTERNO",
				status: "ORCAMENTO",
			})
			.returning({ id: sales.id });

		const newSaleId = insertedSale[0]?.id;
		if (!newSaleId) throw new createHttpError.InternalServerError("Erro ao criar venda.");

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

		return newSaleId;
	});

	const confirmation = await processSaleConfirmation({
		vendaId: saleId,
		pagamentos: input.pagamentos.map((payment) => ({
			metodo: payment.metodo,
			valor: payment.valor,
			parcela: payment.parcela ?? undefined,
			totalParcelas: payment.totalParcelas ?? undefined,
		})),
		autorId: session.user.id,
		organizacao: organization,
		clienteId: input.clienteId ?? null,
		cashbackResgate: input.cashbackResgate,
		cashbackProgramaId: input.cashbackProgramaId,
		contaDebitoId: DEFAULT_POS_CONTA_DEBITO_ID,
		contaCreditoId: DEFAULT_POS_CONTA_CREDITO_ID,
	});

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

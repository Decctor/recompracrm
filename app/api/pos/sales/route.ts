import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { saleItemModifiers, saleItems, sales } from "@/services/drizzle/schema";
import { products, productVariants } from "@/services/drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

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

const CreateSaleDraftInputSchema = z.object({
	clienteId: z.string({ invalid_type_error: "Tipo não válido para ID do cliente." }).optional().nullable(),
	vendedorId: z.string({ invalid_type_error: "Tipo não válido para ID do vendedor." }).optional().nullable(),
	vendedorNome: z.string({ invalid_type_error: "Tipo não válido para nome do vendedor." }).optional().nullable(),
	itens: z.array(CartItemInputSchema).min(1, { message: "Pelo menos um item é obrigatório." }),
});
export type TCreateSaleDraftInput = z.infer<typeof CreateSaleDraftInputSchema>;

const GetSaleDraftInputSchema = z.object({
	id: z.string({ required_error: "ID da venda não informado." }),
});

const UpdateSaleDraftInputSchema = z.object({
	id: z.string({ required_error: "ID da venda não informado." }),
	vendedorId: z.string({ invalid_type_error: "Tipo não válido para ID do vendedor." }).optional().nullable(),
	vendedorNome: z.string({ invalid_type_error: "Tipo não válido para nome do vendedor." }).optional().nullable(),
	entregaModalidade: z.enum(["PRESENCIAL", "RETIRADA", "ENTREGA", "COMANDA"]).optional().nullable(),
	entregaLocalizacaoId: z.string({ invalid_type_error: "Tipo não válido para ID da localização." }).optional().nullable(),
	comandaNumero: z.string({ invalid_type_error: "Tipo não válido para comanda." }).optional().nullable(),
	observacoes: z.string({ invalid_type_error: "Tipo não válido para observações." }).optional().nullable(),
	descontosTotal: z.number({ invalid_type_error: "Tipo não válido para desconto." }).optional().nullable(),
	acrescimosTotal: z.number({ invalid_type_error: "Tipo não válido para acréscimo." }).optional().nullable(),
});
export type TUpdateSaleDraftInput = z.infer<typeof UpdateSaleDraftInputSchema>;

// ============================================================================
// HELPERS
// ============================================================================

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

// ============================================================================
// POST — Create draft sale (ORCAMENTO)
// ============================================================================

async function createSaleDraft({ input, session }: { input: TCreateSaleDraftInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	// Fetch product cost prices for all items
	const productIds = [...new Set(input.itens.map((i) => i.produtoId))];
	const variantIds = input.itens.map((i) => i.produtoVarianteId).filter((id): id is string => !!id);

	const [produtosResult, variantesResult] = await Promise.all([
		productIds.length > 0
			? db.query.products.findMany({
					where: (fields, { inArray }) => inArray(fields.id, productIds),
					columns: { id: true, precoCusto: true, codigo: true },
				})
			: [],
		variantIds.length > 0
			? db.query.productVariants.findMany({
					where: (fields, { inArray }) => inArray(fields.id, variantIds),
					columns: { id: true, precoCusto: true, codigo: true },
				})
			: [],
	]);

	const productCostMap = new Map(produtosResult.map((p) => [p.id, p.precoCusto ?? 0]));
	const productCodeMap = new Map(produtosResult.map((p) => [p.id, p.codigo]));
	const variantCostMap = new Map(variantesResult.map((v) => [v.id, v.precoCusto ?? 0]));

	// Calculate totals
	const valorTotal = input.itens.reduce((sum, item) => sum + item.valorTotalLiquido, 0);
	const descontosTotal = input.itens.reduce((sum, item) => sum + item.valorDesconto, 0);
	const custoTotal = input.itens.reduce((sum, item) => {
		const custo = item.produtoVarianteId ? (variantCostMap.get(item.produtoVarianteId) ?? 0) : (productCostMap.get(item.produtoId) ?? 0);
		return sum + custo * item.quantidade;
	}, 0);

	const idExterno = `POS-${Date.now()}`;

	// Create sale + items in a transaction
	const result = await db.transaction(async (tx) => {
		const [sale] = await tx
			.insert(sales)
			.values({
				organizacaoId: orgId,
				clienteId: input.clienteId ?? null,
				idExterno,
				valorTotal,
				descontosTotal: descontosTotal > 0 ? descontosTotal : null,
				acrescimosTotal: null,
				custoTotal,
				vendedorNome: input.vendedorNome ?? session.user.nome,
				vendedorId: input.vendedorId ?? null,
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

		// Create sale items
		const insertedItems = [];
		for (const item of input.itens) {
			const valorCustoUnitario = item.produtoVarianteId
				? (variantCostMap.get(item.produtoVarianteId) ?? 0)
				: (productCostMap.get(item.produtoId) ?? 0);

			const [saleItem] = await tx
				.insert(saleItems)
				.values({
					organizacaoId: orgId,
					vendaId: sale.id,
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

			// Create modifiers
			if (item.modificadores.length > 0) {
				await tx.insert(saleItemModifiers).values(
					item.modificadores.map((mod) => ({
						itemVendaId: saleItem.id,
						opcaoId: mod.opcaoId,
						nome: mod.nome,
						quantidade: mod.quantidade,
						valorUnitario: mod.valorUnitario,
						valorTotal: mod.valorTotal,
					})),
				);
			}

			insertedItems.push(saleItem);
		}

		return { saleId: sale.id, itemCount: insertedItems.length };
	});

	return {
		data: { saleId: result.saleId, itemCount: result.itemCount },
		message: "Rascunho de venda criado com sucesso.",
	};
}
export type TCreateSaleDraftOutput = Awaited<ReturnType<typeof createSaleDraft>>;

// ============================================================================
// GET — Get draft sale by ID
// ============================================================================

async function getSaleDraft({ input, session }: { input: { id: string }; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	const sale = await db.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.id), eq(fields.organizacaoId, orgId)),
		with: {
			itens: {
				with: {
					adicionais: true,
					produto: {
						columns: { id: true, descricao: true, codigo: true, imagemCapaUrl: true },
					},
					produtoVariante: {
						columns: { id: true, nome: true, codigo: true, imagemCapaUrl: true },
					},
				},
			},
			cliente: {
				columns: { id: true, nome: true, telefone: true },
			},
			entregaLocalizacao: true,
		},
	});

	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");

	return {
		data: { sale },
		message: "Venda encontrada.",
	};
}
export type TGetSaleDraftOutput = Awaited<ReturnType<typeof getSaleDraft>>;

// ============================================================================
// PUT — Update draft sale metadata
// ============================================================================

async function updateSaleDraft({ input, session }: { input: TUpdateSaleDraftInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	// Verify the sale exists and belongs to the org
	const existing = await db.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.id), eq(fields.organizacaoId, orgId)),
		columns: { id: true, status: true },
	});

	if (!existing) throw new createHttpError.NotFound("Venda não encontrada.");
	if (existing.status !== "ORCAMENTO") {
		throw new createHttpError.BadRequest("Somente rascunhos (orçamentos) podem ser editados.");
	}

	await db
		.update(sales)
		.set({
			vendedorId: input.vendedorId,
			vendedorNome: input.vendedorNome ?? undefined,
			entregaModalidade: input.entregaModalidade ?? undefined,
			entregaLocalizacaoId: input.entregaLocalizacaoId,
			comandaNumero: input.comandaNumero,
			observacoes: input.observacoes,
			descontosTotal: input.descontosTotal,
			acrescimosTotal: input.acrescimosTotal,
		})
		.where(eq(sales.id, input.id));

	return {
		data: { saleId: input.id },
		message: "Rascunho atualizado com sucesso.",
	};
}
export type TUpdateSaleDraftOutput = Awaited<ReturnType<typeof updateSaleDraft>>;

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

async function createSaleDraftRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const body = await request.json();
	const input = CreateSaleDraftInputSchema.parse(body);
	const result = await createSaleDraft({ input, session });
	return NextResponse.json(result);
}

async function getSaleDraftRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const { searchParams } = new URL(request.url);
	const input = GetSaleDraftInputSchema.parse({ id: searchParams.get("id") });
	const result = await getSaleDraft({ input, session });
	return NextResponse.json(result);
}

async function updateSaleDraftRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const { searchParams } = new URL(request.url);
	const body = await request.json();
	const input = UpdateSaleDraftInputSchema.parse({ ...body, id: searchParams.get("id") });
	const result = await updateSaleDraft({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: createSaleDraftRoute });
export const GET = appApiHandler({ GET: getSaleDraftRoute });
export const PUT = appApiHandler({ PUT: updateSaleDraftRoute });

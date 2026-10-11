import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { withProductUpdateStamp } from "@/lib/products/update-stamp";
import { products, suppliers } from "@/services/drizzle/schema";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// Fornecedor principal do produto — ÚNICO caminho de escrita de `products.fornecedorPrincipalId`.
// A atribuição é sempre manual: as sugestões (./suggestions) só leem o histórico de compras.
// Rota focada (como /stock-deduction): o PUT do cadastro não envia o campo e, por isso, não o sobrescreve.
// ============================================================================

const UpdateProductMainSupplierInputSchema = z.object({
	productIds: z
		.array(z.string({ invalid_type_error: "Tipo inválido para ID do produto." }), {
			required_error: "Produtos não informados.",
			invalid_type_error: "Tipo inválido para lista de produtos.",
		})
		.min(1, "Informe ao menos um produto.")
		.max(500, "Informe no máximo 500 produtos por vez."),
	// null remove o fornecedor principal.
	fornecedorId: z.string({ invalid_type_error: "Tipo inválido para ID do fornecedor." }).nullable(),
	// Atribuição em lote: só preenche produtos ainda sem fornecedor principal, nunca troca uma escolha feita.
	onlyIfEmpty: z.boolean({ invalid_type_error: "Tipo inválido para a opção de preencher somente vazios." }).optional().default(false),
});
export type TUpdateProductMainSupplierInput = z.input<typeof UpdateProductMainSupplierInputSchema>;

async function updateProductMainSupplier({
	input,
	session,
}: {
	input: z.infer<typeof UpdateProductMainSupplierInputSchema>;
	session: TAuthUserSession;
}) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	// Escolher um fornecedor exige enxergar fornecedores (GET /api/suppliers usa a mesma permissão).
	if (!session.membership?.permissoes.compras.visualizar)
		throw new createHttpError.Unauthorized("Você não possui permissão para definir o fornecedor principal.");

	if (input.fornecedorId) {
		const supplierId = input.fornecedorId;
		const supplier = await db.query.suppliers.findFirst({
			where: and(eq(suppliers.id, supplierId), eq(suppliers.organizacaoId, userOrgId)),
			columns: { id: true },
		});
		if (!supplier) throw new createHttpError.NotFound("Fornecedor não encontrado.");
	}

	const productIds = [...new Set(input.productIds)];
	const conditions: SQL[] = [eq(products.organizacaoId, userOrgId), inArray(products.id, productIds)];
	if (input.onlyIfEmpty) conditions.push(isNull(products.fornecedorPrincipalId));

	const updated = await db
		.update(products)
		.set(withProductUpdateStamp({ fornecedorPrincipalId: input.fornecedorId }))
		.where(and(...conditions))
		.returning({ id: products.id });

	if (updated.length === 0 && productIds.length === 1 && !input.onlyIfEmpty) throw new createHttpError.NotFound("Produto não encontrado.");

	const skippedCount = productIds.length - updated.length;
	const message = !input.fornecedorId
		? "Fornecedor principal removido com sucesso."
		: productIds.length === 1
			? "Fornecedor principal definido com sucesso."
			: `Fornecedor principal definido em ${updated.length} produto(s).${skippedCount > 0 ? ` ${skippedCount} ignorado(s) por já terem fornecedor principal.` : ""}`;

	return {
		data: { updatedIds: updated.map((row) => row.id), skippedCount },
		message,
	};
}
export type TUpdateProductMainSupplierOutput = Awaited<ReturnType<typeof updateProductMainSupplier>>;

async function updateProductMainSupplierRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const body = await request.json();
	const input = UpdateProductMainSupplierInputSchema.parse(body);
	const result = await updateProductMainSupplier({ input, session });
	return NextResponse.json(result);
}

export const PUT = appApiHandler({ PUT: updateProductMainSupplierRoute });

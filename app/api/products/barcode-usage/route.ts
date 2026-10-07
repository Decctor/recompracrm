import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { barcodeLookupForms } from "@/lib/pos/barcode-lookup";
import { BARCODE_SCAN_MAX_LENGTH } from "@/lib/pos/barcode-scan-detector";
import { db } from "@/services/drizzle";
import { productVariants, products } from "@/services/drizzle/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Quem mais usa este código de barras na organização. Alimenta o aviso do formulário de produto:
// a duplicidade não é bloqueada (há cadastros legados e kits que compartilham GTIN), mas o PDV vai
// pedir ao operador que escolha entre os itens a cada leitura — melhor saber na hora de salvar.

const GetProductBarcodeUsageInputSchema = z.object({
	code: z
		.string({ required_error: "Código não informado.", invalid_type_error: "Tipo inválido para código." })
		.trim()
		.min(1, "Código não informado.")
		.max(BARCODE_SCAN_MAX_LENGTH, "Código muito longo."),
	/** Linha de produto a ignorar (o próprio produto em edição). */
	excludeProductId: z.string({ invalid_type_error: "Tipo inválido para ID do produto." }).optional().nullable(),
	/** Linha de variante a ignorar (a própria variante em edição). */
	excludeVariantId: z.string({ invalid_type_error: "Tipo inválido para ID da variante." }).optional().nullable(),
});
export type TGetProductBarcodeUsageInput = z.infer<typeof GetProductBarcodeUsageInputSchema>;

async function getProductBarcodeUsage({ input, session }: { input: TGetProductBarcodeUsageInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const forms = barcodeLookupForms(input.code);
	if (forms.length === 0) return { data: { usages: [] }, message: "Código sem uso." };

	const productConditions = [eq(products.organizacaoId, orgId), inArray(products.codigoBarras, forms)];
	if (input.excludeProductId) productConditions.push(ne(products.id, input.excludeProductId));
	const variantConditions = [eq(productVariants.organizacaoId, orgId), inArray(productVariants.codigoBarras, forms)];
	if (input.excludeVariantId) variantConditions.push(ne(productVariants.id, input.excludeVariantId));

	const [productRows, variantRows] = await Promise.all([
		db
			.select({ produtoId: products.id, produtoNome: products.nome, codigoBarras: products.codigoBarras, ativo: products.ativo })
			.from(products)
			.where(and(...productConditions))
			.limit(10),
		db
			.select({
				produtoId: products.id,
				produtoNome: products.nome,
				varianteId: productVariants.id,
				varianteNome: productVariants.nome,
				codigoBarras: productVariants.codigoBarras,
				ativo: productVariants.ativo,
			})
			.from(productVariants)
			.innerJoin(products, eq(productVariants.produtoId, products.id))
			.where(and(...variantConditions))
			.limit(10),
	]);

	const usages = [
		...productRows.map((row) => ({ ...row, varianteId: null as string | null, varianteNome: null as string | null })),
		...variantRows,
	];
	return { data: { usages }, message: usages.length === 0 ? "Código sem uso." : "Código já em uso." };
}
export type TGetProductBarcodeUsageOutput = Awaited<ReturnType<typeof getProductBarcodeUsage>>;

async function getProductBarcodeUsageRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = GetProductBarcodeUsageInputSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
	const result = await getProductBarcodeUsage({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getProductBarcodeUsageRoute });

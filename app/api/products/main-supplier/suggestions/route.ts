import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getMainSupplierCandidatesForProduct, getMainSupplierSuggestionsPage } from "@/lib/products/main-supplier";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// Sugestões de fornecedor principal a partir das compras efetivadas. SOMENTE LEITURA:
// quem grava é o PUT de /api/products/main-supplier, disparado pelo usuário.
//  - ?productId=  → candidatos de um produto, do mais sugerido ao menos.
//  - sem productId → produtos sem fornecedor principal com o fornecedor sugerido (paginado).
// ============================================================================

const SUGGESTIONS_PAGE_SIZE = 25;

const GetProductMainSupplierSuggestionsInputSchema = z.object({
	productId: z
		.string({ invalid_type_error: "Tipo inválido para ID do produto." })
		.optional()
		.nullable()
		.transform((v) => v || null),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((v) => (v ? Math.max(1, Number(v) || 1) : 1)),
});
export type TGetProductMainSupplierSuggestionsInput = z.input<typeof GetProductMainSupplierSuggestionsInputSchema>;

async function getProductMainSupplierSuggestions({
	input,
	session,
}: {
	input: z.infer<typeof GetProductMainSupplierSuggestionsInputSchema>;
	session: TAuthUserSession;
}) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (!session.membership?.permissoes.compras.visualizar)
		throw new createHttpError.Unauthorized("Você não possui permissão para acessar o histórico de compras.");

	if (input.productId) {
		const candidates = await getMainSupplierCandidatesForProduct(db, { organizacaoId: userOrgId, productId: input.productId });
		return {
			data: { byProduct: { candidates }, default: null },
			message: "Sugestões de fornecedor principal carregadas.",
		};
	}

	const page = await getMainSupplierSuggestionsPage(db, { organizacaoId: userOrgId, page: input.page, pageSize: SUGGESTIONS_PAGE_SIZE });
	return {
		data: { byProduct: null, default: page },
		message: "Sugestões de fornecedor principal carregadas.",
	};
}
export type TGetProductMainSupplierSuggestionsOutput = Awaited<ReturnType<typeof getProductMainSupplierSuggestions>>;
export type TGetProductMainSupplierSuggestionsOutputByProduct = NonNullable<TGetProductMainSupplierSuggestionsOutput["data"]["byProduct"]>;
export type TGetProductMainSupplierSuggestionsOutputDefault = NonNullable<TGetProductMainSupplierSuggestionsOutput["data"]["default"]>;

async function getProductMainSupplierSuggestionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetProductMainSupplierSuggestionsInputSchema.parse({
		productId: searchParams.get("productId") ?? undefined,
		page: searchParams.get("page") ?? undefined,
	});
	const result = await getProductMainSupplierSuggestions({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getProductMainSupplierSuggestionsRoute });

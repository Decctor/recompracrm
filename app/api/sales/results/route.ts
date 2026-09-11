import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertSellersIdsWithinResultsScope, resolveResultsScopeSellerIds } from "@/lib/permissions/results-scope";
import { getSalesResults } from "@/lib/sales/results";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetSalesResultsInputSchema = z.object({
	after: z
		.string({ required_error: "Período não informado.", invalid_type_error: "Tipo inválido para o início do período." })
		.datetime({ message: "Tipo inválido para o início do período." })
		.transform((v) => new Date(v)),
	before: z
		.string({ required_error: "Período não informado.", invalid_type_error: "Tipo inválido para o fim do período." })
		.datetime({ message: "Tipo inválido para o fim do período." })
		.transform((v) => new Date(v)),
	sellersIds: z
		.string({ invalid_type_error: "Tipo inválido para os IDs dos vendedores." })
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",").filter(Boolean) : [])),
	channels: z
		.string({ invalid_type_error: "Tipo inválido para os canais." })
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",").filter(Boolean) : [])),
	excludedFinancialAccountIds: z
		.string({ invalid_type_error: "Tipo inválido para os IDs das contas financeiras excluídas." })
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",").filter(Boolean) : [])),
});
export type TGetSalesResultsInput = z.infer<typeof GetSalesResultsInputSchema>;

async function getSalesResultsHandler({ input, session }: { input: TGetSalesResultsInput; session: TAuthUserSession }) {
	const membership = session.membership;
	if (!membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (!membership.permissoes.resultados.visualizar) throw new createHttpError.Forbidden("Você não possui permissão para visualizar resultados.");

	const organizacaoId = membership.organizacao.id;
	const resultsScope = membership.permissoes.resultados.escopo;

	// Com escopo, um filtro vazio significa "todos" — o escopo vira o filtro, em vez de recusar.
	const scopeSellerIds = await resolveResultsScopeSellerIds({ organizacaoId, resultsScope });
	const sellersIds = scopeSellerIds && input.sellersIds.length === 0 ? scopeSellerIds : input.sellersIds;
	await assertSellersIdsWithinResultsScope({ organizacaoId, resultsScope, sellersIds });

	const results = await getSalesResults({
		filters: {
			organizacaoId,
			after: input.after,
			before: input.before,
			sellersIds,
			channels: input.channels,
			excludedFinancialAccountIds: input.excludedFinancialAccountIds,
		},
		includeSensitive: membership.permissoes.resultados.visualizarSensiveis,
	});

	return { data: results, message: "Resultados de vendas calculados com sucesso." };
}
export type TGetSalesResultsOutput = Awaited<ReturnType<typeof getSalesResultsHandler>>;

async function getSalesResultsRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const searchParams = request.nextUrl.searchParams;
	const input = GetSalesResultsInputSchema.parse({
		after: searchParams.get("after"),
		before: searchParams.get("before"),
		sellersIds: searchParams.get("sellersIds"),
		channels: searchParams.get("channels"),
		excludedFinancialAccountIds: searchParams.get("excludedFinancialAccountIds"),
	});
	const result = await getSalesResultsHandler({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSalesResultsRoute });

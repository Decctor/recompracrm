import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { appApiHandler } from "@/lib/app-api";
import { resolveResultsScopeSellerIds } from "@/lib/permissions/results-scope";
import { getSalesComparisonStats } from "@/lib/sales/comparison-stats";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

function dateParam(label: string) {
	return z
		.string({ required_error: `${label} não informado.`, invalid_type_error: `Tipo inválido para ${label.toLowerCase()}.` })
		.datetime({ message: `Tipo inválido para ${label.toLowerCase()}.` })
		.transform((v) => new Date(v));
}

function idListParam(label: string) {
	return z
		.string({ invalid_type_error: `Tipo inválido para ${label}.` })
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",").filter(Boolean) : []));
}

function numberParam(label: string) {
	return z
		.string({ invalid_type_error: `Tipo inválido para ${label}.` })
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : null))
		.refine((v) => v === null || Number.isFinite(v), { message: `Tipo inválido para ${label}.` });
}

const GetSalesComparisonInputSchema = z
	.object({
		baseAfter: dateParam("Início do período"),
		baseBefore: dateParam("Fim do período"),
		compareAfter: dateParam("Início do período de comparação"),
		compareBefore: dateParam("Fim do período de comparação"),
		sellersIds: idListParam("vendedores"),
		integrationsIds: idListParam("integrações"),
		clientRFMTitles: idListParam("títulos RFM"),
		excludedSalesIds: idListParam("vendas excluídas"),
		totalMin: numberParam("valor mínimo"),
		totalMax: numberParam("valor máximo"),
	})
	.refine((v) => v.baseAfter <= v.baseBefore, { message: "O período começa depois de terminar." })
	.refine((v) => v.compareAfter <= v.compareBefore, { message: "O período de comparação começa depois de terminar." });
export type TGetSalesComparisonInput = z.infer<typeof GetSalesComparisonInputSchema>;

async function getSalesComparison({
	input,
	organizacaoId,
	scopeSellerIds,
	canViewSensitive,
}: {
	input: TGetSalesComparisonInput;
	organizacaoId: string;
	scopeSellerIds: string[] | null;
	canViewSensitive: boolean;
}) {
	// Com escopo, o filtro de vendedores nunca sai dele: um filtro vazio vira o escopo inteiro, e um
	// filtro com ids de fora é reduzido ao que o membro pode ver.
	const sellersIds = scopeSellerIds
		? input.sellersIds.length > 0
			? input.sellersIds.filter((id) => scopeSellerIds.includes(id))
			: scopeSellerIds
		: input.sellersIds;
	if (scopeSellerIds && sellersIds.length === 0) throw new createHttpError.Unauthorized("Você não tem permissão para acessar esse recurso.");

	const data = await getSalesComparisonStats({
		organizacaoId,
		filters: {
			sellersIds,
			integrationsIds: input.integrationsIds,
			clientRFMTitles: input.clientRFMTitles,
			excludedSalesIds: input.excludedSalesIds,
			total: { min: input.totalMin, max: input.totalMax },
		},
		base: { after: input.baseAfter, before: input.baseBefore },
		comparacao: { after: input.compareAfter, before: input.compareBefore },
		canViewSensitive,
	});
	return { data, message: "Comparativo de períodos calculado com sucesso." };
}
export type TGetSalesComparisonOutput = Awaited<ReturnType<typeof getSalesComparison>>;

async function getSalesComparisonRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const membership = session.membership;
	const organizacaoId = membership?.organizacao.id;
	if (!membership || !organizacaoId)
		throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const params = request.nextUrl.searchParams;
	const input = GetSalesComparisonInputSchema.parse({
		baseAfter: params.get("baseAfter"),
		baseBefore: params.get("baseBefore"),
		compareAfter: params.get("compareAfter"),
		compareBefore: params.get("compareBefore"),
		sellersIds: params.get("sellersIds"),
		integrationsIds: params.get("integrationsIds"),
		clientRFMTitles: params.get("clientRFMTitles"),
		excludedSalesIds: params.get("excludedSalesIds"),
		totalMin: params.get("totalMin"),
		totalMax: params.get("totalMax"),
	});

	const scopeSellerIds = await resolveResultsScopeSellerIds({ organizacaoId, resultsScope: membership.permissoes.resultados.escopo });

	const result = await getSalesComparison({
		input,
		organizacaoId,
		scopeSellerIds,
		canViewSensitive: membership.permissoes.resultados.visualizarSensiveis,
	});
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSalesComparisonRoute });

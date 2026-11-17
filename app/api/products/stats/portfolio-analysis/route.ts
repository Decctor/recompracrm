import { canViewCosts } from "@/lib/permissions/sensitive-data";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getPortfolioAnalysis, type TGetPortfolioAnalysisResult } from "@/lib/products/portfolio-analysis";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetProductsPortfolioAnalysisInputSchema = z.object({
	periodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.datetime({ message: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
});

export type TGetProductsPortfolioAnalysisInput = z.infer<typeof GetProductsPortfolioAnalysisInputSchema>;

async function getProductsPortfolioAnalysisRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const input = GetProductsPortfolioAnalysisInputSchema.parse({
		periodAfter: request.nextUrl.searchParams.get("periodAfter"),
		periodBefore: request.nextUrl.searchParams.get("periodBefore"),
	});

	const data = await getPortfolioAnalysis({ input, organizationId: userOrgId, canViewCosts: canViewCosts(session.membership?.permissoes) });

	return NextResponse.json({
		data,
		message: "Análise do portfólio calculada com sucesso.",
	});
}

export type TGetProductsPortfolioAnalysisOutput = {
	data: TGetPortfolioAnalysisResult;
	message: string;
};

export const GET = appApiHandler({ GET: getProductsPortfolioAnalysisRoute });

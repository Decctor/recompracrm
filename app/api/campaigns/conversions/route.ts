import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { db } from "@/services/drizzle";
import { campaignConversions, campaigns, clients } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const conversionTypeFilterSchema = z.enum(["AQUISICAO", "REATIVACAO", "ACELERACAO", "REGULAR", "ATRASADA"]);

const GetCampaignConversionsInputSchema = z.object({
	campaignId: z.string({ invalid_type_error: "Tipo não válido para ID da campanha." }).optional().nullable(),
	page: z
		.string({ invalid_type_error: "Tipo não válido para paginação." })
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : 1)),
	search: z.string({ invalid_type_error: "Tipo não válido para busca." }).optional().nullable(),
	types: z
		.string({ invalid_type_error: "Tipo não válido para tipos de conversão." })
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : []))
		.pipe(z.array(conversionTypeFilterSchema)),
	periodAfter: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).startOf("day").toDate() : undefined)),
	periodBefore: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).endOf("day").toDate() : undefined)),
});
export type TGetCampaignConversionsInput = z.infer<typeof GetCampaignConversionsInputSchema>;

const PAGE_SIZE = 25;

async function getCampaignConversions({
	input,
	session,
}: {
	input: TGetCampaignConversionsInput;
	session: TAuthUserSession;
}) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const safePage = Number.isFinite(input.page) && input.page > 0 ? input.page : 1;
	const skip = PAGE_SIZE * (safePage - 1);

	const baseConditions = [eq(campaignConversions.organizacaoId, userOrgId)];

	if (input.campaignId) baseConditions.push(eq(campaignConversions.campanhaId, input.campaignId));
	if (input.periodAfter) baseConditions.push(gte(campaignConversions.dataConversao, input.periodAfter));
	if (input.periodBefore) baseConditions.push(lte(campaignConversions.dataConversao, input.periodBefore));

	if (input.types && input.types.length > 0) {
		baseConditions.push(inArray(campaignConversions.tipoConversao, input.types));
	}

	// Search by client name
	if (input.search && input.search.trim().length > 0) {
		baseConditions.push(
			inArray(
				campaignConversions.clienteId,
				db
					.select({ id: clients.id })
					.from(clients)
					.where(and(eq(clients.organizacaoId, userOrgId), createSimplifiedSearchCondition(clients.nome, input.search))),
			),
		);
	}

	const [{ conversionsMatched }] = await db
		.select({ conversionsMatched: count() })
		.from(campaignConversions)
		.where(and(...baseConditions));

	const totalPages = Math.ceil(conversionsMatched / PAGE_SIZE);

	if (conversionsMatched === 0) {
		return {
			data: { items: [], conversionsMatched, totalPages },
			message: "Conversões da campanha recuperadas com sucesso.",
		};
	}

	const pageRows = await db
		.select({ id: campaignConversions.id })
		.from(campaignConversions)
		.where(and(...baseConditions))
		.orderBy(desc(campaignConversions.dataConversao), asc(campaignConversions.id))
		.offset(skip)
		.limit(PAGE_SIZE);

	const conversionIds = pageRows.map((r) => r.id);

	const conversionsResult = await db.query.campaignConversions.findMany({
		where: inArray(campaignConversions.id, conversionIds),
		columns: {
			id: true,
			clienteId: true,
			vendaValor: true,
			atribuicaoReceita: true,
			tipoConversao: true,
			tempoParaConversaoMinutos: true,
			dataConversao: true,
			dataInteracao: true,
			deltaFrequencia: true,
			deltaMonetarioPercentual: true,
			diasDesdeUltimaCompra: true,
		},
		with: {
			cliente: {
				columns: { id: true, nome: true },
			},
		},
	});

	const conversionsMap = new Map(conversionsResult.map((c) => [c.id, c]));
	const orderedItems = conversionIds.map((id) => conversionsMap.get(id)).filter((c): c is NonNullable<typeof c> => !!c);

	return {
		data: { items: orderedItems, conversionsMatched, totalPages },
		message: "Conversões da campanha recuperadas com sucesso.",
	};
}

export type TGetCampaignConversionsOutput = Awaited<ReturnType<typeof getCampaignConversions>>;
export type TGetCampaignConversionsOutputItems = TGetCampaignConversionsOutput["data"]["items"];

const getCampaignConversionsRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetCampaignConversionsInputSchema.parse({
		campaignId: searchParams.get("campaignId") ?? undefined,
		page: searchParams.get("page") ?? undefined,
		search: searchParams.get("search") ?? undefined,
		type: searchParams.get("type") ?? undefined,
		periodAfter: searchParams.get("periodAfter") ?? undefined,
		periodBefore: searchParams.get("periodBefore") ?? undefined,
	});

	const result = await getCampaignConversions({ input, session });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getCampaignConversionsRoute,
});

import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema/clients";
import { interactions } from "@/services/drizzle/schema/interactions";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const interactionExecutionStatusSchema = z.enum(["AGENDADA", "EXECUTADA"]);
const orderByFieldSchema = z.enum(["agendamentoData", "dataExecucao", "dataEnvio"]);
const orderByDirectionSchema = z.enum(["asc", "desc"]);

const GetCampaignInteractionsInputSchema = z.object({
	page: z
		.string({
			invalid_type_error: "Tipo não válido para páginação.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? Number(val) : 1)),
	search: z
		.string({
			invalid_type_error: "Tipo não válido para busca.",
		})
		.optional()
		.nullable(),
	status: z
		.string({
			invalid_type_error: "Tipo não válido para status.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : []))
		.pipe(z.array(interactionExecutionStatusSchema)),
	orderByField: orderByFieldSchema.optional().nullable(),
	orderByDirection: orderByDirectionSchema.optional().nullable(),
});
export type TGetCampaignInteractionsInput = z.infer<typeof GetCampaignInteractionsInputSchema>;

async function getCampaignInteractions({ input, session }: { input: TGetCampaignInteractionsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const PAGE_SIZE = 25;
	const safePage = Number.isFinite(input.page) && input.page > 0 ? input.page : 1;
	const skip = PAGE_SIZE * (safePage - 1);
	const conditions = [eq(interactions.organizacaoId, userOrgId), isNotNull(interactions.campanhaId)];

	if (input.search && input.search.trim().length > 0) {
		const search = input.search.trim();
		const clientIdsByNameSubquery = db
			.select({ id: clients.id })
			.from(clients)
			.where(
				and(
					eq(clients.organizacaoId, userOrgId),
					sql`(to_tsvector('portuguese', ${clients.nome}) @@ plainto_tsquery('portuguese', ${search}) OR ${clients.nome} ILIKE '%' || ${search} || '%')`,
				),
			);

		conditions.push(
			or(
				sql`(to_tsvector('portuguese', ${interactions.titulo}) @@ plainto_tsquery('portuguese', ${search}) OR ${interactions.titulo} ILIKE '%' || ${search} || '%')`,
				sql`(to_tsvector('portuguese', ${interactions.descricao}) @@ plainto_tsquery('portuguese', ${search}) OR ${interactions.descricao} ILIKE '%' || ${search} || '%')`,
				inArray(interactions.clienteId, clientIdsByNameSubquery),
			) ?? sql`true`,
		);
	}

	if (input.status && input.status.length > 0) {
		const filterIncludesScheduled = input.status.includes("AGENDADA");
		const filterIncludesExecuted = input.status.includes("EXECUTADA");

		// No-op when both statuses are selected, otherwise apply the selected subset.
		if (!(filterIncludesScheduled && filterIncludesExecuted)) {
			if (filterIncludesScheduled) conditions.push(isNull(interactions.dataExecucao));
			if (filterIncludesExecuted) conditions.push(isNotNull(interactions.dataExecucao));
		}
	}

	const [{ interactionsMatched }] = await db
		.select({ interactionsMatched: count() })
		.from(interactions)
		.where(and(...conditions));

	const totalPages = Math.ceil(interactionsMatched / PAGE_SIZE);
	if (interactionsMatched === 0) {
		return {
			data: {
				items: [],
				interactionsMatched,
				totalPages,
			},
		};
	}

	const direction = input.orderByDirection === "asc" ? asc : desc;
	let orderByClause = desc(interactions.dataInsercao);
	switch (input.orderByField) {
		case "agendamentoData":
			orderByClause = direction(
				sql`COALESCE((${interactions.agendamentoDataReferencia} || ' ' || COALESCE(${interactions.agendamentoBlocoReferencia}::text, '00:00')), '1900-01-01 00:00')`,
			);
			break;
		case "dataExecucao":
			orderByClause = direction(sql`COALESCE(${interactions.dataExecucao}, '1900-01-01'::timestamp)`);
			break;
		case "dataEnvio":
			orderByClause = direction(sql`COALESCE(${interactions.dataEnvio}, '1900-01-01'::timestamp)`);
			break;
		default:
			orderByClause = desc(interactions.dataInsercao);
			break;
	}

	const pageRows = await db
		.select({ id: interactions.id })
		.from(interactions)
		.where(and(...conditions))
		.orderBy(orderByClause, desc(interactions.dataInsercao))
		.offset(skip)
		.limit(PAGE_SIZE);

	const interactionIds = pageRows.map((row) => row.id);
	if (interactionIds.length === 0) {
		return {
			data: {
				items: [],
				interactionsMatched,
				totalPages,
			},
		};
	}

	const interactionsResult = await db.query.interactions.findMany({
		where: inArray(interactions.id, interactionIds),
		columns: {
			id: true,
			clienteId: true,
			campanhaId: true,
			titulo: true,
			descricao: true,
			agendamentoDataReferencia: true,
			agendamentoBlocoReferencia: true,
			dataInsercao: true,
			dataExecucao: true,
			dataEnvio: true,
			statusEnvio: true,
			erroEnvio: true,
		},
		with: {
			campanha: {
				columns: {
					id: true,
					titulo: true,
				},
			},
			cliente: {
				columns: {
					id: true,
					nome: true,
				},
			},
		},
	});

	const interactionsMap = new Map(interactionsResult.map((interaction) => [interaction.id, interaction]));
	const orderedItems = interactionIds
		.map((id) => interactionsMap.get(id))
		.filter((interaction): interaction is NonNullable<typeof interaction> => !!interaction);

	return {
		data: {
			items: orderedItems,
			interactionsMatched,
			totalPages,
		},
	};
}

export type TGetCampaignInteractionsOutput = Awaited<ReturnType<typeof getCampaignInteractions>>;
export type TGetCampaignInteractionsOutputItems = TGetCampaignInteractionsOutput["data"]["items"];

const getCampaignInteractionsRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetCampaignInteractionsInputSchema.parse({
		page: searchParams.get("page") ?? undefined,
		search: searchParams.get("search") ?? undefined,
		status: searchParams.get("status") ?? undefined,
		orderByField: searchParams.get("orderByField") ?? undefined,
		orderByDirection: searchParams.get("orderByDirection") ?? undefined,
	});
	const result = await getCampaignInteractions({ input, session });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getCampaignInteractionsRoute,
});

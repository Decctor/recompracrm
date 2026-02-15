import { apiHandler } from "@/lib/api";
import { getCurrentSessionUncached } from "@/lib/authentication/pages-session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatPhoneAsBase } from "@/lib/formatting";
import { createSimplifiedEmailSearchCondition, createSimplifiedPhoneSearchCondition, createSimplifiedSearchCondition } from "@/lib/search";
import { ClientSchema } from "@/schemas/clients";
import { db } from "@/services/drizzle";
import { clients, sales } from "@/services/drizzle/schema";
import { and, asc, count, desc, eq, gte, inArray, lte, max, min, notInArray, or, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import type { NextApiHandler } from "next";
import z from "zod";

const GetClientsInputSchema = z.object({
	// By ID params
	id: z
		.string({
			invalid_type_error: "Tipo não válido para ID do cliente.",
		})
		.optional()
		.nullable(),
	// General params
	page: z
		.string({
			invalid_type_error: "Tipo não válido para páginação.",
			required_error: "Páginação não informada.",
		})
		.transform((val) => Number(val)),
	search: z
		.string({
			invalid_type_error: "Tipo não válido para busca.",
		})
		.optional()
		.nullable(),
	acquisitionChannels: z
		.string({
			invalid_type_error: "Tipo não válido para canal de aquisição.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : [])),
	segmentationTitles: z
		.string({
			invalid_type_error: "Tipo não válido para título de segmentação.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : [])),
	statsPeriodAfter: z
		.string({
			invalid_type_error: "Tipo não válido para data de inserção do cliente.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	statsPeriodBefore: z
		.string({
			invalid_type_error: "Tipo não válido para data de inserção do cliente.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	statsSaleNatures: z
		.string({
			invalid_type_error: "Tipo não válido para natureza de venda.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : [])),
	statsExcludedSalesIds: z
		.string({
			invalid_type_error: "Tipo não válido para ID da venda.",
		})
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : [])),
	orderByField: z.enum(["nome", "comprasValorTotal", "comprasQtdeTotal", "primeiraCompraData", "ultimaCompraData"]).optional().nullable(),
	orderByDirection: z.enum(["asc", "desc"]).optional().nullable(),
});
export type TGetClientsInput = z.infer<typeof GetClientsInputSchema>;

async function getClients({ input, session }: { input: TGetClientsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if ("id" in input) {
		const clientId = input.id;
		if (!clientId) throw new createHttpError.BadRequest("ID do cliente não informado.");

		const client = await db.query.clients.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, clientId), eq(fields.organizacaoId, userOrgId)),
		});
		if (!client) throw new createHttpError.NotFound("Cliente não encontrado.");
		return {
			data: {
				byId: client,
				default: null,
			},
			message: "Cliente encontrado com sucesso.",
		};
	}

	// First, we start fetching clients with their purchases...
	const clientConditions = [eq(clients.organizacaoId, userOrgId)];

	if (input.search && input.search.trim().length > 0) {
		const searchCondition = or(
			createSimplifiedSearchCondition(clients.nome, input.search),
			createSimplifiedPhoneSearchCondition(clients.telefoneBase, input.search),
			createSimplifiedEmailSearchCondition(clients.email, input.search),
		);
		console.log("SEARCH CONDITION APPIED");
		if (searchCondition) {
			clientConditions.push(searchCondition);
		}
	}
	if (input.acquisitionChannels && input.acquisitionChannels.length > 0) {
		console.log("ACQUISITION CHANNELS CONDITION APPIED");
		clientConditions.push(inArray(clients.canalAquisicao, input.acquisitionChannels));
	}
	if (input.segmentationTitles && input.segmentationTitles.length > 0) {
		console.log("SEGMENTATION TITLES CONDITION APPIED");
		clientConditions.push(inArray(clients.analiseRFMTitulo, input.segmentationTitles));
	}
	const PAGE_SIZE = 25;
	const skip = PAGE_SIZE * (input.page - 1);

	const [{ clientsMatched }] = await db
		.select({
			clientsMatched: count(),
		})
		.from(clients)
		.where(and(...clientConditions));

	const totalPages = Math.ceil(clientsMatched / PAGE_SIZE);
	if (clientsMatched === 0) {
		return {
			data: {
				byId: undefined,
				default: {
					clients: [],
					clientsMatched,
					totalPages,
				},
			},
		};
	}
	console.log("CONDITIONS:", clientConditions.length);

	const statsConditions = [eq(sales.organizacaoId, userOrgId)];
	if (input.statsPeriodAfter) statsConditions.push(gte(sales.dataVenda, input.statsPeriodAfter));
	if (input.statsPeriodBefore) statsConditions.push(lte(sales.dataVenda, input.statsPeriodBefore));
	if (input.statsSaleNatures && input.statsSaleNatures.length > 0) statsConditions.push(inArray(sales.natureza, input.statsSaleNatures));
	if (input.statsExcludedSalesIds && input.statsExcludedSalesIds.length > 0) statsConditions.push(notInArray(sales.id, input.statsExcludedSalesIds));

	const statsByClientSubquery = db
		.select({
			clientId: sales.clienteId,
			totalPurchasesValue: sum(sales.valorTotal).as("totalPurchasesValue"),
			totalPurchasesQty: count(sales.id).as("totalPurchasesQty"),
			firstPurchaseDate: min(sales.dataVenda).as("firstPurchaseDate"),
			lastPurchaseDate: max(sales.dataVenda).as("lastPurchaseDate"),
		})
		.from(sales)
		.where(and(...statsConditions))
		.groupBy(sales.clienteId)
		.as("stats_by_client");

	const direction = input.orderByDirection === "desc" ? desc : asc;
	let orderByClause = asc(clients.nome);
	switch (input.orderByField) {
		case "nome":
			orderByClause = direction(clients.nome);
			break;
		case "comprasValorTotal":
			orderByClause = direction(sql`COALESCE(${statsByClientSubquery.totalPurchasesValue}, 0)`);
			break;
		case "comprasQtdeTotal":
			orderByClause = direction(sql`COALESCE(${statsByClientSubquery.totalPurchasesQty}, 0)`);
			break;
		case "primeiraCompraData":
			orderByClause = direction(sql`COALESCE(${statsByClientSubquery.firstPurchaseDate}, '1900-01-01'::timestamp)`);
			break;
		case "ultimaCompraData":
			orderByClause = direction(sql`COALESCE(${statsByClientSubquery.lastPurchaseDate}, '1900-01-01'::timestamp)`);
			break;
		default:
			orderByClause = asc(clients.nome);
			break;
	}

	const paginatedClientsWithStats = await db
		.select({
			clientId: clients.id,
			totalPurchasesValue: sql<number>`COALESCE(${statsByClientSubquery.totalPurchasesValue}, 0)`,
			totalPurchasesQty: sql<number>`COALESCE(${statsByClientSubquery.totalPurchasesQty}, 0)`,
			firstPurchaseDate: statsByClientSubquery.firstPurchaseDate,
			lastPurchaseDate: statsByClientSubquery.lastPurchaseDate,
		})
		.from(clients)
		.leftJoin(statsByClientSubquery, eq(clients.id, statsByClientSubquery.clientId))
		.where(and(...clientConditions))
		.orderBy(orderByClause, asc(clients.nome))
		.offset(skip)
		.limit(PAGE_SIZE);

	const clientIds = paginatedClientsWithStats.map((client) => client.clientId);
	if (clientIds.length === 0) {
		return {
			data: {
				byId: undefined,
				default: {
					clients: [],
					clientsMatched,
					totalPages,
				},
			},
		};
	}

	const clientsResult = await db.query.clients.findMany({
		where: inArray(clients.id, clientIds),
		with: {
			saldos: true,
		},
	});

	const clientsMap = new Map(clientsResult.map((client) => [client.id, client]));
	const statsMap = new Map(paginatedClientsWithStats.map((client) => [client.clientId, client]));

	const clientsWithStats = clientIds
		.map((clientId) => {
			const client = clientsMap.get(clientId);
			const stats = statsMap.get(clientId);
			if (!client) return null;

			return {
				...client,
				estatisticas: {
					comprasValorTotal: stats?.totalPurchasesValue ? Number(stats.totalPurchasesValue) : 0,
					comprasQtdeTotal: stats?.totalPurchasesQty ? Number(stats.totalPurchasesQty) : 0,
					primeiraCompraData: stats?.firstPurchaseDate ? stats.firstPurchaseDate : null,
					ultimaCompraData: stats?.lastPurchaseDate ? stats.lastPurchaseDate : null,
				},
			};
		})
		.filter((client): client is NonNullable<typeof client> => !!client);
	return {
		data: {
			byId: undefined,
			default: {
				clients: clientsWithStats,
				clientsMatched,
				totalPages,
			},
		},
	};
}
export type TGetClientsOutput = Awaited<ReturnType<typeof getClients>>;
export type TGetClientsOutputDefault = Exclude<TGetClientsOutput["data"]["default"], null>;
export type TGetClientsOutputById = Exclude<TGetClientsOutput["data"]["byId"], null>;

const getClientsRoute: NextApiHandler<TGetClientsOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached(req.cookies);

	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	// if (!session.user.permissoes.parceiros.criar) throw new createHttpError.BadRequest("Você não possui permissão para acessar esse recurso.");
	const input = GetClientsInputSchema.parse(req.query);
	const result = await getClients({ input, session: sessionUser });
	return res.status(200).json(result);
};

type PostResponse = {
	data: { insertedId: string };
	message: string;
};

const createClientRoute: NextApiHandler<PostResponse> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached(req.cookies);
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const client = ClientSchema.parse(req.body);

	const insertResponse = await db
		.insert(clients)
		.values({
			...client,
			organizacaoId: userOrgId,
			telefone: client.telefone ?? "",
			telefoneBase: formatPhoneAsBase(client.telefone ?? ""),
		})
		.returning({ id: clients.id });
	const insertedId = insertResponse[0]?.id;
	if (!insertedId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar cliente.");

	return res.status(201).json({ data: { insertedId }, message: "Cliente criado com sucesso." });
};
export default apiHandler({ POST: createClientRoute, GET: getClientsRoute });

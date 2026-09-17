import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { createEventCampaignDispatch, publishEventDispatches } from "@/lib/campaigns/engine";
import { InteractionContextMetadataSchema, InteractionsStatusEnum } from "@/schemas/interactions";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema/clients";
import { interactions } from "@/services/drizzle/schema/interactions";
import { products } from "@/services/drizzle/schema/products";
import { and, asc, count, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const orderByFieldSchema = z.enum(["dataExecucao", "dataEnvio"]);
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
		.pipe(z.array(InteractionsStatusEnum)),
	orderByField: orderByFieldSchema.optional().nullable(),
	orderByDirection: orderByDirectionSchema.optional().nullable(),
	campanhaId: z.string().optional().nullable(),
});
export type TGetCampaignInteractionsInput = z.infer<typeof GetCampaignInteractionsInputSchema>;

async function getCampaignInteractions({ input, session }: { input: TGetCampaignInteractionsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const PAGE_SIZE = 25;
	const safePage = Number.isFinite(input.page) && input.page > 0 ? input.page : 1;
	const skip = PAGE_SIZE * (safePage - 1);
	const conditions = [
		eq(interactions.organizacaoId, userOrgId),
		isNotNull(interactions.campanhaId),
		...(input.campanhaId ? [eq(interactions.campanhaId, input.campanhaId)] : []),
	];

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
		conditions.push(inArray(interactions.statusEnvio, input.status));
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
			dataInsercao: true,
			dataExecucao: true,
			dataEnvio: true,
			statusEnvio: true,
			erroEnvio: true,
			metadados: true,
		},
		with: {
			campanha: {
				columns: {
					id: true,
					titulo: true,
				},
				with: {
					whatsappTemplate: {
						columns: {
							id: true,
							conteudo: true,
						},
					},
				},
			},
			cliente: {
				columns: {
					id: true,
					nome: true,
					telefone: true,
					email: true,
					analiseRFMTitulo: true,
					metadataGrupoProdutoMaisComprado: true,
					metadataProdutoMaisCompradoId: true,
					metadataProdutoSugeridoId: true,
				},
			},
		},
	});

	const productIds = new Set<string>();
	for (const interaction of interactionsResult) {
		if (interaction.cliente.metadataProdutoMaisCompradoId) productIds.add(interaction.cliente.metadataProdutoMaisCompradoId);
		if (interaction.cliente.metadataProdutoSugeridoId) productIds.add(interaction.cliente.metadataProdutoSugeridoId);
	}

	const resolvedProducts =
		productIds.size > 0
			? await db.query.products.findMany({
					where: inArray(products.id, [...productIds]),
					columns: { id: true, nome: true },
				})
			: [];
	const productNameById = new Map(resolvedProducts.map((product) => [product.id, product.nome]));

	const enrichedInteractions = interactionsResult.map((interaction) => {
		const { metadataProdutoMaisCompradoId, metadataProdutoSugeridoId, ...clientColumns } = interaction.cliente;

		return {
			...interaction,
			cliente: {
				...clientColumns,
				metadataProdutoMaisCompradoNome: metadataProdutoMaisCompradoId ? (productNameById.get(metadataProdutoMaisCompradoId) ?? null) : null,
				metadataProdutoSugeridoNome: metadataProdutoSugeridoId ? (productNameById.get(metadataProdutoSugeridoId) ?? null) : null,
			},
		};
	});

	const interactionsMap = new Map(enrichedInteractions.map((interaction) => [interaction.id, interaction]));
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

const RetryCampaignInteractionInputSchema = z.object({
	interactionId: z.string({
		required_error: "ID da interação não informado.",
		invalid_type_error: "Tipo não válido para o ID da interação.",
	}),
});
export type TRetryCampaignInteractionInput = z.infer<typeof RetryCampaignInteractionInputSchema>;

async function retryCampaignInteraction({ input, session }: { input: TRetryCampaignInteractionInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const interaction = await db.query.interactions.findFirst({
		where: (fields, { and: andFilter, eq: eqFilter, isNotNull: isNotNullFilter }) =>
			andFilter(eqFilter(fields.id, input.interactionId), eqFilter(fields.organizacaoId, userOrgId), isNotNullFilter(fields.campanhaId)),
		columns: { id: true, clienteId: true, campanhaId: true, metadados: true, statusEnvio: true, descricao: true },
		with: { campanha: true },
	});

	if (!interaction) throw new createHttpError.NotFound("Interação não encontrada.");
	if (!interaction.campanha) throw new createHttpError.BadRequest("Campanha da interação não encontrada.");
	if (!interaction.campanha.ativo) throw new createHttpError.BadRequest("Ative a campanha antes de reenviar essa interação.");
	if (interaction.statusEnvio !== "FALHOU") {
		throw new createHttpError.BadRequest("Apenas interações cujo envio falhou podem ser reenviadas manualmente.");
	}

	// O reenvio é um novo disparo de evento com o mesmo contexto congelado na interação original:
	// passa pelo mesmo pipeline (quota, registro, bônus) que qualquer envio.
	const contexto = InteractionContextMetadataSchema.safeParse(interaction.metadados ?? {});
	const dispatch = await db.transaction((tx) =>
		createEventCampaignDispatch({
			tx,
			organizationId: userOrgId,
			campaign: interaction.campanha!,
			janelaReferencia: `reenvio:${interaction.id}:${Date.now()}`,
			scheduledAt: null,
			recipients: [{ clienteId: interaction.clienteId, contexto: contexto.success ? contexto.data : null, descricao: interaction.descricao }],
		}),
	);
	await publishEventDispatches([dispatch]);

	return {
		data: { interactionId: interaction.id, dispatchId: dispatch.dispatchId, reenviada: dispatch.inserted > 0 },
		message: dispatch.inserted > 0 ? "Reenvio enfileirado com sucesso." : "Não foi possível enfileirar o reenvio dessa interação.",
	};
}
export type TRetryCampaignInteractionOutput = Awaited<ReturnType<typeof retryCampaignInteraction>>;

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
		campanhaId: searchParams.get("campanhaId") ?? undefined,
	});
	const result = await getCampaignInteractions({ input, session });
	return NextResponse.json(result, { status: 200 });
};

const retryCampaignInteractionRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const body = await request.json();
	const input = RetryCampaignInteractionInputSchema.parse(body);
	const result = await retryCampaignInteraction({ input, session });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getCampaignInteractionsRoute,
});

export const POST = appApiHandler({
	POST: retryCampaignInteractionRoute,
});

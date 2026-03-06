import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { processSingleInteractionImmediately } from "@/lib/interactions";
import type { TInteractionContextMetadados } from "@/lib/whatsapp/template-variables";
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
		where: (fields, { and, eq, isNotNull }) =>
			and(eq(fields.id, input.interactionId), eq(fields.organizacaoId, userOrgId), isNotNull(fields.campanhaId)),
		columns: {
			id: true,
			clienteId: true,
			metadados: true,
			dataExecucao: true,
			statusEnvio: true,
			erroEnvio: true,
		},
		with: {
			cliente: {
				columns: {
					id: true,
					nome: true,
					telefone: true,
					email: true,
					analiseRFMTitulo: true,
					metadataProdutoMaisCompradoId: true,
					metadataGrupoProdutoMaisComprado: true,
				},
			},
			campanha: {
				columns: {
					autorId: true,
					whatsappConexaoTelefoneId: true,
				},
				with: {
					whatsappTemplate: true,
					whatsappConexaoTelefone: {
						with: {
							conexao: {
								columns: {
									tipoConexao: true,
									token: true,
									gatewaySessaoId: true,
								},
							},
						},
					},
				},
			},
		},
	});

	if (!interaction) throw new createHttpError.NotFound("Interação não encontrada.");
	if (!interaction.campanha) throw new createHttpError.BadRequest("Campanha da interação não encontrada.");
	if (!interaction.campanha.whatsappTemplate) throw new createHttpError.BadRequest("Template do WhatsApp da campanha não encontrado.");
	const campaignAuthorId = interaction.campanha.autorId;
	if (!campaignAuthorId) throw new createHttpError.BadRequest("Autor da campanha não encontrado para reenviar essa interação.");
	const campaignWhatsappConnectionPhoneId = interaction.campanha.whatsappConexaoTelefoneId;
	if (!campaignWhatsappConnectionPhoneId) {
		throw new createHttpError.BadRequest("Telefone de conexão do WhatsApp não encontrado para essa campanha.");
	}
	if (interaction.dataExecucao) throw new createHttpError.BadRequest("Essa interação já foi executada e não pode ser reenviada manualmente.");
	if (interaction.statusEnvio !== "FALHOU" && !interaction.erroEnvio) {
		throw new createHttpError.BadRequest("Apenas interações com falha podem ser reenviadas manualmente.");
	}

	const whatsappConnection = interaction.campanha.whatsappConexaoTelefone?.conexao;
	if (!whatsappConnection) {
		throw new createHttpError.BadRequest("Conexão de WhatsApp não encontrada para essa interação.");
	}

	const processingResult = await processSingleInteractionImmediately({
		interactionId: interaction.id,
		organizationId: userOrgId,
		client: {
			id: interaction.cliente.id,
			nome: interaction.cliente.nome,
			telefone: interaction.cliente.telefone,
			email: interaction.cliente.email,
			analiseRFMTitulo: interaction.cliente.analiseRFMTitulo,
			metadataProdutoMaisCompradoId: interaction.cliente.metadataProdutoMaisCompradoId,
			metadataGrupoProdutoMaisComprado: interaction.cliente.metadataGrupoProdutoMaisComprado,
		},
		campaign: {
			autorId: campaignAuthorId,
			whatsappConexaoTelefoneId: campaignWhatsappConnectionPhoneId,
			whatsappTemplate: interaction.campanha.whatsappTemplate,
		},
		whatsappToken: whatsappConnection.tipoConexao === "META_CLOUD_API" ? (whatsappConnection.token ?? undefined) : undefined,
		whatsappSessionId: whatsappConnection.tipoConexao === "INTERNAL_GATEWAY" ? (whatsappConnection.gatewaySessaoId ?? undefined) : undefined,
		contextMetadados: (interaction.metadados ?? undefined) as TInteractionContextMetadados | undefined,
	});

	if (!processingResult.success) {
		throw new createHttpError.BadRequest(processingResult.error ?? "Não foi possível reenviar essa interação.");
	}

	return {
		data: {
			interactionId: interaction.id,
		},
		message: "Interação reenviada com sucesso.",
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

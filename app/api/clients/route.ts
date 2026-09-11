import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { INTERACTIONS_CRON_TIMEZONE } from "@/lib/campaigns/time-blocks";
import dayjs from "dayjs";
import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import { formatPhoneAsBase } from "@/lib/formatting";
import { createSimplifiedEmailSearchCondition, createSimplifiedPhoneSearchCondition, createSimplifiedSearchCondition } from "@/lib/search";
import { ClientLocationSchema, ClientSchema, ClientTagReferenceSchema } from "@/schemas/clients";
import { db } from "@/services/drizzle";
import { clients, sales } from "@/services/drizzle/schema";
import { clientLocations, clientTagReferences } from "@/services/drizzle/schema/clients";
import { and, asc, count, desc, eq, gte, inArray, lte, max, min, notInArray, or, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";
import { NextRequest, NextResponse } from "next/server";
import { handleSimpleChildRowsProcessing } from "@/lib/db-utils";
import { resolveValidatedAuthorSeller } from "@/lib/clients/authorship";
import { recomputeClientDuplicatesSafely } from "@/lib/clients/duplicates";
import { normalizeSocialProfile, normalizeWebsiteUrl } from "@/lib/socials";

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
	statsIntegrationsIds: z
		.string({
			invalid_type_error: "Tipo não válido para os IDs de integração.",
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
	// Aniversários dentro de um intervalo de datas do calendário. O ano das datas só define o
	// tamanho da janela; o casamento é por MM-DD, então o filtro serve tanto para "o mês inteiro"
	// quanto para "de hoje até tal dia" — inclusive atravessando a virada do ano (28/12 → 05/01).
	birthdaysPeriodAfter: z
		.string({
			invalid_type_error: "Tipo não válido para o início do período de aniversários.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	birthdaysPeriodBefore: z
		.string({
			invalid_type_error: "Tipo não válido para o fim do período de aniversários.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	orderByField: z.enum(["nome", "comprasValorTotal", "comprasQtdeTotal", "primeiraCompraData", "ultimaCompraData"]).optional().nullable(),
	orderByDirection: z.enum(["asc", "desc"]).optional().nullable(),
});
export type TGetClientsInput = z.infer<typeof GetClientsInputSchema>;

async function getClients({ input, session }: { input: TGetClientsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if ("id" in input && input.id) {
		const clientId = input.id;
		if (!clientId) throw new createHttpError.BadRequest("ID do cliente não informado.");

		const client = await db.query.clients.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, clientId), eq(fields.organizacaoId, userOrgId)),
			with: {
				localizacoes: true,
				tagReferencias: {
					with: {
						tag: true,
					},
				},
			},
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
		if (searchCondition) {
			clientConditions.push(searchCondition);
		}
	}
	if (input.acquisitionChannels && input.acquisitionChannels.length > 0) {
		clientConditions.push(inArray(clients.canalAquisicao, input.acquisitionChannels));
	}
	if (input.segmentationTitles && input.segmentationTitles.length > 0) {
		clientConditions.push(inArray(clients.analiseRFMTitulo, input.segmentationTitles));
	}
	if (input.birthdaysPeriodAfter && input.birthdaysPeriodBefore) {
		// Enumera os dias do intervalo no fuso do cron de interações — o mesmo "hoje" da rota
		// `/api/clients/birthdays` e da campanha de aniversário — e casa por MM-DD. É a enumeração
		// que faz a virada do ano funcionar sem caso especial. Teto de 366 dias: além disso a
		// janela já cobre o calendário inteiro.
		const start = dayjs(input.birthdaysPeriodAfter).tz(INTERACTIONS_CRON_TIMEZONE).startOf("day");
		const end = dayjs(input.birthdaysPeriodBefore).tz(INTERACTIONS_CRON_TIMEZONE).startOf("day");
		const totalDays = Math.min(Math.max(end.diff(start, "day") + 1, 1), 366);
		const keys = new Set(Array.from({ length: totalDays }, (_, index) => start.add(index, "day").format("MM-DD")));
		// Ano não bissexto nunca enumera 29/02, mas quem nasceu nesse dia pertence a qualquer
		// janela que atravesse o fim de fevereiro.
		if (keys.has("02-28") && keys.has("03-01")) keys.add("02-29");
		clientConditions.push(inArray(sql`to_char(${clients.dataNascimento}, 'MM-DD')`, [...keys]));
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

	const statsConditions = [eq(sales.organizacaoId, userOrgId), eq(sales.statusVenda, "CONFIRMADA")];
	if (input.statsPeriodAfter) statsConditions.push(gte(sales.dataVenda, input.statsPeriodAfter));
	if (input.statsPeriodBefore) statsConditions.push(lte(sales.dataVenda, input.statsPeriodBefore));
	const integrationCondition = getSalesIntegrationCondition(input.statsIntegrationsIds);
	if (integrationCondition) statsConditions.push(integrationCondition);
	if (input.statsExcludedSalesIds && input.statsExcludedSalesIds.length > 0) statsConditions.push(notInArray(sales.id, input.statsExcludedSalesIds));

	const statsSelection = {
		clientId: sales.clienteId,
		totalPurchasesValue: sum(sales.valorTotal).as("totalPurchasesValue"),
		totalPurchasesQty: count(sales.id).as("totalPurchasesQty"),
		firstPurchaseDate: min(sales.dataVenda).as("firstPurchaseDate"),
		lastPurchaseDate: max(sales.dataVenda).as("lastPurchaseDate"),
	};
	type TClientPageStats = {
		clientId: string;
		totalPurchasesValue: number | string | null;
		totalPurchasesQty: number | string | null;
		firstPurchaseDate: Date | null;
		lastPurchaseDate: Date | null;
	};

	// `clients.id` como último critério: sem um desempate único, OFFSET/LIMIT pode repetir ou pular
	// clientes homônimos entre páginas.
	const direction = input.orderByDirection === "desc" ? desc : asc;
	const orderByField = input.orderByField ?? "nome";

	let paginatedClientsWithStats: TClientPageStats[];
	if (orderByField === "nome") {
		// Ordenação por nome não depende das estatísticas: pagina os clientes primeiro e agrega as
		// vendas (LATERAL, via índice de cliente_id) só para as 25 linhas da página, em vez de agregar
		// todas as vendas da organização a cada requisição. Uma consulta só: com a função longe do
		// banco, uma ida a mais custa mais do que a agregação economizada.
		const clientsPage = db
			.select({ id: clients.id, nome: clients.nome })
			.from(clients)
			.where(and(...clientConditions))
			.orderBy(direction(clients.nome), asc(clients.id))
			.offset(skip)
			.limit(PAGE_SIZE)
			.as("clients_page");
		const pageStats = db
			.select({
				totalPurchasesValue: statsSelection.totalPurchasesValue,
				totalPurchasesQty: statsSelection.totalPurchasesQty,
				firstPurchaseDate: statsSelection.firstPurchaseDate,
				lastPurchaseDate: statsSelection.lastPurchaseDate,
			})
			.from(sales)
			.where(and(...statsConditions, eq(sales.clienteId, clientsPage.id)))
			.as("stats_by_client");
		paginatedClientsWithStats = await db
			.select({
				clientId: clientsPage.id,
				totalPurchasesValue: sql<number>`COALESCE(${pageStats.totalPurchasesValue}, 0)`,
				totalPurchasesQty: sql<number>`COALESCE(${pageStats.totalPurchasesQty}, 0)`,
				firstPurchaseDate: pageStats.firstPurchaseDate,
				lastPurchaseDate: pageStats.lastPurchaseDate,
			})
			.from(clientsPage)
			.leftJoinLateral(pageStats, sql`true`)
			.orderBy(direction(clientsPage.nome), asc(clientsPage.id));
	} else {
		// Ordenação por estatística exige agregar as vendas de todos os clientes candidatos. Com busca
		// textual o conjunto é pequeno e vale restringir a agregação a ele; sem busca, restringir só
		// piora o plano (merge join por idx_sales_client_id varrendo vendas de outras organizações).
		const hasSearch = !!input.search && input.search.trim().length > 0;
		const scopedStatsConditions = hasSearch
			? [
					...statsConditions,
					inArray(
						sales.clienteId,
						db
							.select({ id: clients.id })
							.from(clients)
							.where(and(...clientConditions)),
					),
				]
			: statsConditions;
		const statsByClientSubquery = db
			.select(statsSelection)
			.from(sales)
			.where(and(...scopedStatsConditions))
			.groupBy(sales.clienteId)
			.as("stats_by_client");

		let orderByClause = asc(clients.nome);
		switch (orderByField) {
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
		}

		paginatedClientsWithStats = await db
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
			.orderBy(orderByClause, asc(clients.nome), asc(clients.id))
			.offset(skip)
			.limit(PAGE_SIZE);
	}
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

const getClientsRoute = async (req: NextRequest) => {
	const sessionUser = await getCurrentSessionUncached();

	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const searchParams = await req.nextUrl.searchParams;

	// if (!session.user.permissoes.parceiros.criar) throw new createHttpError.BadRequest("Você não possui permissão para acessar esse recurso.");
	const input = GetClientsInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		page: searchParams.get("page") ?? undefined,
		search: searchParams.get("search") ?? undefined,
		acquisitionChannels: searchParams.get("acquisitionChannels") ?? undefined,
		segmentationTitles: searchParams.get("segmentationTitles") ?? undefined,
		statsPeriodAfter: searchParams.get("statsPeriodAfter") ?? undefined,
		statsPeriodBefore: searchParams.get("statsPeriodBefore") ?? undefined,
		statsIntegrationsIds: searchParams.get("statsIntegrationsIds") ?? undefined,
		statsExcludedSalesIds: searchParams.get("statsExcludedSalesIds") ?? undefined,
		birthdaysPeriodAfter: searchParams.get("birthdaysPeriodAfter") ?? undefined,
		birthdaysPeriodBefore: searchParams.get("birthdaysPeriodBefore") ?? undefined,
		orderByField: searchParams.get("orderByField") ?? undefined,
		orderByDirection: searchParams.get("orderByDirection") ?? undefined,
	});
	const result = await getClients({ input, session: sessionUser });
	return NextResponse.json(result);
};

const ClientNonEditableFieldsOmit = {
	// Autoria de usuário é sempre resolvida da sessão — nunca aceita no payload.
	autorId: true,
	primeiraCompraData: true,
	primeiraCompraId: true,
	ultimaCompraData: true,
	ultimaCompraId: true,
	analiseRFMTitulo: true,
	analiseRFMNotasRecencia: true,
	analiseRFMNotasFrequencia: true,
	analiseRFMNotasMonetario: true,
	analiseRFMUltimaAtualizacao: true,
	dataSincronizacaoExterna: true,
} as const;

const ClientEditableDateInputSchema = {
	dataNascimento: z
		.string({
			invalid_type_error: "Tipo não válido para data de nascimento.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	dataFundacao: z
		.string({
			invalid_type_error: "Tipo nao valido para data de fundacao.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
};

const CreateClientEntityInputSchema = ClientSchema.omit({
	organizacaoId: true,
	dataInsercao: true,
	...ClientNonEditableFieldsOmit,
}).extend(ClientEditableDateInputSchema);

const CreateClientInputSchema = z.object({
	client: CreateClientEntityInputSchema,
	clientLocations: z.array(
		ClientLocationSchema.omit({
			organizacaoId: true,
			clienteId: true,
			dataInsercao: true,
		}),
	),
	clientTags: z.array(
		ClientTagReferenceSchema.omit({ clienteId: true, organizacaoId: true }).extend({
			id: z.string({ invalid_type_error: "Tipo não válido para o ID da tag do cliente." }).optional(),
			deletar: z.boolean({ invalid_type_error: "Tipo não válido para a flag de exclusão da tag do cliente." }).optional(),
		}),
	),
});

export type TCreateClientInput = z.infer<typeof CreateClientInputSchema>;

async function createClientService({ input, session }: { input: TCreateClientInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	// autorVendedorId viaja na própria entidade (ex.: vendedor da venda no new-sale);
	// validado contra a org quando informado, senão fallback para o vínculo da sessão.
	const autorVendedorId = input.client.autorVendedorId
		? await resolveValidatedAuthorSeller({ organizacaoId: userOrgId, vendedorId: input.client.autorVendedorId })
		: (session.membership?.usuarioVendedorId ?? null);

	const insertedId = await db.transaction(async (tx) => {
		const firstLocation = input.clientLocations[0] ?? null;

		const insertResponse = await tx
			.insert(clients)
			.values({
				...input.client,
				organizacaoId: userOrgId,
				autorId: session.user.id,
				autorVendedorId,
				telefone: input.client.telefone ?? "",
				telefoneBase: formatPhoneAsBase(input.client.telefone ?? ""),
				websiteUrl: normalizeWebsiteUrl(input.client.websiteUrl),
				instagram: normalizeSocialProfile(input.client.instagram, "instagram"),
				linkedin: normalizeSocialProfile(input.client.linkedin, "linkedin"),
				twitter: normalizeSocialProfile(input.client.twitter, "twitter"),
				localizacaoCep: firstLocation?.localizacaoCep ?? input.client.localizacaoCep,
				localizacaoEstado: firstLocation?.localizacaoEstado ?? input.client.localizacaoEstado,
				localizacaoCidade: firstLocation?.localizacaoCidade ?? input.client.localizacaoCidade,
				localizacaoBairro: firstLocation?.localizacaoBairro ?? input.client.localizacaoBairro,
				localizacaoLogradouro: firstLocation?.localizacaoLogradouro ?? input.client.localizacaoLogradouro,
				localizacaoNumero: firstLocation?.localizacaoNumero ?? input.client.localizacaoNumero,
				localizacaoComplemento: firstLocation?.localizacaoComplemento ?? input.client.localizacaoComplemento,
			})
			.returning({ id: clients.id });

		const insertedClientId = insertResponse[0]?.id;
		if (!insertedClientId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar cliente.");

		if (input.clientLocations.length > 0) {
			await tx.insert(clientLocations).values(
				input.clientLocations.map((location) => ({
					organizacaoId: userOrgId,
					clienteId: insertedClientId,
					titulo: location.titulo,
					localizacaoCep: location.localizacaoCep,
					localizacaoEstado: location.localizacaoEstado,
					localizacaoCidade: location.localizacaoCidade,
					localizacaoBairro: location.localizacaoBairro,
					localizacaoLogradouro: location.localizacaoLogradouro,
					localizacaoNumero: location.localizacaoNumero,
					localizacaoComplemento: location.localizacaoComplemento,
					localizacaoLatitude: location.localizacaoLatitude,
					localizacaoLongitude: location.localizacaoLongitude,
				})),
			);
		}

		if (input.clientTags.length > 0) {
			await tx.insert(clientTagReferences).values(
				input.clientTags.map((reference) => ({
					organizacaoId: userOrgId,
					clienteId: insertedClientId,
					clienteTagId: reference.clienteTagId,
				})),
			);
		}

		return insertedClientId;
	});

	await recomputeClientDuplicatesSafely({ organizacaoId: userOrgId, clienteId: insertedId });

	return {
		data: {
			insertedId,
		},
		message: "Cliente criado com sucesso.",
	};
}
export type TCreateClientOutput = Awaited<ReturnType<typeof createClientService>>;
const createClientRoute = async (req: NextRequest) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const payload = await req.json();
	const input = CreateClientInputSchema.parse(payload);
	const result = await createClientService({ input, session: sessionUser });
	return NextResponse.json(result);
};
const UpdateClientEntityInputSchema = ClientSchema.omit({
	organizacaoId: true,
	dataInsercao: true,
	// Autoria é imutável: aceita apenas na criação, nunca no update.
	autorVendedorId: true,
	...ClientNonEditableFieldsOmit,
}).extend(ClientEditableDateInputSchema);
const UpdateClientInputSchema = z.object({
	clientId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para ID do cliente.",
	}),
	client: UpdateClientEntityInputSchema,
	clientLocations: z.array(
		ClientLocationSchema.omit({
			organizacaoId: true,
			clienteId: true,
			dataInsercao: true,
		}).extend({
			id: z
				.string({
					required_error: "ID da localização não informado.",
					invalid_type_error: "Tipo não válido para ID da localização.",
				})
				.optional(),
			deletar: z
				.boolean({
					invalid_type_error: "Tipo não válido para marcador de exclusão.",
				})
				.optional()
				.nullable(),
		}),
	),
	clientTags: z.array(
		ClientTagReferenceSchema.omit({ clienteId: true, organizacaoId: true }).extend({
			id: z.string({ invalid_type_error: "Tipo não válido para o ID da tag do cliente." }).optional(),
			deletar: z.boolean({ invalid_type_error: "Tipo não válido para a flag de exclusão da tag do cliente." }).optional(),
		}),
	),
});
export type TUpdateClientInput = z.infer<typeof UpdateClientInputSchema>;

async function updateClientService({ input, session }: { input: TUpdateClientInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const transactionResult = await db.transaction(async (tx) => {
		const updatedClient = await tx
			.update(clients)
			.set({
				...input.client,
				organizacaoId: userOrgId,
				telefone: input.client.telefone ?? "",
				telefoneBase: formatPhoneAsBase(input.client.telefone ?? ""),
				websiteUrl: normalizeWebsiteUrl(input.client.websiteUrl),
				instagram: normalizeSocialProfile(input.client.instagram, "instagram"),
				linkedin: normalizeSocialProfile(input.client.linkedin, "linkedin"),
				twitter: normalizeSocialProfile(input.client.twitter, "twitter"),
			})
			.where(and(eq(clients.id, input.clientId), eq(clients.organizacaoId, userOrgId)))
			.returning({ id: clients.id });

		if (!updatedClient) throw new createHttpError.NotFound("Cliente não encontrado.");
		const updatedClientId = updatedClient[0]?.id;

		await handleSimpleChildRowsProcessing({
			trx: tx,
			table: clientLocations,
			entities: input.clientLocations,
			fatherEntityKey: "clienteId",
			fatherEntityId: updatedClientId,
			organizacaoId: userOrgId,
		});
		await handleSimpleChildRowsProcessing({
			trx: tx,
			table: clientTagReferences,
			entities: input.clientTags,
			fatherEntityKey: "clienteId",
			fatherEntityId: updatedClientId,
			organizacaoId: userOrgId,
		});
		return {
			updatedId: updatedClientId,
		};
	});

	await recomputeClientDuplicatesSafely({ organizacaoId: userOrgId, clienteId: input.clientId });

	return {
		data: {
			updatedId: transactionResult.updatedId,
		},
		message: "Cliente atualizado com sucesso.",
	};
}
export type TUpdateClientOutput = Awaited<ReturnType<typeof updateClientService>>;
const updateClientRoute = async (req: NextRequest) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const payload = await req.json();
	const input = UpdateClientInputSchema.parse(payload);
	const result = await updateClientService({ input, session: sessionUser });
	return NextResponse.json(result);
};
export const POST = appApiHandler({
	POST: (request) => createClientRoute(request),
});
export const GET = appApiHandler({
	GET: (request) => getClientsRoute(request),
});
export const PUT = appApiHandler({
	PUT: (request) => updateClientRoute(request),
});

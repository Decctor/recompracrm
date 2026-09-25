import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import {
	CHAT_FIRST_RESPONSE_BUCKETS,
	CHAT_FIRST_RESPONSE_TARGET_MINUTES,
	durationStatsSelection,
	naiveUtcParam,
	nowAsNaiveUtc,
	safeRatio,
	secondsBetween,
	toDurationStats,
} from "@/lib/chats/analytics";
import { assertChatAccess } from "@/lib/chats/access";
import { db } from "@/services/drizzle";
import { chatAssignments, chatMessages, chats } from "@/services/drizzle/schema/chats";
import { whatsappConnections } from "@/services/drizzle/schema/whatsapp-connections";
import { and, between, eq, isNotNull, notInArray, sql, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aiAgentFollowUps, aiAgentRuns } from "@/services/drizzle/schema/ai-agents";

// ============= GET - Visão geral das estatísticas de atendimento =============

const dateField = (label: string) =>
	z
		.string({ invalid_type_error: `Tipo inválido para ${label}.` })
		.datetime({ message: `Tipo inválido para ${label}.` })
		.optional()
		.nullable()
		.transform((v) => (v ? new Date(v) : null));

const GetChatsStatsOverviewInputSchema = z.object({
	startDate: dateField("período"),
	endDate: dateField("período"),
	comparingStartDate: dateField("período de comparação"),
	comparingEndDate: dateField("período de comparação"),
	whatsappConexaoTelefoneId: z.string({ invalid_type_error: "Tipo inválido para o ID do telefone da conexão." }).optional().nullable(),
});
export type TGetChatsStatsOverviewInput = z.infer<typeof GetChatsStatsOverviewInputSchema>;

const CLOSED_STATUSES = ["ENCERRADO", "CANCELADO"] as const;

/** Duração da primeira resposta a partir da abertura real do atendimento. */
const firstResponseSeconds = secondsBetween(chatAssignments.dataInsercao, chatAssignments.dataPrimeiraResposta);
const resolutionSeconds = secondsBetween(chatAssignments.dataInsercao, chatAssignments.dataResolucao);

type TCohortFilters = { organizacaoId: string; whatsappConexaoTelefoneId?: string | null };

function cohortConditions({ organizacaoId, whatsappConexaoTelefoneId }: TCohortFilters) {
	return [
		eq(chatAssignments.organizacaoId, organizacaoId),
		// Chats de teste do agente de IA não contam como atendimento.
		eq(chats.origem, "WHATSAPP"),
		whatsappConexaoTelefoneId ? eq(chats.whatsappConexaoTelefoneId, whatsappConexaoTelefoneId) : undefined,
	];
}

/**
 * Coorte de **abertura**: atendimentos que nasceram no período.
 *
 * A primeira resposta pertence a esta coorte porque acontece logo depois da abertura. Há
 * censura à direita nas últimas horas do período (um atendimento aberto às 23h50 pode ainda
 * não ter resposta) — é o comportamento padrão e o `semPrimeiraResposta` deixa isso visível.
 */
async function fetchOpeningCohort({ filters, startDate, endDate }: { filters: TCohortFilters; startDate: Date; endDate: Date }) {
	const [row] = await db
		.select({
			abertos: sql<number>`count(*)::int`,
			semPrimeiraResposta: sql<number>`count(*) filter (where ${chatAssignments.dataPrimeiraResposta} is null)::int`,
			dentroDaMeta: sql<number>`count(*) filter (where ${firstResponseSeconds} <= ${CHAT_FIRST_RESPONSE_TARGET_MINUTES * 60})::int`,
			porUsuario: sql<number>`count(*) filter (where ${chatAssignments.responsavelTipo} = 'USUARIO')::int`,
			porAgente: sql<number>`count(*) filter (where ${chatAssignments.responsavelTipo} = 'AGENTE')::int`,
			porExterno: sql<number>`count(*) filter (where ${chatAssignments.responsavelTipo} = 'EXTERNO')::int`,
			semResponsavel: sql<number>`count(*) filter (where ${chatAssignments.responsavelTipo} = 'NAO_ATRIBUIDO')::int`,
			prioridadeBaixa: sql<number>`count(*) filter (where ${chatAssignments.prioridade} = 'BAIXA')::int`,
			prioridadeMedia: sql<number>`count(*) filter (where ${chatAssignments.prioridade} = 'MEDIA')::int`,
			prioridadeAlta: sql<number>`count(*) filter (where ${chatAssignments.prioridade} = 'ALTA')::int`,
			prioridadeUrgente: sql<number>`count(*) filter (where ${chatAssignments.prioridade} = 'URGENTE')::int`,
			semPrioridade: sql<number>`count(*) filter (where ${chatAssignments.prioridade} is null)::int`,
			...durationStatsSelection(firstResponseSeconds),
		})
		.from(chatAssignments)
		.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
		.where(and(...cohortConditions(filters), between(chatAssignments.dataInsercao, startDate, endDate)));

	return row;
}

/** Faixas do tempo de primeira resposta — a mediana esconde a forma da cauda; o histograma não. */
async function fetchFirstResponseBuckets({ filters, startDate, endDate }: { filters: TCohortFilters; startDate: Date; endDate: Date }) {
	const selection = Object.fromEntries(
		CHAT_FIRST_RESPONSE_BUCKETS.map((bucket, index) => {
			const lower = index === 0 ? 0 : CHAT_FIRST_RESPONSE_BUCKETS[index - 1].limiteSegundos;
			const condition =
				bucket.limiteSegundos === null
					? sql`${firstResponseSeconds} > ${lower}`
					: sql`${firstResponseSeconds} > ${lower} and ${firstResponseSeconds} <= ${bucket.limiteSegundos}`;
			return [bucket.id, sql<number>`count(*) filter (where ${condition})::int`];
		}),
	) as Record<(typeof CHAT_FIRST_RESPONSE_BUCKETS)[number]["id"], SQLNumber>;

	const [row] = await db
		.select(selection)
		.from(chatAssignments)
		.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
		.where(and(...cohortConditions(filters), between(chatAssignments.dataInsercao, startDate, endDate)));

	return row;
}
type SQLNumber = ReturnType<typeof sql<number>>;

/** Coorte de **fechamento**: atendimentos encerrados no período, tenham nascido quando nasceram. */
async function fetchClosingCohort({ filters, startDate, endDate }: { filters: TCohortFilters; startDate: Date; endDate: Date }) {
	const [row] = await db
		.select({
			encerrados: sql<number>`count(*)::int`,
			cancelados: sql<number>`count(*) filter (where ${chatAssignments.status} = 'CANCELADO')::int`,
			encerradosPelaIA: sql<number>`count(*) filter (where ${chatAssignments.responsavelTipo} = 'AGENTE')::int`,
			// `resultado` é gravado por `closeChatAttendance`; HUMAN_HANDOFF marca a IA desistindo.
			handoffs: sql<number>`count(*) filter (where ${chatAssignments.resultado} = 'HUMAN_HANDOFF')::int`,
		})
		.from(chatAssignments)
		.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
		.where(and(...cohortConditions(filters), between(chatAssignments.dataEncerramento, startDate, endDate)));

	return row;
}

/**
 * Retomadas executadas no período e quantas trouxeram o cliente de volta (mensagem dele no
 * mesmo chat até 48h depois). A taxa é o número que diz se a retomada vale a pena para a loja.
 */
async function fetchFollowUpStats({ filters, startDate, endDate }: { filters: TCohortFilters; startDate: Date; endDate: Date }) {
	const respondida = sql`exists (
		select 1 from ${chatMessages}
		where ${chatMessages.chatId} = ${aiAgentFollowUps.chatId}
			and ${chatMessages.autorTipo} = 'CLIENTE'
			and ${chatMessages.dataEnvio} > ${aiAgentFollowUps.dataExecucao}
			and ${chatMessages.dataEnvio} <= ${aiAgentFollowUps.dataExecucao} + interval '48 hours'
	)`;
	const [row] = await db
		.select({
			enviadas: sql<number>`count(*) filter (where ${aiAgentFollowUps.runExecucaoId} is not null and exists (select 1 from ${aiAgentRuns} where ${aiAgentRuns.id} = ${aiAgentFollowUps.runExecucaoId} and ${aiAgentRuns.mensagemEnviadaId} is not null))::int`,
			respondidas: sql<number>`count(*) filter (where ${respondida})::int`,
			expiradas: sql<number>`count(*) filter (where ${aiAgentFollowUps.status} = 'EXPIRADA')::int`,
		})
		.from(aiAgentFollowUps)
		.innerJoin(chats, eq(aiAgentFollowUps.chatId, chats.id))
		.where(
			and(
				eq(aiAgentFollowUps.organizacaoId, filters.organizacaoId),
				filters.whatsappConexaoTelefoneId ? eq(chats.whatsappConexaoTelefoneId, filters.whatsappConexaoTelefoneId) : undefined,
				inArray(aiAgentFollowUps.status, ["EXECUTADA", "EXPIRADA"]),
				between(
					sql`coalesce(${aiAgentFollowUps.dataExecucao}, ${aiAgentFollowUps.dataAtualizacao}, ${aiAgentFollowUps.dataInsercao})`,
					startDate,
					endDate,
				),
			),
		);
	return row;
}

/** Coorte de **resolução**: o tempo de resolução só existe para quem foi resolvido. */
async function fetchResolutionCohort({ filters, startDate, endDate }: { filters: TCohortFilters; startDate: Date; endDate: Date }) {
	const [row] = await db
		.select({
			resolvidos: sql<number>`count(*)::int`,
			...durationStatsSelection(resolutionSeconds),
		})
		.from(chatAssignments)
		.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
		.where(and(...cohortConditions(filters), between(chatAssignments.dataResolucao, startDate, endDate)));

	return row;
}

async function fetchMessages({ filters, startDate, endDate }: { filters: TCohortFilters; startDate: Date; endDate: Date }) {
	const [row] = await db
		.select({
			recebidas: sql<number>`count(*) filter (where ${chatMessages.autorTipo} = 'CLIENTE')::int`,
			porUsuario: sql<number>`count(*) filter (where ${chatMessages.autorTipo} = 'USUÁRIO')::int`,
			porIA: sql<number>`count(*) filter (where ${chatMessages.autorTipo} = 'AI')::int`,
			porTelefone: sql<number>`count(*) filter (where ${chatMessages.autorTipo} = 'BUSINESS-APP')::int`,
		})
		.from(chatMessages)
		.innerJoin(chats, eq(chatMessages.chatId, chats.id))
		.where(
			and(
				eq(chatMessages.organizacaoId, filters.organizacaoId),
				eq(chats.origem, "WHATSAPP"),
				filters.whatsappConexaoTelefoneId ? eq(chats.whatsappConexaoTelefoneId, filters.whatsappConexaoTelefoneId) : undefined,
				between(chatMessages.dataEnvio, startDate, endDate),
			),
		);

	return row;
}

/**
 * Retrato da fila **agora**. Ignora o filtro de período de propósito: "quantos estão
 * abertos" é uma pergunta sobre o presente, e responder com o passado seria mentira.
 */
async function fetchBacklog({ filters }: { filters: TCohortFilters }) {
	const agora = naiveUtcParam(new Date());
	const janelaRisco = naiveUtcParam(new Date(Date.now() + 4 * 60 * 60 * 1000));
	// `now()` é timestamptz e as colunas do módulo são timestamp sem fuso: sem normalizar,
	// a subtração dependeria do `TimeZone` da sessão do Postgres.
	const idadeSegundos = secondsBetween(chatAssignments.dataInsercao, nowAsNaiveUtc());
	// Só conta como pendente o que o cliente está esperando: última entrada mais recente
	// que a última saída. Mesma regra de `getChatPendingState`.
	const aguardando = sql`${chats.ultimaMensagemEntradaData} is not null and (${chats.ultimaMensagemSaidaData} is null or ${chats.ultimaMensagemEntradaData} > ${chats.ultimaMensagemSaidaData})`;
	// Conexões de gateway interno não têm janela de 24h — contá-las como "expiradas" faria
	// o alerta disparar para toda a base do gateway.
	const temJanela = sql`${whatsappConnections.tipoConexao} is distinct from 'INTERNAL_GATEWAY'`;

	const [row] = await db
		.select({
			abertosAgora: sql<number>`count(*)::int`,
			naFila: sql<number>`count(*) filter (where ${chatAssignments.responsavelTipo} = 'NAO_ATRIBUIDO')::int`,
			aguardandoResposta: sql<number>`count(*) filter (where ${aguardando})::int`,
			janelaExpirando: sql<number>`count(*) filter (where ${aguardando} and ${temJanela} and ${chats.whatsappJanelaDataExpiracao} > ${agora} and ${chats.whatsappJanelaDataExpiracao} <= ${janelaRisco})::int`,
			janelaExpirada: sql<number>`count(*) filter (where ${aguardando} and ${temJanela} and (${chats.whatsappJanelaDataExpiracao} is null or ${chats.whatsappJanelaDataExpiracao} <= ${agora}))::int`,
			maisAntigoData: sql<Date | null>`min(${chatAssignments.dataInsercao})`,
			...durationStatsSelection(idadeSegundos),
		})
		.from(chatAssignments)
		.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
		.leftJoin(whatsappConnections, eq(chats.whatsappConexaoId, whatsappConnections.id))
		.where(and(...cohortConditions(filters), notInArray(chatAssignments.status, [...CLOSED_STATUSES])));

	const porStatus = await db
		.select({ status: chatAssignments.status, quantidade: sql<number>`count(*)::int` })
		.from(chatAssignments)
		.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
		.where(and(...cohortConditions(filters), notInArray(chatAssignments.status, [...CLOSED_STATUSES])))
		.groupBy(chatAssignments.status);

	return { row, porStatus };
}

async function fetchCategories({ filters, startDate, endDate }: { filters: TCohortFilters; startDate: Date; endDate: Date }) {
	return db
		.select({ categoria: chatAssignments.categoria, quantidade: sql<number>`count(*)::int` })
		.from(chatAssignments)
		.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
		.where(and(...cohortConditions(filters), between(chatAssignments.dataInsercao, startDate, endDate), isNotNull(chatAssignments.categoria)))
		.groupBy(chatAssignments.categoria)
		.orderBy(sql`count(*) desc`)
		.limit(12);
}

async function getChatsStatsOverview({ session, input }: { session: TAuthUserSession; input: TGetChatsStatsOverviewInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "visualizar" });

	const endDate = input.endDate ?? new Date();
	const startDate = input.startDate ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
	const filters: TCohortFilters = { organizacaoId, whatsappConexaoTelefoneId: input.whatsappConexaoTelefoneId };

	const comparing =
		input.comparingStartDate && input.comparingEndDate ? { startDate: input.comparingStartDate, endDate: input.comparingEndDate } : null;

	const [opening, buckets, closing, resolution, messages, backlog, categorias, followUps, comparingOpening, comparingClosing, comparingResolution] =
		await Promise.all([
			fetchOpeningCohort({ filters, startDate, endDate }),
			fetchFirstResponseBuckets({ filters, startDate, endDate }),
			fetchClosingCohort({ filters, startDate, endDate }),
			fetchResolutionCohort({ filters, startDate, endDate }),
			fetchMessages({ filters, startDate, endDate }),
			fetchBacklog({ filters }),
			fetchCategories({ filters, startDate, endDate }),
			fetchFollowUpStats({ filters, startDate, endDate }),
			comparing ? fetchOpeningCohort({ filters, ...comparing }) : null,
			comparing ? fetchClosingCohort({ filters, ...comparing }) : null,
			comparing ? fetchResolutionCohort({ filters, ...comparing }) : null,
		]);

	const abertos = opening?.abertos ?? 0;
	const encerrados = closing?.encerrados ?? 0;
	const resolvidos = resolution?.resolvidos ?? 0;
	const respondidos = abertos - (opening?.semPrimeiraResposta ?? 0);
	const mensagensEnviadas = (messages?.porUsuario ?? 0) + (messages?.porIA ?? 0) + (messages?.porTelefone ?? 0);
	const mensagensRecebidas = messages?.recebidas ?? 0;
	const tocadosPelaIA = opening?.porAgente ?? 0;

	return {
		data: {
			periodo: { inicio: startDate, fim: endDate },
			volume: {
				abertos,
				encerrados,
				resolvidos,
				cancelados: closing?.cancelados ?? 0,
				// Positivo = a fila cresceu no período. É o número que diz se a equipe está
				// dando conta, e nenhum dos dois isolados diz isso.
				saldoBacklog: abertos - encerrados,
				taxaResolucao: safeRatio(resolvidos, abertos),
				semPrimeiraResposta: opening?.semPrimeiraResposta ?? 0,
			},
			tempos: {
				primeiraResposta: toDurationStats(opening ?? { media: null, mediana: null, p90: null, amostra: 0 }),
				resolucao: toDurationStats(resolution ?? { media: null, mediana: null, p90: null, amostra: 0 }),
			},
			sla: {
				metaMinutos: CHAT_FIRST_RESPONSE_TARGET_MINUTES,
				dentroDaMeta: opening?.dentroDaMeta ?? 0,
				// Percentual sobre quem respondeu — misturar os sem resposta no denominador
				// confundiria "demorou" com "nunca aconteceu", que são problemas diferentes.
				percentualDentroDaMeta: safeRatio(opening?.dentroDaMeta ?? 0, respondidos),
				faixas: CHAT_FIRST_RESPONSE_BUCKETS.map((bucket) => ({
					id: bucket.id,
					label: bucket.label,
					quantidade: buckets?.[bucket.id] ?? 0,
				})),
			},
			atendimento: {
				porTipoResponsavel: [
					{ tipo: "USUARIO" as const, quantidade: opening?.porUsuario ?? 0 },
					{ tipo: "AGENTE" as const, quantidade: tocadosPelaIA },
					{ tipo: "EXTERNO" as const, quantidade: opening?.porExterno ?? 0 },
					{ tipo: "NAO_ATRIBUIDO" as const, quantidade: opening?.semResponsavel ?? 0 },
				],
				encerradosPelaIA: closing?.encerradosPelaIA ?? 0,
				handoffs: closing?.handoffs ?? 0,
				// Contenção: dos atendimentos que a IA está segurando, quantos ela fechou sozinha.
				contencaoIA: safeRatio(closing?.encerradosPelaIA ?? 0, tocadosPelaIA),
				retomadas: {
					enviadas: followUps?.enviadas ?? 0,
					respondidas: followUps?.respondidas ?? 0,
					expiradas: followUps?.expiradas ?? 0,
					taxaResposta: safeRatio(followUps?.respondidas ?? 0, followUps?.enviadas ?? 0),
				},
			},
			mensagens: {
				recebidas: mensagensRecebidas,
				enviadas: mensagensEnviadas,
				total: mensagensRecebidas + mensagensEnviadas,
				porAutor: [
					{ autor: "CLIENTE" as const, quantidade: mensagensRecebidas },
					{ autor: "USUÁRIO" as const, quantidade: messages?.porUsuario ?? 0 },
					{ autor: "AI" as const, quantidade: messages?.porIA ?? 0 },
					{ autor: "BUSINESS-APP" as const, quantidade: messages?.porTelefone ?? 0 },
				],
				mediaPorAtendimento: safeRatio(mensagensRecebidas + mensagensEnviadas, abertos),
			},
			backlog: {
				abertosAgora: backlog.row?.abertosAgora ?? 0,
				naFila: backlog.row?.naFila ?? 0,
				aguardandoResposta: backlog.row?.aguardandoResposta ?? 0,
				janelaExpirando: backlog.row?.janelaExpirando ?? 0,
				janelaExpirada: backlog.row?.janelaExpirada ?? 0,
				maisAntigoData: backlog.row?.maisAntigoData ?? null,
				idadeFila: toDurationStats(backlog.row ?? { media: null, mediana: null, p90: null, amostra: 0 }),
				porStatus: backlog.porStatus,
			},
			distribuicoes: {
				prioridade: [
					{ prioridade: "URGENTE" as const, quantidade: opening?.prioridadeUrgente ?? 0 },
					{ prioridade: "ALTA" as const, quantidade: opening?.prioridadeAlta ?? 0 },
					{ prioridade: "MEDIA" as const, quantidade: opening?.prioridadeMedia ?? 0 },
					{ prioridade: "BAIXA" as const, quantidade: opening?.prioridadeBaixa ?? 0 },
					{ prioridade: null, quantidade: opening?.semPrioridade ?? 0 },
				],
				categoria: categorias,
			},
			comparacao: comparing
				? {
						periodo: { inicio: comparing.startDate, fim: comparing.endDate },
						abertos: comparingOpening?.abertos ?? 0,
						encerrados: comparingClosing?.encerrados ?? 0,
						resolvidos: comparingResolution?.resolvidos ?? 0,
						semPrimeiraResposta: comparingOpening?.semPrimeiraResposta ?? 0,
						tempos: {
							primeiraResposta: toDurationStats(comparingOpening ?? { media: null, mediana: null, p90: null, amostra: 0 }),
							resolucao: toDurationStats(comparingResolution ?? { media: null, mediana: null, p90: null, amostra: 0 }),
						},
					}
				: null,
		},
		message: "Estatísticas de atendimento carregadas com sucesso.",
	};
}
export type TGetChatsStatsOverviewOutput = Awaited<ReturnType<typeof getChatsStatsOverview>>;

async function getChatsStatsOverviewRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const searchParams = req.nextUrl.searchParams;
	const input = GetChatsStatsOverviewInputSchema.parse({
		startDate: searchParams.get("startDate"),
		endDate: searchParams.get("endDate"),
		comparingStartDate: searchParams.get("comparingStartDate"),
		comparingEndDate: searchParams.get("comparingEndDate"),
		whatsappConexaoTelefoneId: searchParams.get("whatsappConexaoTelefoneId"),
	});

	const result = await getChatsStatsOverview({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

// ============= Export handlers =============

export const GET = appApiHandler({ GET: getChatsStatsOverviewRoute });

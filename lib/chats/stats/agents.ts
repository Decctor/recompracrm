import { durationStatsSelection, secondsBetween, toDurationStats } from "@/lib/chats/analytics";
import { db } from "@/services/drizzle";
import { chatAssignments, chatMessages, chats } from "@/services/drizzle/schema/chats";
import { organizationMembers } from "@/services/drizzle/schema/organizations";
import { users } from "@/services/drizzle/schema/users";
import { and, between, eq, isNotNull, notInArray, sql } from "drizzle-orm";

/**
 * Ranking de atendentes de uma organização. Extraído de `GET /api/chats/stats/agents` pelo mesmo
 * motivo de `./overview.ts`: painel e `get_chat_analytics` leem a mesma função. Quem chama decide
 * a autorização (a rota exige a permissão de gerenciar atendimentos).
 */
export type TChatAgentsRankingInput = {
	startDate: Date | null;
	endDate: Date | null;
	whatsappConexaoTelefoneId?: string | null;
};

const CLOSED_STATUSES = ["ENCERRADO", "CANCELADO"] as const;

const firstResponseSeconds = secondsBetween(chatAssignments.dataInsercao, chatAssignments.dataPrimeiraResposta);
const resolutionSeconds = secondsBetween(chatAssignments.dataInsercao, chatAssignments.dataResolucao);

/**
 * Ranking de atendentes.
 *
 * **A atribuição por atendente é parcialmente aproximada, e o payload marca quais métricas
 * são quais.** `chat_assignments.responsavelUsuarioId` guarda o dono *atual*: uma
 * transferência sobrescreve o campo sem deixar histórico, então tudo que depende dele
 * credita o último dono, não quem de fato trabalhou o atendimento.
 *
 * - `encerrados` sai de `encerradoPorUsuarioId` — **exato**, é quem clicou em encerrar.
 * - `mensagensEnviadas` sai de `chat_messages.autorUsuarioId` — **exato**, e é a medida de
 *   esforço mais dura que o modelo oferece hoje.
 * - `carteiraAtual`, `resolvidos` e os tempos medianos derivam do dono atual — **aproximados**.
 *
 * Atribuição fiel exigiria uma tabela de eventos de atendimento; até lá, a UI rotula a
 * diferença em vez de fingir uma precisão que o dado não tem.
 */
export async function getChatAgentsRanking({ organizacaoId, input }: { organizacaoId: string; input: TChatAgentsRankingInput }) {
	const endDate = input.endDate ?? new Date();
	const startDate = input.startDate ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
	// Recorte de chats considerados: os reais (chats de teste do agente de IA ficam de fora) e,
	// quando informado, apenas os do telefone selecionado.
	const chatScopeCondition = and(
		eq(chats.origem, "WHATSAPP"),
		input.whatsappConexaoTelefoneId ? eq(chats.whatsappConexaoTelefoneId, input.whatsappConexaoTelefoneId) : undefined,
	);

	const [membros, aberturas, encerramentos, resolucoes, carteiras, mensagens] = await Promise.all([
		db
			.select({ id: users.id, nome: users.nome, avatarUrl: users.avatarUrl })
			.from(organizationMembers)
			.innerJoin(users, eq(users.id, organizationMembers.usuarioId))
			.where(eq(organizationMembers.organizacaoId, organizacaoId)),

		db
			.select({
				usuarioId: chatAssignments.responsavelUsuarioId,
				atendidos: sql<number>`count(*)::int`,
				...durationStatsSelection(firstResponseSeconds),
			})
			.from(chatAssignments)
			.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
			.where(
				and(
					eq(chatAssignments.organizacaoId, organizacaoId),
					between(chatAssignments.dataInsercao, startDate, endDate),
					isNotNull(chatAssignments.responsavelUsuarioId),
					chatScopeCondition,
				),
			)
			.groupBy(chatAssignments.responsavelUsuarioId),

		db
			.select({ usuarioId: chatAssignments.encerradoPorUsuarioId, encerrados: sql<number>`count(*)::int` })
			.from(chatAssignments)
			.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
			.where(
				and(
					eq(chatAssignments.organizacaoId, organizacaoId),
					between(chatAssignments.dataEncerramento, startDate, endDate),
					isNotNull(chatAssignments.encerradoPorUsuarioId),
					chatScopeCondition,
				),
			)
			.groupBy(chatAssignments.encerradoPorUsuarioId),

		db
			.select({
				usuarioId: chatAssignments.responsavelUsuarioId,
				resolvidos: sql<number>`count(*)::int`,
				...durationStatsSelection(resolutionSeconds),
			})
			.from(chatAssignments)
			.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
			.where(
				and(
					eq(chatAssignments.organizacaoId, organizacaoId),
					between(chatAssignments.dataResolucao, startDate, endDate),
					isNotNull(chatAssignments.responsavelUsuarioId),
					chatScopeCondition,
				),
			)
			.groupBy(chatAssignments.responsavelUsuarioId),

		// Retrato: quantos atendimentos vivos estão na mão de cada um agora.
		db
			.select({ usuarioId: chatAssignments.responsavelUsuarioId, carteiraAtual: sql<number>`count(*)::int` })
			.from(chatAssignments)
			.innerJoin(chats, eq(chatAssignments.chatId, chats.id))
			.where(
				and(
					eq(chatAssignments.organizacaoId, organizacaoId),
					notInArray(chatAssignments.status, [...CLOSED_STATUSES]),
					isNotNull(chatAssignments.responsavelUsuarioId),
					chatScopeCondition,
				),
			)
			.groupBy(chatAssignments.responsavelUsuarioId),

		db
			.select({ usuarioId: chatMessages.autorUsuarioId, mensagensEnviadas: sql<number>`count(*)::int` })
			.from(chatMessages)
			.innerJoin(chats, eq(chatMessages.chatId, chats.id))
			.where(
				and(
					eq(chatMessages.organizacaoId, organizacaoId),
					between(chatMessages.dataEnvio, startDate, endDate),
					isNotNull(chatMessages.autorUsuarioId),
					chatScopeCondition,
				),
			)
			.groupBy(chatMessages.autorUsuarioId),
	]);

	const porUsuario = <T extends { usuarioId: string | null }>(rows: T[]) =>
		new Map(rows.filter((row) => row.usuarioId).map((row) => [row.usuarioId as string, row]));
	const aberturasMap = porUsuario(aberturas);
	const encerramentosMap = porUsuario(encerramentos);
	const resolucoesMap = porUsuario(resolucoes);
	const carteirasMap = porUsuario(carteiras);
	const mensagensMap = porUsuario(mensagens);

	const ranking = membros
		.map((membro) => {
			const abertura = aberturasMap.get(membro.id);
			const resolucao = resolucoesMap.get(membro.id);
			return {
				usuarioId: membro.id,
				nome: membro.nome,
				avatarUrl: membro.avatarUrl,
				carteiraAtual: carteirasMap.get(membro.id)?.carteiraAtual ?? 0,
				atendidos: abertura?.atendidos ?? 0,
				encerrados: encerramentosMap.get(membro.id)?.encerrados ?? 0,
				resolvidos: resolucao?.resolvidos ?? 0,
				mensagensEnviadas: mensagensMap.get(membro.id)?.mensagensEnviadas ?? 0,
				tempoPrimeiraResposta: toDurationStats(abertura ?? { media: null, mediana: null, p90: null, amostra: 0 }),
				tempoResolucao: toDurationStats(resolucao ?? { media: null, mediana: null, p90: null, amostra: 0 }),
			};
		})
		// Membros sem nenhuma atividade no período só alongariam a tabela.
		.filter((linha) => linha.carteiraAtual > 0 || linha.atendidos > 0 || linha.encerrados > 0 || linha.mensagensEnviadas > 0);

	return {
		periodo: { inicio: startDate, fim: endDate },
		ranking,
	};
}
export type TChatAgentsRanking = Awaited<ReturnType<typeof getChatAgentsRanking>>;

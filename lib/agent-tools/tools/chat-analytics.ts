import { CHAT_FIRST_RESPONSE_TARGET_MINUTES } from "@/lib/chats/analytics";
import { getChatAgentsRanking } from "@/lib/chats/stats/agents";
import { getChatStatsOverview } from "@/lib/chats/stats/overview";
import z from "zod";
import { durationStatsToMinutes, previousPeriod, ratioToPercent } from "../chat-content";
import { resolveOrganizationScope } from "../organization-scope";
import { PERIOD_DESCRIPTION, PeriodInputSchema, resolvePeriod } from "../period";
import { roundForModel } from "../serialization";
import { defineAgentTool } from "../types";
import {
	assertChatHubEnabled,
	ChatConnectionPhoneInputSchema,
	listChatConnectionPhones,
	OrganizationInputSchema,
	platformOrganizationHint,
} from "./chats-shared";

const GetChatAnalyticsInputSchema = z.object({
	periodo: PeriodInputSchema,
	whatsappConexaoTelefoneId: ChatConnectionPhoneInputSchema,
	incluirAtendentes: z.boolean({ invalid_type_error: "Tipo inválido para incluir atendentes." }).optional().nullable(),
	organizacaoId: OrganizationInputSchema,
});

function describeChange(atual: number, anterior: number | undefined) {
	return {
		atual,
		anterior,
		variacaoPercentual: anterior ? roundForModel(((atual - anterior) / anterior) * 100, 1) : undefined,
	};
}

export const chatAnalyticsTool = defineAgentTool({
	name: "get_chat_analytics",
	title: "Estatísticas de atendimento",
	scopes: ["agent:chats:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: GetChatAnalyticsInputSchema,
	describe: (actor) =>
		[
			"Indicadores do hub de atendimentos (WhatsApp) de um período — os mesmos números da tela Atendimentos > Estatísticas.",
			"Volume (abertos, encerrados, resolvidos, saldo da fila), tempo de primeira resposta e de resolução (média, mediana, p90 e amostra, em minutos),",
			`SLA de primeira resposta (meta de ${CHAT_FIRST_RESPONSE_TARGET_MINUTES} min, com histograma), divisão humano × IA × sem responsável, contenção e handoffs da IA,`,
			"retomadas da IA e taxa de resposta, mensagens por autor, categorias, e o retrato da fila AGORA (abertos, aguardando resposta, janela de 24h expirando/expirada).",
			"Cada métrica tem sua coorte: abertura (volume, primeira resposta) conta atendimentos que nasceram no período; encerramento e resolução contam os que fecharam no período.",
			"A fila (`filaAgora`) ignora o período: é sempre o presente.",
			"Os principais números vêm comparados ao período anterior de mesma duração.",
			"Com `incluirAtendentes` (padrão: sim), traz o ranking por atendente. Nele, `encerrados` e `mensagensEnviadas` são exatos; carteira, resolvidos e tempos creditam o responsável ATUAL do atendimento (transferências não deixam histórico).",
			"Os atendimentos individuais estão em `list_chat_attendances` e as conversas em `get_chat_messages`.",
			"Campo ausente (p90 com amostra pequena, percentual sem base) significa sem dado, nunca zero.",
			PERIOD_DESCRIPTION,
			platformOrganizationHint(actor.mode),
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		await assertChatHubEnabled(organizacaoId);
		const periodo = resolvePeriod(input.periodo);
		const anterior = previousPeriod(periodo);

		const [overview, ranking, telefones] = await Promise.all([
			getChatStatsOverview({
				organizacaoId,
				input: {
					startDate: periodo.after,
					endDate: periodo.before,
					comparingStartDate: anterior.after,
					comparingEndDate: anterior.before,
					whatsappConexaoTelefoneId: input.whatsappConexaoTelefoneId,
				},
			}),
			input.incluirAtendentes === false
				? null
				: getChatAgentsRanking({
						organizacaoId,
						input: { startDate: periodo.after, endDate: periodo.before, whatsappConexaoTelefoneId: input.whatsappConexaoTelefoneId },
					}),
			listChatConnectionPhones(organizacaoId),
		]);

		const { volume, tempos, sla, atendimento, mensagens, backlog, distribuicoes, comparacao } = overview;
		const respondidos = volume.abertos - volume.semPrimeiraResposta;

		return {
			periodo: { inicio: periodo.inicio, fim: periodo.fim },
			periodoAnterior: { inicio: anterior.after.toISOString(), fim: anterior.before.toISOString() },
			// Ids para filtrar por número; o modelo não deve adivinhar qual número é qual.
			telefonesConexao: telefones,
			volume: {
				abertos: describeChange(volume.abertos, comparacao?.abertos),
				encerrados: describeChange(volume.encerrados, comparacao?.encerrados),
				resolvidos: describeChange(volume.resolvidos, comparacao?.resolvidos),
				cancelados: volume.cancelados,
				semPrimeiraResposta: describeChange(volume.semPrimeiraResposta, comparacao?.semPrimeiraResposta),
				// Positivo = a fila cresceu no período.
				saldoFila: volume.saldoBacklog,
				taxaResolucaoPercentual: ratioToPercent(volume.resolvidos, volume.abertos),
			},
			tempos: {
				primeiraResposta: {
					atual: durationStatsToMinutes(tempos.primeiraResposta),
					anterior: comparacao ? durationStatsToMinutes(comparacao.tempos.primeiraResposta) : undefined,
				},
				resolucao: {
					atual: durationStatsToMinutes(tempos.resolucao),
					anterior: comparacao ? durationStatsToMinutes(comparacao.tempos.resolucao) : undefined,
				},
			},
			sla: {
				metaPrimeiraRespostaMinutos: sla.metaMinutos,
				dentroDaMeta: sla.dentroDaMeta,
				// Sobre quem foi respondido: "demorou" e "nunca respondeu" são problemas diferentes,
				// e o segundo está em `volume.semPrimeiraResposta`.
				percentualDentroDaMeta: ratioToPercent(sla.dentroDaMeta, respondidos),
				faixasPrimeiraResposta: sla.faixas.map((faixa) => ({ faixa: faixa.label, quantidade: faixa.quantidade })),
			},
			responsaveis: {
				porTipo: atendimento.porTipoResponsavel,
				encerradosPelaIA: atendimento.encerradosPelaIA,
				handoffsDaIA: atendimento.handoffs,
				contencaoIAPercentual: ratioToPercent(
					atendimento.encerradosPelaIA,
					atendimento.porTipoResponsavel.find((linha) => linha.tipo === "AGENTE")?.quantidade ?? 0,
				),
				retomadasIA: {
					enviadas: atendimento.retomadas.enviadas,
					respondidas: atendimento.retomadas.respondidas,
					expiradas: atendimento.retomadas.expiradas,
					taxaRespostaPercentual: ratioToPercent(atendimento.retomadas.respondidas, atendimento.retomadas.enviadas),
				},
			},
			mensagens: {
				recebidas: mensagens.recebidas,
				enviadas: mensagens.enviadas,
				porAutor: mensagens.porAutor,
				mediaPorAtendimento: volume.abertos ? roundForModel(mensagens.mediaPorAtendimento, 1) : undefined,
			},
			filaAgora: {
				abertos: backlog.abertosAgora,
				semResponsavel: backlog.naFila,
				aguardandoResposta: backlog.aguardandoResposta,
				janelaExpirandoEm4h: backlog.janelaExpirando,
				janelaExpirada: backlog.janelaExpirada,
				maisAntigoDesde: backlog.maisAntigoData,
				idade: durationStatsToMinutes(backlog.idadeFila),
				porStatus: backlog.porStatus,
			},
			distribuicoes: {
				prioridade: distribuicoes.prioridade.map((linha) => ({ prioridade: linha.prioridade ?? "SEM_PRIORIDADE", quantidade: linha.quantidade })),
				categoria: distribuicoes.categoria,
			},
			atendentes: ranking?.ranking.map((linha) => ({
				usuarioId: linha.usuarioId,
				nome: linha.nome,
				carteiraAtual: linha.carteiraAtual,
				atendidos: linha.atendidos,
				encerrados: linha.encerrados,
				resolvidos: linha.resolvidos,
				mensagensEnviadas: linha.mensagensEnviadas,
				primeiraResposta: durationStatsToMinutes(linha.tempoPrimeiraResposta),
				resolucao: durationStatsToMinutes(linha.tempoResolucao),
			})),
		};
	},
});

import { createManualInteraction } from "@/lib/interactions/create";
import type { DB, DBTransaction } from "@/services/drizzle";
import { chatAssignments, chatMessages, clientSellerReferences, chats } from "@/services/drizzle/schema";
import { experimental_evaluate as evaluate } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { TRIAGE_MODEL_ID } from "./message-triage";

type TDb = DB | DBTransaction;

/**
 * "O cliente sumiu com pendência?" — o §9.2 do plano de confiabilidade, a custo de centavos.
 *
 * Roda sobre os atendimentos que o cron de inatividade acabou de encerrar e que a IA (ou
 * ninguém) conduzia. Jev lê o resumo e as últimas mensagens; com probabilidade alta de pendência
 * comercial, cria um follow-up PLANEJADO na agenda do vendedor da carteira do cliente. Não é
 * retomada por IA: é a IA entregando a pendência a quem pode ligar.
 *
 * Nunca lança: uma falha aqui não pode virar falha do encerramento, que já aconteceu.
 */

const PENDING_PROBABILITY_THRESHOLD = 0.8;
const MAX_PER_SWEEP = 50;
const LOG = "[AI_TRIAGE] [ABANDONED]";

type TClosedAttendance = { id: string; chatId: string; organizacaoId: string; responsavelTipo: string };

function nextMorningInSaoPaulo(now: Date): Date {
	// 09:00 de São Paulo (UTC-3) do dia seguinte.
	const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
	return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, 12, 0, 0, 0));
}

export async function handOffAbandonedAttendancesToSellers(db: TDb, input: { closed: TClosedAttendance[]; now: Date }): Promise<number> {
	const candidates = input.closed.filter((row) => row.responsavelTipo === "AGENTE" || row.responsavelTipo === "NAO_ATRIBUIDO").slice(0, MAX_PER_SWEEP);
	let created = 0;

	for (const attendance of candidates) {
		try {
			const [ticket, chat] = await Promise.all([
				db.query.chatAssignments.findFirst({ where: eq(chatAssignments.id, attendance.id), columns: { resumo: true, clienteId: true } }),
				db.query.chats.findFirst({ where: eq(chats.id, attendance.chatId), columns: { clienteId: true } }),
			]);
			const clienteId = chat?.clienteId;
			if (!clienteId) continue;

			// Sem vendedor de carteira não há agenda para receber a pendência.
			const reference = await db.query.clientSellerReferences.findFirst({
				where: and(eq(clientSellerReferences.organizacaoId, attendance.organizacaoId), eq(clientSellerReferences.clienteId, clienteId)),
				columns: { vendedorId: true },
			});
			if (!reference?.vendedorId) continue;

			const messages = await db.query.chatMessages.findMany({
				where: eq(chatMessages.chatId, attendance.chatId),
				orderBy: [desc(chatMessages.dataEnvio)],
				limit: 8,
				columns: { autorTipo: true, conteudoTexto: true, conteudoMidiaTextoProcessado: true },
			});
			const conversa = messages
				.slice()
				.reverse()
				.map((message) => `${message.autorTipo === "CLIENTE" ? "Cliente" : "Loja"}: ${message.conteudoTexto || message.conteudoMidiaTextoProcessado || ""}`)
				.filter((line) => !line.endsWith(": "));
			if (conversa.length === 0 && !ticket?.resumo) continue;

			const result = await evaluate({
				model: TRIAGE_MODEL_ID,
				state: { resumoDoAtendimento: ticket?.resumo ?? null, ultimasMensagens: conversa },
				questions: {
					pendencia: {
						type: "boolean",
						instructions:
							"O cliente parou de responder com uma pendência comercial em aberto (recebeu preço ou orçamento e não decidiu, pediu algo que ficou sem conclusão)? Não é pendência quando a conversa terminou resolvida, o cliente recusou, ou era só uma dúvida respondida.",
					},
				},
				maxRetries: 1,
			});
			if (result.answers.pendencia.probability < PENDING_PROBABILITY_THRESHOLD) continue;

			await createManualInteraction({
				organizacaoId: attendance.organizacaoId,
				clienteId,
				vendedorId: reference.vendedorId,
				autorId: null,
				canal: "WHATSAPP",
				direcao: "SAIDA",
				iniciadoPor: "AGENTE_IA",
				planejada: true,
				dataInteracao: nextMorningInSaoPaulo(input.now),
				titulo: "Cliente sumiu com pendência",
				descricao: ticket?.resumo ?? "Conversa encerrada por inatividade com pendência comercial em aberto.",
			});
			created += 1;
		} catch (error) {
			console.error(`${LOG} Falha ao avaliar atendimento encerrado:`, attendance.id, error);
		}
	}

	if (candidates.length > 0) console.log(`${LOG} ${candidates.length} atendimento(s) avaliado(s), ${created} pendência(s) na agenda.`);
	return created;
}

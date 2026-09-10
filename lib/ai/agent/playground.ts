import { claimChatAttendanceForAgent, getCurrentChatAttendance } from "@/lib/chats/attendance-state";
import { db } from "@/services/drizzle";
import { aiAgentRuns, chatMessages, chats, clients } from "@/services/drizzle/schema";
import { and, asc, desc, eq } from "drizzle-orm";

/**
 * Chat sintético para testar o agente.
 *
 * O ponto do playground é rodar **o mesmo pipeline de produção**: mesmo runtime, mesmas
 * ferramentas, mesmo registro de execução. As únicas diferenças são o `gatilho`
 * (`PLAYGROUND`), a ausência de debounce e o adapter de entrega, que só persiste.
 *
 * O chat é real (linha em `ampmais_chats`), sem conexão de WhatsApp e marcado com
 * `origem: "PLAYGROUND"` — é assim que o hub de atendimentos o ignora.
 */

const PLAYGROUND_CLIENT_NAME = "Cliente de Teste (Playground)";

/** Cliente fictício por organização, reaproveitado entre sessões de teste. */
export async function ensurePlaygroundClient(organizacaoId: string, autorId?: string | null) {
	const existing = await db.query.clients.findFirst({
		where: and(eq(clients.organizacaoId, organizacaoId), eq(clients.nome, PLAYGROUND_CLIENT_NAME)),
		columns: { id: true },
	});
	if (existing) return existing.id;

	const [created] = await db
		.insert(clients)
		.values({
			organizacaoId,
			autorId: autorId ?? null,
			nome: PLAYGROUND_CLIENT_NAME,
			telefone: "",
			canalAquisicao: "PLAYGROUND",
		})
		.returning({ id: clients.id });

	return created.id;
}

export async function getPlaygroundChat(organizacaoId: string) {
	return db.query.chats.findFirst({
		where: and(eq(chats.organizacaoId, organizacaoId), eq(chats.origem, "PLAYGROUND")),
		orderBy: [desc(chats.dataInsercao)],
		columns: { id: true, clienteId: true },
	});
}

/**
 * Cria um chat de teste novo. Chamar de novo abre outra conversa em branco — é o "novo chat
 * de teste" da UI, que é como se testa uma instrução alterada sem o histórico anterior
 * contaminando o contexto.
 */
export async function createPlaygroundChat({
	organizacaoId,
	agenteId,
	autorId,
}: {
	organizacaoId: string;
	agenteId: string;
	autorId?: string | null;
}) {
	const clienteId = await ensurePlaygroundClient(organizacaoId, autorId);

	const [chat] = await db
		.insert(chats)
		.values({
			organizacaoId,
			clienteId,
			origem: "PLAYGROUND",
			ultimaMensagemData: new Date(),
		})
		.returning({ id: chats.id });

	// O agente assume o chat de imediato: no playground não há fila nem disputa com humanos.
	await claimChatAttendanceForAgent(db, { organizacaoId, chatId: chat.id, agenteId });

	return { chatId: chat.id, clienteId };
}

/** Persiste a mensagem "do cliente" digitada no playground. */
export async function persistPlaygroundClientMessage({
	organizacaoId,
	chatId,
	clienteId,
	texto,
}: {
	organizacaoId: string;
	chatId: string;
	clienteId: string;
	texto: string;
}) {
	const now = new Date();

	const [inserted] = await db
		.insert(chatMessages)
		.values({
			organizacaoId,
			chatId,
			clienteId,
			autorTipo: "CLIENTE",
			autorClienteId: clienteId,
			conteudoTexto: texto,
			conteudoMidiaTipo: "TEXTO",
			statusEntrega: "ENTREGUE",
			dataEnvio: now,
		})
		.returning({ id: chatMessages.id, dataEnvio: chatMessages.dataEnvio });

	await db
		.update(chats)
		.set({ ultimaMensagemId: inserted.id, ultimaMensagemData: inserted.dataEnvio, ultimaMensagemEntradaData: inserted.dataEnvio })
		.where(eq(chats.id, chatId));

	return { messageId: inserted.id, dataEnvio: inserted.dataEnvio };
}

/** Estado que a UI busca por polling enquanto o agente responde. */
export async function getPlaygroundState({ organizacaoId, chatId }: { organizacaoId: string; chatId: string }) {
	const messages = await db.query.chatMessages.findMany({
		where: and(eq(chatMessages.chatId, chatId), eq(chatMessages.organizacaoId, organizacaoId)),
		orderBy: [asc(chatMessages.dataEnvio)],
		columns: {
			id: true,
			autorTipo: true,
			conteudoTexto: true,
			// O anexo do agente sai daqui: o playground é onde a organização confere o arquivo antes
			// de ele chegar a um cliente.
			conteudoMidiaTipo: true,
			conteudoMidiaUrl: true,
			conteudoMidiaArquivoNome: true,
			dataEnvio: true,
			metadados: true,
		},
	});

	const attendance = await getCurrentChatAttendance(db, { organizacaoId, chatId });

	const runs = await db.query.aiAgentRuns.findMany({
		where: and(eq(aiAgentRuns.chatId, chatId), eq(aiAgentRuns.organizacaoId, organizacaoId)),
		orderBy: [desc(aiAgentRuns.dataInsercao)],
		limit: 1,
		columns: { id: true, status: true, erro: true, uso: true, dataInsercao: true },
	});

	const lastRun = runs[0] ?? null;

	return {
		mensagens: messages,
		atendimento: attendance ? { status: attendance.status, responsavelTipo: attendance.responsavelTipo, resumo: attendance.resumo } : null,
		ultimaExecucao: lastRun,
		execucaoAtiva: lastRun ? lastRun.status === "PENDENTE" || lastRun.status === "RODANDO" : false,
	};
}

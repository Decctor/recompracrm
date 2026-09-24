import { getCurrentChatAttendance } from "@/lib/chats/attendance-state";
import { isWhatsappWindowOpen } from "@/lib/chats/whatsapp-window-status";
import type { DB, DBTransaction } from "@/services/drizzle";
import { chatMessages, chats } from "@/services/drizzle/schema";
import { and, desc, eq } from "drizzle-orm";

type TDb = DB | DBTransaction;

/** Quantas mensagens do histórico entram no contexto do turno. */
const HISTORY_MESSAGE_LIMIT = 100;

export type TChatRunContext = {
	chatId: string;
	cliente: {
		id: string;
		nome: string;
		telefone: string | null;
		email: string | null;
		cidade: string | null;
		estado: string | null;
		aniversario: Date | null;
	};
	conversa: Array<{ autor: string; texto: string; dataEnvio: Date | null }>;
	atendimento: { status: string; responsavelTipo: string; resumo: string | null } | null;
	tempo: {
		agora: string;
		fusoHorario: string;
		janelaWhatsapp: { aberta: boolean; expiraEm: Date | null };
		ultimaMensagemDoClienteEm: Date | null;
		ultimaMensagemEnviadaEm: Date | null;
	};
};

function describeAuthor(autorTipo: string): string {
	if (autorTipo === "CLIENTE") return "Cliente";
	if (autorTipo === "AI") return "Você (assistente)";
	if (autorTipo === "USUÁRIO") return "Atendente humano";
	// Eco do WhatsApp Business no celular da loja: é gente da equipe respondendo por fora da
	// plataforma. Rotulado como "Sistema", o modelo lia a conversa como ruído automático.
	if (autorTipo === "BUSINESS-APP") return "Atendente humano (celular da loja)";
	return "Sistema";
}

function formatSaoPauloMoment(instant: string): string {
	const date = new Date(instant);
	const hour = Number(
		new Intl.DateTimeFormat("en-US", {
			timeZone: "America/Sao_Paulo",
			hour: "2-digit",
			hourCycle: "h23",
		}).format(date),
	);
	const period = hour < 6 ? "madrugada" : hour < 12 ? "manhã" : hour < 18 ? "tarde" : "noite";
	const localDateTime = new Intl.DateTimeFormat("pt-BR", {
		timeZone: "America/Sao_Paulo",
		dateStyle: "short",
		timeStyle: "short",
		hour12: false,
	}).format(date);

	return `${localDateTime} (${period})`;
}

/**
 * Snapshot que acompanha **sempre** o prompt do turno.
 *
 * Decisão deliberada: o modelo não deve gastar chamadas de ferramenta para redescobrir quem é
 * o cliente, o que já foi dito e que horas são. Ferramentas servem para o que varia sob
 * demanda (compras, catálogo, cashback), não para o básico do atendimento.
 *
 * O bloco `tempo` existe porque o modelo não tem relógio: sem ele, ou alucina datas, ou trata
 * a janela de 24h do WhatsApp como se sempre estivesse aberta.
 */
export async function buildChatRunContext(
	db: TDb,
	input: { organizacaoId: string; chatId: string },
): Promise<{ contexto: TChatRunContext; clienteId: string }> {
	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, input.chatId), eq(chats.organizacaoId, input.organizacaoId)),
		columns: {
			id: true,
			clienteId: true,
			whatsappJanelaDataExpiracao: true,
			ultimaMensagemEntradaData: true,
			ultimaMensagemSaidaData: true,
		},
		with: {
			cliente: {
				columns: {
					id: true,
					nome: true,
					telefone: true,
					email: true,
					localizacaoCidade: true,
					localizacaoEstado: true,
					dataNascimento: true,
				},
			},
			whatsappConexao: { columns: { tipoConexao: true } },
		},
	});

	if (!chat) throw new Error("Chat não encontrado para montar o contexto do agente.");

	const messages = await db.query.chatMessages.findMany({
		where: and(eq(chatMessages.chatId, chat.id), eq(chatMessages.organizacaoId, input.organizacaoId)),
		orderBy: [desc(chatMessages.dataEnvio)],
		limit: HISTORY_MESSAGE_LIMIT,
		columns: {
			autorTipo: true,
			conteudoTexto: true,
			conteudoMidiaTipo: true,
			conteudoMidiaTextoProcessado: true,
			conteudoMidiaTextoProcessadoResumo: true,
			dataEnvio: true,
		},
	});

	const attendance = await getCurrentChatAttendance(db, { organizacaoId: input.organizacaoId, chatId: chat.id });

	const now = new Date();
	const isWindowOpen = isWhatsappWindowOpen({
		expiracao: chat.whatsappJanelaDataExpiracao,
		tipoConexao: chat.whatsappConexao?.tipoConexao,
		now,
	});

	return {
		clienteId: chat.clienteId,
		contexto: {
			chatId: chat.id,
			cliente: {
				id: chat.cliente.id,
				nome: chat.cliente.nome,
				telefone: chat.cliente.telefone,
				email: chat.cliente.email,
				cidade: chat.cliente.localizacaoCidade,
				estado: chat.cliente.localizacaoEstado,
				aniversario: chat.cliente.dataNascimento,
			},
			// Cronológico: o modelo lê a conversa como ela aconteceu.
			conversa: messages
				.slice()
				.reverse()
				.map((message) => ({
					autor: describeAuthor(message.autorTipo),
					// Mídia processada (áudio transcrito, imagem descrita) entra como texto — para o
					// modelo, uma nota de voz e uma mensagem escrita valem o mesmo.
					texto:
						message.conteudoTexto ||
						message.conteudoMidiaTextoProcessado ||
						message.conteudoMidiaTextoProcessadoResumo ||
						(message.conteudoMidiaTipo ? `[${message.conteudoMidiaTipo}]` : ""),
					dataEnvio: message.dataEnvio,
				}))
				.filter((message) => message.texto.length > 0),
			atendimento: attendance ? { status: attendance.status, responsavelTipo: attendance.responsavelTipo, resumo: attendance.resumo } : null,
			tempo: {
				agora: now.toISOString(),
				fusoHorario: "America/Sao_Paulo (BRT, UTC-03:00)",
				janelaWhatsapp: { aberta: isWindowOpen, expiraEm: chat.whatsappJanelaDataExpiracao },
				ultimaMensagemDoClienteEm: chat.ultimaMensagemEntradaData,
				ultimaMensagemEnviadaEm: chat.ultimaMensagemSaidaData,
			},
		},
	};
}

/** Serializa o contexto para o prompt do turno. */
export function formatChatRunContext(context: TChatRunContext): string {
	const client = context.cliente;
	const clientLines = [
		`- Nome: ${client.nome}`,
		client.telefone ? `- Telefone: ${client.telefone}` : null,
		client.email ? `- E-mail: ${client.email}` : null,
		client.cidade || client.estado ? `- Localização: ${[client.cidade, client.estado].filter(Boolean).join(" / ")}` : null,
	]
		.filter(Boolean)
		.join("\n");

	const conversation = context.conversa.map((message) => `${message.autor}: ${message.texto}`).join("\n");

	const attendanceBlock = context.atendimento
		? `\n## Atendimento em aberto\n- Status: ${context.atendimento.status}\n- Responsável: ${context.atendimento.responsavelTipo}${
				context.atendimento.resumo ? `\n- Resumo acumulado: ${context.atendimento.resumo}` : ""
			}\n`
		: "";

	return `## Cliente
${clientLines}

## Momento atual
- Agora em São Paulo: ${formatSaoPauloMoment(context.tempo.agora)}
- Fuso horário: ${context.tempo.fusoHorario}
- Janela de 24h do WhatsApp: ${context.tempo.janelaWhatsapp.aberta ? "aberta" : "fechada"}
${attendanceBlock}
## Conversa até aqui
${conversation || "(sem mensagens anteriores)"}

Responda à última mensagem do cliente.`;
}

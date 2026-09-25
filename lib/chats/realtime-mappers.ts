import type { TChatThreadMessage } from "@/lib/queries/chats";
import type { TChatMessageMetadata } from "@/schemas/chats";
import type {
	TAiAgentRunStatusEnum,
	TAiAgentRunTriggerEnum,
	TChatMessageAuthorTypeEnum,
	TChatMessageContentTypeEnum,
	TChatMessageDeliveryStatus,
} from "@/schemas/enums";

/**
 * Fronteira entre o snake_case do Postgres (que chega cru pelo realtime do Supabase) e o
 * camelCase da API. Existe em um lugar só de propósito: duplicar este mapeamento nos dois
 * canais garante que eles divirjam na primeira coluna nova.
 */

export type TRealtimeChatMessageRow = {
	id: string;
	chat_id: string;
	organizacao_id: string;
	autor_tipo: TChatMessageAuthorTypeEnum;
	autor_usuario_id: string | null;
	autor_cliente_id: string | null;
	conteudo_texto: string | null;
	conteudo_midia_tipo: TChatMessageContentTypeEnum;
	conteudo_midia_url: string | null;
	conteudo_midia_storage_id: string | null;
	conteudo_midia_mime_type: string | null;
	conteudo_midia_arquivo_nome: string | null;
	conteudo_midia_arquivo_tamanho: number | null;
	conteudo_midia_texto_processado: string | null;
	conteudo_midia_texto_processado_resumo: string | null;
	cliente_mensagem_id: string | null;
	whatsapp_message_id: string | null;
	whatsapp_echo: boolean | null;
	metadados: TChatMessageMetadata | null;
	status_entrega: TChatMessageDeliveryStatus;
	provedor_status_data_atualizacao: string | null;
	data_envio: string;
};

export type TRealtimeChatRow = {
	id: string;
	organizacao_id: string;
	whatsapp_conexao_telefone_id: string | null;
	mensagens_nao_lidas: number | null;
	ultima_mensagem_id: string | null;
	ultima_mensagem_data: string | null;
	ultima_mensagem_entrada_data: string | null;
	ultima_mensagem_saida_data: string | null;
	whatsapp_janela_data_expiracao: string | null;
	ultima_leitura_data: string | null;
};

/** Linha de `ai_agent_runs` como chega pelo realtime. Só o que a presença da IA consome. */
export type TRealtimeAiRunRow = {
	id: string;
	chat_id: string;
	organizacao_id: string;
	status: TAiAgentRunStatusEnum;
	gatilho: TAiAgentRunTriggerEnum;
	erro: string | null;
	data_inicio: string | null;
	data_fim: string | null;
	data_insercao: string;
};

export type TRealtimeAiRun = {
	id: string;
	chatId: string;
	status: TAiAgentRunStatusEnum;
	gatilho: TAiAgentRunTriggerEnum;
	erro: string | null;
	dataInicio: Date | null;
	dataFim: Date | null;
	dataInsercao: Date;
};

export function mapRealtimeAiRunRow(row: TRealtimeAiRunRow): TRealtimeAiRun {
	return {
		id: row.id,
		chatId: row.chat_id,
		status: row.status,
		gatilho: row.gatilho,
		erro: row.erro,
		dataInicio: row.data_inicio ? new Date(row.data_inicio) : null,
		dataFim: row.data_fim ? new Date(row.data_fim) : null,
		dataInsercao: new Date(row.data_insercao),
	};
}

/**
 * O payload do realtime não traz os joins de autor. Para mensagens do próprio usuário
 * reconstruímos o autor a partir da sessão; para as demais o nome vem no próximo refetch,
 * disparado pelo `ChatThread` quando a mensagem não é dele.
 */
export function mapRealtimeMessageRow(
	row: TRealtimeChatMessageRow,
	currentUser: { id: string; nome: string; avatarUrl: string | null },
): TChatThreadMessage {
	const isCurrentUser = row.autor_usuario_id === currentUser.id;
	return {
		id: row.id,
		chatId: row.chat_id,
		autorTipo: row.autor_tipo,
		autorUsuario: isCurrentUser ? { id: currentUser.id, nome: currentUser.nome, avatarUrl: currentUser.avatarUrl } : null,
		autorCliente: null,
		conteudoTexto: row.conteudo_texto,
		conteudoMidiaTipo: row.conteudo_midia_tipo,
		conteudoMidiaUrl: row.conteudo_midia_url,
		conteudoMidiaMimeType: row.conteudo_midia_mime_type,
		conteudoMidiaArquivoNome: row.conteudo_midia_arquivo_nome,
		conteudoMidiaArquivoTamanho: row.conteudo_midia_arquivo_tamanho,
		conteudoMidiaTextoProcessado: row.conteudo_midia_texto_processado,
		conteudoMidiaTextoProcessadoResumo: row.conteudo_midia_texto_processado_resumo,
		statusEntrega: row.status_entrega,
		provedorStatusDataAtualizacao: row.provedor_status_data_atualizacao ? new Date(row.provedor_status_data_atualizacao) : null,
		dataEnvio: new Date(row.data_envio),
		whatsappMessageId: row.whatsapp_message_id,
		whatsappEcho: row.whatsapp_echo ?? false,
		clienteMensagemId: row.cliente_mensagem_id,
		metadados: row.metadados ?? null,
	};
}

/** Campos do chat que o realtime consegue patchar sem invalidar a lista inteira. */
export function mapRealtimeChatRow(row: TRealtimeChatRow) {
	return {
		mensagensNaoLidas: row.mensagens_nao_lidas ?? 0,
		ultimaMensagemId: row.ultima_mensagem_id,
		ultimaMensagemData: row.ultima_mensagem_data ? new Date(row.ultima_mensagem_data) : null,
		ultimaMensagemEntradaData: row.ultima_mensagem_entrada_data ? new Date(row.ultima_mensagem_entrada_data) : null,
		ultimaMensagemSaidaData: row.ultima_mensagem_saida_data ? new Date(row.ultima_mensagem_saida_data) : null,
		whatsappJanelaDataExpiracao: row.whatsapp_janela_data_expiracao ? new Date(row.whatsapp_janela_data_expiracao) : null,
		ultimaLeituraData: row.ultima_leitura_data ? new Date(row.ultima_leitura_data) : null,
	};
}

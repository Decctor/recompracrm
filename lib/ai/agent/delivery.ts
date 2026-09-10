import { applyProviderDeliveryStatus, persistOutboundNonHubMessage } from "@/lib/chats/incoming-message";
import { isWhatsappWindowOpen } from "@/lib/chats/whatsapp-window-status";
import { type SendMessageContent, sendMessage as sendInternalGatewayMessage } from "@/lib/whatsapp/internal-gateway";
import { formatPhoneAsWhatsappId, formatPhoneForInternalGateway } from "@/lib/whatsapp/utils";
import type { TAiAgentTurnAttachment } from "@/schemas/ai-agents";
import { db } from "@/services/drizzle";
import { chatMessages, chats } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { toProviderMediaType } from "./attachment";
import type { TAgentMessageDeliverer } from "./respond-to-chat";

/**
 * Adapters de entrega da mensagem do agente, um por canal.
 *
 * Ficam fora do runtime de propósito: as regras de canal (janela de 24h da Meta, fila do
 * gateway interno) não devem ser decisões do modelo nem viver no loop do agente.
 *
 * Todos persistem a mensagem com `metadados.aiAgente`, o espelho denormalizado do vínculo
 * canônico `ai_agent_runs.mensagemEnviadaId` — o hub exibe a origem sem precisar de join.
 */

// `runId` e `agenteId` chegam por argumento na entrega — só existem depois que a execução abre.
type TDelivererParams = { organizacaoId: string; chatId: string };

/**
 * Como a mensagem persistida descreve o anexo. `enviado: false` significa que o provedor recusou
 * o arquivo e o cliente recebeu só o texto — a thread não pode mostrar um anexo que não saiu.
 */
function attachmentColumns(anexo: TAiAgentTurnAttachment | null, enviado: boolean) {
	if (!anexo || !enviado) return { conteudoMidiaTipo: "TEXTO" as const, midia: null };
	return { conteudoMidiaTipo: anexo.tipo, midia: { publicUrl: anexo.url, arquivoNome: anexo.nomeArquivo } };
}

/**
 * Envio pela Meta Cloud API com degradê deliberado: o anexo vai como `link` (a Meta busca a URL
 * sozinha, sem upload do nosso lado) e, se ela recusar o arquivo, a mesma mensagem sai como texto.
 * Um PDF quebrado não pode custar a resposta ao cliente.
 */
async function sendViaMetaCloud({
	fromPhoneNumberId,
	toPhoneNumber,
	whatsappToken,
	mensagem,
	anexo,
}: {
	fromPhoneNumberId: string;
	toPhoneNumber: string;
	whatsappToken: string;
	mensagem: string;
	anexo: TAiAgentTurnAttachment | null;
}): Promise<{ whatsappMessageId: string | null; anexoEnviado: boolean }> {
	const { sendBasicWhatsappMessage, sendMediaWhatsappMessage } = await import("@/lib/whatsapp");

	if (anexo) {
		try {
			const response = await sendMediaWhatsappMessage({
				fromPhoneNumberId,
				toPhoneNumber,
				media: { link: anexo.url },
				mediaType: toProviderMediaType(anexo.tipo),
				caption: mensagem || undefined,
				filename: anexo.nomeArquivo ?? undefined,
				whatsappToken,
			});
			return { whatsappMessageId: response.whatsappMessageId, anexoEnviado: true };
		} catch (error) {
			console.error("[AI_AGENT] [DELIVERY] Anexo recusado pela Meta, seguindo só com texto:", anexo.url, error);
		}
	}

	if (!mensagem) return { whatsappMessageId: null, anexoEnviado: false };

	try {
		const response = await sendBasicWhatsappMessage({ fromPhoneNumberId, toPhoneNumber, content: mensagem, whatsappToken });
		return { whatsappMessageId: response.whatsappMessageId, anexoEnviado: false };
	} catch (error) {
		console.error("[AI_AGENT] [DELIVERY] Falha no envio via Meta Cloud API:", error);
		return { whatsappMessageId: null, anexoEnviado: false };
	}
}

async function loadChatForDelivery(organizacaoId: string, chatId: string) {
	return db.query.chats.findFirst({
		where: and(eq(chats.id, chatId), eq(chats.organizacaoId, organizacaoId)),
		columns: { id: true, clienteId: true, whatsappTelefoneId: true, whatsappJanelaDataExpiracao: true },
		with: {
			cliente: { columns: { telefone: true } },
			whatsappConexao: { columns: { token: true, tipoConexao: true, gatewaySessaoId: true, gatewayStatus: true } },
		},
	});
}

/** Meta Cloud API: envia primeiro, persiste depois — o id do provider volta na resposta. */
export function createMetaCloudDeliverer({ organizacaoId, chatId }: TDelivererParams): TAgentMessageDeliverer {
	return async ({ mensagem, anexo, runId, agenteId }) => {
		const chat = await loadChatForDelivery(organizacaoId, chatId);
		if (!chat) {
			console.error("[AI_AGENT] [DELIVERY] Chat não encontrado para entrega:", chatId);
			return { messageId: null };
		}

		// Fora da janela de 24h só passa template, e a IA não envia template.
		if (!isWhatsappWindowOpen({ expiracao: chat.whatsappJanelaDataExpiracao, tipoConexao: chat.whatsappConexao?.tipoConexao })) {
			console.log("[AI_AGENT] [DELIVERY] Janela de 24h expirada, resposta descartada:", chatId);
			return { messageId: null };
		}

		const { whatsappMessageId, anexoEnviado } =
			chat.whatsappConexao?.token && chat.cliente?.telefone && chat.whatsappTelefoneId
				? await sendViaMetaCloud({
						fromPhoneNumberId: chat.whatsappTelefoneId,
						toPhoneNumber: formatPhoneAsWhatsappId(chat.cliente.telefone),
						whatsappToken: chat.whatsappConexao.token,
						mensagem,
						anexo,
					})
				: { whatsappMessageId: null, anexoEnviado: false };

		const inserted = await persistOutboundNonHubMessage({
			organizacaoId,
			chatId,
			clienteId: chat.clienteId,
			origem: "AI",
			whatsappMessageId,
			conteudoTexto: mensagem,
			...attachmentColumns(anexo, anexoEnviado),
			metadados: { aiAgente: { runId, agenteId } },
		});
		// null = wamid já persistido por outra via (o webhook de echo chegou primeiro).
		if (!inserted) return { messageId: null };

		if (!whatsappMessageId) {
			await applyProviderDeliveryStatus({ statusEntrega: "FALHA", chatMessageId: inserted.messageId });
		}

		return { messageId: inserted.messageId };
	};
}

/**
 * Gateway interno: persiste primeiro (a mensagem nasce PENDENTE) e enfileira depois — o
 * `clientMessageId` é o próprio id da mensagem, que é como o webhook `message.sent` reconcilia.
 */
export function createInternalGatewayDeliverer({ organizacaoId, chatId, sessaoId }: TDelivererParams & { sessaoId: string }): TAgentMessageDeliverer {
	return async ({ mensagem, anexo, runId, agenteId }) => {
		const chat = await loadChatForDelivery(organizacaoId, chatId);
		if (!chat) {
			console.error("[AI_AGENT] [DELIVERY] Chat não encontrado para entrega:", chatId);
			return { messageId: null };
		}

		const inserted = await persistOutboundNonHubMessage({
			organizacaoId,
			chatId,
			clienteId: chat.clienteId,
			origem: "AI",
			whatsappMessageId: null,
			conteudoTexto: mensagem,
			// Otimista: aqui a persistência vem antes do envio, então a linha nasce com o anexo e é
			// corrigida abaixo se a fila recusar.
			...attachmentColumns(anexo, true),
			metadados: { gatewayInterno: { sessaoId }, aiAgente: { runId, agenteId } },
		});
		// Sem wamid não há alvo de conflito; o null aqui é impossível, mas o tipo exige o guard.
		if (!inserted) return { messageId: null };

		if (!chat.whatsappConexao?.gatewaySessaoId || chat.whatsappConexao.gatewayStatus !== "connected" || !chat.cliente?.telefone) {
			console.warn("[AI_AGENT] [DELIVERY] Gateway interno indisponível:", chatId);
			await applyProviderDeliveryStatus({ statusEntrega: "FALHA", chatMessageId: inserted.messageId });
			return { messageId: inserted.messageId };
		}

		const gatewaySessaoId = chat.whatsappConexao.gatewaySessaoId;
		const destino = formatPhoneForInternalGateway(chat.cliente.telefone);
		const enqueue = async (content: SendMessageContent) => {
			const response = await sendInternalGatewayMessage(gatewaySessaoId, destino, content, { clientMessageId: inserted.messageId });
			if (!response.success) throw new Error(response.error || "Falha ao enfileirar a mensagem da IA no Gateway Interno.");
		};

		try {
			await enqueue(
				anexo
					? {
							type: toProviderMediaType(anexo.tipo),
							text: mensagem || undefined,
							mediaUrl: anexo.url,
							mediaFileName: anexo.nomeArquivo ?? undefined,
						}
					: { type: "text", text: mensagem },
			);
		} catch (error) {
			console.error("[AI_AGENT] [DELIVERY] Falha ao enfileirar no gateway interno:", error);

			// Mesmo degradê da Meta. Reusar o `clientMessageId` é seguro porque a tentativa anterior
			// não chegou a enfileirar — é justamente o que a falha acima diz.
			const degradou = await (async () => {
				if (!anexo || !mensagem) return false;
				try {
					await enqueue({ type: "text", text: mensagem });
					await db
						.update(chatMessages)
						.set({ conteudoMidiaTipo: "TEXTO", conteudoMidiaUrl: null, conteudoMidiaArquivoNome: null })
						.where(eq(chatMessages.id, inserted.messageId));
					console.warn("[AI_AGENT] [DELIVERY] Anexo recusado pelo gateway, seguindo só com texto:", anexo.url);
					return true;
				} catch (retryError) {
					console.error("[AI_AGENT] [DELIVERY] Falha ao reenfileirar sem o anexo:", retryError);
					return false;
				}
			})();

			if (!degradou) await applyProviderDeliveryStatus({ statusEntrega: "FALHA", chatMessageId: inserted.messageId });
		}

		return { messageId: inserted.messageId };
	};
}

/**
 * Escolhe o adapter pelo canal da conexão do chat.
 *
 * Os webhooks montam o seu adapter direto, porque já sabem por qual canal a mensagem entrou.
 * Quem dispara o agente fora de um webhook (a atribuição pelo hub) não sabe, e replicar a
 * escolha no chamador espalharia a regra de canal por dois lugares.
 *
 * Devolve `null` quando não há canal por onde entregar — conexão ausente, ou gateway interno
 * sem sessão. Aí não há turno a executar: gastar tokens numa resposta que não sai é pior do
 * que não responder.
 */
export async function resolveChatDeliverer({ organizacaoId, chatId }: TDelivererParams): Promise<TAgentMessageDeliverer | null> {
	const chat = await loadChatForDelivery(organizacaoId, chatId);
	if (!chat?.whatsappConexao) return null;

	if (chat.whatsappConexao.tipoConexao === "INTERNAL_GATEWAY") {
		if (!chat.whatsappConexao.gatewaySessaoId) return null;
		return createInternalGatewayDeliverer({ organizacaoId, chatId, sessaoId: chat.whatsappConexao.gatewaySessaoId });
	}

	return createMetaCloudDeliverer({ organizacaoId, chatId });
}

/**
 * Playground: apenas persiste. Sem envio externo e sem checagem de janela — o chat de teste
 * não tem conexão de WhatsApp.
 */
export function createPlaygroundDeliverer({ organizacaoId, chatId }: TDelivererParams): TAgentMessageDeliverer {
	return async ({ mensagem, anexo, runId, agenteId }) => {
		const chat = await loadChatForDelivery(organizacaoId, chatId);
		if (!chat) return { messageId: null };

		const inserted = await persistOutboundNonHubMessage({
			organizacaoId,
			chatId,
			clienteId: chat.clienteId,
			origem: "AI",
			whatsappMessageId: null,
			conteudoTexto: mensagem,
			// Sem provedor não há o que recusar: o anexo é persistido como o agente o produziu, que
			// é justamente o que a organização precisa conferir antes de soltar o agente.
			...attachmentColumns(anexo, true),
			metadados: { aiAgente: { runId, agenteId } },
		});

		return { messageId: inserted?.messageId ?? null };
	};
}

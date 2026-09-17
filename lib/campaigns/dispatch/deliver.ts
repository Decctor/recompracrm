import { EmailTemplate, sendEmailWithResend } from "@/lib/email";
import { buildInteractionMessageVariables } from "@/lib/interactions/message-preview";
import {
	buildWhatsappTemplateSendPayload,
	convertHtmlToWhatsappText,
	replaceMessageTemplateVariables,
	type TInteractionContextMetadados,
	type TMessageTemplateRuntimeContext,
} from "@/lib/message-templates";
import { sendTemplateWhatsappMessage } from "@/lib/whatsapp";
import { parseTemplatePayloadToGatewayContent, sendMessage } from "@/lib/whatsapp/internal-gateway";
import { formatPhoneForInternalGateway } from "@/lib/whatsapp/utils";
import type { TInteractionsStatusEnum } from "@/schemas/interactions";
import { db } from "@/services/drizzle";
import type { TClientEntity, TMessageTemplate } from "@/services/drizzle/schema";
import { chatMessages, chats } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

/**
 * Entrega de uma mensagem de campanha aos provedores (WhatsApp Cloud API / gateway interno e
 * e-mail). NÃO toca em `interactions` nem em quota: recebe tudo o que precisa, chama os provedores
 * e devolve o que aconteceu. Quem registra (lib/campaigns/dispatch/send.ts) decide o que persistir.
 * O único efeito colateral no banco é a mensagem do chat (Hub de atendimentos), que é registro do
 * canal e não da campanha.
 */

export type TChatPromiseCache = Map<string, Promise<string | null>>;

export type TCampaignDeliveryClient = {
	id: string;
	nome: string;
	telefone: string;
	email: string | null;
	analiseRFMTitulo: string | null;
	metadataProdutoMaisCompradoId: TClientEntity["metadataProdutoMaisCompradoId"];
	metadataGrupoProdutoMaisComprado: TClientEntity["metadataGrupoProdutoMaisComprado"];
	metadataProdutoSugeridoId: TClientEntity["metadataProdutoSugeridoId"];
};

export type TCampaignDeliveryCampaign = {
	autorId: string;
	whatsappConexaoTelefoneId: string | null;
	whatsappTemplate: TMessageTemplate;
};

export type TCampaignDeliveryInput = {
	organizationId: string;
	client: TCampaignDeliveryClient;
	campaign: TCampaignDeliveryCampaign;
	whatsappToken?: string;
	whatsappSessionId?: string;
	contextMetadados?: TInteractionContextMetadados;
	// Id da interação que será registrada se o envio sair. Vai ao gateway como clientMessageId
	// (deduplicação no provedor) e aos links de rastreio do template.
	messageKey: string;
	hasHubAccess?: boolean;
	chatIdCache?: TChatPromiseCache;
	testing?: {
		overridePhoneNumber?: string;
		disableWhatsappCloudApi?: boolean;
		disableInternalGateway?: boolean;
	};
};

export type TCampaignDeliveryOutcome = "SENT" | "QUEUED" | "FAILED" | "NO_CONTACT";

export type TCampaignDeliveryResult = {
	outcome: TCampaignDeliveryOutcome;
	// Status de entrega inicial da interação: ENVIADO (Cloud API/e-mail) ou PENDENTE (gateway
	// interno enfileirou; o webhook confirma depois).
	statusEnvio: Extract<TInteractionsStatusEnum, "ENVIADO" | "PENDENTE">;
	error: string | null;
	channelsAttempted: string[];
	channelsSkipped: string[];
	channelsSent: string[];
	channelErrors: Record<string, string>;
	whatsappMessageId?: string;
	emailMessageId?: string;
	jobId?: string;
	clientMessageId?: string;
	chatMessageId: string | null;
	whatsappStatus: string | null;
	emailStatus: string | null;
};

async function resolveOrganizationMessagingContext(organizationId: string) {
	const [organization, cashbackProgram] = await Promise.all([
		db.query.organizations.findFirst({
			where: (fields, { eq: eqFilter }) => eqFilter(fields.id, organizationId),
			columns: {
				id: true,
				nome: true,
				logoUrl: true,
				corPrimaria: true,
				corPrimariaForeground: true,
				configuracao: true,
			},
		}),
		db.query.cashbackPrograms.findFirst({
			where: (fields, { eq: eqFilter }) => eqFilter(fields.organizacaoId, organizationId),
			columns: { terminologia: true },
		}),
	]);

	return {
		organization,
		hasHubAccess: organization?.configuracao?.recursos?.hubAtendimentos?.acesso ?? false,
		organizationCashbackTerminology: cashbackProgram?.terminologia ?? "DINHEIRO",
	};
}

export async function resolveOrganizationHubAccess(organizationId: string) {
	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq: eqFilter }) => eqFilter(fields.id, organizationId),
		columns: { configuracao: true },
	});
	return organization?.configuracao?.recursos?.hubAtendimentos?.acesso ?? false;
}

async function getOrCreateChatId({
	organizationId,
	clientId,
	whatsappConnectionId,
	whatsappConnectionPhoneId,
	whatsappPhoneId,
	chatIdCache,
}: {
	organizationId: string;
	clientId: string;
	whatsappConnectionId: string;
	whatsappConnectionPhoneId: string;
	whatsappPhoneId: string | null;
	chatIdCache?: TChatPromiseCache;
}) {
	const cacheKey = `${organizationId}:${clientId}:${whatsappConnectionPhoneId}`;
	const cachedChatPromise = chatIdCache?.get(cacheKey);
	if (cachedChatPromise) return cachedChatPromise;

	const chatIdPromise = (async () => {
		// Campanhas em massa disparam vários envios ao mesmo cliente em paralelo, e o
		// find-then-insert criava chats duplicados. O upsert só é possível quando há
		// telefone: o índice único da chave natural é parcial (NULL nunca conflita).
		if (whatsappPhoneId) {
			const [inserted] = await db
				.insert(chats)
				.values({
					organizacaoId: organizationId,
					clienteId: clientId,
					whatsappTelefoneId: whatsappPhoneId,
					whatsappConexaoId: whatsappConnectionId,
					whatsappConexaoTelefoneId: whatsappConnectionPhoneId,
					ultimaMensagemData: new Date(),
				})
				.onConflictDoNothing({
					target: [chats.organizacaoId, chats.clienteId, chats.whatsappTelefoneId],
					where: sql`${chats.whatsappTelefoneId} is not null`,
				})
				.returning({ id: chats.id });

			if (inserted) return inserted.id;

			const [existingChat] = await db
				.update(chats)
				.set({
					whatsappConexaoId: whatsappConnectionId,
					whatsappConexaoTelefoneId: whatsappConnectionPhoneId,
				})
				.where(and(eq(chats.organizacaoId, organizationId), eq(chats.clienteId, clientId), eq(chats.whatsappTelefoneId, whatsappPhoneId)))
				.returning({ id: chats.id });
			return existingChat?.id ?? null;
		}

		const existingChat = await db.query.chats.findFirst({
			where: (fields, { and: andFilter, eq: eqFilter }) =>
				andFilter(
					eqFilter(fields.organizacaoId, organizationId),
					eqFilter(fields.clienteId, clientId),
					eqFilter(fields.whatsappConexaoTelefoneId, whatsappConnectionPhoneId),
				),
			columns: { id: true },
		});
		if (existingChat) {
			await db.update(chats).set({ whatsappConexaoId: whatsappConnectionId }).where(eq(chats.id, existingChat.id));
			return existingChat.id;
		}

		const [newChat] = await db
			.insert(chats)
			.values({
				organizacaoId: organizationId,
				clienteId: clientId,
				whatsappConexaoId: whatsappConnectionId,
				whatsappConexaoTelefoneId: whatsappConnectionPhoneId,
				ultimaMensagemData: new Date(),
			})
			.returning({ id: chats.id });
		return newChat?.id ?? null;
	})();

	if (chatIdCache) chatIdCache.set(cacheKey, chatIdPromise);

	try {
		const chatId = await chatIdPromise;
		if (!chatId) chatIdCache?.delete(cacheKey);
		return chatId;
	} catch (error) {
		chatIdCache?.delete(cacheKey);
		throw error;
	}
}

function buildWhatsappPlainContent({ template, variables }: { template: TMessageTemplate; variables: TMessageTemplateRuntimeContext["variaveis"] }) {
	const header =
		template.conteudo.cabecalho?.tipo === "TEXTO" && template.conteudo.cabecalho.conteudoTexto
			? convertHtmlToWhatsappText(replaceMessageTemplateVariables(template.conteudo.cabecalho.conteudoTexto, variables))
			: "";
	const body = convertHtmlToWhatsappText(replaceMessageTemplateVariables(template.conteudo.corpo.conteudo, variables));
	const footer = template.conteudo.rodape ? convertHtmlToWhatsappText(replaceMessageTemplateVariables(template.conteudo.rodape, variables)) : "";
	return [header, body, footer].filter(Boolean).join("\n\n");
}

export async function deliverCampaignMessage(params: TCampaignDeliveryInput): Promise<TCampaignDeliveryResult> {
	const { organizationId, client, campaign, whatsappToken, whatsappSessionId, contextMetadados, messageKey, testing, chatIdCache } = params;
	const effectivePhoneNumber = testing?.overridePhoneNumber ?? client.telefone;
	let insertedChatMessageId: string | null = null;

	const channelErrors: Record<string, string> = {};
	const channelsAttempted: string[] = [];
	const channelsSkipped: string[] = [];

	try {
		const organizationContext = await resolveOrganizationMessagingContext(organizationId);
		const hasHubAccess = params.hasHubAccess ?? organizationContext.hasHubAccess;
		// Resolve favorite and suggested product names in a single indexed lookup to avoid an extra round-trip on the hot path.
		const productIdsToResolve = [client.metadataProdutoMaisCompradoId, client.metadataProdutoSugeridoId].filter(Boolean) as string[];
		const resolvedProductNames = productIdsToResolve.length
			? await db.query.products.findMany({
					where: (fields, { inArray }) => inArray(fields.id, productIdsToResolve),
					columns: { id: true, nome: true },
				})
			: [];
		const productNameById = new Map(resolvedProductNames.map((product) => [product.id, product.nome]));
		const clientFavoriteProduct = client.metadataProdutoMaisCompradoId ? (productNameById.get(client.metadataProdutoMaisCompradoId) ?? "") : "";
		const clientSuggestedProduct = client.metadataProdutoSugeridoId ? (productNameById.get(client.metadataProdutoSugeridoId) ?? "") : "";

		const cashbackTerminology = contextMetadados?.terminologia ?? organizationContext.organizationCashbackTerminology;
		const messageTemplateVariablesValuesMap = buildInteractionMessageVariables({
			client: {
				nome: client.nome,
				telefone: effectivePhoneNumber,
				email: client.email,
				analiseRFMTitulo: client.analiseRFMTitulo,
				metadataGrupoProdutoMaisComprado: client.metadataGrupoProdutoMaisComprado,
				metadataProdutoMaisCompradoNome: clientFavoriteProduct,
				metadataProdutoSugeridoNome: clientSuggestedProduct,
			},
			contextMetadados,
			terminology: cashbackTerminology,
		});
		const runtimeContext: TMessageTemplateRuntimeContext = {
			origin: process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || "",
			organizacaoId: organizationId,
			clienteId: client.id,
			interactionId: messageKey,
			variaveis: messageTemplateVariablesValuesMap,
			cabecalhoMidiaUrl:
				campaign.whatsappTemplate.conteudo.cabecalho?.tipo === "IMAGEM_DINAMICA"
					? undefined
					: campaign.whatsappTemplate.conteudo.cabecalho?.conteudoMidiaUrl,
		};

		const renderedWhatsappContent = buildWhatsappPlainContent({ template: campaign.whatsappTemplate, variables: runtimeContext.variaveis });

		let whatsappMessageId: string | undefined;
		let emailMessageId: string | undefined;
		let statusEnvio: TCampaignDeliveryResult["statusEnvio"] = "ENVIADO";
		let clientMessageId: string | undefined;
		let jobId: string | undefined;

		if (!effectivePhoneNumber) {
			channelsSkipped.push("WHATSAPP: cliente sem telefone");
		} else if (!campaign.whatsappConexaoTelefoneId) {
			channelsSkipped.push("WHATSAPP: telefone de conexao nao configurado");
		} else {
			channelsAttempted.push("WHATSAPP");
			try {
				const whatsappConnectionPhone = await db.query.whatsappConnectionPhones.findFirst({
					where: (fields, { eq: eqFilter }) => eqFilter(fields.id, campaign.whatsappConexaoTelefoneId as string),
					columns: { id: true, conexaoId: true, whatsappTelefoneId: true },
				});
				if (!whatsappConnectionPhone) throw new Error("Telefone de conexao do WhatsApp nao encontrado.");

				const payload = buildWhatsappTemplateSendPayload({
					template: campaign.whatsappTemplate,
					toPhoneNumber: effectivePhoneNumber,
					runtimeContext,
				});

				if (hasHubAccess) {
					const chatId = await getOrCreateChatId({
						organizationId,
						clientId: client.id,
						whatsappConnectionId: whatsappConnectionPhone.conexaoId,
						whatsappConnectionPhoneId: campaign.whatsappConexaoTelefoneId,
						whatsappPhoneId: whatsappConnectionPhone.whatsappTelefoneId,
						chatIdCache,
					});
					if (!chatId) throw new Error("Falha ao resolver o chat da interacao.");

					const insertedChatMessageResponse = await db
						.insert(chatMessages)
						.values({
							organizacaoId: organizationId,
							chatId,
							whatsappTemplateId: campaign.whatsappTemplate.id,
							autorTipo: "USUÁRIO",
							autorUsuarioId: campaign.autorId,
							conteudoTexto: renderedWhatsappContent,
							conteudoMidiaTipo: "TEXTO",
							clienteId: client.id,
							statusEntrega: "PENDENTE",
						})
						.returning({ id: chatMessages.id });

					insertedChatMessageId = insertedChatMessageResponse[0]?.id ?? null;
					if (!insertedChatMessageId) throw new Error("Falha ao inserir a mensagem no chat.");
				}

				if (whatsappToken && whatsappConnectionPhone.whatsappTelefoneId) {
					if (testing?.disableWhatsappCloudApi) {
						whatsappMessageId = `test-whatsapp-message-${messageKey}`;
					} else {
						const sentWhatsappTemplateResponse = await sendTemplateWhatsappMessage({
							fromPhoneNumberId: whatsappConnectionPhone.whatsappTelefoneId,
							templatePayload: payload,
							whatsappToken,
						});
						whatsappMessageId = sentWhatsappTemplateResponse.whatsappMessageId;
					}
				} else if (whatsappSessionId) {
					const gatewayPayload = { ...payload, to: formatPhoneForInternalGateway(effectivePhoneNumber) };
					const templateContent = parseTemplatePayloadToGatewayContent(gatewayPayload, { fallbackText: renderedWhatsappContent });

					if (testing?.disableInternalGateway) {
						jobId = `test-gateway-job-${messageKey}`;
					} else {
						const sentWhatsappTemplateResponse = await sendMessage(
							whatsappSessionId,
							formatPhoneForInternalGateway(effectivePhoneNumber),
							templateContent,
							{
								clientMessageId: messageKey,
							},
						);
						if (!sentWhatsappTemplateResponse.success) {
							throw new Error(sentWhatsappTemplateResponse.error || "Falha ao enfileirar mensagem no Gateway Interno.");
						}
						jobId = sentWhatsappTemplateResponse.jobId;
					}

					statusEnvio = "PENDENTE";
					clientMessageId = messageKey;
				} else {
					throw new Error("WhatsApp token or session ID is required.");
				}
			} catch (error) {
				channelErrors.WHATSAPP = error instanceof Error ? error.message : "Falha desconhecida no WhatsApp.";
				if (insertedChatMessageId) await db.update(chatMessages).set({ statusEntrega: "FALHA" }).where(eq(chatMessages.id, insertedChatMessageId));
			}
		}

		if (hasHubAccess && insertedChatMessageId && !channelErrors.WHATSAPP) {
			await db
				.update(chatMessages)
				.set({
					...(whatsappMessageId ? { whatsappMessageId } : {}),
					statusEntrega: statusEnvio === "PENDENTE" ? "PENDENTE" : "ENVIADA",
				})
				.where(eq(chatMessages.id, insertedChatMessageId));
		}

		if (!client.email) {
			channelsSkipped.push("EMAIL: cliente sem email");
		} else {
			channelsAttempted.push("EMAIL");
			try {
				const emailContent = {
					...campaign.whatsappTemplate.conteudo,
					assunto: replaceMessageTemplateVariables(campaign.whatsappTemplate.conteudo.assunto, runtimeContext.variaveis),
					preheader: replaceMessageTemplateVariables(campaign.whatsappTemplate.conteudo.preheader, runtimeContext.variaveis),
				};
				const emailResult = await sendEmailWithResend(
					client.email,
					EmailTemplate.MessageTemplate,
					{
						content: emailContent,
						variables: runtimeContext.variaveis,
						organization: {
							id: organizationId,
							name: organizationContext.organization?.nome ?? "RecompraCRM",
							logoUrl: organizationContext.organization?.logoUrl,
							primaryColor: organizationContext.organization?.corPrimaria,
							primaryForeground: organizationContext.organization?.corPrimariaForeground,
						},
						clientId: client.id,
						origin: runtimeContext.origin,
						headerMediaUrl: runtimeContext.cabecalhoMidiaUrl,
					},
					{
						from: {
							name: organizationContext.organization?.nome,
							prefix: organizationContext.organization?.nome,
						},
					},
				);
				emailMessageId = (emailResult.data as { id?: string } | null | undefined)?.id;
			} catch (error) {
				channelErrors.EMAIL = error instanceof Error ? error.message : "Falha desconhecida no e-mail.";
			}
		}

		const channelsSent = [whatsappMessageId || jobId ? "WHATSAPP" : null, emailMessageId ? "EMAIL" : null].filter((channel): channel is string =>
			Boolean(channel),
		);
		const whatsappStatus = whatsappMessageId || jobId ? statusEnvio : channelErrors.WHATSAPP ? "FALHOU" : null;
		const emailStatus = emailMessageId ? "ENVIADO" : channelErrors.EMAIL ? "FALHOU" : null;

		const base = {
			statusEnvio,
			channelsAttempted,
			channelsSkipped,
			channelsSent,
			channelErrors,
			whatsappMessageId,
			emailMessageId,
			jobId,
			clientMessageId,
			chatMessageId: insertedChatMessageId,
			whatsappStatus,
			emailStatus,
		};

		if (channelsAttempted.length === 0) {
			return { ...base, outcome: "NO_CONTACT", error: "Cliente nao possui telefone nem e-mail para envio." };
		}

		if (channelsSent.length === 0) {
			return { ...base, outcome: "FAILED", error: Object.values(channelErrors).join(" | ") || "Houve uma falha ao enviar a mensagem." };
		}

		return {
			...base,
			outcome: statusEnvio === "PENDENTE" ? "QUEUED" : "SENT",
			error: Object.keys(channelErrors).length > 0 ? Object.values(channelErrors).join(" | ") : null,
		};
	} catch (error) {
		console.error(`[CAMPAIGN_DELIVERY] Falha inesperada ao entregar a mensagem ${messageKey}:`, error);
		if (insertedChatMessageId) {
			await db
				.update(chatMessages)
				.set({ statusEntrega: "FALHA" })
				.where(eq(chatMessages.id, insertedChatMessageId))
				.catch(() => undefined);
		}
		return {
			outcome: "FAILED",
			statusEnvio: "ENVIADO",
			error: error instanceof Error ? error.message : "Houve uma falha ao enviar a mensagem.",
			channelsAttempted,
			channelsSkipped,
			channelsSent: [],
			channelErrors,
			chatMessageId: insertedChatMessageId,
			whatsappStatus: null,
			emailStatus: null,
		};
	}
}

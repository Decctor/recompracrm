import { sendTemplateWhatsappMessage } from "@/lib/whatsapp";
import { parseTemplatePayloadToGatewayContent, sendMessage } from "@/lib/whatsapp/internal-gateway";
import type { TWhatsappTemplateVariables } from "@/lib/whatsapp/template-variables";
import { getWhatsappTemplatePayload } from "@/lib/whatsapp/templates";
import { formatPhoneForInternalGateway } from "@/lib/whatsapp/utils";
import type { TInteractionsCronJobTimeBlocksEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { chatMessages, chats, interactions, organizations } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { NextApiHandler } from "next";

dayjs.extend(utc);
dayjs.extend(timezone);

const TIME_BLOCKS = ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];
const INTERACTIONS_CRON_TIMEZONE = process.env.INTERACTIONS_CRON_TIMEZONE ?? "America/Sao_Paulo";

/**
 * Gets the most recent time block that has passed (or current if exact match)
 * @param currentTime - Optional dayjs object, defaults to now
 * @returns The closest time block (e.g., "09:00")
 */
function getCurrentTimeBlock(currentTime = dayjs()): (typeof TIME_BLOCKS)[number] {
	const currentHour = currentTime.hour();
	const currentMinute = currentTime.minute();
	const currentTotalMinutes = currentHour * 60 + currentMinute;

	// Convert time blocks to minutes for comparison
	const timeBlocksInMinutes = TIME_BLOCKS.map((block) => {
		const [hour, minute] = block.split(":").map(Number);
		return hour * 60 + minute;
	});

	// Find the most recent time block that has passed
	let closestBlock = TIME_BLOCKS[0]; // Default to "00:00"
	let closestMinutes = timeBlocksInMinutes[0];

	for (let i = 0; i < timeBlocksInMinutes.length; i++) {
		if (timeBlocksInMinutes[i] <= currentTotalMinutes) {
			closestBlock = TIME_BLOCKS[i];
			closestMinutes = timeBlocksInMinutes[i];
		} else {
			break; // Since blocks are sorted, we can break early
		}
	}

	return closestBlock;
}

const processInteractionsHandler: NextApiHandler = async (req, res) => {
	try {
		const nowInCronTimezone = dayjs().tz(INTERACTIONS_CRON_TIMEZONE);
		const currentDateAsISO8601 = nowInCronTimezone.format("YYYY-MM-DD");
		const currentTimeBlock = getCurrentTimeBlock(nowInCronTimezone);
		console.log("[INFO] [PROCESS_INTERACTIONS] Starting interactions processing", {
			timezone: INTERACTIONS_CRON_TIMEZONE,
			nowInTimezone: nowInCronTimezone.format(),
			currentDate: currentDateAsISO8601,
			currentTimeBlock,
		});

		// Buscar todas as organizacoes com configuracao
		const organizationsList = await db.query.organizations.findMany({
			columns: { id: true, configuracao: true },
		});

		console.log(`[INFO] [PROCESS_INTERACTIONS] Processing ${organizationsList.length} organizations`);

		for (const organization of organizationsList) {
			try {
				console.log(`[ORG: ${organization.id}] [INFO] [PROCESS_INTERACTIONS] Processing interactions`);

				// Check if hubAtendimentos access is enabled for this organization
				const hasHubAccess = organization.configuracao?.recursos?.hubAtendimentos?.acesso ?? false;

				const interactionsResult = await db.query.interactions.findMany({
					where: (fields, { and, eq, isNull, isNotNull }) =>
						and(
							eq(fields.organizacaoId, organization.id),
							eq(fields.agendamentoDataReferencia, currentDateAsISO8601),
							eq(fields.agendamentoBlocoReferencia, currentTimeBlock as TInteractionsCronJobTimeBlocksEnum),
							isNotNull(fields.campanhaId),
							isNull(fields.dataExecucao),
						),
					with: {
						cliente: {
							columns: {
								id: true,
								nome: true,
								telefone: true,
								telefoneBase: true,
								email: true,
								analiseRFMTitulo: true,
							},
						},
						campanha: {
							columns: {
								autorId: true,
								whatsappConexaoTelefoneId: true,
							},
							with: {
								whatsappConexaoTelefone: {
									columns: {
										id: true,
										whatsappTelefoneId: true,
									},
									with: {
										conexao: {
											columns: {
												tipoConexao: true,
												token: true,
												gatewaySessaoId: true,
											},
										},
									},
								},
							},
						},
					},
				});

				const interactionsCampaignsIds = interactionsResult.map((interaction) => interaction.campanhaId).filter((id) => id !== null);
				const campaigns = await db.query.campaigns.findMany({
					where: (fields, { and, inArray }) => and(eq(fields.organizacaoId, organization.id), inArray(fields.id, interactionsCampaignsIds)),
					columns: {
						id: true,
					},
					with: {
						whatsappTemplate: true,
					},
				});

				for (const [index, interaction] of interactionsResult.entries()) {
					if ((index + 1) % 10 === 0) {
						console.log(`[ORG: ${organization.id}] [INFO] [PROCESS_INTERACTIONS] Processing interaction ${index + 1} of ${interactionsResult.length}`);
					}
					const campaign = campaigns.find((campaign) => campaign.id === interaction.campanhaId);
					const interactionCampaign = interaction.campanha;
					if (!campaign || !interactionCampaign) continue;

					const whatsappConnectionPhone = interactionCampaign.whatsappConexaoTelefone;
					if (!whatsappConnectionPhone) {
						console.warn(`[ORG: ${organization.id}] [WARN] [PROCESS_INTERACTIONS] No WhatsApp connection phone for interaction ${interaction.id}`);
						continue;
					}

					const whatsappConnection = whatsappConnectionPhone.conexao;
					if (!whatsappConnection) {
						console.warn(`[ORG: ${organization.id}] [WARN] [PROCESS_INTERACTIONS] No WhatsApp connection for interaction ${interaction.id}`);
						continue;
					}

					const whatsappTemplate = campaign.whatsappTemplate;
					if (!whatsappTemplate) continue;
					const whatsappTemplateVariablesValuesMap: Record<keyof TWhatsappTemplateVariables, string> = {
						clientEmail: interaction.cliente.email ?? "",
						clientName: interaction.cliente.nome,
						clientPhoneNumber: interaction.cliente.telefone,
						clientSegmentation: interaction.cliente.analiseRFMTitulo ?? "",
						clientFavoriteProduct: "",
						clientFavoriteProductGroup: "",
						clientSuggestedProduct: "",
					};

					const payload = getWhatsappTemplatePayload({
						template: {
							name: whatsappTemplate.nome,
							content: whatsappTemplate.componentes.corpo.conteudo,
							components: whatsappTemplate.componentes,
						},
						variables: whatsappTemplateVariablesValuesMap,
						toPhoneNumber: interaction.cliente.telefone,
					});
					console.log(`[ORG: ${organization.id}] [INFO] [PROCESS_INTERACTIONS] Creating template message:`, JSON.stringify(payload, null, 2));

					// Only create chat and insert message if hubAtendimentos access is enabled
					let insertedChatMessageId: string | null = null;
					if (hasHubAccess) {
						let chatId: string | null = null;
						const existingChat = await db.query.chats.findFirst({
							where: (fields, { and, eq }) =>
								and(
									eq(fields.organizacaoId, organization.id),
									eq(fields.clienteId, interaction.clienteId),
									eq(fields.whatsappConexaoTelefoneId, whatsappConnectionPhone.id),
								),
						});
						if (existingChat) {
							chatId = existingChat.id;
						} else {
							const [newChat] = await db
								.insert(chats)
								.values({
									organizacaoId: organization.id,
									clienteId: interaction.clienteId,
									whatsappTelefoneId: whatsappConnectionPhone.whatsappTelefoneId,
									whatsappConexaoTelefoneId: whatsappConnectionPhone.id,
									ultimaMensagemData: new Date(),
									ultimaMensagemConteudoTipo: "TEXTO",
								})
								.returning({ id: chats.id });
							chatId = newChat.id;
						}
						// Inserting message in db
						const insertedChatMessageResponse = await db
							.insert(chatMessages)
							.values({
								organizacaoId: organization.id,
								chatId: chatId,
								autorTipo: "USUÁRIO",
								autorUsuarioId: interactionCampaign.autorId,
								conteudoTexto: payload.content,
								conteudoMidiaTipo: "TEXTO",
							})
							.returning({ id: chatMessages.id });

						insertedChatMessageId = insertedChatMessageResponse[0]?.id ?? null;

						if (!insertedChatMessageId) throw new Error("Failed to insert chat message");
					} else {
						console.log(`[ORG: ${organization.id}] [INFO] [PROCESS_INTERACTIONS] hubAtendimentos disabled, skipping chat message insertion`);
					}

					try {
						let whatsappMessageId: string | undefined;

						// Handle different WhatsApp connection types
						if (whatsappConnection.tipoConexao === "META_CLOUD_API") {
							// Cloud API - use Meta's official API
							if (!whatsappConnection.token || !whatsappConnectionPhone.whatsappTelefoneId) {
								throw new Error("WhatsApp Cloud API token or phone ID is missing");
							}

							const sentWhatsappTemplateResponse = await sendTemplateWhatsappMessage({
								fromPhoneNumberId: whatsappConnectionPhone.whatsappTelefoneId,
								templatePayload: payload.data,
								whatsappToken: whatsappConnection.token,
							});
							whatsappMessageId = sentWhatsappTemplateResponse.whatsappMessageId;
							console.log(`[ORG: ${organization.id}] [INFO] [PROCESS_INTERACTIONS] Sent via Cloud API:`, whatsappMessageId);
						} else if (whatsappConnection.tipoConexao === "INTERNAL_GATEWAY") {
							// Internal Gateway - use our internal WhatsApp gateway
							if (!whatsappConnection.gatewaySessaoId) {
								throw new Error("WhatsApp Gateway session ID is missing");
							}

							const gatewayPayload = {
								...payload.data,
								to: formatPhoneForInternalGateway(interaction.cliente.telefone),
							};
							const templateContent = parseTemplatePayloadToGatewayContent(gatewayPayload, {
								fallbackText: payload.content,
							});
							const sentWhatsappTemplateResponse = await sendMessage(
								whatsappConnection.gatewaySessaoId,
								formatPhoneForInternalGateway(interaction.cliente.telefone),
								templateContent,
							);
							whatsappMessageId = sentWhatsappTemplateResponse.messageId;
							console.log(`[ORG: ${organization.id}] [INFO] [PROCESS_INTERACTIONS] Sent via Internal Gateway:`, whatsappMessageId);
						} else {
							throw new Error(`Unknown WhatsApp connection type: ${whatsappConnection.tipoConexao}`);
						}

						// Update chat message with WhatsApp message ID (only if hub access enabled)
						if (hasHubAccess && insertedChatMessageId) {
							await db
								.update(chatMessages)
								.set({
									whatsappMessageId: whatsappMessageId,
									whatsappMessageStatus: "ENVIADO",
								})
								.where(eq(chatMessages.id, insertedChatMessageId));
						}

						await db
							.update(interactions)
							.set({
								dataExecucao: new Date(),
								metadados: {
									whatsappMessageId: whatsappMessageId,
									whatsappTemplateId: campaign.whatsappTemplate.id,
								},
							})
							.where(and(eq(interactions.id, interaction.id), eq(interactions.organizacaoId, organization.id)));
					} catch (error) {
						console.error(
							`[ORG: ${organization.id}] [ERROR] [PROCESS_INTERACTIONS] Failed to send WhatsApp message for interaction ${interaction.id}:`,
							error,
						);

						// Mark message as failed (only if hub access enabled)
						if (hasHubAccess && insertedChatMessageId) {
							await db
								.update(chatMessages)
								.set({
									whatsappMessageStatus: "FALHOU",
								})
								.where(eq(chatMessages.id, insertedChatMessageId));
						}

						// Don't mark interaction as executed, so it can be retried
						// Continue processing other interactions
					}
				}

				console.log(`[ORG: ${organization.id}] [INFO] [PROCESS_INTERACTIONS] Interactions processed successfully`);
			} catch (error) {
				console.error(`[ORG: ${organization.id}] [ERROR] [PROCESS_INTERACTIONS] Error processing interactions:`, error);
				// Continuar para proxima organizacao mesmo com erro
			}
		}

		console.log("[INFO] [PROCESS_INTERACTIONS] All organizations processed");

		return res.status(200).json({
			message: "Interactions processed successfully",
		});
	} catch (error) {
		console.error("[ERROR] [PROCESS_INTERACTIONS] Fatal error:", error);
		return res.status(500).json({
			error: "Failed to process interactions",
			message: error instanceof Error ? error.message : "Unknown error",
		});
	}
};

export default processInteractionsHandler;

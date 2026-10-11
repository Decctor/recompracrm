import { sendTemplateWhatsappMessage, uploadMediaToWhatsapp } from "@/lib/whatsapp";
import { WHATSAPP_REPORT_TEMPLATES } from "@/lib/whatsapp/templates";
import type { DB, DBTransaction } from "@/services/drizzle";
import { chats } from "@/services/drizzle/schema/chats";
import { users } from "@/services/drizzle/schema/users";
import { and, eq } from "drizzle-orm";
import { renderHandoffHeaderPng } from "./render";

const SERVICE_TRANSFER_TEMPLATE_V2 = "service_transfer_notification_v2";

/**
 * Avisa pelo número da RecompraCRM quem acabou de receber um atendimento.
 *
 * Serve às duas origens: a IA (`transferidoPor: null`) e uma pessoa no hub (transferir ou
 * atribuir). Os templates aprovados na Meta abrem com "Novo atendimento transferido pela IA." —
 * texto fixo —, então numa transferência manual quem transferiu vai no selo do header e no início
 * de `detalhes`.
 *
 * Notificação é acessória: nunca lança. Uma falha aqui não desfaz a transferência.
 */
export async function notifyChatTransferRecipient({
	db,
	organizacaoId,
	chatId,
	usuarioDestinoId,
	transferidoPor,
	motivo,
	detalhes,
}: {
	db: DB | DBTransaction;
	organizacaoId: string;
	chatId: string;
	usuarioDestinoId: string;
	/** Nome de quem transferiu. `null` = a IA. */
	transferidoPor: string | null;
	/** Frase curta para o header. */
	motivo: string;
	/** Texto completo do corpo (motivo + resumo). */
	detalhes: string;
}): Promise<boolean> {
	const whatsappToken = process.env.META_ACCESS_TOKEN;
	const fromPhoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
	if (!whatsappToken || !fromPhoneNumberId) return false;

	try {
		const [chat, target] = await Promise.all([
			db.query.chats.findFirst({
				where: and(eq(chats.id, chatId), eq(chats.organizacaoId, organizacaoId)),
				columns: { id: true },
				with: {
					cliente: { columns: { nome: true, telefone: true } },
					organizacao: { columns: { nome: true, logoUrl: true } },
				},
			}),
			db.query.users.findFirst({ where: eq(users.id, usuarioDestinoId), columns: { telefone: true } }),
		]);
		if (!chat?.cliente || !chat.organizacao || !target?.telefone) return false;

		const useImageTemplate = process.env.META_SERVICE_TRANSFER_TEMPLATE_NAME === SERVICE_TRANSFER_TEMPLATE_V2;
		let notificationPayload;
		if (useImageTemplate) {
			const headerPng = await renderHandoffHeaderPng({
				organizationName: chat.organizacao.nome,
				organizationLogoUrl: chat.organizacao.logoUrl,
				clientName: chat.cliente.nome,
				clientPhone: chat.cliente.telefone,
				reason: motivo,
				transferredBy: transferidoPor,
			});
			const { mediaId } = await uploadMediaToWhatsapp({
				fromPhoneNumberId,
				fileBuffer: headerPng,
				mimeType: "image/png",
				filename: `transferencia-${chat.id}.png`,
				whatsappToken,
			});
			notificationPayload = WHATSAPP_REPORT_TEMPLATES.SERVICE_TRANSFER_NOTIFICATIONS_V2.getPayload({
				templateKey: "SERVICE_TRANSFER_NOTIFICATIONS_V2",
				headerMediaId: mediaId,
				organizationName: chat.organizacao.nome,
				clientName: chat.cliente.nome,
				clientePhoneNumber: chat.cliente.telefone,
				toPhoneNumber: target.telefone,
				serviceDescription: detalhes,
			}).data;
		} else {
			notificationPayload = WHATSAPP_REPORT_TEMPLATES.SERVICE_TRANSFER_NOTIFICATIONS.getPayload({
				templateKey: "SERVICE_TRANSFER_NOTIFICATIONS",
				organizationName: chat.organizacao.nome,
				clientName: chat.cliente.nome,
				clientePhoneNumber: chat.cliente.telefone,
				toPhoneNumber: target.telefone,
				serviceDescription: detalhes,
			}).data;
		}

		await sendTemplateWhatsappMessage({ whatsappToken, fromPhoneNumberId, templatePayload: notificationPayload });
		return true;
	} catch (error) {
		console.error("[ERROR] [CHATS] [TRANSFER_NOTIFICATION] Falha ao notificar o usuário:", error);
		return false;
	}
}

/**
 * Corpo da notificação de uma transferência feita por uma pessoa no hub. O resumo é o do
 * atendimento (escrito pela IA ou editado pela equipe), que é o que o destinatário precisa ler.
 */
export function buildManualTransferDetails({
	acao,
	transferidoPor,
	motivo,
	resumo,
}: {
	acao: "TRANSFERENCIA" | "ATRIBUICAO";
	transferidoPor: string;
	motivo: string | null;
	resumo: string | null;
}): string {
	const header = acao === "ATRIBUICAO" ? `[ATRIBUIÇÃO]\nAtribuído por: ${transferidoPor}` : `[TRANSFERÊNCIA]\nTransferido por: ${transferidoPor}`;
	const lines = [header];
	if (motivo?.trim()) lines.push(`Motivo: ${motivo.trim()}`);
	lines.push("", "Resumo do atendimento:", resumo?.trim() || "Sem resumo registrado.");
	return lines.join("\n");
}

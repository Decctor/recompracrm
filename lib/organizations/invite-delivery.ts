import { EmailTemplate, sendEmailWithResend } from "@/lib/email";
import { sendTemplateWhatsappMessage } from "@/lib/whatsapp";
import { getPlatformWhatsappSender } from "@/lib/whatsapp/platform-sender";
import { formatPhoneForInternalGateway, sanitizeTemplateParameter } from "@/lib/whatsapp/utils";
import { renderAndUploadOrganizationInviteHeader } from "./invite-header/render";
import {
	buildOrganizationInviteAcceptUrl,
	getOrganizationInviteExpirationLabel,
	ORGANIZATION_INVITE_EXPIRES_IN_HOURS,
	ORGANIZATION_INVITE_PARAM_NAMES,
	ORGANIZATION_INVITE_PRODUCTION_ORIGIN,
	ORGANIZATION_INVITE_TEMPLATE_LANGUAGE,
	ORGANIZATION_INVITE_TEMPLATE_NAME,
} from "./invite-template";

const FALLBACK_ORGANIZATION_NAME = "sua organização";

type SendOrganizationInviteParams = {
	invitationId: string;
	organizacaoId: string;
	organizationName: string | null;
	organizationLogoUrl?: string | null;
	invitedName: string;
	inviterName?: string | null;
	inviterEmail?: string | null;
	email: string;
	phone?: string | null;
};

function getAppOrigin() {
	return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || ORGANIZATION_INVITE_PRODUCTION_ORIGIN;
}

async function sendOrganizationInviteEmail({
	email,
	invitationId,
	invitedName,
	inviterName,
	inviterEmail,
	organizationName,
	organizationLogoUrl,
}: Pick<
	SendOrganizationInviteParams,
	"email" | "invitationId" | "invitedName" | "inviterName" | "inviterEmail" | "organizationName" | "organizationLogoUrl"
>) {
	const inviter = inviterName?.trim() || null;
	return sendEmailWithResend(
		email,
		EmailTemplate.OrganizationInvite,
		{
			inviteLink: buildOrganizationInviteAcceptUrl({ origin: getAppOrigin(), invitationId }),
			invitedName,
			inviterName: inviter,
			inviterEmail,
			organizationName,
			organizationLogoUrl,
			expiresInHours: ORGANIZATION_INVITE_EXPIRES_IN_HOURS,
		},
		{
			// "Fulano via RecompraCRM" mostra uma pessoa conhecida na caixa de entrada, e a resposta
			// vai para quem convidou — um convite de remetente anônimo é o formato clássico de phishing.
			from: { name: inviter ? `${inviter} via RecompraCRM` : "RecompraCRM", prefix: "convites" },
			replyTo: inviterEmail,
		},
	);
}

async function sendOrganizationInviteWhatsapp({
	phone,
	invitationId,
	organizacaoId,
	invitedName,
	organizationName,
	organizationLogoUrl,
}: Pick<SendOrganizationInviteParams, "phone" | "invitationId" | "organizacaoId" | "invitedName" | "organizationName" | "organizationLogoUrl">) {
	if (!phone?.trim()) return null;

	const sender = getPlatformWhatsappSender();
	if (!sender) {
		console.warn("[WARN] [ORGANIZATION_INVITE_WHATSAPP] WhatsApp env vars not configured; skipping WhatsApp delivery.");
		return null;
	}

	const safeOrganizationName = organizationName?.trim() || FALLBACK_ORGANIZATION_NAME;
	const headerImageUrl = await renderAndUploadOrganizationInviteHeader({
		organizacaoId,
		invitationId,
		organizationName: safeOrganizationName,
		organizationLogoUrl,
	});

	// O cabeçalho de imagem é obrigatório no template aprovado — sem ele a Meta
	// rejeita o envio, então é melhor pular o WhatsApp do que estourar o convite.
	if (!headerImageUrl) {
		console.warn("[WARN] [ORGANIZATION_INVITE_WHATSAPP] Cabeçalho indisponível; skipping WhatsApp delivery.");
		return null;
	}

	return sendTemplateWhatsappMessage({
		fromPhoneNumberId: sender.fromPhoneNumberId,
		whatsappToken: sender.whatsappToken,
		graphApiBaseUrl: sender.graphApiBaseUrl,
		templatePayload: {
			messaging_product: "whatsapp",
			to: formatPhoneForInternalGateway(phone),
			type: "template",
			template: {
				name: ORGANIZATION_INVITE_TEMPLATE_NAME,
				language: { code: ORGANIZATION_INVITE_TEMPLATE_LANGUAGE },
				components: [
					{
						type: "header",
						parameters: [{ type: "image", image: { link: headerImageUrl } }],
					},
					{
						type: "body",
						parameters: [
							{
								type: "text",
								parameter_name: ORGANIZATION_INVITE_PARAM_NAMES.convidadoNome,
								text: sanitizeTemplateParameter(invitedName),
							},
							{
								type: "text",
								parameter_name: ORGANIZATION_INVITE_PARAM_NAMES.organizacaoNome,
								text: sanitizeTemplateParameter(safeOrganizationName),
							},
							{
								type: "text",
								parameter_name: ORGANIZATION_INVITE_PARAM_NAMES.expiracao,
								text: getOrganizationInviteExpirationLabel(),
							},
						],
					},
					{
						// A Meta anexa este valor ao final da URL do botão, que termina em `invitationId=`.
						type: "button",
						sub_type: "url",
						index: "0",
						parameters: [{ type: "text", text: invitationId }],
					},
				],
			},
		},
	});
}

/**
 * Entrega o convite por e-mail e, quando há telefone, também por WhatsApp.
 *
 * O e-mail é o canal principal: se ele falhar, o erro sobe. O WhatsApp é
 * complementar e opt-in — falha ali só vira log, para não derrubar um convite
 * que já foi persistido.
 */
export async function sendOrganizationInvite({
	invitationId,
	organizacaoId,
	organizationName,
	organizationLogoUrl,
	invitedName,
	inviterName,
	inviterEmail,
	email,
	phone,
}: SendOrganizationInviteParams) {
	const [emailResult, whatsappResult] = await Promise.allSettled([
		sendOrganizationInviteEmail({
			email,
			invitationId,
			invitedName,
			inviterName,
			inviterEmail,
			organizationName,
			organizationLogoUrl,
		}),
		sendOrganizationInviteWhatsapp({
			phone,
			invitationId,
			organizacaoId,
			invitedName,
			organizationName,
			organizationLogoUrl,
		}),
	]);

	if (whatsappResult.status === "rejected") {
		console.error("[ERROR] [ORGANIZATION_INVITE_WHATSAPP] WhatsApp delivery failed:", whatsappResult.reason);
	}

	if (emailResult.status === "rejected") {
		throw emailResult.reason;
	}

	return {
		email: emailResult.value,
		whatsapp: whatsappResult.status === "fulfilled" ? whatsappResult.value : null,
	};
}

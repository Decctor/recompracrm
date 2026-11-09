import { parseRetryAfterHeader, withRateLimitRetry } from "@/lib/http/rate-limit";
import { resend } from "@/services/resend";
import MagicLinkTemplate from "@/services/resend/templates/MagicLink";
import MessageTemplateEmail from "@/services/resend/templates/MessageTemplate";
import OrganizationInviteTemplate, { buildOrganizationInviteSubject } from "@/services/resend/templates/OrganizationInvite";
import { render, toPlainText } from "@react-email/render";
import type { ComponentProps } from "react";

export enum EmailTemplate {
	AuthMagicLink = "AuthMagicLink",
	OrganizationInvite = "OrganizationInvite",
	MessageTemplate = "MessageTemplate",
}

export type PropsMap = {
	[EmailTemplate.AuthMagicLink]: ComponentProps<typeof MagicLinkTemplate>;
	[EmailTemplate.OrganizationInvite]: ComponentProps<typeof OrganizationInviteTemplate>;
	[EmailTemplate.MessageTemplate]: ComponentProps<typeof MessageTemplateEmail>;
	// [EmailTemplate.PasswordReset]: ComponentProps<typeof ResetPasswordTemplate>;
};

type SendEmailWithResendConfig = {
	from?: {
		name?: string | null;
		prefix?: string | null;
	};
	replyTo?: string | null;
};

const RESEND_FROM_DOMAIN = "recompracrm.com.br";

function sanitizeSenderPrefix(value: string | null | undefined) {
	const sanitized = (value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "")
		.slice(0, 32);
	return sanitized || "noreply";
}

function sanitizeSenderName(value: string | null | undefined) {
	// Vírgula e ponto e vírgula separam endereços no cabeçalho From: um nome com eles sem aspas vira dois remetentes.
	return (value?.trim() || "RecompraCRM").replace(/[<>",;]/g, "");
}

function buildResendFrom(config?: SendEmailWithResendConfig) {
	const senderName = sanitizeSenderName(config?.from?.name);
	const senderPrefix = sanitizeSenderPrefix(config?.from?.prefix);
	return `${senderName} <${senderPrefix}@${RESEND_FROM_DOMAIN}>`;
}

function getReactEmailTemplateAndSubject<T extends EmailTemplate>(template: T, props: PropsMap[NoInfer<T>]) {
	switch (template) {
		case EmailTemplate.AuthMagicLink:
			return {
				templateComponent: <MagicLinkTemplate {...(props as PropsMap[EmailTemplate.AuthMagicLink])} />,
				subject: "Aqui está seu link de acesso ao RecompraCRM.",
			};
		case EmailTemplate.OrganizationInvite: {
			const inviteProps = props as PropsMap[EmailTemplate.OrganizationInvite];
			return {
				templateComponent: <OrganizationInviteTemplate {...inviteProps} />,
				subject: buildOrganizationInviteSubject(inviteProps),
			};
		}
		case EmailTemplate.MessageTemplate: {
			const messageTemplateProps = props as PropsMap[EmailTemplate.MessageTemplate];
			return {
				templateComponent: <MessageTemplateEmail {...messageTemplateProps} />,
				subject: messageTemplateProps.content.assunto,
			};
		}
		default:
			throw new Error("Template de email inválido.");
	}
}

export const sendEmailWithResend = async <T extends EmailTemplate>(
	to: string,
	template: T,
	props: PropsMap[NoInfer<T>],
	config?: SendEmailWithResendConfig,
) => {
	try {
		const { templateComponent, subject } = getReactEmailTemplateAndSubject(template, props);
		// Renderiza uma vez e manda as duas partes: o SDK, com `react`, envia só HTML, e e-mail sem
		// text/plain pesa contra a entrega nos filtros de spam.
		const html = await render(templateComponent);
		const text = toPlainText(html);
		const replyTo = config?.replyTo?.trim() || undefined;
		// O limite por segundo da Resend é da conta inteira (campanhas, magic links, convites): uma
		// recusa 429 não processou nada, então repetir depois do retry-after é seguro.
		const { data, error } = await withRateLimitRetry({
			run: () =>
				resend.emails.send({
					from: buildResendFrom(config),
					to: [to],
					subject: subject,
					html,
					text,
					...(replyTo ? { replyTo } : {}),
				}),
			classify: (outcome) =>
				"result" in outcome && outcome.result.error?.name === "rate_limit_exceeded"
					? { retry: true, retryAfterMs: parseRetryAfterHeader(outcome.result.headers?.["retry-after"]) }
					: { retry: false },
			maxAttempts: 4,
		});
		if (error) throw new Error(error.message);
		return { success: true, data };
	} catch (error) {
		console.log(error);
		throw error;
	}
};

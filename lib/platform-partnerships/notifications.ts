import "server-only";
import { EmailTemplate, sendEmailWithResend } from "@/lib/email";
import { getPlatformPartnerReferralLink } from "@/lib/platform-partnerships/constants";
import { formatCentavos, formatCommissionPercent, formatPartnerDate } from "@/lib/platform-partnerships/earnings";
import type { PlatformPartnerNotificationTemplateProps } from "@/services/resend/templates/PlatformPartnerNotification";
import { waitUntil } from "@vercel/functions";

/**
 * Emails do programa de parcerias. Sempre em segundo plano (`waitUntil`) e sem derrubar quem
 * chamou: aprovar um parceiro ou processar o webhook do Stripe não pode falhar porque o Resend
 * recusou um email.
 */
type TPartnerRecipient = { nome: string; email: string };

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.recompracrm.com.br").replace(/\/$/, "");
const firstName = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

function send(partner: TPartnerRecipient, content: Omit<PlatformPartnerNotificationTemplateProps, "partnerFirstName">) {
	if (!partner.email) return;
	const task = sendEmailWithResend(
		partner.email,
		EmailTemplate.PlatformPartnerNotification,
		{ ...content, partnerFirstName: firstName(partner.nome) },
		{ from: { name: "Parcerias RecompraCRM", prefix: "parcerias" } },
	).catch((error) => console.error("[PLATFORM_PARTNER_EMAIL] Falha ao enviar email.", { subject: content.subject, error }));
	waitUntil(task);
}

export function notifyPlatformPartnerApproved(partner: TPartnerRecipient & { codigo: string }) {
	send(partner, {
		subject: "Seu cadastro de parceiro foi aprovado",
		heading: "Seu cartão de parceiro está pronto",
		paragraphs: [
			"Seu cadastro no programa de parcerias foi aprovado. Seu link e seu código já estão ativos.",
			"A primeira loja que assinar pelo seu link rende 100% da mensalidade.",
		],
		highlight: { label: "SEU CÓDIGO", value: partner.codigo, note: getPlatformPartnerReferralLink(partner.codigo).replace(/^https?:\/\/(www\.)?/, "") },
		cta: { label: "Abrir meu painel", href: `${appUrl()}/partner-dashboard` },
	});
}

export function notifyPlatformPartnerRejected(partner: TPartnerRecipient, motivo: string) {
	send(partner, {
		subject: "Seu cadastro de parceiro precisa de ajustes",
		heading: "Precisamos de um ajuste no seu cadastro",
		paragraphs: ["Não conseguimos aprovar seu cadastro no programa de parcerias com os dados enviados. Corrija o ponto abaixo e envie de novo."],
		callout: { label: "O QUE CORRIGIR", text: motivo },
		cta: { label: "Corrigir e reenviar", href: `${appUrl()}/partner-dashboard/onboarding` },
	});
}

export function notifyPlatformPartnerNewCommission(
	partner: TPartnerRecipient,
	commission: { lojaNome: string; numeroInvoiceAssinatura: number; percentualComissaoBps: number; valorComissaoCentavos: number; dataPix: Date },
) {
	send(partner, {
		subject: `Nova comissão: ${formatCentavos(commission.valorComissaoCentavos)} de ${commission.lojaNome}`,
		heading: "Você tem uma nova comissão",
		paragraphs: [
			`${commission.lojaNome} pagou a ${commission.numeroInvoiceAssinatura}ª mensalidade. Sua comissão de ${formatCommissionPercent(commission.percentualComissaoBps)} já está no seu extrato.`,
		],
		highlight: {
			label: "COMISSÃO",
			value: formatCentavos(commission.valorComissaoCentavos),
			note: `Prevista para o PIX de ${formatPartnerDate(commission.dataPix)}`,
		},
		cta: { label: "Ver extrato", href: `${appUrl()}/partner-dashboard/statement` },
	});
}

export function notifyPlatformPartnerPixPaid(partner: TPartnerRecipient, payout: { id: string; valorTotalCentavos: number; dataPagamento: Date }) {
	send(partner, {
		subject: `PIX de ${formatCentavos(payout.valorTotalCentavos)} enviado`,
		heading: "Seu PIX foi enviado",
		paragraphs: ["O pagamento das suas comissões foi feito na chave PIX cadastrada. O detalhe e o comprovante ficam no painel."],
		highlight: { label: "PIX RECEBIDO", value: formatCentavos(payout.valorTotalCentavos), note: `Pago em ${formatPartnerDate(payout.dataPagamento)}` },
		cta: { label: "Ver pagamento", href: `${appUrl()}/partner-dashboard/payouts/${payout.id}` },
	});
}

export function notifyPlatformPartnerChangeRequestResolved(partner: TPartnerRecipient, result: { aprovada: boolean; motivoRecusa?: string | null }) {
	send(partner, {
		subject: result.aprovada ? "Seus dados de parceiro foram atualizados" : "Sua alteração de dados não foi aprovada",
		heading: result.aprovada ? "Dados atualizados" : "Alteração não aprovada",
		paragraphs: [
			result.aprovada
				? "O financeiro aprovou a alteração dos seus dados. Os próximos PIX já usam as informações novas."
				: "O financeiro não aprovou a alteração dos seus dados. Seus dados anteriores continuam valendo.",
		],
		callout: !result.aprovada && result.motivoRecusa ? { label: "MOTIVO", text: result.motivoRecusa } : null,
		cta: { label: "Ver meus dados", href: `${appUrl()}/partner-dashboard/profile` },
	});
}

import { createIntervalLimiter, createKeyedIntervalLimiter } from "@/lib/http/rate-limit";

/**
 * Ritmo dos envios de campanha. Cada worker de envio processa grupos de destinatários em paralelo
 * e até CAMPAIGN_DISPATCH_MAX_SEND_WORKERS rodam ao mesmo tempo para o mesmo disparo, em instâncias
 * que não compartilham memória — sem ritmo, isso chegou a ~40 chamadas simultâneas e a Meta
 * respondeu 130429 e a Resend 429 (disparo 8b297f05, Congelatte, 2026-11-04). O orçamento de cada
 * provedor é dividido pelos workers; o que escapar é absorvido pela nova tentativa com espera.
 */

export const CAMPAIGN_DISPATCH_MAX_SEND_WORKERS = 4;

// Por número de envio. Números em coexistência (app WhatsApp Business + Cloud API) têm teto de 20
// mensagens/s; os demais começam em 80. O menor vale para todos: o limite semanal de envios
// mantém os disparos pequenos o bastante para que a diferença seja de segundos.
const WHATSAPP_MESSAGES_PER_SECOND_PER_PHONE = 20;

// A Resend limita a conta inteira em 10 requisições/s, dividida com magic links e convites. As
// campanhas ficam com 6 para que um disparo grande não derrube o login.
const CAMPAIGN_EMAILS_PER_SECOND = 6;

const whatsappLimiter = createKeyedIntervalLimiter({
	ratePerSecond: WHATSAPP_MESSAGES_PER_SECOND_PER_PHONE / CAMPAIGN_DISPATCH_MAX_SEND_WORKERS,
});
const emailLimiter = createIntervalLimiter({ ratePerSecond: CAMPAIGN_EMAILS_PER_SECOND / CAMPAIGN_DISPATCH_MAX_SEND_WORKERS });

/** Aguarda a vez de enviar uma mensagem de campanha pelo número (id do telefone na Meta). */
export function acquireCampaignWhatsappSendSlot(whatsappPhoneNumberId: string) {
	return whatsappLimiter.acquire(whatsappPhoneNumberId);
}

/** Aguarda a vez de enviar um e-mail de campanha. */
export function acquireCampaignEmailSendSlot() {
	return emailLimiter.acquire();
}

// Limite de vazão da Meta: a mensagem não foi aceita, repetir após alguns segundos é seguro.
// O limite por par de números (131056) não entra: ele dura minutos e não se resolve aqui.
export const WHATSAPP_THROUGHPUT_RATE_LIMIT_CODES = new Set([130429]);

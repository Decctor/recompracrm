import { GRAPH_API_VERSION } from "./index";

/**
 * Credenciais do número da própria RecompraCRM — o que envia login por link mágico, convites,
 * relatórios e o aviso de transferência ao atendente. Não confundir com os números das
 * organizações, que vivem nas configurações de cada uma e falam direto com a Meta.
 *
 * O número é compartilhado com outras plataformas nossas pelo Syncroniza Sends, um proxy
 * transparente da Graph API: os mesmos caminhos e corpos da Meta, com um token `ss_graph_` no
 * lugar do token da Meta. Com `SENDS_APP_URL` definido, todo envio do número sai por lá; sem ele,
 * vale o caminho direto antigo (`META_ACCESS_TOKEN`) — útil para ambiente local.
 *
 * Não há fallback de um caminho para o outro em caso de falha: o Sends é o caminho do número.
 *
 * O token hoje é o mesmo da integração do número no Syncroniza Control. Se o número for
 * reconectado lá, o Sends emite um token novo e revoga este — atualize `SENDS_GRAPH_ACCESS_TOKEN`.
 */
export type TPlatformWhatsappSender = {
	fromPhoneNumberId: string;
	whatsappToken: string;
	graphApiBaseUrl: string;
	via: "SENDS" | "META";
};

export function getPlatformWhatsappSender(): TPlatformWhatsappSender | null {
	const fromPhoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
	if (!fromPhoneNumberId) return null;

	const sendsAppUrl = process.env.SENDS_APP_URL?.trim().replace(/\/+$/, "");
	if (sendsAppUrl) {
		const sendsToken = process.env.SENDS_GRAPH_ACCESS_TOKEN;
		// Meia configuração é erro, não motivo para voltar à Meta em silêncio.
		if (!sendsToken) {
			console.error("[ERROR] [PLATFORM_WHATSAPP] SENDS_APP_URL definido sem SENDS_GRAPH_ACCESS_TOKEN.");
			return null;
		}
		return { fromPhoneNumberId, whatsappToken: sendsToken, graphApiBaseUrl: `${sendsAppUrl}/api/graph/${GRAPH_API_VERSION}`, via: "SENDS" };
	}

	const metaToken = process.env.META_ACCESS_TOKEN;
	if (!metaToken) return null;
	return { fromPhoneNumberId, whatsappToken: metaToken, graphApiBaseUrl: `https://graph.facebook.com/${GRAPH_API_VERSION}`, via: "META" };
}

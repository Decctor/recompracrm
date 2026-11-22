/**
 * Conexão do WhatsApp oficial pelo fluxo da Meta (Embedded Signup): o que a volta do fluxo põe na
 * URL, o que as telas dizem sobre isso, e como uma reconexão reaproveita a conexão existente.
 * Puro (usado pela rota de callback e pelas telas de onboarding e configurações).
 *
 * Toda volta do fluxo da Meta termina numa tela nossa, com uma mensagem em português e o próximo
 * passo. Antes, cancelar ou falhar mostrava um JSON cru do servidor.
 */

export const WHATSAPP_CONNECT_RESULT_PARAM = "whatsapp";
export const WHATSAPP_CONNECT_ERROR_PARAM = "whatsappErro";
export const WHATSAPP_CONNECT_COUNT_PARAM = "whatsappNumeros";

export const WHATSAPP_CONNECT_ERROR_MESSAGES = {
	cancelado: "Conexão cancelada na Meta. Nenhum número foi conectado. Quando quiser, é só conectar de novo.",
	expirado: "A conexão expirou ou foi aberta em outra aba. Comece de novo por aqui.",
	sessao: "Sua sessão terminou durante a conexão. Entre de novo e conecte o WhatsApp.",
	"sem-numero":
		"A Meta não devolveu nenhum número conectado. Confira se escolheu o número do app WhatsApp Business e se concluiu a confirmação no celular.",
	"sem-permissao": "A autorização não incluiu o envio de mensagens. Conecte de novo e mantenha todas as permissões marcadas na tela da Meta.",
	meta: "A Meta não confirmou a autorização. Tente de novo em alguns minutos.",
	"1": "Não foi possível conectar o WhatsApp agora. Tente de novo ou fale com a gente.",
} as const;
export type TWhatsappConnectErrorCode = keyof typeof WHATSAPP_CONNECT_ERROR_MESSAGES;

export type TWhatsappConnectSuccess = "conectado" | "reconectado";

export function describeWhatsappConnectError(code: string | null | undefined) {
	if (!code) return null;
	return WHATSAPP_CONNECT_ERROR_MESSAGES[code as TWhatsappConnectErrorCode] ?? WHATSAPP_CONNECT_ERROR_MESSAGES["1"];
}

/**
 * Erro que a própria Meta põe na volta (`error`, `error_reason`). `access_denied`/`user_denied` é
 * a pessoa fechando ou cancelando o fluxo — o caso mais comum, e não é uma falha nossa.
 */
export function classifyMetaCallbackError(params: { get(name: string): string | null }): TWhatsappConnectErrorCode | null {
	const error = params.get("error");
	const reason = params.get("error_reason");
	if (!error && !reason) return null;
	if (error === "access_denied" || reason === "user_denied") return "cancelado";
	return "meta";
}

/** Monta a URL de volta preservando o que já havia nela (ex.: `?view=meta-oauth`). */
export function buildWhatsappConnectReturnPath(
	path: string,
	outcome: { erro: TWhatsappConnectErrorCode } | { sucesso: TWhatsappConnectSuccess; numeros: number },
) {
	const [pathname, query = ""] = path.split("?");
	const params = new URLSearchParams(query);
	params.delete(WHATSAPP_CONNECT_RESULT_PARAM);
	params.delete(WHATSAPP_CONNECT_ERROR_PARAM);
	params.delete(WHATSAPP_CONNECT_COUNT_PARAM);
	if ("erro" in outcome) params.set(WHATSAPP_CONNECT_ERROR_PARAM, outcome.erro);
	else {
		params.set(WHATSAPP_CONNECT_RESULT_PARAM, outcome.sucesso);
		params.set(WHATSAPP_CONNECT_COUNT_PARAM, String(outcome.numeros));
	}
	return `${pathname}?${params.toString()}`;
}

export type TWhatsappConnectReturn = {
	sucesso: TWhatsappConnectSuccess | null;
	numeros: number;
	codigoErro: TWhatsappConnectErrorCode | null;
	erro: string | null;
};

export function readWhatsappConnectReturn(params: { get(name: string): string | null }): TWhatsappConnectReturn {
	const result = params.get(WHATSAPP_CONNECT_RESULT_PARAM);
	const errorCode = params.get(WHATSAPP_CONNECT_ERROR_PARAM);
	const count = Number(params.get(WHATSAPP_CONNECT_COUNT_PARAM));
	return {
		sucesso: result === "conectado" || result === "reconectado" ? result : null,
		numeros: Number.isFinite(count) && count > 0 ? count : 0,
		codigoErro: errorCode ? ((errorCode in WHATSAPP_CONNECT_ERROR_MESSAGES ? errorCode : "1") as TWhatsappConnectErrorCode) : null,
		erro: describeWhatsappConnectError(errorCode),
	};
}

/** Remove os parâmetros da volta, para a mensagem não reaparecer num recarregamento. */
export function stripWhatsappConnectParams(search: string) {
	const params = new URLSearchParams(search);
	params.delete(WHATSAPP_CONNECT_RESULT_PARAM);
	params.delete(WHATSAPP_CONNECT_ERROR_PARAM);
	params.delete(WHATSAPP_CONNECT_COUNT_PARAM);
	const rest = params.toString();
	return rest ? `?${rest}` : "";
}

// ------------------------------------------------------------------ reconexão

export type TExistingMetaPhone = { conexaoId: string; telefoneId: string; whatsappTelefoneId: string };
export type TIncomingMetaPhone = { whatsappTelefoneId: string };

export type TWhatsappConnectionUpsertPlan<T extends TIncomingMetaPhone> = {
	/** Conexão reaproveitada (token renovado), ou null para criar uma nova. */
	conexaoId: string | null;
	/** Números que já existiam nesta organização: atualizados, nunca duplicados. */
	atualizar: Array<{ telefoneId: string; incoming: T }>;
	/** Números novos, inseridos na conexão reaproveitada ou na nova. */
	inserir: T[];
};

/**
 * Reconectar renova o token da conexão que já tem esses números, em vez de criar outra linha com
 * os mesmos números (o que duplicava telefones, campanhas apontando para o telefone velho e
 * webhooks ambíguos). Escolhe a conexão que contém mais números da autorização; empate fica com a
 * primeira encontrada.
 */
export function planWhatsappConnectionUpsert<T extends TIncomingMetaPhone>({
	existing,
	incoming,
}: {
	existing: TExistingMetaPhone[];
	incoming: T[];
}): TWhatsappConnectionUpsertPlan<T> {
	const byPhoneId = new Map(existing.map((phone) => [phone.whatsappTelefoneId, phone]));
	const matches = incoming.flatMap((phone) => {
		const found = byPhoneId.get(phone.whatsappTelefoneId);
		return found ? [{ found, phone }] : [];
	});
	const votes = new Map<string, number>();
	for (const { found } of matches) votes.set(found.conexaoId, (votes.get(found.conexaoId) ?? 0) + 1);
	let conexaoId: string | null = null;
	let best = 0;
	for (const [id, total] of votes) {
		if (total > best) {
			conexaoId = id;
			best = total;
		}
	}
	return {
		conexaoId,
		atualizar: matches.map(({ found, phone }) => ({ telefoneId: found.telefoneId, incoming: phone })),
		inserir: incoming.filter((phone) => !byPhoneId.has(phone.whatsappTelefoneId)),
	};
}

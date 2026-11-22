import type { TWhatsappConnectionPhoneMetadados } from "@/services/drizzle/schema/whatsapp-connections";

/**
 * Se o RecompraCRM ainda consegue usar um número, decidido sem I/O.
 *
 * `whatsapp_connections.data_expiracao` é uma estimativa: o callback da Meta grava `expires_in`, e
 * 60 dias quando a Meta não manda o campo (o caso dos tokens de negócio do Embedded Signup, que não
 * expiram). Números que entregam campanha todo dia ficavam "expirados" no readiness, no aviso do hub e
 * nos passos do canal. A prova de acesso é a checagem de saúde (`metadados.saude`, cron a cada 6 h e
 * webhooks `account_update`): uma checagem feita **depois** da data vence a data. Sem checagem, ou
 * com uma anterior à data, a data continua valendo.
 */

export type TMetaPhoneAccess = "CONECTADO" | "EXPIRADO" | "SEM_ACESSO";

export type TWhatsappNumberState = "NENHUM" | "CONECTADO" | "EXPIRADO" | "DESCONECTADO";

type TPhoneHealth = TWhatsappConnectionPhoneMetadados["saude"];

export function resolveMetaPhoneAccess({
	dataExpiracao,
	saude,
	now,
}: {
	dataExpiracao: Date | null;
	saude: TPhoneHealth | null | undefined;
	now: Date;
}): TMetaPhoneAccess {
	// A checagem só grava FALHA para erros que não passam sozinhos (token revogado, número fora do
	// WABA, permissão removida): connection-health-policy.ts.
	if (saude?.status === "FALHA") return "SEM_ACESSO";
	if (!dataExpiracao || dataExpiracao.getTime() > now.getTime()) return "CONECTADO";
	const checkedAt = saude?.status === "SAUDAVEL" ? new Date(saude.verificadoEm) : null;
	if (checkedAt && !Number.isNaN(checkedAt.getTime()) && checkedAt.getTime() >= dataExpiracao.getTime()) return "CONECTADO";
	return "EXPIRADO";
}

export type TWhatsappNumberStateConnection = {
	tipoConexao: "META_CLOUD_API" | "INTERNAL_GATEWAY";
	dataExpiracao: Date | null;
	gatewayStatus: string | null;
	telefones: Array<{ metadados?: TWhatsappConnectionPhoneMetadados | null }>;
};

/** Estado de um número de uma conexão. O gateway interno (QR) não tem token: vale o status da sessão. */
export function resolvePhoneNumberState({
	connection,
	phone,
	now,
}: {
	connection: Omit<TWhatsappNumberStateConnection, "telefones">;
	phone: { metadados?: TWhatsappConnectionPhoneMetadados | null };
	now: Date;
}): Exclude<TWhatsappNumberState, "NENHUM"> {
	if (connection.tipoConexao === "INTERNAL_GATEWAY") return connection.gatewayStatus === "connected" ? "CONECTADO" : "DESCONECTADO";
	const access = resolveMetaPhoneAccess({ dataExpiracao: connection.dataExpiracao, saude: phone.metadados?.saude, now });
	return access === "CONECTADO" ? "CONECTADO" : access === "EXPIRADO" ? "EXPIRADO" : "DESCONECTADO";
}

/**
 * Estado do canal da organização: o melhor entre os números. Um número utilizável basta para
 * "conectado"; sem nenhum, "expirado" quando algum só passou da data, senão "desconectado".
 */
export function resolveWhatsappNumberState({ connections, now }: { connections: TWhatsappNumberStateConnection[]; now: Date }): TWhatsappNumberState {
	const states = connections.flatMap((connection) => connection.telefones.map((phone) => resolvePhoneNumberState({ connection, phone, now })));
	if (states.length === 0) return "NENHUM";
	if (states.includes("CONECTADO")) return "CONECTADO";
	return states.includes("EXPIRADO") ? "EXPIRADO" : "DESCONECTADO";
}

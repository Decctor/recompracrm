import type { TWhatsappConnectionPhoneMetadados, TWhatsappPhoneDisconnection } from "@/services/drizzle/schema/whatsapp-connections";

/**
 * Regras puras da checagem de saúde dos telefones Meta Cloud API — sem I/O, para teste.
 * Os efeitos (Graph API, banco, e-mail) ficam em ./connection-health.ts.
 */

type TPhoneHealth = NonNullable<TWhatsappConnectionPhoneMetadados["saude"]>;

type TGraphError = {
	code?: number;
	error_subcode?: number;
	message?: string;
	is_transient?: boolean;
};

export type TWhatsappPhoneHealthCheck =
	| { status: "SAUDAVEL" }
	| { status: "FALHA"; motivo: string; mensagem: string }
	// Não dá para afirmar nada (rede, 5xx, rate limit, erro desconhecido): o estado gravado não muda.
	| { status: "INDETERMINADO"; mensagem: string };

// Rate limit, throttling e indisponibilidade temporária da Graph API.
const TRANSIENT_GRAPH_ERROR_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80007, 130429]);

export const PHONE_HEALTH_REMINDER_DAYS = 7;

export function classifyWhatsappPhoneHealth({
	phone,
	error,
}: {
	phone?: { status?: string | null } | null;
	error?: TGraphError | null;
}): TWhatsappPhoneHealthCheck {
	if (error) {
		const code = error.code ?? 0;
		if (error.is_transient || TRANSIENT_GRAPH_ERROR_CODES.has(code)) {
			return { status: "INDETERMINADO", mensagem: error.message ?? "Erro temporário da Meta." };
		}
		if (code === 190) {
			return {
				status: "FALHA",
				motivo: "TOKEN_INVALIDO",
				mensagem: "O token de acesso da Meta foi invalidado (acesso revogado, app removido ou sessão encerrada).",
			};
		}
		// 100/33: o objeto não existe ou não é visível para o token — a conta WhatsApp Business foi
		// excluída, o número migrou para outra conta ou o acesso do app foi removido. A Meta não
		// distingue os casos.
		if (code === 100 && error.error_subcode === 33) {
			return {
				status: "FALHA",
				motivo: "SEM_ACESSO",
				mensagem:
					"A Meta não reconhece mais este número nesta conexão: a conta WhatsApp Business foi excluída, o número migrou para outra conta ou o acesso foi removido.",
			};
		}
		if (code === 10 || (code >= 200 && code < 300)) {
			return {
				status: "FALHA",
				motivo: "SEM_PERMISSAO",
				mensagem: "A conexão perdeu as permissões do WhatsApp concedidas na Meta.",
			};
		}
		return { status: "INDETERMINADO", mensagem: error.message ?? `Erro ${code} da Meta.` };
	}

	if (phone?.status === "CONNECTED") return { status: "SAUDAVEL" };
	return {
		status: "FALHA",
		motivo: "TELEFONE_INDISPONIVEL",
		mensagem: `A Meta reporta o número com status ${phone?.status ?? "desconhecido"}.`,
	};
}

// Falhas de acesso que um PARTNER_REMOVED explica (o número some para o token: 100/33, permissão, token).
const ACCESS_FAILURE_REASONS = new Set(["SEM_ACESSO", "SEM_PERMISSAO", "TOKEN_INVALIDO"]);
// O webhook chega antes da checagem que detecta a falha (cron a cada 6 h) ou depois dela; um aviso
// mais antigo que isso em relação ao início da falha atual é de outra história.
const DISCONNECTION_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

/** Texto para a loja a partir do `disconnection_info` do PARTNER_REMOVED. */
export function describeWhatsappDisconnection(desconexao: Pick<TWhatsappPhoneDisconnection, "motivo" | "iniciadoPor">): string {
	if (desconexao.motivo === "PRIMARY_INACTIVITY") {
		return "A Meta desconectou o número do RecompraCRM porque o app WhatsApp Business ficou muito tempo sem ser aberto no celular (coexistência). Abra o app no celular desse número e depois reconecte.";
	}
	if (desconexao.iniciadoPor === "USER") {
		return "Alguém da empresa desconectou o RecompraCRM deste número, pelo app WhatsApp Business no celular ou pelo Meta Business Suite.";
	}
	return "O RecompraCRM foi removido como parceiro desta conta do WhatsApp na Meta.";
}

/**
 * Troca a mensagem genérica de "sem acesso" pelo motivo que a Meta mandou no webhook, quando o
 * aviso pertence à falha atual. O `motivo` da checagem fica — ele descreve o que a Graph respondeu.
 */
function explainWhatsappAccessFailure({
	check,
	desconexao,
	falhandoDesde,
}: {
	check: Exclude<TWhatsappPhoneHealthCheck, { status: "INDETERMINADO" }>;
	desconexao: TWhatsappPhoneDisconnection | null | undefined;
	falhandoDesde: string;
}) {
	if (check.status !== "FALHA" || !desconexao || !ACCESS_FAILURE_REASONS.has(check.motivo)) return check;
	const receivedAt = new Date(desconexao.recebidoEm).getTime();
	if (!Number.isFinite(receivedAt) || receivedAt < new Date(falhandoDesde).getTime() - DISCONNECTION_LOOKBACK_MS) return check;
	return { ...check, mensagem: describeWhatsappDisconnection(desconexao) };
}

/**
 * Próximo estado de saúde a partir do atual e da checagem. `null` = não gravar (indeterminado).
 *
 * Aviso por e-mail na transição para FALHA e, enquanto durar a falha, um lembrete a cada
 * PHONE_HEALTH_REMINDER_DAYS dias. `notificadoEm` já sai marcado quando `notify` é true —
 * quem chama grava e envia na mesma passada (reivindica o aviso antes de enviar).
 */
export function resolveNextWhatsappPhoneHealth({
	current,
	check: rawCheck,
	now,
	desconexao,
}: {
	current: TPhoneHealth | null | undefined;
	check: TWhatsappPhoneHealthCheck;
	now: Date;
	desconexao?: TWhatsappPhoneDisconnection | null;
}): { saude: TPhoneHealth; notify: boolean } | null {
	if (rawCheck.status === "INDETERMINADO") return null;

	const wasFailing = current?.status === "FALHA";
	const check = explainWhatsappAccessFailure({
		check: rawCheck,
		desconexao,
		falhandoDesde: (wasFailing ? current?.falhandoDesde : null) ?? now.toISOString(),
	});

	const verificadoEm = now.toISOString();
	if (check.status === "SAUDAVEL") {
		return {
			saude: { status: "SAUDAVEL", verificadoEm, falhandoDesde: null, motivo: null, mensagem: null, notificadoEm: null },
			notify: false,
		};
	}

	const falhandoDesde = (wasFailing ? current?.falhandoDesde : null) ?? verificadoEm;
	const lastNotifiedAt = wasFailing && current?.notificadoEm ? new Date(current.notificadoEm) : null;
	const notify = !lastNotifiedAt || now.getTime() - lastNotifiedAt.getTime() >= PHONE_HEALTH_REMINDER_DAYS * 24 * 60 * 60 * 1000;

	return {
		saude: {
			status: "FALHA",
			verificadoEm,
			falhandoDesde,
			motivo: check.motivo,
			mensagem: check.mensagem,
			notificadoEm: notify ? verificadoEm : (lastNotifiedAt?.toISOString() ?? null),
		},
		notify,
	};
}

// Campos de webhook que afetam a saúde da conexão, com o `tipo` que recebem no inbox:
// `account_update` (parceiro removido, conta desativada/excluída, restrições, migração) e
// `phone_number_quality_update` (qualidade/limite do número, FLAGGED/UNFLAGGED).
export const WHATSAPP_ACCOUNT_HEALTH_WEBHOOK_FIELDS = {
	account_update: "ACCOUNT-UPDATE",
	phone_number_quality_update: "PHONE-QUALITY",
} as const;
type TWhatsappAccountHealthWebhookField = keyof typeof WHATSAPP_ACCOUNT_HEALTH_WEBHOOK_FIELDS;

export type TWhatsappAccountHealthEvent = {
	whatsappBusinessAccountId: string;
	campo: TWhatsappAccountHealthWebhookField;
	evento: string | null;
	// `disconnection_info` do PARTNER_REMOVED (ex.: PRIMARY_INACTIVITY / SYSTEM).
	motivoDesconexao: string | null;
	desconexaoIniciadaPor: string | null;
};

function isAccountHealthWebhookField(field: unknown): field is TWhatsappAccountHealthWebhookField {
	return typeof field === "string" && Object.hasOwn(WHATSAPP_ACCOUNT_HEALTH_WEBHOOK_FIELDS, field);
}

type TAccountHealthChangeValue = {
	event?: unknown;
	waba_info?: { waba_id?: unknown };
	disconnection_info?: { reason?: unknown; initiated_by?: unknown };
};

function stringOrNull(value: unknown) {
	return typeof value === "string" && value ? value : null;
}

/**
 * Webhooks de conta/número da Meta. O evento só dispara uma checagem imediata dos telefones do
 * WABA — quem decide o estado é a checagem, não o nome do evento.
 *
 * O WABA é `value.waba_info.waba_id` quando vier: nos eventos de parceiro (PARTNER_ADDED,
 * PARTNER_REMOVED, PARTNER_APP_*, MM_LITE_*) o `entry.id` é o portfólio do RecompraCRM, não o da
 * loja. Nos demais (ACCOUNT_OFFBOARDED, qualidade do número) o `entry.id` é o próprio WABA.
 */
export function parseWhatsappAccountHealthWebhook(body: unknown): TWhatsappAccountHealthEvent[] {
	const entries = (body as { entry?: unknown })?.entry;
	if (!Array.isArray(entries)) return [];

	const events: TWhatsappAccountHealthEvent[] = [];
	for (const entry of entries as Array<{ id?: unknown; changes?: unknown }>) {
		if (!Array.isArray(entry?.changes)) continue;
		for (const change of entry.changes as Array<{ field?: unknown; value?: TAccountHealthChangeValue }>) {
			if (!isAccountHealthWebhookField(change?.field)) continue;
			const whatsappBusinessAccountId = stringOrNull(change.value?.waba_info?.waba_id) ?? stringOrNull(entry.id);
			if (!whatsappBusinessAccountId) continue;
			events.push({
				whatsappBusinessAccountId,
				campo: change.field,
				evento: stringOrNull(change.value?.event),
				motivoDesconexao: stringOrNull(change.value?.disconnection_info?.reason),
				desconexaoIniciadaPor: stringOrNull(change.value?.disconnection_info?.initiated_by),
			});
		}
	}
	return events;
}

/** Último PARTNER_REMOVED entre os eventos de um WABA, pronto para `metadados.desconexao`. */
export function pickWhatsappDisconnection(events: TWhatsappAccountHealthEvent[], now: Date): TWhatsappPhoneDisconnection | null {
	const removed = events.filter((event) => event.campo === "account_update" && event.evento === "PARTNER_REMOVED").at(-1);
	if (!removed) return null;
	return {
		evento: "PARTNER_REMOVED",
		motivo: removed.motivoDesconexao,
		iniciadoPor: removed.desconexaoIniciadaPor,
		recebidoEm: now.toISOString(),
	};
}

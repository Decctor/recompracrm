import type { TWhatsappConnectionPhoneMetadados } from "@/services/drizzle/schema/whatsapp-connections";

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

/**
 * Próximo estado de saúde a partir do atual e da checagem. `null` = não gravar (indeterminado).
 *
 * Aviso por e-mail na transição para FALHA e, enquanto durar a falha, um lembrete a cada
 * PHONE_HEALTH_REMINDER_DAYS dias. `notificadoEm` já sai marcado quando `notify` é true —
 * quem chama grava e envia na mesma passada (reivindica o aviso antes de enviar).
 */
export function resolveNextWhatsappPhoneHealth({
	current,
	check,
	now,
}: {
	current: TPhoneHealth | null | undefined;
	check: TWhatsappPhoneHealthCheck;
	now: Date;
}): { saude: TPhoneHealth; notify: boolean } | null {
	if (check.status === "INDETERMINADO") return null;

	const verificadoEm = now.toISOString();
	if (check.status === "SAUDAVEL") {
		return {
			saude: { status: "SAUDAVEL", verificadoEm, falhandoDesde: null, motivo: null, mensagem: null, notificadoEm: null },
			notify: false,
		};
	}

	const wasFailing = current?.status === "FALHA";
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
};

function isAccountHealthWebhookField(field: unknown): field is TWhatsappAccountHealthWebhookField {
	return typeof field === "string" && Object.hasOwn(WHATSAPP_ACCOUNT_HEALTH_WEBHOOK_FIELDS, field);
}

/**
 * Webhooks de conta/número da Meta. `entry.id` é o WABA nos dois campos. O evento só dispara
 * uma checagem imediata dos telefones do WABA — quem decide o estado é a checagem, não o nome
 * do evento.
 */
export function parseWhatsappAccountHealthWebhook(body: unknown): TWhatsappAccountHealthEvent[] {
	const entries = (body as { entry?: unknown })?.entry;
	if (!Array.isArray(entries)) return [];

	const events: TWhatsappAccountHealthEvent[] = [];
	for (const entry of entries as Array<{ id?: unknown; changes?: unknown }>) {
		if (typeof entry?.id !== "string" || !Array.isArray(entry.changes)) continue;
		for (const change of entry.changes as Array<{ field?: unknown; value?: { event?: unknown } }>) {
			if (!isAccountHealthWebhookField(change?.field)) continue;
			events.push({
				whatsappBusinessAccountId: entry.id,
				campo: change.field,
				evento: typeof change.value?.event === "string" ? change.value.event : null,
			});
		}
	}
	return events;
}

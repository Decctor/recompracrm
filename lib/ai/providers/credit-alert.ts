import { db } from "@/services/drizzle";
import { resend } from "@/services/resend";
import { sql } from "drizzle-orm";

/**
 * Alerta de crédito esgotado no AI Gateway.
 *
 * O crédito é global da aplicação, não da organização: quando acaba, todo agente de IA e toda
 * transcrição/descrição de mídia param ao mesmo tempo, em todas as organizações. Entre 21 e 24
 * de setembro de 2026 isso durou três dias e meio sem ninguém perceber — 33 runs e 309 mídias
 * falharam em silêncio, e a única pista era a coluna `erro` das runs.
 *
 * O destinatário é o desenvolvedor (`BUG_REPORT_EMAIL`), o mesmo dos alertas de disparo de
 * campanha. Uma janela de silêncio evita um e-mail por webhook enquanto o crédito não volta.
 */

const ALERT_KEY = "ai-gateway-credit-alert";
const ALERT_SILENCE_HOURS = 6;
const LOG = "[AI_GATEWAY_CREDIT_ALERT]";

function describe(value: unknown): string {
	if (value instanceof Error) return `${value.name} ${value.message}`;
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value) ?? "";
	} catch {
		return "";
	}
}

/** Reconhece a recusa do gateway por falta de crédito, em qualquer camada da cadeia de causas. */
export function isAiGatewayCreditError(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; current && depth < 5; depth++) {
		if (/insufficient_funds|positive credit balance/i.test(describe(current))) return true;
		current = current instanceof Error ? current.cause : null;
	}
	return false;
}

/**
 * Reserva o direito de enviar o alerta: a primeira falha envia; as seguintes, dentro da janela,
 * só contam. Uma corrida entre dois webhooks pode enviar dois e-mails — aceitável.
 */
async function claimAlertWindow(): Promise<boolean> {
	const [existing] = await db.execute<{ id: string }>(sql`
		select id from ampmais_utils
		where identificador = ${ALERT_KEY} and organizacao_id is null
		limit 1
	`);

	if (!existing) {
		await db.execute(sql`
			insert into ampmais_utils (id, identificador, valor)
			values (${crypto.randomUUID()}, ${ALERT_KEY}, '{}'::jsonb)
		`);
		return true;
	}

	const updated = await db.execute<{ id: string }>(sql`
		update ampmais_utils
		set data_ultima_atualizacao = now()
		where id = ${existing.id}
			and data_ultima_atualizacao < now() - (${ALERT_SILENCE_HOURS} * interval '1 hour')
		returning id
	`);
	return updated.length > 0;
}

/**
 * Envia o alerta ao desenvolvedor. Nunca lança: é chamado do caminho de erro de uma run ou de
 * um processamento de mídia, e falhar em avisar não pode piorar a falha original.
 */
export async function notifyAiGatewayCreditExhausted({
	source,
	organizacaoId,
	detail,
}: {
	source: "AGENTE" | "MIDIA";
	organizacaoId?: string | null;
	detail: string;
}): Promise<void> {
	const recipient = process.env.BUG_REPORT_EMAIL;
	if (!recipient) {
		console.error(`${LOG} BUG_REPORT_EMAIL não configurado; alerta de crédito não enviado.`, { source, organizacaoId });
		return;
	}

	try {
		if (!(await claimAlertWindow())) return;

		const lines = [
			"O AI Gateway recusou uma requisição por falta de crédito. Enquanto o saldo não for reposto,",
			"nenhum agente de IA responde e nenhuma mídia de cliente (áudio, imagem, documento) é processada,",
			"em todas as organizações.",
			"",
			`Origem da primeira falha: ${source === "AGENTE" ? "turno do agente de IA" : "processamento de mídia do chat"}`,
			`Organização: ${organizacaoId ?? "desconhecida"}`,
			`Detalhe: ${detail}`,
			"",
			"Reposição: https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dtop-up",
			"",
			`Este alerta é silenciado por ${ALERT_SILENCE_HOURS} horas. Depois de repor o crédito, rode`,
			"`npm run reprocess:chat-media -- --apply` para transcrever as mídias que ficaram sem processamento.",
		];

		const { error } = await resend.emails.send({
			from: "RecompraCRM <noreply@recompracrm.com.br>",
			to: [recipient],
			subject: "[ALERTA] AI Gateway sem créditos — agentes de IA parados",
			text: lines.join("\n"),
		});
		if (error) console.error(`${LOG} Falha ao enviar o alerta:`, error);
		else console.warn(`${LOG} Alerta enviado para ${recipient}.`);
	} catch (error) {
		console.error(`${LOG} Erro inesperado ao enviar o alerta:`, error);
	}
}

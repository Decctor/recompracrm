import { releaseSendQuota } from "@/lib/interactions/send-counters";
import { resolveMessageTemplateStatusForPhone } from "@/lib/message-templates/metadata";
import type { ParsedWhatsappStatusError } from "@/lib/whatsapp/parsing";
import type { TCampaignDispatchInterruptionReasonEnum } from "@/schemas/enums";
import { type DBTransaction, db } from "@/services/drizzle";
import {
	type TCampaignDispatchInterruption,
	type TWhatsappConnectionPhoneMetadados,
	campaignDispatchRecipients,
	campaignDispatches,
	chatMessages,
	interactions,
	messageTemplates,
	whatsappConnectionPhones,
} from "@/services/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import {
	CAMPAIGN_DISPATCH_INTERRUPTION_COPY,
	type TCampaignDispatchInterruptionRule,
	findInterruptingWhatsappError,
	getCampaignDispatchInterruptionMessage,
} from "./interruption-policy";
import { skipRemainingRecipients } from "./progress";

/**
 * Efeitos da interrupção de disparos (regras em ./interruption-policy.ts).
 *
 * Onde a interrupção fica registrada depende de quem o erro afeta:
 *  - NUMERO: `metadados.bloqueioEnvio` do telefone — vale para todas as campanhas dele;
 *  - TEMPLATE: o status do template na Meta (PAUSADO/DESABILITADO/REJEITADO), já sincronizado
 *    pelos webhooks de template — sem estado próprio, cai sozinho quando a Meta reaprova;
 *  - DISPARO: só o disparo em que o erro aconteceu.
 * O consumer de envio consulta número, template e o próprio disparo antes de cada lote, então um
 * bloqueio gravado por qualquer caminho (envio síncrono, webhook, outro disparo) para todos os
 * envios em andamento no lote seguinte.
 */

const ACTIVE_SEND_STATUSES = ["ENFILEIRADA", "ENVIANDO"] as const;
const BLOCKING_TEMPLATE_STATUSES = new Set(["PAUSADO", "DESABILITADO", "REJEITADO"]);

export type TCampaignDispatchInterruptionInput = TCampaignDispatchInterruptionRule & {
	codigo: number | null;
	titulo: string | null;
	detalhes: string | null;
	interacaoId?: string | null;
};

export function buildInterruptionFromWhatsappError({
	error,
	rule,
	interacaoId = null,
}: {
	error: ParsedWhatsappStatusError;
	rule: TCampaignDispatchInterruptionRule;
	interacaoId?: string | null;
}): TCampaignDispatchInterruptionInput {
	return {
		...rule,
		codigo: error.code ?? null,
		titulo: error.title ?? error.message ?? null,
		detalhes: error.details ?? null,
		interacaoId,
	};
}

/**
 * Interrompe o disparo se ele ainda está enviando e pula quem aguarda na fila. Idempotente: a
 * primeira interrupção vence e as seguintes (outros workers, webhooks repetidos) não fazem nada.
 */
export async function interruptCampaignDispatch({
	executor,
	dispatchId,
	interruption,
}: {
	executor?: DBTransaction;
	dispatchId: string;
	interruption: TCampaignDispatchInterruptionInput;
}): Promise<boolean> {
	const apply = async (tx: DBTransaction) => {
		const now = new Date();
		const erro = getCampaignDispatchInterruptionMessage({ motivo: interruption.motivo, codigo: interruption.codigo });
		const interrupcao: TCampaignDispatchInterruption = {
			escopo: interruption.escopo,
			codigo: interruption.codigo,
			titulo: interruption.titulo,
			detalhes: interruption.detalhes,
			interacaoId: interruption.interacaoId ?? null,
			ocorridoEm: now.toISOString(),
		};
		const [interrupted] = await tx
			.update(campaignDispatches)
			.set({ status: "INTERROMPIDA", motivoInterrupcao: interruption.motivo, interrupcao, erro, dataConclusao: now, dataAtualizacao: now })
			.where(and(eq(campaignDispatches.id, dispatchId), inArray(campaignDispatches.status, [...ACTIVE_SEND_STATUSES])))
			.returning({ id: campaignDispatches.id });
		if (!interrupted) return false;

		const skipped = await skipRemainingRecipients({ executor: tx, dispatchId, motivoPulo: "ENVIO_INTERROMPIDO", erro });
		console.warn(`[CAMPAIGN_DISPATCH] [${dispatchId}] ${erro} ${skipped} destinatários pulados.`);
		return true;
	};

	if (executor) return apply(executor);
	return db.transaction(apply);
}

/**
 * Destinatários já reservados (quota consumida) que não serão enviados porque o lote foi
 * interrompido no meio: viram PULADA/ENVIO_INTERROMPIDO e devolvem a quota.
 */
export async function skipReservedRecipientsForInterruption({
	dispatch,
	recipients,
	interruption,
}: {
	dispatch: { id: string; organizacaoId: string; campanhaId: string };
	recipients: { id: string; dataReserva: Date | null }[];
	interruption: Pick<TCampaignDispatchInterruptionInput, "motivo" | "codigo">;
}) {
	if (recipients.length === 0) return 0;
	const erro = getCampaignDispatchInterruptionMessage(interruption);
	return db.transaction(async (tx) => {
		const skipped = await tx
			.update(campaignDispatchRecipients)
			.set({ status: "PULADA", motivoPulo: "ENVIO_INTERROMPIDO", erro, dataReserva: null })
			.where(
				and(
					inArray(
						campaignDispatchRecipients.id,
						recipients.map((recipient) => recipient.id),
					),
					eq(campaignDispatchRecipients.status, "RESERVADA"),
				),
			)
			.returning({ id: campaignDispatchRecipients.id });
		const skippedIds = new Set(skipped.map((row) => row.id));
		for (const recipient of recipients) {
			if (!skippedIds.has(recipient.id)) continue;
			await releaseSendQuota({
				tx,
				organizationId: dispatch.organizacaoId,
				campaignId: dispatch.campanhaId,
				reservedAt: recipient.dataReserva ?? new Date(),
			});
		}
		if (skipped.length > 0) {
			await tx
				.update(campaignDispatches)
				.set({ totalPulados: sql`${campaignDispatches.totalPulados} + ${skipped.length}`, dataAtualizacao: new Date() })
				.where(eq(campaignDispatches.id, dispatch.id));
		}
		return skipped.length;
	});
}

type TPhoneSendBlock = NonNullable<TWhatsappConnectionPhoneMetadados["bloqueioEnvio"]>;

// Grava o bloqueio só se o número ainda não está bloqueado: o primeiro erro é o que explica.
export async function blockWhatsappPhoneForCampaigns({
	executor = db,
	phoneId,
	interruption,
}: {
	executor?: DBTransaction | typeof db;
	phoneId: string;
	interruption: Pick<TCampaignDispatchInterruptionInput, "motivo" | "codigo" | "titulo" | "detalhes">;
}) {
	const block: TPhoneSendBlock = {
		motivo: interruption.motivo,
		codigo: interruption.codigo,
		titulo: interruption.titulo,
		detalhes: interruption.detalhes,
		bloqueadoEm: new Date().toISOString(),
	};
	await executor
		.update(whatsappConnectionPhones)
		.set({
			metadados: sql`jsonb_set(coalesce(${whatsappConnectionPhones.metadados}, '{}'::jsonb), '{bloqueioEnvio}', ${JSON.stringify(block)}::jsonb, true)`,
		})
		.where(
			and(
				eq(whatsappConnectionPhones.id, phoneId),
				sql`coalesce(${whatsappConnectionPhones.metadados}->'bloqueioEnvio', 'null'::jsonb) = 'null'::jsonb`,
			),
		);
}

/** Remove o bloqueio de envio do número. Com `sentAfter`, só se o bloqueio for anterior a ele. */
export async function clearWhatsappPhoneSendBlock({
	executor = db,
	phoneId,
	sentAfter,
}: {
	executor?: DBTransaction | typeof db;
	phoneId: string;
	sentAfter?: Date;
}) {
	const rows = await executor
		.update(whatsappConnectionPhones)
		.set({ metadados: sql`${whatsappConnectionPhones.metadados} - 'bloqueioEnvio'` })
		.where(
			and(
				eq(whatsappConnectionPhones.id, phoneId),
				sql`coalesce(${whatsappConnectionPhones.metadados}->'bloqueioEnvio', 'null'::jsonb) <> 'null'::jsonb`,
				sentAfter
					? sql`(${whatsappConnectionPhones.metadados}->'bloqueioEnvio'->>'bloqueadoEm')::timestamptz < ${sentAfter.toISOString()}::timestamptz`
					: undefined,
			),
		)
		.returning({ id: whatsappConnectionPhones.id });
	return rows.length > 0;
}

export type TCampaignDispatchSendBlock =
	| { kind: "OK" }
	// O disparo saiu de ENFILEIRADA/ENVIANDO (interrompido por outro worker ou webhook, cancelado).
	| { kind: "STOPPED" }
	| { kind: "BLOCKED"; interruption: TCampaignDispatchInterruptionInput };

/**
 * Checagem antes de cada lote: o disparo ainda está enviando, o número não está bloqueado e o
 * template não foi pausado/desabilitado/rejeitado pela Meta para este número.
 */
export async function resolveCampaignDispatchSendBlock({
	dispatchId,
	phoneId,
	templateId,
	checkTemplateApproval,
}: {
	dispatchId: string;
	phoneId: string | null;
	templateId: string | null;
	// A aprovação de template só existe na Cloud API; o gateway interno envia texto livre.
	checkTemplateApproval: boolean;
}): Promise<TCampaignDispatchSendBlock> {
	const [dispatch, phone, template] = await Promise.all([
		db.query.campaignDispatches.findFirst({ where: eq(campaignDispatches.id, dispatchId), columns: { status: true } }),
		phoneId ? db.query.whatsappConnectionPhones.findFirst({ where: eq(whatsappConnectionPhones.id, phoneId), columns: { metadados: true } }) : null,
		checkTemplateApproval && templateId
			? db.query.messageTemplates.findFirst({ where: eq(messageTemplates.id, templateId), columns: { metadados: true } })
			: null,
	]);

	if (!dispatch || !(ACTIVE_SEND_STATUSES as readonly string[]).includes(dispatch.status)) return { kind: "STOPPED" };

	const block = phone?.metadados?.bloqueioEnvio;
	if (block) {
		return {
			kind: "BLOCKED",
			interruption: { escopo: "NUMERO", motivo: block.motivo, codigo: block.codigo, titulo: block.titulo, detalhes: block.detalhes },
		};
	}

	if (template && phoneId) {
		// Só estados negativos explícitos da Meta bloqueiam. Template ainda não registrado/pendente
		// para o número segue o caminho normal: se a Meta recusar, o código do erro interrompe.
		const resolution = resolveMessageTemplateStatusForPhone({ metadata: template.metadados, phoneId });
		if (resolution.escopo === "TELEFONE" && BLOCKING_TEMPLATE_STATUSES.has(resolution.status)) {
			return {
				kind: "BLOCKED",
				interruption: {
					escopo: "TEMPLATE",
					motivo: "TEMPLATE_INDISPONIVEL",
					codigo: null,
					titulo: `Template ${resolution.status.toLowerCase()} na Meta`,
					detalhes: null,
				},
			};
		}
	}

	return { kind: "OK" };
}

/**
 * Falha reportada pelo webhook de status da Meta. Um erro que interrompe envios:
 *  - bloqueia o número (escopo NUMERO), inclusive quando a mensagem não é de campanha;
 *  - devolve o destinatário da campanha de ENVIADA para FALHOU, para que possa ser reenviado;
 *  - interrompe o disparo de origem, se ele ainda estiver enviando.
 * Erros do destinatário não mudam nada aqui: a interação já registra a falha.
 */
export async function handleWhatsappStatusFailure({
	whatsappPhoneNumberId,
	errors,
	interactionId,
}: {
	whatsappPhoneNumberId?: string | null;
	errors: ParsedWhatsappStatusError[] | null | undefined;
	interactionId?: string | null;
}) {
	const match = findInterruptingWhatsappError(errors);
	if (!match) return;
	const interruption = buildInterruptionFromWhatsappError({ ...match, interacaoId: interactionId ?? null });

	if (interruption.escopo === "NUMERO" && whatsappPhoneNumberId) {
		const phone = await db.query.whatsappConnectionPhones.findFirst({
			where: eq(whatsappConnectionPhones.whatsappTelefoneId, whatsappPhoneNumberId),
			columns: { id: true },
		});
		if (phone) await blockWhatsappPhoneForCampaigns({ phoneId: phone.id, interruption });
	}

	if (!interactionId) return;
	const interaction = await db.query.interactions.findFirst({
		where: eq(interactions.id, interactionId),
		columns: { id: true, metadados: true },
	});
	const dispatchId = interaction?.metadados?.dispatchId;
	const recipientId = interaction?.metadados?.dispatchRecipientId;
	if (!dispatchId) return;

	await db.transaction(async (tx) => {
		if (recipientId) {
			const [failed] = await tx
				.update(campaignDispatchRecipients)
				.set({ status: "FALHOU", erro: getCampaignDispatchInterruptionMessage(interruption) })
				.where(and(eq(campaignDispatchRecipients.id, recipientId), eq(campaignDispatchRecipients.status, "ENVIADA")))
				.returning({ id: campaignDispatchRecipients.id });
			if (failed) {
				await tx
					.update(campaignDispatches)
					.set({
						totalEnviados: sql`GREATEST(${campaignDispatches.totalEnviados} - 1, 0)`,
						totalFalhados: sql`${campaignDispatches.totalFalhados} + 1`,
						dataAtualizacao: new Date(),
					})
					.where(eq(campaignDispatches.id, dispatchId));
			}
		}
		await interruptCampaignDispatch({ executor: tx, dispatchId, interruption });
	});
}

/**
 * Entrega confirmada pela Meta: se o número está bloqueado e a mensagem saiu depois do bloqueio,
 * o problema foi resolvido (pagamento regularizado, conta liberada) e o bloqueio cai. Mensagens
 * enviadas antes do bloqueio e entregues depois não contam — chegam aos montes logo após o erro.
 * Para pagamento pendente só conta mensagem cobrável: uma resposta de atendimento gratuita pode
 * ser entregue com a cobrança ainda irregular. A retomada dos disparos continua manual.
 */
export async function handleWhatsappDeliveryConfirmed({
	whatsappPhoneNumberId,
	whatsappMessageId,
	interactionId,
	billable,
}: {
	whatsappPhoneNumberId?: string | null;
	whatsappMessageId: string;
	interactionId?: string | null;
	billable: boolean | null;
}) {
	if (!whatsappPhoneNumberId) return;
	const phone = await db.query.whatsappConnectionPhones.findFirst({
		where: and(
			eq(whatsappConnectionPhones.whatsappTelefoneId, whatsappPhoneNumberId),
			sql`coalesce(${whatsappConnectionPhones.metadados}->'bloqueioEnvio', 'null'::jsonb) <> 'null'::jsonb`,
		),
		columns: { id: true, metadados: true },
	});
	if (!phone) return;
	if (phone.metadados?.bloqueioEnvio?.motivo === "PAGAMENTO_PENDENTE" && billable !== true) return;

	const [chatMessage, interaction] = await Promise.all([
		db.query.chatMessages.findFirst({ where: eq(chatMessages.whatsappMessageId, whatsappMessageId), columns: { dataEnvio: true } }),
		interactionId ? db.query.interactions.findFirst({ where: eq(interactions.id, interactionId), columns: { dataEnvio: true } }) : null,
	]);
	const sentAt = interaction?.dataEnvio ?? chatMessage?.dataEnvio ?? null;
	if (!sentAt) return;

	const cleared = await clearWhatsappPhoneSendBlock({ phoneId: phone.id, sentAfter: sentAt });
	if (cleared) console.log(`[CAMPAIGN_DISPATCH] Bloqueio de envio do telefone ${phone.id} removido após entrega confirmada.`);
}

/** Barra a ativação de uma campanha cujo número está bloqueado para envios. */
export async function assertWhatsappPhoneCanSendCampaigns(phoneId: string | null | undefined) {
	if (!phoneId) return;
	const phone = await db.query.whatsappConnectionPhones.findFirst({
		where: eq(whatsappConnectionPhones.id, phoneId),
		columns: { metadados: true },
	});
	const block = phone?.metadados?.bloqueioEnvio;
	if (!block) return;
	throw new createHttpError.BadRequest(describePhoneSendBlock(block.motivo, block.codigo));
}

export function describePhoneSendBlock(motivo: TCampaignDispatchInterruptionReasonEnum, codigo: number | null) {
	const copy = CAMPAIGN_DISPATCH_INTERRUPTION_COPY[motivo];
	return `Envios pelo número de WhatsApp bloqueados: ${copy.titulo}${codigo != null ? ` (código ${codigo})` : ""}. ${copy.acao}`;
}

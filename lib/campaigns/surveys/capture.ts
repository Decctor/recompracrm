import { saveClientCustomFieldValues } from "@/lib/custom-fields/values";
import { getSurveyButtons, type TMessageTemplateSurveyButton } from "@/lib/message-templates/surveys";
import { isSurveyFieldType } from "@/lib/message-templates/survey-validation";
import type { TInteractionSurveyReply } from "@/schemas/interactions";
import type { TSurveyReplySourceEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { clientCustomFieldValues, customFields, interactions } from "@/services/drizzle/schema";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { findSurveyButtonByOptionValue, findSurveyButtonByText, mergeSurveyAnswerIntoFieldValue, resolveSurveyOptionTitle } from "./answers";
import { parseSurveyReplyPayload } from "./payload";

/**
 * Captura de respostas de pesquisa (docs/dev-planning/survey-campaigns-plan.md §6).
 *
 * Roda no estágio 1 dos dois webhooks (antes do gate do hub): o valor da pesquisa é a escrita no
 * campo do cliente, e isso não pode depender da organização pagar o hub de atendimentos.
 *
 * Nunca lança para um toque que não é de pesquisa: `captured: false` custa um parse de payload e,
 * sem payload, uma consulta indexada.
 */

// Fallback por texto (gateway interno): só o último envio de pesquisa ao cliente nesta janela.
const TEXT_FALLBACK_WINDOW_DAYS = 7;
const TEXT_FALLBACK_CANDIDATES = 10;

export type TCaptureSurveyReplyInput = {
	organizacaoId: string;
	clienteId: string;
	/** wamid da mensagem do cliente: chave de idempotência do toque. */
	whatsappMessageId: string;
	buttonText: string;
	buttonPayload: string | null;
	quotedWhatsappMessageId: string | null;
	date: Date;
};

export type TCaptureSurveyReplyResult =
	| { captured: false }
	| {
			captured: true;
			/** Reentrega do provedor: a resposta já estava registrada, nada foi escrito. */
			duplicate: boolean;
			interacaoId: string;
			campanhaId: string;
			campoId: string;
			opcaoValor: string;
			opcaoTitulo: string;
			origem: TSurveyReplySourceEnum;
	  };

type TSurveyInteractionRow = {
	id: string;
	organizacaoId: string | null;
	clienteId: string;
	campanhaId: string | null;
	metadados: typeof interactions.$inferSelect.metadados;
	campanha: { id: string; whatsappTemplate: { conteudo: { botoes: TMessageTemplateSurveyButton[] | Array<{ tipo: string }> } } | null } | null;
};

type TResolvedSurveyReply = {
	interaction: TSurveyInteractionRow;
	campaignId: string;
	button: TMessageTemplateSurveyButton;
	origem: TSurveyReplySourceEnum;
};

const INTERACTION_WITH_TEMPLATE = {
	columns: { id: true, organizacaoId: true, clienteId: true, campanhaId: true, metadados: true },
	with: { campanha: { columns: { id: true }, with: { whatsappTemplate: { columns: { conteudo: true } } } } },
} as const;

function surveyButtonsOf(interaction: TSurveyInteractionRow) {
	const content = interaction.campanha?.whatsappTemplate?.conteudo;
	if (!content) return [];
	return getSurveyButtons(content as { botoes: TMessageTemplateSurveyButton[] });
}

function belongsTo(interaction: TSurveyInteractionRow, input: TCaptureSurveyReplyInput) {
	return interaction.organizacaoId === input.organizacaoId && interaction.clienteId === input.clienteId && !!interaction.campanhaId;
}

// 1. PAYLOAD — a resposta chega sabendo a que envio responde e qual opção é.
async function resolveByPayload(input: TCaptureSurveyReplyInput): Promise<TResolvedSurveyReply | null> {
	const payload = parseSurveyReplyPayload(input.buttonPayload);
	if (!payload) return null;

	const interaction = (await db.query.interactions.findFirst({
		where: eq(interactions.id, payload.interactionId),
		...INTERACTION_WITH_TEMPLATE,
	})) as TSurveyInteractionRow | undefined;
	if (!interaction || !belongsTo(interaction, input) || !interaction.campanhaId) return null;

	const button = findSurveyButtonByOptionValue(surveyButtonsOf(interaction), payload.opcaoValor);
	if (!button) return null;
	return { interaction, campaignId: interaction.campanhaId, button, origem: "PAYLOAD" };
}

// 2. CONTEXTO — o wamid citado é o do template enviado; o mesmo lookup que os status de entrega fazem.
async function resolveByQuotedMessage(input: TCaptureSurveyReplyInput): Promise<TResolvedSurveyReply | null> {
	if (!input.quotedWhatsappMessageId) return null;

	const interaction = (await db.query.interactions.findFirst({
		where: and(eq(interactions.organizacaoId, input.organizacaoId), sql`${interactions.metadados}->>'whatsappMessageId' = ${input.quotedWhatsappMessageId}`),
		...INTERACTION_WITH_TEMPLATE,
	})) as TSurveyInteractionRow | undefined;
	if (!interaction || !belongsTo(interaction, input) || !interaction.campanhaId) return null;

	const button = findSurveyButtonByText(surveyButtonsOf(interaction), input.buttonText);
	if (!button) return null;
	return { interaction, campaignId: interaction.campanhaId, button, origem: "CONTEXTO" };
}

// 3. TEXTO — gateway interno: o rótulo do botão contra os últimos envios de campanha ao cliente.
async function resolveByText(input: TCaptureSurveyReplyInput): Promise<TResolvedSurveyReply | null> {
	if (!input.buttonText.trim()) return null;
	const since = new Date(input.date.getTime() - TEXT_FALLBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000);

	const candidates = (await db.query.interactions.findMany({
		where: and(
			eq(interactions.organizacaoId, input.organizacaoId),
			eq(interactions.clienteId, input.clienteId),
			isNotNull(interactions.campanhaId),
			gte(interactions.dataInsercao, since),
		),
		orderBy: desc(interactions.dataInsercao),
		limit: TEXT_FALLBACK_CANDIDATES,
		...INTERACTION_WITH_TEMPLATE,
	})) as TSurveyInteractionRow[];

	for (const interaction of candidates) {
		if (!interaction.campanhaId) continue;
		const button = findSurveyButtonByText(surveyButtonsOf(interaction), input.buttonText);
		if (button) return { interaction, campaignId: interaction.campanhaId, button, origem: "TEXTO" };
	}
	return null;
}

export async function resolveSurveyReply(input: TCaptureSurveyReplyInput): Promise<TResolvedSurveyReply | null> {
	return (await resolveByPayload(input)) ?? (await resolveByQuotedMessage(input)) ?? (await resolveByText(input));
}

export async function captureSurveyReply(input: TCaptureSurveyReplyInput): Promise<TCaptureSurveyReplyResult> {
	const resolved = await resolveSurveyReply(input);
	if (!resolved) return { captured: false };

	const { interaction, campaignId, button, origem } = resolved;

	const field = await db.query.customFields.findFirst({
		where: and(eq(customFields.id, button.campoId), eq(customFields.organizacaoId, input.organizacaoId)),
	});
	const opcaoTitulo = resolveSurveyOptionTitle({ options: field?.opcoes, button });

	const entry: TInteractionSurveyReply = {
		opcaoValor: button.opcaoValor,
		opcaoTitulo,
		origem,
		whatsappMessageId: input.whatsappMessageId,
		data: input.date.toISOString(),
	};
	const probe = JSON.stringify([{ whatsappMessageId: input.whatsappMessageId }]);

	const outcome = await db.transaction(async (tx) => {
		// Append atômico guardado pelo wamid do cliente: uma reentrega da Meta não duplica a entrada
		// nem regrava o campo, e dois toques com milissegundos de diferença não se perdem.
		const appended = await tx
			.update(interactions)
			.set({
				metadados: sql`jsonb_set(
					COALESCE(${interactions.metadados}, '{}'::jsonb),
					'{pesquisaRespostas}',
					COALESCE(${interactions.metadados}->'pesquisaRespostas', '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb
				)`,
			})
			.where(and(eq(interactions.id, interaction.id), sql`NOT COALESCE(${interactions.metadados}->'pesquisaRespostas', '[]'::jsonb) @> ${probe}::jsonb`))
			.returning({ id: interactions.id });
		if (appended.length === 0) return { duplicate: true };

		// Campo inativo (ou apagado) depois da pesquisa: a resposta fica registrada no envio e a
		// audiência não a vê — é o que "inativo" significa.
		if (!field || !field.ativo || !isSurveyFieldType(field.tipo)) return { duplicate: false };

		let currentValue: typeof clientCustomFieldValues.$inferSelect.valor | null = null;
		if (field.tipo === "ESCOLHA_MULTIPLA") {
			// O campo agrega respostas de pesquisas diferentes: a união precisa do valor atual sob lock.
			const [current] = await tx
				.select({ valor: clientCustomFieldValues.valor })
				.from(clientCustomFieldValues)
				.where(and(eq(clientCustomFieldValues.clienteId, input.clienteId), eq(clientCustomFieldValues.campoId, field.id)))
				.for("update");
			currentValue = current?.valor ?? null;
		}

		try {
			await saveClientCustomFieldValues({
				trx: tx,
				organizacaoId: input.organizacaoId,
				clienteId: input.clienteId,
				valores: [{ campoId: field.id, valor: mergeSurveyAnswerIntoFieldValue({ fieldType: field.tipo, currentValue, opcaoValor: button.opcaoValor }) }],
			});
		} catch (error) {
			// A opção saiu do campo depois que a pesquisa encerrou (o congelamento só vale enquanto a
			// campanha está ativa). A resposta continua registrada no envio; só o campo fica sem ela.
			if (createHttpError.isHttpError(error) && error.statusCode < 500) {
				console.warn("[SURVEY_CAPTURE] Resposta registrada, mas o campo recusou o valor:", { campoId: field.id, opcaoValor: button.opcaoValor, error: error.message });
				return { duplicate: false };
			}
			throw error;
		}
		return { duplicate: false };
	});

	return {
		captured: true,
		duplicate: outcome.duplicate,
		interacaoId: interaction.id,
		campanhaId: campaignId,
		campoId: button.campoId,
		opcaoValor: button.opcaoValor,
		opcaoTitulo,
		origem,
	};
}

/** Wrapper para os webhooks: um erro na captura nunca derruba o processamento da mensagem. */
export async function captureSurveyReplySafely(input: TCaptureSurveyReplyInput, logPrefix: string): Promise<TCaptureSurveyReplyResult> {
	try {
		const result = await captureSurveyReply(input);
		if (result.captured) {
			console.log(`${logPrefix} Resposta de pesquisa capturada:`, {
				interacaoId: result.interacaoId,
				campanhaId: result.campanhaId,
				opcaoValor: result.opcaoValor,
				origem: result.origem,
				duplicate: result.duplicate,
			});
		}
		return result;
	} catch (error) {
		console.error(`${logPrefix} Falha ao capturar resposta de pesquisa:`, error);
		return { captured: false };
	}
}

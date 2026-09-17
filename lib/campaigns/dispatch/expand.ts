import { filterClientIdsByFrequencyCap } from "@/lib/campaigns/engine/frequency-cap";
import { filterCommunicationPausedClientIds, resolveCampaignAudienceClientIds } from "@/lib/campaigns/filters";
import {
	loadPromotionProductCandidates,
	resolvePromotionMetadataByClientId,
	type TPromotionProductCandidate,
} from "@/lib/campaigns/promotion-suggestion";
import type { TInteractionContextMetadados } from "@/lib/message-templates";
import { db } from "@/services/drizzle";
import { campaignDispatches, campaigns } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { chunkArray } from "../shared";
import { insertCampaignDispatchRecipients, type TCampaignDispatchRecipientInput } from "./create";
import { publishCampaignDispatchSend } from "./queue";
import { CAMPAIGN_DISPATCH_MAX_SEND_WORKERS, CAMPAIGN_DISPATCH_SEND_BATCH_SIZE, finalizeCampaignDispatchIfDone } from "./send";

/**
 * Consumer de expansão (`campaign-dispatch-expand`): resolve a audiência de um disparo agendado/
 * recorrente e materializa os destinatários. Filtros de frequência e de pausa de comunicação
 * marcam PULADA em vez de sumir com o cliente — observabilidade completa de quem não foi
 * contatado e por quê. Seguro para reexecutar: a chave única (disparo, cliente) ignora repetidos.
 */

export type TCampaignDispatchExpandSummary = {
	dispatchId: string;
	audience: number;
	inserted: number;
	skipped: number;
	workersPublished: number;
};

const PROMOTION_CONTEXT_CHUNK_SIZE = 1000;

export async function runCampaignDispatchExpand({ dispatchId }: { dispatchId: string }): Promise<TCampaignDispatchExpandSummary> {
	const summary: TCampaignDispatchExpandSummary = { dispatchId, audience: 0, inserted: 0, skipped: 0, workersPublished: 0 };
	const logPrefix = `[CAMPAIGN_DISPATCH] [${dispatchId}] [expand]`;

	const dispatch = await db.query.campaignDispatches.findFirst({ where: eq(campaignDispatches.id, dispatchId) });
	if (!dispatch) {
		console.warn(`${logPrefix} Disparo não encontrado; mensagem descartada.`);
		return summary;
	}

	// Reentrega depois de uma expansão concluída: garante que o envio foi publicado e recua.
	if (dispatch.status === "ENFILEIRADA" || dispatch.status === "ENVIANDO") {
		await publishCampaignDispatchSend({ dispatchId, generation: "expand-retry" });
		return { ...summary, workersPublished: 1 };
	}
	if (dispatch.status !== "PENDENTE" && dispatch.status !== "RESOLVENDO" && !(dispatch.status === "FALHOU" && dispatch.totalEnviados === 0)) {
		return summary;
	}

	const now = new Date();
	await db.update(campaignDispatches).set({ status: "RESOLVENDO", erro: null, dataAtualizacao: now }).where(eq(campaignDispatches.id, dispatchId));

	const campaign = await db.query.campaigns.findFirst({
		where: and(eq(campaigns.id, dispatch.campanhaId), eq(campaigns.organizacaoId, dispatch.organizacaoId)),
		with: { segmentacoes: true },
	});
	if (!campaign) {
		await db
			.update(campaignDispatches)
			.set({ status: "FALHOU", erro: "Campanha não encontrada.", dataConclusao: now, dataAtualizacao: now })
			.where(eq(campaignDispatches.id, dispatchId));
		return summary;
	}
	if (!campaign.ativo) {
		await db
			.update(campaignDispatches)
			.set({ status: "CANCELADA", erro: "Campanha pausada antes da expansão.", dataConclusao: now, dataAtualizacao: now })
			.where(eq(campaignDispatches.id, dispatchId));
		return summary;
	}

	// Promoção de produtos sem produto disponível é erro de configuração: o disparo falha visível
	// (painel de disparos) em vez de sair sem produto ou desligar a campanha silenciosamente.
	let promotionCandidates: TPromotionProductCandidate[] = [];
	if (campaign.gatilhoTipo === "PROMOCAO-PRODUTOS") {
		promotionCandidates = await loadPromotionProductCandidates({
			organizationId: dispatch.organizacaoId,
			promotionProducts: campaign.gatilhoPromocaoProdutos ?? [],
		});
		if (promotionCandidates.length === 0) {
			throw new Error("Nenhum produto disponível na lista da promoção (produtos removidos ou inativados).");
		}
	}

	const audienceClientIds = await resolveCampaignAudienceClientIds({
		organizationId: dispatch.organizacaoId,
		segmentations: campaign.segmentacoes.map((segmentation) => segmentation.segmentacao),
		filters: campaign.filtros,
	});
	summary.audience = audienceClientIds.length;

	const deliverableClientIds = new Set(
		await filterCommunicationPausedClientIds({ organizationId: dispatch.organizacaoId, clientIds: audienceClientIds }),
	);
	// Cap de frequência só faz sentido em campanhas que voltam a rodar (recorrentes); uso único e
	// promoção disparam uma vez por janela e a chave única já barra repetição.
	const frequency =
		dispatch.origem === "RECORRENTE"
			? await filterClientIdsByFrequencyCap({ campaign, clientIds: Array.from(deliverableClientIds), now })
			: { allowed: Array.from(deliverableClientIds), blocked: [] as string[] };
	const blockedByFrequency = new Set(frequency.blocked);

	const promotionContextByClientId = new Map<string, TInteractionContextMetadados>();
	if (promotionCandidates.length > 0) {
		for (const chunk of chunkArray(frequency.allowed, PROMOTION_CONTEXT_CHUNK_SIZE)) {
			try {
				const resolved = await resolvePromotionMetadataByClientId({
					organizationId: dispatch.organizacaoId,
					clientIds: chunk,
					candidates: promotionCandidates,
				});
				for (const [clientId, context] of resolved) promotionContextByClientId.set(clientId, context);
			} catch (error) {
				// Sem contexto, o template ainda envia (variáveis da promoção vazias) — preferível a
				// perder a campanha inteira.
				console.error(`${logPrefix} Falha ao resolver produtos sugeridos para um lote:`, error);
			}
		}
	}

	const recipients: TCampaignDispatchRecipientInput[] = audienceClientIds.map((clienteId) => ({
		clienteId,
		contexto: promotionContextByClientId.get(clienteId) ?? null,
		motivoPulo: !deliverableClientIds.has(clienteId) ? "COMUNICACAO_PAUSADA" : blockedByFrequency.has(clienteId) ? "FREQUENCIA" : null,
	}));

	const result = await db.transaction((tx) =>
		insertCampaignDispatchRecipients({ tx, dispatchId, organizationId: dispatch.organizacaoId, campaignId: dispatch.campanhaId, recipients }),
	);
	summary.inserted = result.inserted;
	summary.skipped = result.skipped;

	await db
		.update(campaignDispatches)
		.set({
			status: "ENFILEIRADA",
			erro: audienceClientIds.length === 0 ? "Audiência vazia: nenhum cliente corresponde aos filtros da campanha." : null,
			dataAtualizacao: new Date(),
		})
		.where(eq(campaignDispatches.id, dispatchId));

	if (result.inserted === 0) {
		await finalizeCampaignDispatchIfDone({ dispatchId });
		console.log(`${logPrefix} Nenhum destinatário a enviar.`, summary);
		return summary;
	}

	const workers = Math.min(CAMPAIGN_DISPATCH_MAX_SEND_WORKERS, Math.max(1, Math.ceil(result.inserted / CAMPAIGN_DISPATCH_SEND_BATCH_SIZE)));
	await publishCampaignDispatchSend({ dispatchId, workers, generation: "expand" });
	summary.workersPublished = workers;
	console.log(`${logPrefix} Expansão concluída.`, summary);
	return summary;
}

export async function markCampaignDispatchExpandFailed({ dispatchId, error }: { dispatchId: string; error: unknown }) {
	const message = error instanceof Error ? error.message : "Erro desconhecido ao expandir o disparo.";
	await db
		.update(campaignDispatches)
		.set({ status: "FALHOU", erro: message, dataConclusao: new Date(), dataAtualizacao: new Date() })
		.where(and(eq(campaignDispatches.id, dispatchId), eq(campaignDispatches.totalEnviados, 0)));
	return message;
}

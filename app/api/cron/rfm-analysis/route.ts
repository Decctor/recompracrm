import dayjs from "dayjs";
import { NextRequest, NextResponse } from "next/server";

import { appApiHandler } from "@/lib/app-api";
import { publishEventDispatches, scheduleSegmentationDispatches, type TEventDispatchResult } from "@/lib/campaigns/engine";
import { filterCommunicationPausedClientIds, resolveCampaignAudienceClientIds } from "@/lib/campaigns/filters";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { type DBTransaction, db } from "@/services/drizzle";
import { clients, sales, utils } from "@/services/drizzle/schema";
import { getRFMLabel } from "@/utils/rfm";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { formatDurationMs } from "@/lib/formatting";

const intervalStart = dayjs().subtract(12, "month").startOf("day").toDate();
const intervalEnd = dayjs().endOf("day").toDate();
const RFM_UPDATE_BATCH_SIZE = 100;

type TRFMClientUpdateEntry = {
	clientId: string;
	analiseRFMTitulo: string;
	analiseRFMNotasFrequencia: string;
	analiseRFMNotasRecencia: string;
	analiseRFMNotasMonetario: string;
	analiseRFMUltimaAtualizacao: Date;
	analiseRFMUltimaAlteracao: Date | null;
};

async function flushPendingRFMClientUpdates({
	tx,
	organizationId,
	pendingUpdates,
}: {
	tx: DBTransaction;
	organizationId: string;
	pendingUpdates: TRFMClientUpdateEntry[];
}) {
	if (pendingUpdates.length === 0) return { updatedClientsCount: 0, durationMs: 0 };
	const startedAt = Date.now();

	await tx.execute(sql`
		update ${clients} as c
		set
			analise_rfm_titulo = v.analise_rfm_titulo::text,
			analise_rfm_notas_frequencia = v.analise_rfm_notas_frequencia::text,
			analise_rfm_notas_recencia = v.analise_rfm_notas_recencia::text,
			analise_rfm_notas_monetario = v.analise_rfm_notas_monetario::text,
			analise_rfm_ultima_atualizacao = v.analise_rfm_ultima_atualizacao::timestamp,
			analise_rfm_ultima_alteracao = v.analise_rfm_ultima_alteracao::timestamp
		from (
			values
				${sql.join(
					pendingUpdates.map(
						(entry) => sql`(
							${entry.clientId},
							${organizationId},
							${entry.analiseRFMTitulo},
							${entry.analiseRFMNotasFrequencia},
							${entry.analiseRFMNotasRecencia},
							${entry.analiseRFMNotasMonetario},
							${entry.analiseRFMUltimaAtualizacao.toISOString()},
							${entry.analiseRFMUltimaAlteracao?.toISOString() ?? null}
						)`,
					),
					sql`, `,
				)}
		) as v(
			client_id,
			organization_id,
			analise_rfm_titulo,
			analise_rfm_notas_frequencia,
			analise_rfm_notas_recencia,
			analise_rfm_notas_monetario,
			analise_rfm_ultima_atualizacao,
			analise_rfm_ultima_alteracao
		)
		where c.id = v.client_id
			and c.organizacao_id = v.organization_id
	`);

	return {
		updatedClientsCount: pendingUpdates.length,
		durationMs: Date.now() - startedAt,
	};
}

async function getRFMAnalysisRoute(_req: NextRequest) {
	const startedAt = Date.now();
	// Buscar todas as organizacoes
	const organizationsList = await db.query.organizations.findMany({
		columns: { id: true },
	});

	console.log(
		`[INFO] [RFM_ANALYSIS] Starting RFM analysis for ${organizationsList.length} organizations with updateBatchSize=${RFM_UPDATE_BATCH_SIZE}`,
	);

	let processedOrganizationsCount = 0;
	let failedOrganizationsCount = 0;
	let analyzedClientsCount = 0;
	let updatedClientsCount = 0;
	let immediateInteractionsCount = 0;

	for (const organization of organizationsList) {
		const organizationStartedAt = Date.now();
		try {
			console.log(`[ORG: ${organization.id}] [INFO] [RFM_ANALYSIS] Starting RFM analysis`);

			const campaigns = await db.query.campaigns.findMany({
				where: (fields, { eq, and, or }) =>
					and(
						eq(fields.organizacaoId, organization.id),
						eq(fields.ativo, true),
						or(eq(fields.gatilhoTipo, "PERMANÊNCIA-SEGMENTAÇÃO"), eq(fields.gatilhoTipo, "ENTRADA-SEGMENTAÇÃO")),
					),
				with: {
					segmentacoes: true,
					whatsappTemplate: true,
					whatsappConexaoTelefone: {
						columns: {
							id: true,
						},
						with: {
							conexao: { columns: { token: true, gatewaySessaoId: true } },
						},
					},
				},
			});

			const campaignsForPermanenceInSegmentation = campaigns.filter((campaign) => campaign.gatilhoTipo === "PERMANÊNCIA-SEGMENTAÇÃO");
			const campaignsForEntryInSegmentation = campaigns.filter((campaign) => campaign.gatilhoTipo === "ENTRADA-SEGMENTAÇÃO");
			const filterAudienceEntries = await Promise.all(
				campaigns.map(async (campaign) => {
					const clientIds = await resolveCampaignAudienceClientIds({
						organizationId: organization.id,
						segmentations: [],
						filters: campaign.filtros,
					});
					const deliverableClientIds = await filterCommunicationPausedClientIds({
						organizationId: organization.id,
						clientIds,
					});
					return [campaign.id, new Set(deliverableClientIds)] as const;
				}),
			);
			const filterAudiencesByCampaignId = new Map(filterAudienceEntries);

			console.log(`[ORG: ${organization.id}] ${campaignsForPermanenceInSegmentation.length} campanhas de permanência em segmentação encontradas.`);
			console.log(`[ORG: ${organization.id}] ${campaignsForEntryInSegmentation.length} campanhas de entrada em segmentação encontradas.`);

			const accumulatedResultsByClient = await db
				.select({
					clientId: clients.id,
					clientRFMCurrentLabel: clients.analiseRFMTitulo,
					clientRFMLastLabelModification: clients.analiseRFMUltimaAlteracao,
					totalPurchases: sql<number>`sum(${sales.valorTotal})`,
					purchaseCount: sql<number>`count(${sales.id})`,
					lastPurchaseDate: sql<Date>`max(${sales.dataVenda})`,
				})
				.from(clients)
				.leftJoin(
					sales,
					and(
						eq(sales.clienteId, clients.id),
						eq(sales.organizacaoId, organization.id),
						gte(sales.dataVenda, intervalStart),
						lte(sales.dataVenda, intervalEnd),
						eq(sales.statusVenda, "CONFIRMADA"),
					),
				)
				.where(eq(clients.organizacaoId, organization.id))
				.groupBy(clients.id);

			console.log(`[ORG: ${organization.id}] [INFO] [RFM_ANALYSIS] Loaded ${accumulatedResultsByClient.length} clients for RFM evaluation`);

			const utilsRFMReturn = await db.query.utils.findFirst({
				where: and(eq(utils.identificador, "CONFIG_RFM"), eq(utils.organizacaoId, organization.id)),
			});

			const rfmConfig = utilsRFMReturn?.valor.identificador === "CONFIG_RFM" ? utilsRFMReturn.valor : null;
			if (!rfmConfig) {
				console.error(`[ORG: ${organization.id}] [ERROR] Configuração RFM não encontrada.`);
				continue;
			}

			// Collect data for immediate processing
			const eventDispatches: TEventDispatchResult[] = [];
			const pendingRFMClientUpdates: TRFMClientUpdateEntry[] = [];
			let flushedRFMUpdateBatchesCount = 0;
			let scheduledInteractionsCount = 0;
			const transactionStartedAt = Date.now();

			await db.transaction(async (tx) => {
				const cashbackProgram = await tx.query.cashbackPrograms.findFirst({
					where: (fields, { eq }) => eq(fields.organizacaoId, organization.id),
					columns: { terminologia: true },
				});
				const cashbackTerminology = cashbackProgram?.terminologia ?? "DINHEIRO";
				for (const [_index, results] of accumulatedResultsByClient.entries()) {
					// `null`, não NaN, quando o cliente não comprou na janela — e o guard abaixo é
					// `!== null`, não truthiness: recência 0 (comprou hoje) é falsy e derrubava o
					// cliente para a pior nota, invertendo o rótulo dele a cada rodada do cron.
					const calculatedRecency = results.lastPurchaseDate ? dayjs().diff(dayjs(results.lastPurchaseDate), "days") : null;
					const calculatedFrequency = results.purchaseCount;
					const calculatedMonetary = results.totalPurchases;

					const configRecency = Object.entries(rfmConfig.recencia).find(
						([_key, value]) => calculatedRecency !== null && calculatedRecency >= value.min && calculatedRecency <= value.max,
					);
					const configFrequency = Object.entries(rfmConfig.frequencia).find(
						([_key, value]) => calculatedFrequency >= value.min && calculatedFrequency <= value.max,
					);
					const configMonetary = Object.entries(rfmConfig.monetario).find(
						([_key, value]) => calculatedMonetary >= value.min && calculatedMonetary <= value.max,
					);

					const recencyScore = configRecency ? Number(configRecency[0]) : 1;
					const frequencyScore = configFrequency ? Number(configFrequency[0]) : 1;
					const monetaryScore = configMonetary ? Number(configMonetary[0]) : 1;

					const newRFMLabel = getRFMLabel({ monetary: monetaryScore, frequency: frequencyScore, recency: recencyScore });

					const hasClientChangedRFMLabels = results.clientRFMCurrentLabel !== newRFMLabel;
					const clientDispatches = await scheduleSegmentationDispatches({
						tx,
						organizationId: organization.id,
						client: {
							clientId: results.clientId,
							newLabel: newRFMLabel,
							labelChanged: hasClientChangedRFMLabels,
							lastLabelModification: results.clientRFMLastLabelModification,
						},
						entryCampaigns: campaignsForEntryInSegmentation,
						permanenceCampaigns: campaignsForPermanenceInSegmentation,
						filterAudiencesByCampaignId,
						cashbackTerminology,
					});
					eventDispatches.push(...clientDispatches);
					scheduledInteractionsCount += clientDispatches.length;

					pendingRFMClientUpdates.push({
						clientId: results.clientId,
						analiseRFMTitulo: newRFMLabel,
						analiseRFMNotasFrequencia: frequencyScore.toString(),
						analiseRFMNotasRecencia: recencyScore.toString(),
						analiseRFMNotasMonetario: monetaryScore.toString(),
						analiseRFMUltimaAtualizacao: new Date(),
						analiseRFMUltimaAlteracao: hasClientChangedRFMLabels ? new Date() : results.clientRFMLastLabelModification,
					});

					if (pendingRFMClientUpdates.length >= RFM_UPDATE_BATCH_SIZE) {
						const flushSummary = await flushPendingRFMClientUpdates({
							tx,
							organizationId: organization.id,
							pendingUpdates: pendingRFMClientUpdates,
						});
						if (flushSummary.updatedClientsCount > 0) {
							flushedRFMUpdateBatchesCount += 1;
							console.log(
								`[ORG: ${organization.id}] [INFO] [RFM_ANALYSIS] Flushed RFM update batch ${flushedRFMUpdateBatchesCount} (${flushSummary.updatedClientsCount} clients) in ${formatDurationMs(flushSummary.durationMs)}`,
							);
						}
						pendingRFMClientUpdates.length = 0;
					}
				}

				const finalFlushSummary = await flushPendingRFMClientUpdates({
					tx,
					organizationId: organization.id,
					pendingUpdates: pendingRFMClientUpdates,
				});
				if (finalFlushSummary.updatedClientsCount > 0) {
					flushedRFMUpdateBatchesCount += 1;
					console.log(
						`[ORG: ${organization.id}] [INFO] [RFM_ANALYSIS] Flushed RFM update batch ${flushedRFMUpdateBatchesCount} (${finalFlushSummary.updatedClientsCount} clients) in ${formatDurationMs(finalFlushSummary.durationMs)}`,
					);
				}
			});

			console.log(
				`[ORG: ${organization.id}] [INFO] [RFM_ANALYSIS] Transaction completed in ${formatDurationMs(Date.now() - transactionStartedAt)} | clients=${accumulatedResultsByClient.length} | updateBatches=${flushedRFMUpdateBatchesCount} | scheduledInteractions=${scheduledInteractionsCount}`,
			);

			// Disparos de campanha imediatos: publicados depois do commit; os com atraso ficam para o relógio.
			if (eventDispatches.length > 0) await publishEventDispatches(eventDispatches);

			processedOrganizationsCount += 1;
			analyzedClientsCount += accumulatedResultsByClient.length;
			updatedClientsCount += accumulatedResultsByClient.length;
			immediateInteractionsCount += eventDispatches.length;

			console.log(
				`[ORG: ${organization.id}] [INFO] [RFM_ANALYSIS] RFM analysis completed successfully in ${formatDurationMs(Date.now() - organizationStartedAt)} | clients=${accumulatedResultsByClient.length} | immediateInteractions=${eventDispatches.length}`,
			);
		} catch (error) {
			failedOrganizationsCount += 1;
			console.error(`[ORG: ${organization.id}] [ERROR] [RFM_ANALYSIS] Error processing RFM analysis:`, error);
			// Continuar para proxima organizacao mesmo com erro
		}
	}

	console.log(
		`[INFO] [RFM_ANALYSIS] Completed in ${formatDurationMs(Date.now() - startedAt)} | organizations=${processedOrganizationsCount}/${organizationsList.length} | failedOrganizations=${failedOrganizationsCount} | analyzedClients=${analyzedClientsCount} | updatedClients=${updatedClientsCount} | immediateInteractions=${immediateInteractionsCount}`,
	);

	return NextResponse.json("AN?LISE RFM FEITA COM SUCESSO !", { status: 200 });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = appApiHandler({
	GET: async (req) => {
		assertCronAuthorized(req);
		return getRFMAnalysisRoute(req);
	},
});

import { appApiHandler } from "@/lib/app-api";
import {
	createEventCampaignDispatch,
	filterClientIdsByFrequencyCap,
	publishEventDispatches,
	type TEventDispatchResult,
} from "@/lib/campaigns/engine";
import { resolveDispatchScheduledAtForDate } from "@/lib/campaigns/dispatch/schedule";
import { resolveCampaignAudienceClientIdsForCampaign } from "@/lib/campaigns/filters";
import { buildBaseCashbackInteractionMetadata } from "@/lib/campaigns/interaction-metadata";
import { INTERACTIONS_CRON_TIMEZONE } from "@/lib/campaigns/time-blocks";
import { computeWorstSalesDayOfWeek } from "@/lib/campaigns/utils";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { DASTJS_TIME_DURATION_UNITS_MAP, getPostponedDateFromReferenceDate } from "@/lib/dates";
import { db } from "@/services/drizzle";
import dayjs from "dayjs";
import { NextRequest, NextResponse } from "next/server";

/**
 * Pior dia de vendas: um disparo por (campanha, dia) com toda a audiência como destinatários.
 * O bônus (cashback/cupom) é concedido no envio; aqui só o contexto.
 */
async function getWorstSalesDayNotifyRoute(_req: NextRequest) {
	console.log("[INFO] [WORST_SALES_DAY_NOTIFY] Starting worst sales day notification cron job");

	try {
		const organizationsList = await db.query.organizations.findMany({ columns: { id: true } });
		const now = new Date();
		const today = dayjs(now).tz(INTERACTIONS_CRON_TIMEZONE);
		const todayKey = today.format("YYYY-MM-DD");

		for (const organization of organizationsList) {
			console.log(`[ORG: ${organization.id}] Processing organization...`);
			const eventDispatches: TEventDispatchResult[] = [];

			await db.transaction(async (tx) => {
				const worstDayCampaigns = await tx.query.campaigns.findMany({
					where: (fields, { and, eq }) =>
						and(eq(fields.organizacaoId, organization.id), eq(fields.ativo, true), eq(fields.gatilhoTipo, "PIOR-DIA-VENDAS")),
					with: { segmentacoes: true },
				});
				if (worstDayCampaigns.length === 0) {
					console.log(`[ORG: ${organization.id}] No active PIOR-DIA-VENDAS campaigns found. Skipping.`);
					return;
				}

				const worstDayOfWeek = await computeWorstSalesDayOfWeek(tx, organization.id);
				if (worstDayOfWeek === null) {
					console.log(`[ORG: ${organization.id}] Insufficient sales data to determine worst day. Skipping.`);
					return;
				}
				console.log(`[ORG: ${organization.id}] Worst sales day of week: ${worstDayOfWeek} (0=Sun, 6=Sat)`);

				const cashbackProgram = await tx.query.cashbackPrograms.findFirst({
					where: (fields, { eq }) => eq(fields.organizacaoId, organization.id),
					columns: { terminologia: true },
				});
				const cashbackTerminology = cashbackProgram?.terminologia ?? "DINHEIRO";

				for (const campaign of worstDayCampaigns) {
					let targetDayOfWeek: number;
					let scheduledAt: Date;
					const isAntes = campaign.execucaoAgendadaDirecao === "ANTES" && campaign.execucaoAgendadaValor > 0;

					if (isAntes) {
						// Look ahead: is the worst day N units from now? Send today.
						const futureDate = today.add(campaign.execucaoAgendadaValor, DASTJS_TIME_DURATION_UNITS_MAP[campaign.execucaoAgendadaMedida]);
						targetDayOfWeek = futureDate.day();
						scheduledAt = resolveDispatchScheduledAtForDate({ date: now, block: campaign.execucaoAgendadaBloco });
					} else {
						// Is today the worst day? Schedule with delay.
						targetDayOfWeek = today.day();
						const postponed = getPostponedDateFromReferenceDate({
							date: now,
							unit: campaign.execucaoAgendadaMedida,
							value: campaign.execucaoAgendadaValor,
						});
						scheduledAt = resolveDispatchScheduledAtForDate({ date: postponed, block: campaign.execucaoAgendadaBloco });
					}

					if (targetDayOfWeek !== worstDayOfWeek) {
						console.log(`[ORG: ${organization.id}] [CAMPAIGN: ${campaign.id}] Target DOW ${targetDayOfWeek} !== worst DOW ${worstDayOfWeek}. Skipping.`);
						continue;
					}

					const targetClientIds = await resolveCampaignAudienceClientIdsForCampaign({ executor: tx, organizationId: organization.id, campaign });
					console.log(`[ORG: ${organization.id}] [CAMPAIGN: ${campaign.id}] Found ${targetClientIds.length} matching clients.`);
					if (targetClientIds.length === 0) continue;

					const frequency = await filterClientIdsByFrequencyCap({ executor: tx, campaign, clientIds: targetClientIds, now });
					const dispatch = await createEventCampaignDispatch({
						tx,
						organizationId: organization.id,
						campaign,
						janelaReferencia: `pior-dia:${todayKey}`,
						scheduledAt,
						recipients: [
							...frequency.allowed.map((clientId) => ({
								clienteId: clientId,
								contexto: buildBaseCashbackInteractionMetadata({ terminologia: cashbackTerminology }),
								descricao: "Campanha para o pior dia de vendas da semana.",
							})),
							...frequency.blocked.map((clientId) => ({ clienteId: clientId, motivoPulo: "FREQUENCIA" as const })),
						],
						now,
					});
					if (dispatch.created) eventDispatches.push(dispatch);
				}
			});

			await publishEventDispatches(eventDispatches);
		}

		console.log("[INFO] [WORST_SALES_DAY_NOTIFY] All organizations processed successfully");
		return NextResponse.json("EXECUTADO COM SUCESSO", { status: 200 });
	} catch (error) {
		console.error("[ERROR] [WORST_SALES_DAY_NOTIFY] Fatal error:", error);
		return NextResponse.json(
			{
				error: "Failed to process worst sales day notifications",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = appApiHandler({
	GET: async (req) => {
		assertCronAuthorized(req);
		return getWorstSalesDayNotifyRoute(req);
	},
});

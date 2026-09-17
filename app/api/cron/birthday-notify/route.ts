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
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { DASTJS_TIME_DURATION_UNITS_MAP, getPostponedDateFromReferenceDate } from "@/lib/dates";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

type TOrganizationBirthdayNotifySummary = {
	activeCampaigns: number;
	matchingClients: number;
	dispatchesCreated: number;
	recipientsQueued: number;
	skippedByFrequencyRules: number;
};

/**
 * Aniversário do cliente: um disparo por (campanha, dia) com todos os aniversariantes como
 * destinatários. O bônus (cashback/cupom) é concedido no envio; aqui só o contexto.
 */
async function getBirthdayNotifyRoute(_req: NextRequest) {
	console.log("[INFO] [BIRTHDAY_NOTIFY] Starting birthday notification cron job");

	try {
		const organizationsList = await db.query.organizations.findMany({ columns: { id: true } });
		const now = new Date();
		const today = dayjs(now).tz(INTERACTIONS_CRON_TIMEZONE);
		const todayKey = today.format("YYYY-MM-DD");

		for (const organization of organizationsList) {
			console.log(`[ORG: ${organization.id}] Processing organization...`);
			const eventDispatches: TEventDispatchResult[] = [];
			const organizationSummary: TOrganizationBirthdayNotifySummary = {
				activeCampaigns: 0,
				matchingClients: 0,
				dispatchesCreated: 0,
				recipientsQueued: 0,
				skippedByFrequencyRules: 0,
			};

			await db.transaction(async (tx) => {
				const birthdayCampaigns = await tx.query.campaigns.findMany({
					where: (fields, { and: andFilter, eq: eqFilter }) =>
						andFilter(eqFilter(fields.organizacaoId, organization.id), eqFilter(fields.ativo, true), eqFilter(fields.gatilhoTipo, "ANIVERSARIO_CLIENTE")),
					with: { segmentacoes: true },
				});
				organizationSummary.activeCampaigns = birthdayCampaigns.length;
				if (birthdayCampaigns.length === 0) return;

				const cashbackProgram = await tx.query.cashbackPrograms.findFirst({
					where: (fields, { eq: eqFilter }) => eqFilter(fields.organizacaoId, organization.id),
					columns: { terminologia: true },
				});
				const cashbackTerminology = cashbackProgram?.terminologia ?? "DINHEIRO";

				// Each campaign may target a different birthday date based on direction.
				for (const campaign of birthdayCampaigns) {
					let targetMonth: number;
					let targetDay: number;
					let scheduledAt: Date;
					const isAntes = campaign.execucaoAgendadaDirecao === "ANTES" && campaign.execucaoAgendadaValor > 0;

					if (isAntes) {
						// Look ahead: clients whose birthday is N days/weeks/months from now; send today.
						const futureDate = today.add(campaign.execucaoAgendadaValor, DASTJS_TIME_DURATION_UNITS_MAP[campaign.execucaoAgendadaMedida]);
						targetMonth = futureDate.month() + 1;
						targetDay = futureDate.date();
						scheduledAt = resolveDispatchScheduledAtForDate({ date: now, block: campaign.execucaoAgendadaBloco });
					} else {
						// Birthday is today; delay execution by N units.
						targetMonth = today.month() + 1;
						targetDay = today.date();
						const postponed = getPostponedDateFromReferenceDate({
							date: now,
							unit: campaign.execucaoAgendadaMedida,
							value: campaign.execucaoAgendadaValor,
						});
						scheduledAt = resolveDispatchScheduledAtForDate({ date: postponed, block: campaign.execucaoAgendadaBloco });
					}

					const audienceClientIds = new Set(
						await resolveCampaignAudienceClientIdsForCampaign({ executor: tx, organizationId: organization.id, campaign }),
					);
					const birthdayClients = await tx
						.select({ id: clients.id, nome: clients.nome })
						.from(clients)
						.where(
							and(
								eq(clients.organizacaoId, organization.id),
								sql`EXTRACT(MONTH FROM ${clients.dataNascimento}) = ${targetMonth}`,
								sql`EXTRACT(DAY FROM ${clients.dataNascimento}) = ${targetDay}`,
							),
						);
					const targetBirthdayClients = birthdayClients.filter((client) => audienceClientIds.has(client.id));
					organizationSummary.matchingClients += targetBirthdayClients.length;
					console.log(
						`[ORG: ${organization.id}] [CAMPAIGN: ${campaign.id}] Direction: ${campaign.execucaoAgendadaDirecao}, Target birthday: ${targetMonth}/${targetDay}, Found ${targetBirthdayClients.length} matching clients.`,
					);
					if (targetBirthdayClients.length === 0) continue;

					const frequency = await filterClientIdsByFrequencyCap({
						executor: tx,
						campaign,
						clientIds: targetBirthdayClients.map((client) => client.id),
						now,
					});
					organizationSummary.skippedByFrequencyRules += frequency.blocked.length;
					const clientNameById = new Map(targetBirthdayClients.map((client) => [client.id, client.nome]));

					const dispatch = await createEventCampaignDispatch({
						tx,
						organizationId: organization.id,
						campaign,
						janelaReferencia: `aniversario:${todayKey}`,
						scheduledAt,
						recipients: [
							...frequency.allowed.map((clientId) => ({
								clienteId: clientId,
								contexto: buildBaseCashbackInteractionMetadata({ terminologia: cashbackTerminology }),
								descricao: `Feliz aniversário, ${clientNameById.get(clientId) ?? "cliente"}!`,
							})),
							...frequency.blocked.map((clientId) => ({ clienteId: clientId, motivoPulo: "FREQUENCIA" as const })),
						],
						now,
					});
					if (!dispatch.created) continue;
					eventDispatches.push(dispatch);
					organizationSummary.dispatchesCreated += 1;
					organizationSummary.recipientsQueued += dispatch.inserted;
				}
			});

			await publishEventDispatches(eventDispatches);

			console.log(`[ORG: ${organization.id}] [INFO] [BIRTHDAY_NOTIFY] Organization processing summary`, {
				...organizationSummary,
				timezone: INTERACTIONS_CRON_TIMEZONE,
				currentDate: todayKey,
			});
		}

		console.log("[INFO] [BIRTHDAY_NOTIFY] All organizations processed successfully");
		return NextResponse.json("EXECUTADO COM SUCESSO", { status: 200 });
	} catch (error) {
		console.error("[ERROR] [BIRTHDAY_NOTIFY] Fatal error:", error);
		return NextResponse.json(
			{
				error: "Failed to process birthday notifications",
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
		return getBirthdayNotifyRoute(req);
	},
});

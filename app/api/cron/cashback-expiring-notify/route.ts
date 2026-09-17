import { appApiHandler } from "@/lib/app-api";
import {
	createEventCampaignDispatch,
	filterClientIdsByFrequencyCap,
	publishEventDispatches,
	type TEventDispatchResult,
} from "@/lib/campaigns/engine";
import { resolveCampaignAudienceClientIdsForCampaign } from "@/lib/campaigns/filters";
import { INTERACTIONS_CRON_TIMEZONE } from "@/lib/campaigns/time-blocks";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { DASTJS_TIME_DURATION_UNITS_MAP } from "@/lib/dates";
import { formatDateAsLocale } from "@/lib/formatting";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import dayjs from "dayjs";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_CASHBACK_EXPIRING_ANTECEDENCIA_VALOR = 3;
const DEFAULT_CASHBACK_EXPIRING_ANTECEDENCIA_MEDIDA: TTimeDurationUnitsEnum = "DIAS";

function formatCashbackExpiringWindow(value: number, measure: TTimeDurationUnitsEnum) {
	const labels: Record<TTimeDurationUnitsEnum, { singular: string; plural: string }> = {
		MINUTOS: { singular: "minuto", plural: "minutos" },
		HORAS: { singular: "hora", plural: "horas" },
		DIAS: { singular: "dia", plural: "dias" },
		SEMANAS: { singular: "semana", plural: "semanas" },
		MESES: { singular: "mês", plural: "meses" },
		ANOS: { singular: "ano", plural: "anos" },
	};
	const label = value === 1 ? labels[measure].singular : labels[measure].plural;
	return `nos próximos ${value} ${label}`;
}

/**
 * Cashback expirando: um disparo por (campanha, dia) com os clientes que têm saldo expirando na
 * janela de antecedência. O atraso configurado na campanha vale como nos demais gatilhos de evento.
 */
async function getCashbackExpiringNotifyRoute(_req: NextRequest) {
	console.log("[INFO] [CASHBACK_EXPIRING_NOTIFY] Starting cashback expiring notification cron job");

	try {
		const organizationsList = await db.query.organizations.findMany({ columns: { id: true } });
		const now = new Date();
		const today = dayjs(now).startOf("day").toDate();
		const todayKey = dayjs(now).tz(INTERACTIONS_CRON_TIMEZONE).format("YYYY-MM-DD");

		for (const organization of organizationsList) {
			console.log(`[ORG: ${organization.id}] Processing organization...`);
			const eventDispatches: TEventDispatchResult[] = [];

			await db.transaction(async (tx) => {
				const cashbackProgram = await tx.query.cashbackPrograms.findFirst({
					where: (fields, { eq }) => eq(fields.organizacaoId, organization.id),
					columns: { terminologia: true },
				});
				const cashbackTerminology = cashbackProgram?.terminologia ?? "DINHEIRO";

				const campaignsForExpiration = await tx.query.campaigns.findMany({
					where: (fields, { and, eq }) =>
						and(eq(fields.organizacaoId, organization.id), eq(fields.ativo, true), eq(fields.gatilhoTipo, "CASHBACK-EXPIRANDO")),
					with: { segmentacoes: true },
				});
				if (campaignsForExpiration.length === 0) {
					console.log(`[ORG: ${organization.id}] No active CASHBACK-EXPIRANDO campaigns found. Skipping.`);
					return;
				}

				for (const campaign of campaignsForExpiration) {
					const effectiveAntecedenciaValor =
						campaign.gatilhoCashbackExpirandoAntecedenciaValor && campaign.gatilhoCashbackExpirandoAntecedenciaValor > 0
							? campaign.gatilhoCashbackExpirandoAntecedenciaValor
							: DEFAULT_CASHBACK_EXPIRING_ANTECEDENCIA_VALOR;
					const effectiveAntecedenciaMedida = campaign.gatilhoCashbackExpirandoAntecedenciaMedida ?? DEFAULT_CASHBACK_EXPIRING_ANTECEDENCIA_MEDIDA;

					const dayjsUnit = DASTJS_TIME_DURATION_UNITS_MAP[effectiveAntecedenciaMedida] || "day";
					const windowEndDate = dayjs(now).add(effectiveAntecedenciaValor, dayjsUnit).endOf("day").toDate();
					const cashbackExpiringWindow = formatCashbackExpiringWindow(effectiveAntecedenciaValor, effectiveAntecedenciaMedida);

					const expiringSoonTransactions = await tx.query.cashbackProgramTransactions.findMany({
						where: (fields, { and, eq, gt, lte }) =>
							and(
								eq(fields.organizacaoId, organization.id),
								eq(fields.tipo, "ACÚMULO"),
								eq(fields.status, "ATIVO"),
								gt(fields.valorRestante, 0),
								gt(fields.expiracaoData, today),
								lte(fields.expiracaoData, windowEndDate),
							),
						columns: { clienteId: true, valorRestante: true },
					});

					const totalExpiringByClientId = new Map<string, number>();
					for (const transaction of expiringSoonTransactions) {
						totalExpiringByClientId.set(transaction.clienteId, (totalExpiringByClientId.get(transaction.clienteId) ?? 0) + transaction.valorRestante);
					}

					const audienceClientIds = new Set(
						await resolveCampaignAudienceClientIdsForCampaign({ executor: tx, organizationId: organization.id, campaign }),
					);
					const minimumExpiringValue = campaign.gatilhoCashbackExpirandoValorMinimo ?? 0;
					const eligibleClientIds = Array.from(totalExpiringByClientId.entries())
						.filter(([clientId, totalExpiring]) => audienceClientIds.has(clientId) && (minimumExpiringValue <= 0 || totalExpiring >= minimumExpiringValue))
						.map(([clientId]) => clientId);
					console.log(`[ORG: ${organization.id}] [CAMPAIGN: ${campaign.id}] Found ${eligibleClientIds.length} clients with expiring cashback.`);
					if (eligibleClientIds.length === 0) continue;

					const frequency = await filterClientIdsByFrequencyCap({ executor: tx, campaign, clientIds: eligibleClientIds, now });
					const dispatch = await createEventCampaignDispatch({
						tx,
						organizationId: organization.id,
						campaign,
						janelaReferencia: `cashback-expirando:${todayKey}`,
						recipients: [
							...frequency.allowed.map((clientId) => {
								const totalExpiring = totalExpiringByClientId.get(clientId) ?? 0;
								return {
									clienteId: clientId,
									contexto: {
										terminologia: cashbackTerminology,
										cashbackExpirandoValor: totalExpiring,
										cashbackExpirandoData: formatDateAsLocale(windowEndDate) ?? undefined,
										cashbackExpirandoJanela: cashbackExpiringWindow,
									},
									descricao: `Você tem R$ ${(totalExpiring / 100).toFixed(2)} em cashback expirando nos próximos ${effectiveAntecedenciaValor} ${effectiveAntecedenciaMedida.toLowerCase()}.`,
								};
							}),
							...frequency.blocked.map((clientId) => ({ clienteId: clientId, motivoPulo: "FREQUENCIA" as const })),
						],
						now,
					});
					if (dispatch.created) eventDispatches.push(dispatch);
				}
			});

			await publishEventDispatches(eventDispatches);
		}

		console.log("[INFO] [CASHBACK_EXPIRING_NOTIFY] All organizations processed successfully");
		return NextResponse.json("EXECUTADO COM SUCESSO", { status: 200 });
	} catch (error) {
		console.error("[ERROR] [CASHBACK_EXPIRING_NOTIFY] Fatal error:", error);
		return NextResponse.json(
			{
				error: "Failed to process cashback expiring notifications",
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
		return getCashbackExpiringNotifyRoute(req);
	},
});

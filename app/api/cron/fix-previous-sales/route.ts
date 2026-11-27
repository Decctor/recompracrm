import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { runDataCollectingV2 } from "@/lib/data-collecting-v2";
import { getActiveDataSourceIntegrations } from "@/lib/integrations/data-sources";
import { db } from "@/services/drizzle";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { NextRequest, NextResponse } from "next/server";

dayjs.extend(utc);
dayjs.extend(timezone);

const DATA_COLLECTING_TIMEZONE = process.env.DATA_COLLECTING_TIMEZONE ?? "America/Sao_Paulo";

// O run de 5 dias rodava em série (concorrência padrão 1) e estourava os 300 s toda noite: as
// organizações do fim da fila nunca eram corrigidas. Mesma concorrência do cron principal
// (app/api/cron/data-collecting) — integrações da mesma organização seguem em série.
const FIX_PREVIOUS_SALES_ORGANIZATION_CONCURRENCY = 4;
const FIX_PREVIOUS_SALES_FETCH_CONCURRENCY = 6;

// E dividido em duas partes por organização, uma por execução agendada (vercel.json: 04:00 e
// 05:00 UTC), para cada metade caber folgada no limite. Chamada fora desses horários (manual)
// processa todas; `?parte=0|1` força uma metade.
const FIX_PREVIOUS_SALES_PARTS = 2;
const FIX_PREVIOUS_SALES_PART_BY_UTC_HOUR: Record<number, number> = { 4: 0, 5: 1 };

function resolveRunPart(request: NextRequest): number | null {
	const requested = request.nextUrl.searchParams.get("parte");
	if (requested !== null) {
		const part = Number(requested);
		return Number.isInteger(part) && part >= 0 && part < FIX_PREVIOUS_SALES_PARTS ? part : null;
	}
	return FIX_PREVIOUS_SALES_PART_BY_UTC_HOUR[new Date().getUTCHours()] ?? null;
}

/** Fontes ativas da metade `part`: organizações em ordem estável de id, alternadas entre as partes. */
async function loadIntegrationsForPart(part: number | null) {
	const integrations = await getActiveDataSourceIntegrations({ executor: db });
	if (part === null) return integrations;
	const organizationIds = Array.from(new Set(integrations.map((integration) => integration.organizacaoId))).sort();
	const partOrganizationIds = new Set(organizationIds.filter((_, index) => index % FIX_PREVIOUS_SALES_PARTS === part));
	return integrations.filter((integration) => partOrganizationIds.has(integration.organizacaoId));
}

/**
 * Syncs the previous 5 full days, excluding today, to catch sales or cancellations
 * missed by the main data-collecting cron.
 *
 * Campaigns stay disabled so past sales do not trigger NOVA-COMPRA/PRIMEIRA-COMPRA
 * interactions. Cashback and conversion attribution still run for newly imported
 * valid sales, and cashback reversal still runs for retroactive cancellations.
 */
async function getFixPreviousSalesRoute(req: NextRequest) {
	const referenceDate = dayjs().tz(DATA_COLLECTING_TIMEZONE);
	const part = resolveRunPart(req);
	const integrations = await loadIntegrationsForPart(part);
	const startDate = referenceDate.subtract(5, "day").startOf("day").toDate();
	const endDate = referenceDate.subtract(1, "day").endOf("day").toDate();

	console.log("[INFO] [FIX_PREVIOUS_SALES] Starting previous sales sync", {
		timezone: DATA_COLLECTING_TIMEZONE,
		startDate: startDate.toISOString(),
		endDate: endDate.toISOString(),
		part: part === null ? "TODAS" : `${part + 1}/${FIX_PREVIOUS_SALES_PARTS}`,
		integrations: integrations.length,
		effects: {
			processCashback: true,
			processCampaigns: false,
			processConversionAttribution: true,
		},
	});

	const result = await runDataCollectingV2({
		integrations,
		organizationConcurrency: FIX_PREVIOUS_SALES_ORGANIZATION_CONCURRENCY,
		fetchConcurrency: FIX_PREVIOUS_SALES_FETCH_CONCURRENCY,
		window: {
			startDate,
			endDate,
		},
		processImmediateInteractions: false,
		effects: {
			processCashback: true,
			processCampaigns: false,
			processConversionAttribution: true,
		},
	});

	console.log("[INFO] [FIX_PREVIOUS_SALES] Processing concluded", {
		part: part === null ? "TODAS" : `${part + 1}/${FIX_PREVIOUS_SALES_PARTS}`,
		summaries: result.summaries.length,
		errors: result.errors.length,
		importedSalesCount: result.summaries.reduce((total, summary) => total + summary.importedSalesCount, 0),
		createdSalesCount: result.summaries.reduce((total, summary) => total + summary.createdSalesCount, 0),
		updatedSalesCount: result.summaries.reduce((total, summary) => total + summary.updatedSalesCount, 0),
		unchangedSalesCount: result.summaries.reduce((total, summary) => total + summary.unchangedSalesCount, 0),
		cashbackTransactionsCount: result.summaries.reduce((total, summary) => total + summary.cashbackTransactionsCount, 0),
	});

	return NextResponse.json(
		{
			data: result,
			message:
				result.errors.length > 0
					? "Correção de vendas anteriores concluída com erros em algumas organizações."
					: "Correção de vendas anteriores executada com sucesso.",
		},
		{ status: 200 },
	);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = appApiHandler({
	GET: async (req) => {
		assertCronAuthorized(req);
		return getFixPreviousSalesRoute(req);
	},
});

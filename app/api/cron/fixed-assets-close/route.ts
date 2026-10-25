import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { closeFixedAssetsMonth, listPendingFixedAssetsMonths } from "@/lib/fixed-assets/monthly-close";
import { db } from "@/services/drizzle";
import { fixedAssets } from "@/services/drizzle/schema";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Fechamento mensal do patrimônio (ADR-0002, decisão 8): para cada organização com bens, gera o
 * lançamento PATRIMONIO dos meses completos ainda sem lançamento. Idempotente por
 * `chaveIdempotencia`; meses já fechados não são refeitos aqui.
 */

export const maxDuration = 300;

async function closePendingFixedAssetsMonths() {
	const organizationRows = await db.selectDistinct({ organizacaoId: fixedAssets.organizacaoId }).from(fixedAssets);
	let fechados = 0;
	const erros: string[] = [];
	for (const { organizacaoId } of organizationRows) {
		const pending = await listPendingFixedAssetsMonths({ trx: db, organizationId: organizacaoId });
		for (const month of pending) {
			try {
				await db.transaction((tx) => closeFixedAssetsMonth({ trx: tx, organizationId: organizacaoId, month }));
				fechados += 1;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				erros.push(`${organizacaoId} ${month}: ${message}`);
				console.error(`[FIXED_ASSETS_CLOSE] Falha ao fechar ${month} da organização ${organizacaoId}.`, error);
				// Meses seguintes dependem das mesmas contas: não insistir na mesma organização.
				break;
			}
		}
	}
	console.log(`[INFO] [FIXED_ASSETS_CLOSE] ${organizationRows.length} organização(ões), ${fechados} mês(es) fechado(s), ${erros.length} erro(s).`);
	return { data: { organizacoes: organizationRows.length, fechados, erros }, message: "Fechamento do patrimônio executado." };
}
export type TCloseFixedAssetsMonthsOutput = Awaited<ReturnType<typeof closePendingFixedAssetsMonths>>;

async function closeFixedAssetsRoute(request: NextRequest) {
	assertCronAuthorized(request);
	const result = await closePendingFixedAssetsMonths();
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: closeFixedAssetsRoute });

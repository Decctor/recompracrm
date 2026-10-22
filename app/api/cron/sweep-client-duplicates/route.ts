import { appApiHandler } from "@/lib/app-api";
import { sweepClientDuplicates } from "@/lib/clients/duplicates";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { type NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

/**
 * Varredura noturna de clientes duplicados (rede de segurança para importações,
 * syncs de ERP e dados históricos). Também serve de backfill no primeiro deploy.
 * A detecção primária é event-driven: os pontos de criação de cliente chamam
 * recomputeClientDuplicatesSafely na hora. Nomes semelhantes são detectados
 * somente nesta varredura, por organização e com limites conservadores.
 */
async function sweepClientDuplicatesRoute(req: NextRequest) {
	assertCronAuthorized(req);
	await sweepClientDuplicates();
	return NextResponse.json({ success: true }, { status: 200 });
}

export const GET = appApiHandler({ GET: sweepClientDuplicatesRoute });

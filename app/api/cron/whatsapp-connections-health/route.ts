import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { runWhatsappConnectionsHealthCheck } from "@/lib/whatsapp/connection-health";
import { NextRequest, NextResponse } from "next/server";

/**
 * Varredura de saúde das conexões Meta Cloud API (a cada 6h, vercel.json): uma GET por telefone,
 * resultado em `metadados.saude` e e-mail aos membros com `empresa.editar` quando um número
 * perde o acesso. Os webhooks `account_update`/`phone_number_quality_update` cobrem o caso
 * imediato; esta varredura cobre o que a Meta não avisa (token revogado, coexistência desconectada).
 */
async function checkWhatsappConnectionsHealthRoute(_request: NextRequest) {
	const summary = await runWhatsappConnectionsHealthCheck();
	return NextResponse.json({
		data: summary,
		message: `${summary.verificados} telefone(s) verificado(s): ${summary.falhas} com falha, ${summary.organizacoesNotificadas} organização(ões) avisada(s).`,
	});
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = appApiHandler({
	GET: async (req) => {
		assertCronAuthorized(req);
		return checkWhatsappConnectionsHealthRoute(req);
	},
});

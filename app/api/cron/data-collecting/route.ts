import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { runDataCollectingV2 } from "@/lib/data-collecting-v2";
import { NextRequest, NextResponse } from "next/server";

/**
 * Organizações coletadas em paralelo. O ciclo passa a custar as organizações mais lentas, não a
 * soma de todas. Conexões da MESMA organização seguem em série (ver
 * `groupIntegrationsByOrganization`) e cada uma já é isolada em try/catch. O teto fica bem abaixo
 * do pool (max 10 por instância): a transação de persistência só usa `tx`, então nenhuma
 * organização segura uma conexão esperando outra, e os efeitos pós-commit rodam depois do commit.
 * Mesmo valor do polling do iFood (`IFOOD_POLLING_ORGANIZATION_CONCURRENCY`).
 */
const DATA_COLLECTING_ORGANIZATION_CONCURRENCY = 4;

/**
 * Buscas nos conectores em paralelo, de qualquer organização. A busca é quase toda espera de rede
 * (o run gastava ~25 s de parede para ~0,9 s de CPU), então sobrepor as esperas é o que encurta o
 * run. Somado às 4 transações de gravação, fica dentro do pool de 10 conexões: Bling e iFood tocam
 * o banco durante a busca para renovar o token.
 */
const DATA_COLLECTING_FETCH_CONCURRENCY = 6;

/**
 * Run completo uma vez por hora (o das :00); os outros são incrementais: Bling e Cardápio Web pulam
 * o detalhe dos pedidos já gravados cuja listagem não mudou. O completo pega o que a listagem não
 * mostra — contato editado no ERP, produto que passou a resolver no catálogo.
 */
const DATA_COLLECTING_FULL_RUN_MINUTES = 5;

function isIncrementalRun(now: Date) {
	return now.getUTCMinutes() >= DATA_COLLECTING_FULL_RUN_MINUTES;
}

async function getDataCollectingRoute(_req: NextRequest) {
	console.log("[INFO] [DATA_COLLECTING_V2] Starting data collecting cron job");

	const startedAt = Date.now();
	const reuseUnchangedListings = isIncrementalRun(new Date(startedAt));
	const result = await runDataCollectingV2({
		organizationConcurrency: DATA_COLLECTING_ORGANIZATION_CONCURRENCY,
		fetchConcurrency: DATA_COLLECTING_FETCH_CONCURRENCY,
		reuseUnchangedListings,
	});

	// Tempos por integração: busca (rede), espera pela vez de gravar e gravação. É a base para
	// achar a integração que segura o run e para medir otimizações nos conectores.
	console.log("[INFO] [DATA_COLLECTING_V2] Processing concluded", {
		durationMs: Date.now() - startedAt,
		mode: reuseUnchangedListings ? "INCREMENTAL" : "COMPLETO",
		summaries: result.summaries.length,
		eventDispatches: result.eventDispatches.length,
		errors: result.errors.length,
		timings: result.timings,
	});

	return NextResponse.json(
		{
			data: result,
			message: result.errors.length > 0 ? "Coleta de dados concluída com erros em algumas organizações." : "Coleta de dados executada com sucesso.",
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
		return getDataCollectingRoute(req);
	},
});

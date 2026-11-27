import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { PRINT_JOB_PAYLOAD_RETENTION_DAYS } from "@/lib/desktop-agent/print-job-retention";
import { PRINT_JOB_MAX_TENTATIVAS } from "@/lib/desktop-agent/print-jobs";
import { db } from "@/services/drizzle";
import { printJobs } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, asc, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// Manutenção da fila de impressão, de hora em hora (plano: ciclo de vida do job):
// 1. PROCESSANDO com lease vencida e tentativas esgotadas → ERRO (reimpressão é decisão humana);
// 2. PENDENTE (ou PROCESSANDO retomável) além do TTL → EXPIRADO;
// 3. purga de jobs terminais com mais de 90 dias (mesma retenção do retention-cleanup);
// 4. compactação: jobs terminais com mais de PRINT_JOB_PAYLOAD_RETENTION_DAYS perdem o payload
//    (`conteudo` e a logo embutida nos `dados`), que nada relê depois do claim. A linha fica até a
//    purga. Ver lib/desktop-agent/print-job-retention.ts.
// Roda de hora em hora: os passos 1 e 2 deixam o dashboard em dia mais cedo, e a compactação
// mantém no máximo ~1 semana de payload na tabela.
const PURGE_RETENTION_DAYS = 90;
const TERMINAL_STATUSES = ["IMPRESSO", "ERRO", "CANCELADO", "EXPIRADO"] as const;
// Lotes pequenos: cada job compactado libera ~300 KB de TOAST; a primeira execução após o deploy
// pega o acumulado (~11 mil jobs) e para no orçamento de tempo, a seguinte continua.
const COMPACTION_BATCH_SIZE = 500;
const COMPACTION_TIME_BUDGET_MS = 200_000;
const LOGO_DATA_URL_PATH = sql`'{organizacao,logoDataUrl}'::text[]`;

async function compactTerminalPrintJobPayloads(cutoff: Date, startedAt: number) {
	let compacted = 0;
	while (Date.now() - startedAt < COMPACTION_TIME_BUDGET_MS) {
		const batch = await db
			.select({ id: printJobs.id })
			.from(printJobs)
			.where(
				and(
					inArray(printJobs.status, [...TERMINAL_STATUSES]),
					lt(printJobs.dataInsercao, cutoff),
					or(isNotNull(printJobs.conteudo), sql`${printJobs.dados} #> ${LOGO_DATA_URL_PATH} is not null`),
				),
			)
			.orderBy(asc(printJobs.dataInsercao))
			.limit(COMPACTION_BATCH_SIZE);
		if (batch.length === 0) break;

		await db
			.update(printJobs)
			.set({ conteudo: null, dados: sql`${printJobs.dados} #- ${LOGO_DATA_URL_PATH}` })
			.where(
				inArray(
					printJobs.id,
					batch.map((job) => job.id),
				),
			);
		compacted += batch.length;
		if (batch.length < COMPACTION_BATCH_SIZE) break;
	}
	return compacted;
}

async function printJobsMaintenanceRoute(request: NextRequest) {
	assertCronAuthorized(request);
	const startedAt = Date.now();
	const now = new Date();

	// 1. Tentativas esgotadas sem confirmação: o modo de falha perigoso é "imprimiu mas não
	// reportou" — vira ERRO visível no dashboard em vez de voltar para a fila.
	const exhaustedJobs = await db
		.update(printJobs)
		.set({ status: "ERRO", erro: "Tentativas de impressão esgotadas sem confirmação do agente.", dataConclusao: now })
		.where(and(eq(printJobs.status, "PROCESSANDO"), lt(printJobs.leaseExpiraEm, now), gte(printJobs.numeroTentativas, PRINT_JOB_MAX_TENTATIVAS)))
		.returning({ id: printJobs.id });

	// 2. TTL vencido: cupom atrasado é pior que cupom nenhum.
	const expiredJobs = await db
		.update(printJobs)
		.set({ status: "EXPIRADO", dataConclusao: now })
		.where(
			and(or(eq(printJobs.status, "PENDENTE"), and(eq(printJobs.status, "PROCESSANDO"), lt(printJobs.leaseExpiraEm, now))), lt(printJobs.expiraEm, now)),
		)
		.returning({ id: printJobs.id });

	// 3. Purga de terminais antigos.
	const purgeCutoff = dayjs().subtract(PURGE_RETENTION_DAYS, "days").toDate();
	const purgedJobs = await db
		.delete(printJobs)
		.where(and(inArray(printJobs.status, [...TERMINAL_STATUSES]), lt(printJobs.dataInsercao, purgeCutoff)))
		.returning({ id: printJobs.id });

	// 4. Compactação do payload dos terminais.
	const compactionCutoff = dayjs().subtract(PRINT_JOB_PAYLOAD_RETENTION_DAYS, "days").toDate();
	const compactedJobs = await compactTerminalPrintJobPayloads(compactionCutoff, startedAt);

	console.log(
		`[PRINT_JOBS_MAINTENANCE] ${exhaustedJobs.length} com tentativas esgotadas, ${expiredJobs.length} expirados, ${purgedJobs.length} purgados, ${compactedJobs} compactados.`,
	);

	return NextResponse.json({
		data: {
			tentativasEsgotadas: exhaustedJobs.length,
			expirados: expiredJobs.length,
			purgados: purgedJobs.length,
			compactados: compactedJobs,
		},
		message: "Manutenção da fila de impressão concluída com sucesso.",
	});
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = appApiHandler({ GET: printJobsMaintenanceRoute });

import { executeScheduledAutoEmission } from "@/lib/sales/sale-processing/execute-scheduled-auto-emission";
import { connection, db } from "@/services/drizzle";
import { fiscalOutboundDocuments } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { getErrorMessage } from "../errors";
import { AUTO_EMISSION_SCHEDULE_GRACE_MINUTES } from "./constants";
import { emitFiscalDocument, syncFiscalDocument } from "./documents";

const MAX_ATTEMPTS = 6;
// Backoff exponencial (minutos) por tentativa.
const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 360];
const FISCAL_QUEUE_LOCK_NAMESPACE = 347_221;
const FISCAL_QUEUE_LOCK_KEY = 1;

function nextAttemptDate(attempts: number): Date {
	const index = Math.min(attempts, BACKOFF_MINUTES.length - 1);
	return new Date(Date.now() + BACKOFF_MINUTES[index] * 60_000);
}

// Reagenda (ou encerra) a proxima tentativa do documento. O lock de envio (bloqueadoEm)
// e adquirido e liberado dentro de emitFiscalDocument, dono unico do claim.
async function scheduleNextAttempt(documentId: string, proximaTentativaEm: Date | null) {
	await db.update(fiscalOutboundDocuments).set({ proximaTentativaEm }).where(eq(fiscalOutboundDocuments.id, documentId));
}

// Processa a fila de emissao fiscal (outbox). Executado por cron.
// 1) Envia documentos prontos / com erro retentavel cuja proxima tentativa venceu.
// 2) Sincroniza documentos em processamento / cancelamento pendente.
// 3) Rede de seguranca do atraso da emissao automatica: executa agendamentos vencidos que a fila
//    `fiscal-auto-emissions` nao entregou (send falhou, mensagem descartada, ambiente sem fila).
async function processFiscalQueueUnlocked({ limit = 25 }: { limit?: number } = {}) {
	const now = new Date();
	const results = { enviados: 0, falhas: 0, sincronizados: 0, agendamentosExecutados: 0 };

	const toSend = await db.query.fiscalOutboundDocuments.findMany({
		where: (fields, operators) =>
			operators.and(
				operators.inArray(fields.statusInterno, ["PRONTO_PARA_ENVIO", "ERRO"]),
				operators.lt(fields.tentativasEnvio, MAX_ATTEMPTS),
				operators.isNotNull(fields.proximaTentativaEm),
				operators.lte(fields.proximaTentativaEm, now),
				operators.isNotNull(fields.vendaId),
			),
		orderBy: (fields, operators) => operators.asc(fields.proximaTentativaEm),
		limit,
	});

	for (const doc of toSend) {
		if (doc.presencaConsumidorDeclarada) {
			await scheduleNextAttempt(doc.id, null);
			continue;
		}
		if (doc.tipo !== "NFCE" && doc.tipo !== "NFE") {
			await scheduleNextAttempt(doc.id, null);
			continue;
		}

		try {
			// Repassa o encadeamento de devolucao persistido no documento: sem ele a referencia
			// seria recalculada sem o sufixo ":dev:" e a emissao cairia no documento da venda original.
			await emitFiscalDocument({
				vendaId: doc.vendaId as string,
				tipo: doc.tipo,
				organizacaoId: doc.organizacaoId,
				lancamentoContabilId: doc.lancamentoContabilId,
				origem: "AUTOMATICA",
				documentoOrigemId: doc.documentoOrigemId,
				chaveAcessoReferencia: doc.chaveAcessoReferencia,
			});
			// Sucesso, rejeicao ou processamento: nao reagenda automaticamente.
			await scheduleNextAttempt(doc.id, null);
			results.enviados++;
		} catch (error) {
			// 409: outro processo (emissao manual ou worker concorrente) detem o lock de envio.
			// Nao conta como falha nem reagenda; o dono do lock conclui o envio.
			if (createHttpError.isHttpError(error) && error.statusCode === 409) continue;
			const attempts = (doc.tentativasEnvio ?? 0) + 1;
			const proxima = attempts < MAX_ATTEMPTS ? nextAttemptDate(attempts) : null;
			await scheduleNextAttempt(doc.id, proxima);
			results.falhas++;
			console.error(`[FISCAL_WORKER] Falha ao emitir documento ${doc.id}: ${getErrorMessage(error)}`);
		}
	}

	const toSync = await db.query.fiscalOutboundDocuments.findMany({
		where: (fields, operators) => operators.inArray(fields.statusInterno, ["EM_PROCESSAMENTO", "CANCELAMENTO_PENDENTE"]),
		orderBy: (fields, operators) => operators.asc(fields.dataUltimaSincronizacao),
		limit,
	});

	for (const doc of toSync) {
		try {
			await syncFiscalDocument({
				organizationId: doc.organizacaoId,
				documentId: doc.id,
				source: "CONSULTA_AUTOMATICA",
			});
			results.sincronizados++;
		} catch (error) {
			console.error(`[FISCAL_WORKER] Falha ao sincronizar documento ${doc.id}: ${getErrorMessage(error)}`);
		}
	}

	// A graca da a fila a chance de entregar primeiro; se consumer e cron colidirem mesmo assim, o
	// claim em executeScheduledAutoEmission deixa passar um so. Indice parcial em
	// emissao_fiscal_data_agendamento mantem esta varredura barata.
	const scheduleCutoff = new Date(now.getTime() - AUTO_EMISSION_SCHEDULE_GRACE_MINUTES * 60_000);
	const overdueSchedules = await db.query.sales.findMany({
		where: (fields, operators) =>
			operators.and(operators.isNotNull(fields.emissaoFiscalDataAgendamento), operators.lte(fields.emissaoFiscalDataAgendamento, scheduleCutoff)),
		columns: { id: true, organizacaoId: true, emissaoFiscalDataAgendamento: true },
		orderBy: (fields, operators) => operators.asc(fields.emissaoFiscalDataAgendamento),
		limit,
	});

	for (const sale of overdueSchedules) {
		// organizacao_id e nullable no schema legado; sem org nao ha configuracao fiscal para emitir.
		if (!sale.emissaoFiscalDataAgendamento || !sale.organizacaoId) continue;
		try {
			const result = await executeScheduledAutoEmission({
				organizationId: sale.organizacaoId,
				saleId: sale.id,
				// O autor do gatilho so viaja na mensagem da fila; pelo cron a emissao e do sistema.
				authorId: null,
				scheduledFor: sale.emissaoFiscalDataAgendamento,
				source: "CRON",
			});
			if (result.status !== "IGNORADO") results.agendamentosExecutados++;
		} catch (error) {
			console.error(`[FISCAL_WORKER] Falha ao executar agendamento da venda ${sale.id}: ${getErrorMessage(error)}`);
		}
	}

	return results;
}

export async function processFiscalQueue({ limit = 25 }: { limit?: number } = {}) {
	return connection.begin(async (transaction) => {
		const [lock] = await transaction<{ acquired: boolean }[]>`
      select pg_try_advisory_xact_lock(${FISCAL_QUEUE_LOCK_NAMESPACE}, ${FISCAL_QUEUE_LOCK_KEY}) as acquired
    `;
		if (!lock?.acquired) {
			console.warn("[FISCAL_WORKER] Ciclo ignorado porque outra invocacao ainda possui o lock.");
			return { enviados: 0, falhas: 0, sincronizados: 0, agendamentosExecutados: 0 };
		}

		return processFiscalQueueUnlocked({ limit });
	});
}

import { getErrorMessage } from "@/lib/errors";
import { db } from "@/services/drizzle";
import { sales } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { processSaleAutomaticFiscalEmissionIfEligible } from "./process-sale-automatic-fiscal-emission";

export type TExecuteScheduledAutoEmissionInput = {
	organizationId: string;
	saleId: string;
	authorId: string | null;
	// Horário agendado gravado em `sales.emissaoFiscalDataAgendamento` no momento do agendamento.
	scheduledFor: Date;
	source: "FILA" | "CRON";
};

/**
 * Executa uma emissão automática agendada. Caminho único do consumer da fila e do cron
 * `fiscal-queue` (rede de segurança), por isso o claim vive aqui:
 *
 * `UPDATE ... WHERE emissao_fiscal_data_agendamento = scheduledFor RETURNING` limpa a coluna e
 * só deixa passar quem encontrou exatamente o agendamento que carrega. Mensagem reentregue,
 * fora de ordem ou de um agendamento antigo (a venda voltou a ser elegível e agendou de novo)
 * recua sem tocar em nada; consumer e cron simultâneos também — só um vence o UPDATE. Se ainda
 * assim dois chegarem ao provedor, o lock de envio do documento (`bloqueadoEm` → 409) resolve.
 *
 * A elegibilidade NÃO é presumida: `processSaleAutomaticFiscalEmissionIfEligible` reavalia tudo
 * contra o banco atual (status, pagamento, documento existente, exceções, preferência da org).
 * Uma venda cancelada, estornada ou já emitida manualmente na janela recua ali.
 */
export async function executeScheduledAutoEmission(input: TExecuteScheduledAutoEmissionInput) {
	const [claimed] = await db
		.update(sales)
		.set({ emissaoFiscalDataAgendamento: null })
		.where(and(eq(sales.id, input.saleId), eq(sales.organizacaoId, input.organizationId), eq(sales.emissaoFiscalDataAgendamento, input.scheduledFor)))
		.returning({ id: sales.id });
	if (!claimed) {
		console.log(
			`[FISCAL_AUTO_EMISSION] [${input.source}] Agendamento ignorado para venda ${input.saleId}: coluna não confere com ${input.scheduledFor.toISOString()} (mensagem velha, duplicada ou já executada).`,
		);
		return { status: "IGNORADO" as const, reason: "AGENDAMENTO_DIVERGENTE" as const };
	}

	const organization = await db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, input.organizationId) });
	if (!organization) return { status: "IGNORADO" as const, reason: "ORGANIZACAO_NAO_ENCONTRADA" as const };

	try {
		const result = await processSaleAutomaticFiscalEmissionIfEligible({
			organization,
			saleId: input.saleId,
			authorId: input.authorId,
			modo: "EXECUTAR_AGENDAMENTO",
		});
		console.log(`[FISCAL_AUTO_EMISSION] [${input.source}] Agendamento executado para venda ${input.saleId}: ${result.status}.`);
		return result;
	} catch (error) {
		// A coluna já foi limpa (claim). Não reagendamos: a venda fica visível pelo fluxo normal de
		// erro/emissão manual, e um erro de infraestrutura aqui vira retentativa do consumer.
		console.error(`[FISCAL_AUTO_EMISSION] [${input.source}] Falha ao executar agendamento da venda ${input.saleId}: ${getErrorMessage(error)}`);
		throw error;
	}
}

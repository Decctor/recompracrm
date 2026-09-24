import { getErrorMessage } from "@/lib/errors";
import { resolveAutoEmissionSchedule } from "@/lib/fiscal/auto-emission-delay";
import { resolveAutoEmissionException } from "@/lib/fiscal/auto-emission-policy";
import { sendScheduledAutoEmissionToQueue } from "@/lib/fiscal/auto-emission-queue";
import { enqueueFiscalDocument } from "@/lib/fiscal/documents";
import { resolveEmissionDocumentType } from "@/lib/fiscal/document-type";
import { notifyFiscalEmissionFailure } from "@/lib/fiscal/notifications";
import { isManagedFulfillmentSaleModel } from "@/lib/sales/fulfillment-channels/policy";
import { db } from "@/services/drizzle";
import { sales, type TOrganizationEntity } from "@/services/drizzle/schema";
import { and, eq, isNull } from "drizzle-orm";
import createHttpError from "http-errors";
import { getSaleFinancialState } from "./get-sale-financial-state";

/**
 * Trava de rollout da fase 5 (C5): enquanto o tratamento fiscal de pedidos com benefits
 * patrocinados (pagamento VALE reconstruído) e frete próprio (vFrete) não for validado com
 * pedidos reais na homologação, a emissão AUTOMÁTICA desses casos é pulada — a emissão manual
 * continua disponível (e já usa o tratamento novo). Vire para false após a validação.
 */
const MANAGED_CHANNEL_STRICT_AUTO_EMISSION = true;

/**
 * Canal gerenciado (ex.: iFood): no modelo clearing os pagamentos online já entram efetivados na
 * conta do canal, então `dataEfetivacao` basta. O caso AGUARDANDO_REPASSE é LEGADO — vendas
 * importadas antes do modelo clearing (até o backfill `backfill-settle-managed-channel-receivables`
 * rodar) — e conta como pago: a pendência era loja↔canal, não do consumidor.
 */
function isManagedSaleCustomerPaid({
	financialState,
	saleTotal,
}: {
	financialState: Awaited<ReturnType<typeof getSaleFinancialState>>;
	saleTotal: number;
}) {
	const customerPaidTotal = financialState.transactions
		.filter(
			(transaction) =>
				transaction.tipo === "ENTRADA" &&
				!["CANCELADO", "ESTORNADO"].includes(transaction.provedorStatus ?? "") &&
				(transaction.dataEfetivacao != null || transaction.provedorStatus === "AGUARDANDO_REPASSE"),
		)
		.reduce((sum, transaction) => sum + transaction.valor, 0);
	return customerPaidTotal + 0.01 >= saleTotal;
}

/**
 * Grava o agendamento na venda e publica a mensagem com delay. O UPDATE condicional
 * (`WHERE emissao_fiscal_data_agendamento IS NULL`) é o claim entre gatilhos concorrentes: só o
 * primeiro agenda; os outros leem o horário que ele gravou.
 *
 * Falha no `send` (rede, credenciais ausentes em `next dev`) NÃO desfaz o agendamento: a coluna
 * fica e o cron `fiscal-queue` executa o agendamento vencido (com graça para a fila entregar
 * primeiro). Emitir na hora como fallback violaria silenciosamente o atraso que a org pediu.
 */
async function scheduleAutomaticFiscalEmission({
	organizationId,
	saleId,
	authorId,
	agendadaPara,
}: {
	organizationId: string;
	saleId: string;
	authorId: string | null;
	agendadaPara: Date;
}): Promise<Date> {
	const [claimed] = await db
		.update(sales)
		.set({ emissaoFiscalDataAgendamento: agendadaPara })
		.where(and(eq(sales.id, saleId), eq(sales.organizacaoId, organizationId), isNull(sales.emissaoFiscalDataAgendamento)))
		.returning({ agendadaPara: sales.emissaoFiscalDataAgendamento });

	if (!claimed?.agendadaPara) {
		const current = await db.query.sales.findFirst({
			where: (fields, { eq }) => eq(fields.id, saleId),
			columns: { emissaoFiscalDataAgendamento: true },
		});
		// Outro gatilho agendou entre a leitura e o UPDATE. Sem coluna aqui só resta emitir no
		// horário que calculamos — cenário improvável (a coluna acabou de ser vista preenchida).
		return current?.emissaoFiscalDataAgendamento ?? agendadaPara;
	}

	try {
		await sendScheduledAutoEmissionToQueue({ organizationId, saleId, authorId, scheduledFor: agendadaPara.toISOString() });
	} catch (error) {
		console.error(
			`[PROCESS_SALE_AUTOMATIC_FISCAL_EMISSION] Falha ao publicar agendamento da venda ${saleId} na fila; o cron fiscal-queue executará o agendamento vencido. ${getErrorMessage(error)}`,
		);
	}
	return agendadaPara;
}

/**
 * `modo`:
 * - `GATILHO` (padrão): chamado pelos eventos da venda (confirmação, entrega, pagamento, edição,
 *   importação). Respeita `fiscalConfiguracao.emissaoAutomatica.atrasoMinutos`: com atraso, agenda
 *   e devolve `AGENDADO` em vez de emitir.
 * - `EXECUTAR_AGENDAMENTO`: chamado por `executeScheduledAutoEmission` (consumer da fila / cron)
 *   no fim da espera. Reavalia todas as travas e emite; nunca agenda de novo.
 */
export type TProcessSaleAutomaticFiscalEmissionMode = "GATILHO" | "EXECUTAR_AGENDAMENTO";

export async function processSaleAutomaticFiscalEmissionIfEligible({
	organization,
	saleId,
	authorId,
	modo = "GATILHO",
}: {
	organization: TOrganizationEntity;
	saleId: string;
	authorId?: string | null;
	modo?: TProcessSaleAutomaticFiscalEmissionMode;
}) {
	const [sale, financialState] = await Promise.all([
		db.query.sales.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, saleId), eq(fields.organizacaoId, organization.id)),
			with: {
				cliente: { columns: { cpfCnpj: true } },
				documentosFiscais: { columns: { id: true, statusInterno: true } },
				lancamentosContabeis: { columns: { id: true } },
			},
		}),
		getSaleFinancialState({ organizationId: organization.id, saleId }),
	]);

	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");

	// Override por venda (tri-state): null herda a preferência da organização; true/false é decisão explícita.
	const emissaoAutomaticaEfetiva = sale.emissaoFiscalAutomatica ?? organization.fiscalEmissaoAutomatica;
	if (!emissaoAutomaticaEfetiva) return { status: "NAO_SOLICITADO" as const, reason: "EMISSAO_AUTOMATICA_DESATIVADA" as const };

	// Exceções valem só quando a venda herda a preferência — override explícito (true) força a emissão.
	if (sale.emissaoFiscalAutomatica == null) {
		const metodos = financialState.transactions
			.filter(
				(transaction) =>
					transaction.tipo === "ENTRADA" && !["CANCELADO", "ESTORNADO"].includes(transaction.provedorStatus ?? "") && transaction.valor > 0,
			)
			.map((transaction) => transaction.metodo);
		const exception = resolveAutoEmissionException({ metodos, excecoes: organization.fiscalConfiguracao?.emissaoAutomatica?.excecoes });
		if (exception) return { status: "NAO_SOLICITADO" as const, reason: exception };
	}

	const isManagedSale = sale.processamentoOrigem === "EXTERNO" && isManagedFulfillmentSaleModel(sale.modelo);
	const isPaidForFiscal = financialState.isFullyPaid || (isManagedSale && isManagedSaleCustomerPaid({ financialState, saleTotal: sale.valorTotal }));
	if (sale.statusVenda !== "CONFIRMADA" || sale.statusAtendimento !== "ENTREGUE" || !isPaidForFiscal) {
		return { status: "NAO_SOLICITADO" as const, reason: "VENDA_NAO_ELEGIVEL" as const };
	}
	if (sale.documentosFiscais.some((document) => !["CANCELADO", "INUTILIZADO"].includes(document.statusInterno ?? ""))) {
		return { status: "NAO_SOLICITADO" as const, reason: "DOCUMENTO_EXISTENTE" as const };
	}

	if (isManagedSale && MANAGED_CHANNEL_STRICT_AUTO_EMISSION) {
		const integracaoMetadados = sale.integracaoMetadados;
		const sponsoredTotal = integracaoMetadados?.descontos.patrocinados.reduce((sum, sponsored) => sum + sponsored.valor, 0) ?? 0;
		const ownFreight = integracaoMetadados?.entrega.realizadaPor === "LOJA" ? integracaoMetadados.entrega.valorFrete : 0;
		if (sponsoredTotal > 0 || ownFreight > 0) {
			console.log(
				`[PROCESS_SALE_AUTOMATIC_FISCAL_EMISSION] Emissão automática pulada para venda gerenciada ${saleId} (patrocinado=${sponsoredTotal.toFixed(2)}, frete próprio=${ownFreight.toFixed(2)}) — emitir manualmente até a validação do tratamento.`,
			);
			return { status: "NAO_SOLICITADO" as const, reason: "CANAL_PENDENTE_VALIDACAO_FISCAL" as const };
		}
	}

	const accountingEntryId = sale.lancamentosContabeis[0]?.id;
	if (!accountingEntryId) throw new createHttpError.BadRequest("Lançamento contábil da venda não encontrado.");

	// Atraso configurado pela organização: a venda já é elegível (travas acima), mas a emissão só
	// acontece no fim da espera — e é reavaliada lá, porque o snapshot é montado só na emissão.
	if (modo === "GATILHO") {
		const schedule = resolveAutoEmissionSchedule({
			atrasoMinutos: organization.fiscalConfiguracao?.emissaoAutomatica?.atrasoMinutos,
			agendadaPara: sale.emissaoFiscalDataAgendamento,
		});
		if (schedule.acao === "JA_AGENDADA") return { status: "AGENDADO" as const, agendadaPara: schedule.agendadaPara };
		if (schedule.acao === "AGENDAR") {
			const agendadaPara = await scheduleAutomaticFiscalEmission({
				organizationId: organization.id,
				saleId,
				authorId: authorId ?? null,
				agendadaPara: schedule.agendadaPara,
			});
			return { status: "AGENDADO" as const, agendadaPara };
		}
	}

	try {
		const tipoDocumento = await resolveEmissionDocumentType({
			organizacaoId: organization.id,
			operacaoPadraoNfeId: organization.fiscalConfiguracao?.operacaoPadraoPorTipo?.NFE ?? null,
			signals: {
				canal: sale.canal,
				entregaModalidade: sale.entregaModalidade,
				destinatarioCpfCnpj: sale.cliente?.cpfCnpj,
			},
		});
		const enqueued = await enqueueFiscalDocument({
			vendaId: saleId,
			tipo: tipoDocumento,
			organizacaoId: organization.id,
			lancamentoContabilId: accountingEntryId,
			autorId: authorId ?? null,
			origem: "AUTOMATICA",
		});
		return { status: "SOLICITADO" as const, documentoId: enqueued.documentoId, statusInterno: enqueued.statusInterno };
	} catch (error) {
		console.error("[PROCESS_SALE_AUTOMATIC_FISCAL_EMISSION] Error emitting fiscal document", error);
		const errorMessage = getErrorMessage(error);
		await notifyFiscalEmissionFailure({ organization, sale, errorMessage });
		return { status: "ERRO" as const, error: errorMessage };
	}
}

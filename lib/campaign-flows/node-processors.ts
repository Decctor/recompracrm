import { generateCashbackForCampaign } from "@/lib/cashback/generate-campaign-cashback";
import type { ImmediateProcessingData } from "@/lib/interactions";
import type { TCampaignFlowNodeEntity } from "@/services/drizzle/schema";
import {
	campaignAudiences,
	campaignFlowExecutionSteps,
	cashbackProgramBalances,
	clients,
	interactions,
	sales,
} from "@/services/drizzle/schema";
import type { DBTransaction } from "@/services/drizzle";
import { and, eq, gte, sql } from "drizzle-orm";
import type { NodeResult } from "./graph-utils";
import { checkClientInAudience } from "./audience-resolver";
import type { TFilterTree } from "@/schemas/campaign-audiences";

// ============================================================================
// TYPES
// ============================================================================

type ProcessNodeParams = {
	tx: DBTransaction;
	node: TCampaignFlowNodeEntity;
	clienteId: string;
	executionId: string;
	campanhaId: string;
	organizacaoId: string;
	eventoMetadados?: Record<string, unknown> | null;
};

// ============================================================================
// MAIN DISPATCHER
// ============================================================================

/**
 * Processes a single node for a single client.
 * Returns the result including success/failure, condition outcome, etc.
 */
export async function processNode(params: ProcessNodeParams): Promise<NodeResult> {
	const { node } = params;

	switch (node.tipo) {
		case "GATILHO":
			return { sucesso: true };

		case "ACAO":
			return processActionNode(params);

		case "DELAY":
			return processDelayNode(params);

		case "CONDICAO":
			return processConditionNode(params);

		case "FILTRO":
			return processFilterNode(params);

		default:
			return { sucesso: false, erro: `Tipo de nó desconhecido: ${node.tipo}` };
	}
}

// ============================================================================
// ACTION PROCESSORS
// ============================================================================

async function processActionNode(params: ProcessNodeParams): Promise<NodeResult> {
	const { node } = params;
	const config = node.configuracao as Record<string, unknown>;

	switch (node.subtipo) {
		case "ENVIAR-WHATSAPP":
			return processActionWhatsapp(params, config);

		case "GERAR-CASHBACK":
			return processActionCashback(params, config);

		case "NOTIFICACAO-INTERNA":
			return processActionNotification(params, config);

		default:
			return { sucesso: false, erro: `Subtipo de ação desconhecido: ${node.subtipo}` };
	}
}

async function processActionWhatsapp(
	{ tx, clienteId, executionId, campanhaId, organizacaoId }: ProcessNodeParams,
	config: Record<string, unknown>,
): Promise<NodeResult> {
	const whatsappTemplateId = config.whatsappTemplateId as string;
	const whatsappConexaoTelefoneId = config.whatsappConexaoTelefoneId as string;

	if (!whatsappTemplateId || !whatsappConexaoTelefoneId) {
		return { sucesso: false, erro: "Template ou telefone de conexão não configurados." };
	}

	// Fetch template and connection
	const [template, clientData] = await Promise.all([
		tx.query.whatsappTemplates.findFirst({
			where: (fields, { eq }) => eq(fields.id, whatsappTemplateId),
		}),
		tx.query.clients.findFirst({
			where: (fields, { eq }) => eq(fields.id, clienteId),
			columns: { id: true, nome: true, telefone: true, email: true, analiseRFMTitulo: true },
		}),
	]);

	if (!template) {
		return { sucesso: false, erro: `Template WhatsApp ${whatsappTemplateId} não encontrado.` };
	}

	if (!clientData?.telefone) {
		return { sucesso: false, erro: "Cliente não possui telefone cadastrado." };
	}

	// Create interaction record (links to the campaign flow via campanhaId)
	const [insertedInteraction] = await tx
		.insert(interactions)
		.values({
			clienteId,
			organizacaoId,
			titulo: `Flow: ${template.nome ?? "WhatsApp"}`,
			tipo: "ENVIO-MENSAGEM",
			descricao: `Mensagem via campaign flow`,
			agendamentoDataReferencia: new Date().toISOString().split("T")[0],
		})
		.returning({ id: interactions.id });

	// The actual WhatsApp sending will be handled by the Vercel Workflow runner
	// which calls processSingleInteractionImmediately after this step completes.
	// We store the data needed for sending in the step result.
	return {
		sucesso: true,
		dados: {
			interactionId: insertedInteraction.id,
			whatsappTemplateId,
			whatsappConexaoTelefoneId,
			clienteId,
			requiresImmediateProcessing: true,
		},
	};
}

async function processActionCashback(
	{ tx, clienteId, campanhaId, organizacaoId, eventoMetadados }: ProcessNodeParams,
	config: Record<string, unknown>,
): Promise<NodeResult> {
	const tipo = config.tipo as "FIXO" | "PERCENTUAL";
	const valor = config.valor as number;
	const expiracaoMedida = (config.expiracaoMedida as string) ?? null;
	const expiracaoValor = (config.expiracaoValor as number) ?? null;

	if (!tipo || valor == null) {
		return { sucesso: false, erro: "Tipo ou valor do cashback não configurados." };
	}

	const saleId = (eventoMetadados?.vendaId as string) ?? null;
	const saleValue = (eventoMetadados?.valor as number) ?? null;

	const result = await generateCashbackForCampaign({
		tx,
		organizationId: organizacaoId,
		clientId: clienteId,
		campaignId: campanhaId,
		cashbackType: tipo,
		cashbackValue: valor,
		saleId,
		saleValue,
		expirationMeasure: expiracaoMedida as "DIAS" | "SEMANAS" | "MESES" | null,
		expirationValue: expiracaoValor,
	});

	if (!result) {
		return { sucesso: false, erro: "Falha ao gerar cashback." };
	}

	return {
		sucesso: true,
		dados: {
			cashbackAmount: result.cashbackAmount,
			transactionId: result.transactionId,
			newBalance: result.clientNewAvailableBalance,
		},
	};
}

async function processActionNotification(
	{ organizacaoId }: ProcessNodeParams,
	config: Record<string, unknown>,
): Promise<NodeResult> {
	const mensagem = config.mensagem as string;
	const destinatarioIds = config.destinatarioIds as string[] | undefined;

	// For now, just log the notification. This can be extended to send
	// real notifications via email, push, or in-app notifications.
	console.log(
		`[CAMPAIGN_FLOW] [NOTIFICACAO] Org: ${organizacaoId} | Msg: ${mensagem} | Dest: ${destinatarioIds?.join(", ") ?? "todos"}`,
	);

	return {
		sucesso: true,
		dados: { mensagem, destinatarioIds },
	};
}

// ============================================================================
// DELAY PROCESSOR
// ============================================================================

/**
 * Calculates the delay duration. The actual sleep/wait is handled by the
 * Vercel Workflow runner using context.sleep().
 */
async function processDelayNode({ node }: ProcessNodeParams): Promise<NodeResult> {
	const config = node.configuracao as Record<string, unknown>;

	switch (node.subtipo) {
		case "ESPERAR-DURACAO": {
			const valor = config.valor as number;
			const medida = config.medida as string;
			const sleepMs = convertToMs(valor, medida);
			return { sucesso: true, dados: { sleepMs, tipo: "DURACAO" } };
		}

		case "ESPERAR-ATE-HORARIO": {
			const horario = config.horario as string;
			const now = new Date();
			const [hours, minutes] = horario.split(":").map(Number);
			const target = new Date(now);
			target.setHours(hours, minutes, 0, 0);
			if (target <= now) target.setDate(target.getDate() + 1);
			const sleepMs = target.getTime() - now.getTime();
			return { sucesso: true, dados: { sleepMs, tipo: "ATE_HORARIO", horario } };
		}

		case "ESPERAR-ATE-DATA": {
			const data = config.data as string;
			const target = new Date(data);
			const sleepMs = Math.max(0, target.getTime() - Date.now());
			return { sucesso: true, dados: { sleepMs, tipo: "ATE_DATA", data } };
		}

		default:
			return { sucesso: false, erro: `Subtipo de delay desconhecido: ${node.subtipo}` };
	}
}

function convertToMs(valor: number, medida: string): number {
	switch (medida) {
		case "HORAS":
			return valor * 60 * 60 * 1000;
		case "DIAS":
			return valor * 24 * 60 * 60 * 1000;
		case "SEMANAS":
			return valor * 7 * 24 * 60 * 60 * 1000;
		case "MESES":
			return valor * 30 * 24 * 60 * 60 * 1000;
		default:
			return valor * 24 * 60 * 60 * 1000; // default to days
	}
}

// ============================================================================
// CONDITION PROCESSORS
// ============================================================================

async function processConditionNode(params: ProcessNodeParams): Promise<NodeResult> {
	const { node } = params;
	const config = node.configuracao as Record<string, unknown>;

	switch (node.subtipo) {
		case "VERIFICAR-ATRIBUTO-CLIENTE":
			return evaluateClientAttribute(params, config);

		case "VERIFICAR-COMPRA-RECENTE":
			return evaluateRecentPurchase(params, config);

		case "VERIFICAR-INTERACAO-ANTERIOR":
			return evaluatePreviousInteraction(params, config);

		case "VERIFICAR-SEGMENTO-RFM":
			return evaluateRfmSegment(params, config);

		case "VERIFICAR-CASHBACK-SALDO":
			return evaluateCashbackBalance(params, config);

		default:
			return { sucesso: false, erro: `Subtipo de condição desconhecido: ${node.subtipo}` };
	}
}

async function evaluateClientAttribute(
	{ tx, clienteId }: ProcessNodeParams,
	config: Record<string, unknown>,
): Promise<NodeResult> {
	const campo = config.campo as string;
	const operador = config.operador as string;
	const valor = config.valor;

	const client = await tx.query.clients.findFirst({
		where: (fields, { eq }) => eq(fields.id, clienteId),
	});

	if (!client) return { sucesso: true, condicaoResultado: false };

	const clientValue = (client as Record<string, unknown>)[campo];
	const resultado = evaluateComparison(clientValue, operador, valor);

	return { sucesso: true, condicaoResultado: resultado };
}

async function evaluateRecentPurchase(
	{ tx, clienteId, organizacaoId }: ProcessNodeParams,
	config: Record<string, unknown>,
): Promise<NodeResult> {
	const diasAtras = config.diasAtras as number;
	const valorMinimo = config.valorMinimo as number | undefined;

	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - diasAtras);

	const conditions = [
		eq(sales.clienteId, clienteId),
		eq(sales.organizacaoId, organizacaoId),
		gte(sales.dataVenda, cutoff),
	];

	if (valorMinimo != null) {
		conditions.push(gte(sales.valorTotal, valorMinimo));
	}

	const recentSale = await tx.query.sales.findFirst({
		where: and(...conditions),
	});

	return { sucesso: true, condicaoResultado: !!recentSale };
}

async function evaluatePreviousInteraction(
	{ tx, executionId, clienteId }: ProcessNodeParams,
	config: Record<string, unknown>,
): Promise<NodeResult> {
	const statusEsperado = config.statusEsperado as string;

	// Find the most recent completed step in this execution for this client
	// that has an interactionId in its resultado
	const previousStep = await tx.query.campaignFlowExecutionSteps.findFirst({
		where: and(
			eq(campaignFlowExecutionSteps.execucaoId, executionId),
			eq(campaignFlowExecutionSteps.clienteId, clienteId),
			eq(campaignFlowExecutionSteps.status, "CONCLUIDO"),
		),
		orderBy: (fields, { desc }) => [desc(fields.dataConclusao)],
	});

	if (!previousStep?.resultado) {
		return { sucesso: true, condicaoResultado: false };
	}

	const resultado = previousStep.resultado as Record<string, unknown>;
	const interactionId = resultado.interactionId as string | undefined;

	if (!interactionId) {
		return { sucesso: true, condicaoResultado: false };
	}

	const interaction = await tx.query.interactions.findFirst({
		where: eq(interactions.id, interactionId),
		columns: { statusEnvio: true },
	});

	const matches = interaction?.statusEnvio === statusEsperado;
	return { sucesso: true, condicaoResultado: matches };
}

async function evaluateRfmSegment(
	{ tx, clienteId }: ProcessNodeParams,
	config: Record<string, unknown>,
): Promise<NodeResult> {
	const segmentos = config.segmentos as string[];
	if (!segmentos?.length) return { sucesso: true, condicaoResultado: false };

	const client = await tx.query.clients.findFirst({
		where: eq(clients.id, clienteId),
		columns: { analiseRFMTitulo: true },
	});

	const resultado = client?.analiseRFMTitulo ? segmentos.includes(client.analiseRFMTitulo) : false;
	return { sucesso: true, condicaoResultado: resultado };
}

async function evaluateCashbackBalance(
	{ tx, clienteId, organizacaoId }: ProcessNodeParams,
	config: Record<string, unknown>,
): Promise<NodeResult> {
	const valorMinimo = config.valorMinimo as number;

	const balance = await tx.query.cashbackProgramBalances.findFirst({
		where: and(eq(cashbackProgramBalances.clienteId, clienteId), eq(cashbackProgramBalances.organizacaoId, organizacaoId)),
		columns: { saldoValorDisponivel: true },
	});

	const resultado = (balance?.saldoValorDisponivel ?? 0) >= valorMinimo;
	return { sucesso: true, condicaoResultado: resultado };
}

function evaluateComparison(actual: unknown, operador: string, expected: unknown): boolean {
	switch (operador) {
		case "IGUAL":
			return actual === expected;
		case "DIFERENTE":
			return actual !== expected;
		case "MAIOR":
			return Number(actual) > Number(expected);
		case "MENOR":
			return Number(actual) < Number(expected);
		case "CONTEM":
			return String(actual).includes(String(expected));
		default:
			return false;
	}
}

// ============================================================================
// FILTER PROCESSOR
// ============================================================================

async function processFilterNode(params: ProcessNodeParams): Promise<NodeResult> {
	const { node, tx, clienteId, organizacaoId } = params;
	const config = node.configuracao as Record<string, unknown>;

	switch (node.subtipo) {
		case "FILTRAR-POR-PUBLICO": {
			const publicoId = config.publicoId as string;
			if (!publicoId) return { sucesso: true, pulado: true };

			const audience = await tx.query.campaignAudiences.findFirst({
				where: eq(campaignAudiences.id, publicoId),
			});

			if (!audience) return { sucesso: true, pulado: true };

			const passes = await checkClientInAudience({
				tx,
				organizacaoId,
				clienteId,
				filtros: audience.filtros as TFilterTree,
			});

			return { sucesso: true, pulado: !passes };
		}

		case "FILTRAR-INLINE": {
			const filtros = config.filtros as TFilterTree;
			if (!filtros) return { sucesso: true, pulado: true };

			const passes = await checkClientInAudience({
				tx,
				organizacaoId,
				clienteId,
				filtros,
			});

			return { sucesso: true, pulado: !passes };
		}

		default:
			return { sucesso: false, erro: `Subtipo de filtro desconhecido: ${node.subtipo}` };
	}
}

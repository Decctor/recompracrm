import { db } from "@/services/drizzle";
import { PaymentMethodEnum } from "@/schemas/enums";
import {
	accountingEntries,
	clients,
	financialAccounts,
	financialReconciliationMatches,
	financialStatementTransactions,
	financialTransactions,
	sales,
} from "@/services/drizzle/schema";
import { and, asc, count, eq, gte, lte, notExists, sql, sum, type SQL } from "drizzle-orm";
import z from "zod";
import { resolveOrganizationScope } from "../organization-scope";
import { PERIOD_DESCRIPTION, PeriodInputSchema, resolvePeriod } from "../period";
import { roundForModel } from "../serialization";
import { defineAgentTool } from "../types";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/**
 * Fuso da operação — fixo no produto hoje (mesmo valor de `lib/ai/agent/context.ts`).
 * O banco guarda timestamps naive lidos como UTC; extrato de banco e maquininha falam hora local.
 * Todas as datas destas ferramentas saem já convertidas, para o agente comparar sem aritmética.
 */
const OPERATION_TIMEZONE = "America/Sao_Paulo";
const localDateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
	timeZone: OPERATION_TIMEZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
});

/** "2026-09-11 21:43:04" no fuso da operação; null propaga. */
export function formatOperationLocalDateTime(date: Date | null | undefined): string | null {
	if (!date) return null;
	return localDateTimeFormatter.format(date);
}

/**
 * Datas de entrada dos extratos: "YYYY-MM-DD HH:mm[:ss]" é lido como hora local da operação;
 * ISO com offset explícito é respeitado. `America/Sao_Paulo` não tem horário de verão desde 2019,
 * então o offset fixo -03:00 é seguro.
 */
export function parseOperationLocalDateTime(value: string): Date {
	const trimmed = value.trim();
	const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
	const date = new Date(hasOffset ? trimmed : `${trimmed.replace(" ", "T")}-03:00`);
	if (Number.isNaN(date.getTime())) throw new Error(`Data inválida: "${value}". Use "YYYY-MM-DD HH:mm:ss" (hora local) ou ISO com offset.`);
	return date;
}

const OrganizationInputSchema = z.object({
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

export const getFinancialAccountsTool = defineAgentTool({
	name: "get_financial_accounts",
	title: "Consultar contas financeiras",
	scopes: ["agent:finances:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: OrganizationInputSchema.extend({
		incluirInativas: z.boolean({ invalid_type_error: "Tipo inválido para incluir inativas." }).optional().nullable(),
	}),
	describe: (actor) =>
		[
			"Lista as contas financeiras da organização (caixa, banco, carteira digital, cartão).",
			"`ehClearingDeCanal` marca contas de repasse de canal (ex.: iFood): dinheiro ali está em posse do canal até o repasse e NUNCA aparece em extrato bancário da loja.",
			"É o ponto de partida da conciliação: descubra aqui o `contaFinanceiraId` antes de importar um extrato ou filtrar transações.",
			"Não retorna saldos — saldo é pergunta de relatório, não desta listagem.",
			actor.mode === "PLATAFORMA" ? "Informe `organizacaoId` (id ou slug)." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const conditions: SQL[] = [eq(financialAccounts.organizacaoId, organizacaoId)];
		if (!input.incluirInativas) conditions.push(eq(financialAccounts.ativo, true));
		const rows = await db.query.financialAccounts.findMany({
			where: and(...conditions),
			columns: { id: true, nome: true, descricao: true, tipo: true, ativo: true, chaveSistema: true, nomeBanco: true, codigoBanco: true },
			orderBy: (fields, { asc: ascFn }) => ascFn(fields.nome),
		});
		return {
			total: rows.length,
			contas: rows.map((account) => ({
				id: account.id,
				nome: account.nome,
				descricao: account.descricao,
				tipo: account.tipo,
				ativo: account.ativo,
				ehClearingDeCanal: account.chaveSistema != null,
				nomeBanco: account.nomeBanco,
				codigoBanco: account.codigoBanco,
			})),
		};
	},
});

const GetFinancialTransactionsInputSchema = OrganizationInputSchema.extend({
	periodo: PeriodInputSchema,
	tipo: z.enum(["ENTRADA", "SAIDA"], { invalid_type_error: "Tipo inválido para o tipo da transação." }).optional().nullable(),
	metodo: PaymentMethodEnum.optional().nullable(),
	contaFinanceiraId: z.string({ invalid_type_error: "Tipo inválido para o id da conta financeira." }).optional().nullable(),
	vendaId: z.string({ invalid_type_error: "Tipo inválido para o id da venda." }).optional().nullable(),
	apenasSemConciliacao: z.boolean({ invalid_type_error: "Tipo inválido para o filtro de conciliação." }).optional().nullable(),
	incluirCanceladas: z.boolean({ invalid_type_error: "Tipo inválido para incluir canceladas." }).optional().nullable(),
	limite: z.number({ invalid_type_error: "Tipo inválido para o limite." }).int().positive().max(MAX_LIMIT).optional().nullable(),
	pagina: z.number({ invalid_type_error: "Tipo inválido para a página." }).int().positive().optional().nullable(),
});

export const getFinancialTransactionsTool = defineAgentTool({
	name: "get_financial_transactions",
	title: "Consultar transações financeiras",
	scopes: ["agent:finances:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: GetFinancialTransactionsInputSchema,
	describe: (actor) =>
		[
			"Lista transações financeiras (entradas E saídas) no grão do razão: valor, método, conta, datas e a venda/cliente de origem quando houver.",
			"Semântica que importa: `origem: 'TROCO'` é dinheiro devolvido ao cliente (SAÍDA) e abate o método que o devolveu;",
			"`origem: 'TAXA_CANAL'` é taxa retida pelo canal; `conta.ehClearingDeCanal: true` significa dinheiro em posse do canal (ex.: iFood), que não aparece em extrato da loja.",
			"O período filtra por `coalesce(dataEfetivacao, dataPrevisao)`. Todas as datas saem em hora LOCAL da operação (America/Sao_Paulo), prontas para comparar com extratos.",
			"Para conciliar: use `apenasSemConciliacao` e case por valor + proximidade de horário; com valores repetidos, resolva a atribuição globalmente pelo menor delta (execute código), nunca linha a linha na ordem.",
			"Use os agregados do período em vez de somar as linhas devolvidas, que são só uma página.",
			`Devolve no máximo ${MAX_LIMIT} transações por chamada (padrão ${DEFAULT_LIMIT}); use \`pagina\` para avançar.`,
			PERIOD_DESCRIPTION,
			actor.mode === "PLATAFORMA" ? "Informe `organizacaoId` (id ou slug)." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const periodo = resolvePeriod(input.periodo);
		const limite = input.limite ?? DEFAULT_LIMIT;
		const pagina = input.pagina ?? 1;

		// Base temporal da conciliação: quando o dinheiro se moveu (efetivação), senão a previsão.
		const baseDate = sql`coalesce(${financialTransactions.dataEfetivacao}, ${financialTransactions.dataPrevisao})`;
		// Comparação explícita: `gte(baseDate, Date)` não serializa o Date porque o fragmento não
		// carrega o tipo da coluna. O cast segue a convenção das colunas naive (ISO tratada como UTC).
		const conditions: SQL[] = [
			eq(financialTransactions.organizacaoId, organizacaoId),
			sql`${baseDate} >= ${periodo.after.toISOString()}::timestamp`,
			sql`${baseDate} <= ${periodo.before.toISOString()}::timestamp`,
		];
		if (input.tipo) conditions.push(eq(financialTransactions.tipo, input.tipo));
		if (input.metodo) conditions.push(eq(financialTransactions.metodo, input.metodo));
		if (input.contaFinanceiraId) conditions.push(eq(financialTransactions.contaFinanceiraId, input.contaFinanceiraId));
		if (input.vendaId) conditions.push(eq(accountingEntries.vendaId, input.vendaId));
		if (!input.incluirCanceladas) {
			conditions.push(sql`coalesce(${financialTransactions.provedorStatus}, '') not in ('CANCELADO', 'ESTORNADO')`);
		}
		if (input.apenasSemConciliacao) {
			conditions.push(
				notExists(
					db
						.select({ id: financialReconciliationMatches.id })
						.from(financialReconciliationMatches)
						.where(
							and(
								eq(financialReconciliationMatches.transacaoFinanceiraId, financialTransactions.id),
								eq(financialReconciliationMatches.status, "CONFIRMADO"),
							),
						),
				),
			);
		}

		const origemExpr = sql<string | null>`case
			when ${financialTransactions.modificadoresMetadata}->>'origem' = 'TROCO' then 'TROCO'
			when ${accountingEntries.chaveIdempotencia} like 'taxas-canal:%' then 'TAXA_CANAL'
			else null
		end`;

		const baseQuery = () =>
			db
				.select({
					id: financialTransactions.id,
					tipo: financialTransactions.tipo,
					valor: financialTransactions.valor,
					metodo: financialTransactions.metodo,
					titulo: financialTransactions.titulo,
					provedorStatus: financialTransactions.provedorStatus,
					dataEfetivacao: financialTransactions.dataEfetivacao,
					dataPrevisao: financialTransactions.dataPrevisao,
					parcela: financialTransactions.parcela,
					totalParcelas: financialTransactions.totalParcelas,
					origem: origemExpr,
					lancamentoContabilId: financialTransactions.lancamentoContabilId,
					contaId: financialAccounts.id,
					contaNome: financialAccounts.nome,
					contaChaveSistema: financialAccounts.chaveSistema,
					vendaId: accountingEntries.vendaId,
					vendaValorTotal: sales.valorTotal,
					clienteNome: clients.nome,
				})
				.from(financialTransactions)
				.leftJoin(accountingEntries, eq(accountingEntries.id, financialTransactions.lancamentoContabilId))
				.leftJoin(financialAccounts, eq(financialAccounts.id, financialTransactions.contaFinanceiraId))
				.leftJoin(sales, eq(sales.id, accountingEntries.vendaId))
				.leftJoin(clients, eq(clients.id, sales.clienteId))
				.where(and(...conditions));

		const [rows, [totals]] = await Promise.all([
			baseQuery()
				.orderBy(asc(baseDate), asc(financialTransactions.id))
				.limit(limite)
				.offset((pagina - 1) * limite),
			// Agregado do período/filtros inteiro, não da página — o modelo não deve somar as linhas.
			db
				.select({
					total: count(),
					totalEntradas: sql<string>`coalesce(sum(case when ${financialTransactions.tipo} = 'ENTRADA' then ${financialTransactions.valor} else 0 end), 0)`,
					totalSaidas: sql<string>`coalesce(sum(case when ${financialTransactions.tipo} = 'SAIDA' then ${financialTransactions.valor} else 0 end), 0)`,
					valorTotal: sum(financialTransactions.valor),
				})
				.from(financialTransactions)
				.leftJoin(accountingEntries, eq(accountingEntries.id, financialTransactions.lancamentoContabilId))
				.where(and(...conditions)),
		]);

		const total = totals?.total ?? 0;
		return {
			periodo: { inicio: periodo.inicio, fim: periodo.fim },
			fusoHorario: OPERATION_TIMEZONE,
			total,
			totalEntradasPeriodo: roundForModel(Number(totals?.totalEntradas ?? 0)),
			totalSaidasPeriodo: roundForModel(Number(totals?.totalSaidas ?? 0)),
			exibindo: rows.length,
			pagina,
			truncado: total > pagina * limite,
			transacoes: rows.map((row) => ({
				id: row.id,
				tipo: row.tipo,
				valor: roundForModel(row.valor),
				metodo: row.metodo,
				origem: row.origem,
				titulo: row.titulo,
				provedorStatus: row.provedorStatus,
				dataEfetivacao: formatOperationLocalDateTime(row.dataEfetivacao),
				dataPrevisao: formatOperationLocalDateTime(row.dataPrevisao),
				parcela: row.parcela,
				totalParcelas: row.totalParcelas,
				lancamentoContabilId: row.lancamentoContabilId,
				conta: row.contaId ? { id: row.contaId, nome: row.contaNome, ehClearingDeCanal: row.contaChaveSistema != null } : null,
				vendaId: row.vendaId,
				vendaValorTotal: row.vendaValorTotal != null ? roundForModel(row.vendaValorTotal) : null,
				clienteNome: row.clienteNome,
			})),
		};
	},
});

const GetStatementTransactionsInputSchema = OrganizationInputSchema.extend({
	periodo: PeriodInputSchema,
	contaFinanceiraId: z.string({ invalid_type_error: "Tipo inválido para o id da conta financeira." }).optional().nullable(),
	importacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da importação." }).optional().nullable(),
	status: z.enum(["PENDENTE", "CONCILIADA", "IGNORADA"], { invalid_type_error: "Tipo inválido para o status da linha." }).optional().nullable(),
	limite: z.number({ invalid_type_error: "Tipo inválido para o limite." }).int().positive().max(MAX_LIMIT).optional().nullable(),
	pagina: z.number({ invalid_type_error: "Tipo inválido para a página." }).int().positive().optional().nullable(),
});

export const getStatementTransactionsTool = defineAgentTool({
	name: "get_statement_transactions",
	title: "Consultar linhas de extrato",
	scopes: ["agent:finances:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: GetStatementTransactionsInputSchema,
	describe: (actor) =>
		[
			"Lista linhas de extrato importadas (OFX, planilha, arquivo ou transcrição de agente), com status de conciliação.",
			"`PENDENTE` = ainda sem conciliação confirmada; `CONCILIADA` = vinculada a transações; `IGNORADA` = descartada por um usuário.",
			"A idempotência é por conta + conteúdo: reimportar o mesmo extrato não duplica linhas, então esta é a fonte da verdade do que já foi importado.",
			"Datas em hora LOCAL da operação (America/Sao_Paulo).",
			PERIOD_DESCRIPTION,
			actor.mode === "PLATAFORMA" ? "Informe `organizacaoId` (id ou slug)." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const periodo = resolvePeriod(input.periodo);
		const limite = input.limite ?? DEFAULT_LIMIT;
		const pagina = input.pagina ?? 1;

		const conditions: SQL[] = [
			eq(financialStatementTransactions.organizacaoId, organizacaoId),
			gte(financialStatementTransactions.dataTransacao, periodo.after),
			lte(financialStatementTransactions.dataTransacao, periodo.before),
		];
		if (input.contaFinanceiraId) conditions.push(eq(financialStatementTransactions.contaFinanceiraId, input.contaFinanceiraId));
		if (input.importacaoId) conditions.push(eq(financialStatementTransactions.importacaoId, input.importacaoId));
		if (input.status) conditions.push(eq(financialStatementTransactions.status, input.status));

		const [rows, [totals]] = await Promise.all([
			db.query.financialStatementTransactions.findMany({
				where: and(...conditions),
				orderBy: (fields, { asc: ascFn }) => [ascFn(fields.dataTransacao), ascFn(fields.id)],
				limit: limite,
				offset: (pagina - 1) * limite,
				columns: {
					id: true,
					dataTransacao: true,
					descricao: true,
					tipo: true,
					valor: true,
					metodo: true,
					idExterno: true,
					status: true,
					contaFinanceiraId: true,
					importacaoId: true,
				},
			}),
			db
				.select({ total: count(), valor: sum(financialStatementTransactions.valor) })
				.from(financialStatementTransactions)
				.where(and(...conditions)),
		]);

		const total = totals?.total ?? 0;
		return {
			periodo: { inicio: periodo.inicio, fim: periodo.fim },
			fusoHorario: OPERATION_TIMEZONE,
			total,
			valorTotalPeriodo: roundForModel(Number(totals?.valor ?? 0)),
			exibindo: rows.length,
			pagina,
			truncado: total > pagina * limite,
			linhas: rows.map((linha) => ({
				id: linha.id,
				dataTransacao: formatOperationLocalDateTime(linha.dataTransacao),
				descricao: linha.descricao,
				tipo: linha.tipo,
				valor: roundForModel(linha.valor),
				metodo: linha.metodo,
				idExterno: linha.idExterno,
				status: linha.status,
				contaFinanceiraId: linha.contaFinanceiraId,
				importacaoId: linha.importacaoId,
			})),
		};
	},
});

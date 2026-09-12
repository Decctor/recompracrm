// Imports pelos módulos específicos, não pelo barrel: o barrel puxa `sync.ts` → sale-processing →
// fiscal (`server-only`), e o registro de ferramentas precisa carregar em Node puro (testes/smoke).
import { ingestStatementLines } from "@/lib/financial-reconciliation/ingest";
import { runStatementMatching } from "@/lib/financial-reconciliation/match";
import { createSuggestedReconciliationMatch } from "@/lib/financial-reconciliation/suggest";
import { PaymentMethodEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { financialAccounts, financialStatementImports } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";
import { resolveOrganizationScope, resolveResponsibleUser } from "../organization-scope";
import { AgentMutationControlInputSchema, defineAgentTool } from "../types";
import { formatOperationLocalDateTime, parseOperationLocalDateTime } from "./finances";

const MAX_STATEMENT_LINES = 200;
const MAX_MATCH_SUGGESTIONS = 50;

const OrganizationInputSchema = z.object({
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

const StatementLineInputSchema = z.object({
	dataTransacao: z.string({
		required_error: "Data da linha não informada.",
		invalid_type_error: "Tipo inválido para a data da linha.",
	}),
	descricao: z
		.string({ required_error: "Descrição da linha não informada.", invalid_type_error: "Tipo inválido para a descrição da linha." })
		.trim()
		.min(1, "A descrição da linha não pode ser vazia.")
		.max(500, "A descrição da linha excede 500 caracteres."),
	tipo: z.enum(["ENTRADA", "SAIDA"], { required_error: "Tipo da linha não informado.", invalid_type_error: "Tipo inválido para o tipo da linha." }),
	valor: z
		.number({ required_error: "Valor da linha não informado.", invalid_type_error: "Tipo inválido para o valor da linha." })
		.positive("O valor da linha precisa ser positivo — o sentido vai em `tipo`."),
	metodo: PaymentMethodEnum.optional().nullable(),
	idExterno: z.string({ invalid_type_error: "Tipo inválido para o id externo da linha." }).max(255).optional().nullable(),
});

export const createStatementImportTool = defineAgentTool({
	name: "create_statement_import",
	title: "Importar extrato transcrito",
	scopes: ["agent:finances:reconcile"],
	modes: ["ORG", "PLATAFORMA"],
	requiresResponsibleUser: true,
	mutates: true,
	inputSchema: OrganizationInputSchema.merge(AgentMutationControlInputSchema).extend({
		contaFinanceiraId: z.string({
			required_error: "ID da conta financeira não informado.",
			invalid_type_error: "Tipo inválido para o id da conta financeira.",
		}),
		descricao: z
			.string({ invalid_type_error: "Tipo inválido para a descrição da importação." })
			.trim()
			.max(500, "A descrição da importação excede 500 caracteres.")
			.optional()
			.nullable(),
		linhas: z
			.array(StatementLineInputSchema, { required_error: "Linhas do extrato não informadas." })
			.min(1, "Informe ao menos uma linha do extrato.")
			.max(MAX_STATEMENT_LINES, `Envie no máximo ${MAX_STATEMENT_LINES} linhas por importação.`),
		executarMatchingAutomatico: z.boolean({ invalid_type_error: "Tipo inválido para o matching automático." }).optional().nullable(),
	}),
	describe: (actor) =>
		[
			"Registra como importação de extrato as linhas que você transcreveu de um comprovante (print, PDF, foto de maquininha), na conta financeira indicada.",
			'Transcreva fielmente: valor exato, hora local ("YYYY-MM-DD HH:mm:ss") e o nome do pagador em `descricao` — o sentido vai em `tipo`, o valor é sempre positivo.',
			"Idempotente por conteúdo: linhas idênticas já importadas (mesma conta, data, valor, tipo e descrição) são puladas, então reenviar o mesmo comprovante não duplica.",
			"Por padrão roda o motor de matching automático sobre as linhas novas (sugestões AUTOMATICO/HEURISTICO/IA); revise depois as que continuarem PENDENTES com `get_statement_transactions` e proponha os vínculos restantes com `suggest_reconciliation_matches`.",
			"Nada aqui confirma conciliação — sugestões são confirmadas por um humano no painel.",
			actor.mode === "PLATAFORMA" ? "Informe `organizacaoId` (id ou slug)." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const authorId = await resolveResponsibleUser(actor, organizacaoId);

		const account = await db.query.financialAccounts.findFirst({
			where: and(eq(financialAccounts.id, input.contaFinanceiraId), eq(financialAccounts.organizacaoId, organizacaoId)),
			columns: { id: true, nome: true },
		});
		if (!account) throw new createHttpError.NotFound("Conta financeira não encontrada para esta organização.");

		const linhas = input.linhas.map((linha) => ({
			dataTransacao: parseOperationLocalDateTime(linha.dataTransacao),
			descricao: linha.descricao,
			tipo: linha.tipo,
			valor: linha.valor,
			metodo: linha.metodo ?? null,
			idExterno: linha.idExterno ?? null,
			// Auditoria: de onde a linha veio quando não há arquivo — a transcrição é do agente.
			metadados: { fonte: "AGENTE_MCP", cliente: actor.clientCode },
		}));
		const datas = linhas.map((linha) => linha.dataTransacao.getTime());

		const [importRow] = await db
			.insert(financialStatementImports)
			.values({
				organizacaoId,
				contaFinanceiraId: account.id,
				// O enum de origem não tem valor próprio para agente; ARQUIVO com `arquivoNome`
				// descritivo preserva a proveniência sem custo de migração de enum no Postgres.
				origem: "ARQUIVO",
				status: "PROCESSANDO",
				arquivoNome: input.descricao?.trim() || `Extrato transcrito pelo agente (${actor.clientCode})`,
				autorId: authorId,
			})
			.returning({ id: financialStatementImports.id });

		try {
			const { inseridas, duplicadas } = await ingestStatementLines({
				organizacaoId,
				contaFinanceiraId: account.id,
				importacaoId: importRow.id,
				linhas,
			});

			const matching =
				(input.executarMatchingAutomatico ?? true) && inseridas.length > 0
					? await runStatementMatching({ organizacaoId, contaFinanceiraId: account.id, linhaIds: inseridas.map((linha) => linha.id) })
					: { sugeridas: 0 };

			await db
				.update(financialStatementImports)
				.set({ status: "PROCESSADO", periodoInicio: new Date(Math.min(...datas)), periodoFim: new Date(Math.max(...datas)) })
				.where(eq(financialStatementImports.id, importRow.id));

			return {
				importacaoId: importRow.id,
				conta: { id: account.id, nome: account.nome },
				importadas: inseridas.length,
				duplicadas,
				sugestoesAutomaticas: matching.sugeridas,
				periodo: {
					inicio: formatOperationLocalDateTime(new Date(Math.min(...datas))),
					fim: formatOperationLocalDateTime(new Date(Math.max(...datas))),
				},
				proximoPasso:
					"Liste as linhas PENDENTES da conta com `get_statement_transactions` e as transações com `apenasSemConciliacao` em `get_financial_transactions`; proponha os vínculos restantes com `suggest_reconciliation_matches`.",
			};
		} catch (error) {
			await db
				.update(financialStatementImports)
				.set({ status: "ERRO", erro: error instanceof Error ? error.message : "Erro desconhecido ao processar o extrato." })
				.where(eq(financialStatementImports.id, importRow.id));
			throw error;
		}
	},
});

export const suggestReconciliationMatchesTool = defineAgentTool({
	name: "suggest_reconciliation_matches",
	title: "Sugerir conciliações",
	scopes: ["agent:finances:reconcile"],
	modes: ["ORG", "PLATAFORMA"],
	requiresResponsibleUser: true,
	mutates: true,
	inputSchema: OrganizationInputSchema.merge(AgentMutationControlInputSchema).extend({
		matches: z
			.array(
				z.object({
					extratoTransacaoId: z.string({ required_error: "ID da linha do extrato não informado." }),
					transacaoFinanceiraId: z.string({ required_error: "ID da transação financeira não informado." }),
					confianca: z
						.number({ invalid_type_error: "Tipo inválido para a confiança." })
						.min(0, "Confiança mínima é 0.")
						.max(1, "Confiança máxima é 1.")
						.optional()
						.nullable(),
				}),
				{ required_error: "Sugestões de conciliação não informadas." },
			)
			.min(1, "Informe ao menos uma sugestão.")
			.max(MAX_MATCH_SUGGESTIONS, `Envie no máximo ${MAX_MATCH_SUGGESTIONS} sugestões por chamada.`),
	}),
	describe: (actor) =>
		[
			"Registra vínculos linha de extrato ↔ transação financeira como SUGESTÕES (tipo IA), que um humano confirma ou rejeita na tela de conciliação — esta ferramenta nunca concilia nada sozinha.",
			"Sugira apenas pares em que você tem convicção (valor igual e horário próximo); informe `confianca` (0..1).",
			"Com valores repetidos no mesmo dia, resolva a atribuição globalmente pelo menor delta de horário (execute código) antes de sugerir — o pareamento linha a linha na ordem do extrato erra.",
			"Um par que já existe (sugerido, confirmado ou rejeitado) não é sobrescrito e volta como `PAR_JA_EXISTENTE`.",
			actor.mode === "PLATAFORMA" ? "Informe `organizacaoId` (id ou slug)." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const authorId = await resolveResponsibleUser(actor, organizacaoId);

		// Sugestões são independentes: uma linha inválida não deve derrubar as demais — o resultado
		// individual diz o que aconteceu com cada par, e repetir a chamada é seguro (par único no banco).
		const resultados: Array<{ extratoTransacaoId: string; transacaoFinanceiraId: string; resultado: string; motivo?: string }> = [];
		for (const match of input.matches) {
			try {
				const created = await createSuggestedReconciliationMatch({
					organizacaoId,
					autorId: authorId,
					extratoTransacaoId: match.extratoTransacaoId,
					transacaoFinanceiraId: match.transacaoFinanceiraId,
					confianca: match.confianca ?? null,
				});
				resultados.push({
					extratoTransacaoId: match.extratoTransacaoId,
					transacaoFinanceiraId: match.transacaoFinanceiraId,
					resultado: created.criada ? "SUGERIDA" : "PAR_JA_EXISTENTE",
				});
			} catch (error) {
				resultados.push({
					extratoTransacaoId: match.extratoTransacaoId,
					transacaoFinanceiraId: match.transacaoFinanceiraId,
					resultado: "RECUSADA",
					motivo: error instanceof Error ? error.message : "Erro desconhecido.",
				});
			}
		}

		return {
			total: resultados.length,
			sugeridas: resultados.filter((resultado) => resultado.resultado === "SUGERIDA").length,
			jaExistentes: resultados.filter((resultado) => resultado.resultado === "PAR_JA_EXISTENTE").length,
			recusadas: resultados.filter((resultado) => resultado.resultado === "RECUSADA").length,
			resultados,
			aviso: "Sugestões aguardam confirmação humana na tela de conciliação (Financeiro > Conciliação).",
		};
	},
});

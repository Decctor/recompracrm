import { db } from "@/services/drizzle";
import { SaleStatusEnum } from "@/schemas/enums";
import { sales } from "@/services/drizzle/schema";
import { and, count, desc, eq, gte, lte, sum, type SQL } from "drizzle-orm";
import z from "zod";
import { canReadClientPii, maskSensitiveValue, resolveOrganizationScope } from "../organization-scope";
import { PERIOD_DESCRIPTION, PeriodInputSchema, resolvePeriod } from "../period";
import { roundForModel } from "../serialization";
import { defineAgentTool } from "../types";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const GetSalesInputSchema = z.object({
	periodo: PeriodInputSchema,
	clienteId: z.string({ invalid_type_error: "Tipo inválido para o id do cliente." }).optional().nullable(),
	vendedorId: z.string({ invalid_type_error: "Tipo inválido para o id do vendedor." }).optional().nullable(),
	canal: z.string({ invalid_type_error: "Tipo inválido para o canal." }).optional().nullable(),
	status: SaleStatusEnum.optional().nullable(),
	valorMinimo: z.number({ invalid_type_error: "Tipo inválido para o valor mínimo." }).optional().nullable(),
	ordenacao: z.enum(["DATA_DESC", "DATA_ASC", "VALOR_DESC"]).optional().nullable(),
	limite: z.number({ invalid_type_error: "Tipo inválido para o limite." }).int().positive().max(MAX_LIMIT).optional().nullable(),
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

export const getSalesTool = defineAgentTool({
	name: "get_sales",
	title: "Consultar vendas",
	scopes: ["agent:sales:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: GetSalesInputSchema,
	describe: (actor) =>
		[
			"Lista vendas individuais do período, com valor, desconto, vendedor, canal e cliente.",
			"Cobre perguntas sobre vendas específicas, como as maiores vendas da semana ou o que um vendedor vendeu ontem.",
			"Totais, médias e comparação com o período anterior, agregados no banco, estão em `get_commercial_results`.",
			"O padrão considera apenas vendas confirmadas; `status` permite ver rascunhos ou canceladas.",
			PERIOD_DESCRIPTION,
			`Devolve no máximo ${MAX_LIMIT} vendas por chamada, junto com o total de vendas e a soma de valor do período inteiro; as linhas devolvidas são só uma página.`,
			actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const periodo = resolvePeriod(input.periodo);
		const limite = input.limite ?? DEFAULT_LIMIT;
		const showPii = canReadClientPii(actor);

		const conditions: SQL[] = [
			eq(sales.organizacaoId, organizacaoId),
			gte(sales.dataVenda, periodo.after),
			lte(sales.dataVenda, periodo.before),
			eq(sales.statusVenda, input.status ?? "CONFIRMADA"),
		];
		if (input.clienteId) conditions.push(eq(sales.clienteId, input.clienteId));
		if (input.vendedorId) conditions.push(eq(sales.vendedorId, input.vendedorId));
		if (input.canal) conditions.push(eq(sales.canal, input.canal));
		if (input.valorMinimo) conditions.push(gte(sales.valorTotal, input.valorMinimo));

		const where = and(...conditions);

		const orderBy =
			input.ordenacao === "VALOR_DESC" ? [desc(sales.valorTotal)] : input.ordenacao === "DATA_ASC" ? [sales.dataVenda] : [desc(sales.dataVenda)];

		const [rows, totals] = await Promise.all([
			db.query.sales.findMany({
				where,
				orderBy,
				limit: limite,
				columns: {
					id: true,
					valorTotal: true,
					custoTotal: true,
					descontosTotal: true,
					vendedorNome: true,
					canal: true,
					statusVenda: true,
					dataVenda: true,
					observacoes: true,
				},
				with: {
					cliente: { columns: { id: true, nome: true, telefone: true } },
				},
			}),
			// Agregado do período inteiro, não da página: sem ele o modelo soma as 20 linhas que
			// recebeu e apresenta o resultado como se fosse o total do período.
			db
				.select({ total: count(), valor: sum(sales.valorTotal) })
				.from(sales)
				.where(where),
		]);

		const total = totals[0]?.total ?? 0;

		return {
			periodo: { inicio: periodo.inicio, fim: periodo.fim },
			total,
			valorTotalPeriodo: roundForModel(totals[0]?.valor ? Number(totals[0].valor) : 0),
			exibindo: rows.length,
			truncado: total > rows.length,
			vendas: rows.map((sale) => ({
				id: sale.id,
				dataVenda: sale.dataVenda,
				valorTotal: roundForModel(sale.valorTotal),
				descontosTotal: roundForModel(sale.descontosTotal),
				// Margem só existe quando o custo foi informado; zero de custo não é margem cheia.
				margemBruta: sale.custoTotal ? roundForModel(sale.valorTotal - sale.custoTotal) : undefined,
				vendedorNome: sale.vendedorNome,
				canal: sale.canal,
				statusVenda: sale.statusVenda,
				observacoes: sale.observacoes,
				// Venda sem cliente é venda ao consumidor não identificado — o campo some, e a
				// ausência é a informação: não há a quem atribuir nem para quem fazer campanha.
				cliente: sale.cliente
					? {
							id: sale.cliente.id,
							nome: sale.cliente.nome,
							telefone: showPii ? sale.cliente.telefone : maskSensitiveValue(sale.cliente.telefone),
						}
					: undefined,
			})),
		};
	},
});

import { countPeriodDays } from "@/lib/period-presets";
import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import type { TSaleStatsGeneralQueryParams } from "@/schemas/query-params-utils";
import { db } from "@/services/drizzle";
import { clients, saleItems, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { type SQL, and, count, eq, exists, gte, inArray, isNull, lt, lte, notInArray, sum } from "drizzle-orm";

/**
 * Agregações de resultado comercial do período, extraídas de `app/api/stats/sales-overall/route.ts`
 * para que o painel e o agente de IA (`lib/agent-tools/tools/commercial-results.ts`) leiam os
 * mesmos números. Números que não batem entre o painel e o agente valem menos que nenhum número.
 *
 * Nada aqui lê sessão ou request: a organização entra por parâmetro, sempre.
 */

export type TOverallSalesStats = {
	/** O recorte contra o qual os `anterior` foram calculados; `null` quando não houve comparação. */
	periodoComparacao: { after: string; before: string; dias: number } | null;
	faturamentoMeta: number;
	faturamentoMetaPorcentagem: number;
	faturamento: {
		atual: number;
		anterior: number | undefined;
	};
	margemBruta: {
		atual: number;
		anterior: number | undefined;
	};
	qtdeVendas: {
		atual: number;
		anterior: number | undefined;
	};
	ticketMedio: {
		atual: number;
		anterior: number | undefined;
	};
	qtdeItensVendidos: {
		atual: number;
		anterior: number | undefined;
	};
	itensPorVendaMedio: {
		atual: number;
		anterior: number | undefined;
	};
	valorDiarioVendido: {
		atual: number;
		anterior: number | undefined;
	};
	faturamentoViaClientesRecorrentes: {
		atual: number;
		anterior: number | undefined;
		porcentagem: number;
	};
	faturamentoViaNovosClientes: {
		atual: number;
		anterior: number | undefined;
		porcentagem: number;
	};
	faturamentoViaClientesNaoIdentificados: {
		atual: number;
		anterior: number | undefined;
		porcentagem: number;
	};
};

type GetOverallSaleGoalProps = {
	after: string;
	before: string;
	organizacaoId: string;
};
export async function getOverallSaleGoal({ after, before, organizacaoId }: GetOverallSaleGoalProps) {
	const ajustedAfter = dayjs(after).toDate();
	const ajustedBefore = dayjs(before).endOf("day").toDate();
	try {
		const goals = await db.query.goals.findMany({
			where: (fields, { and, or, gte, lte, eq }) =>
				and(
					eq(fields.organizacaoId, organizacaoId),
					or(
						and(gte(fields.dataInicio, ajustedAfter), lte(fields.dataInicio, ajustedBefore)),
						and(gte(fields.dataFim, ajustedAfter), lte(fields.dataFim, ajustedBefore)),
					),
				),
		});

		console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goals: ", goals);
		const applicableSaleGoal = goals.reduce((acc, current) => {
			const afterDatetime = new Date(after).getTime();
			const beforeDatetime = new Date(before).getTime();

			const monthStartDatetime = new Date(current.dataInicio).getTime();
			const monthEndDatetime = new Date(current.dataFim).getTime();

			const days = Math.abs(dayjs(current.dataFim).diff(dayjs(current.dataInicio), "days")) + 1;

			if (
				(afterDatetime < monthStartDatetime && beforeDatetime < monthStartDatetime) ||
				(afterDatetime > monthEndDatetime && beforeDatetime > monthEndDatetime)
			) {
				console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goal not applicable: ", { current });
				return acc;
			}
			if (afterDatetime <= monthStartDatetime && beforeDatetime >= monthEndDatetime) {
				// Caso o período de filtro da query compreenda o mês inteiro
				console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goal applicable for all period: ", { current });
				return acc + current.objetivoValor;
			}
			if (beforeDatetime > monthEndDatetime) {
				const applicableDays = dayjs(current.dataFim).diff(dayjs(after), "days");

				console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goal applicable for partial period: ", { current, applicableDays, days });
				return acc + (current.objetivoValor * applicableDays) / days;
			}

			const applicableDays = dayjs(before).diff(dayjs(current.dataInicio), "days") + 1;

			console.log("[INFO] [GET_OVERALL_SALE_GOAL] Goal applicable for partial period: ", { current, applicableDays, days });

			return acc + (current.objetivoValor * applicableDays) / days;
		}, 0);

		return applicableSaleGoal;
	} catch (error) {
		console.log("Error getting overall sale goal", error);
		throw error;
	}
}

type TStatsPeriod = { after: Date; before: Date };

/** Totais de um período sob as mesmas condições — chamado para o período base e para o de comparação. */
async function getPeriodTotals({ conditions, organizacaoId, period }: { conditions: SQL[]; organizacaoId: string; period: TStatsPeriod }) {
	const periodConditions = [...conditions, gte(sales.dataVenda, period.after), lte(sales.dataVenda, period.before)];

	const [salesTotalsResult, itemsTotalsResult, existingClientsResult, newClientsResult, nonIdentifiedResult] = await Promise.all([
		db
			.select({ qtde: count(sales.id), valorTotal: sum(sales.valorTotal), custoTotal: sum(sales.custoTotal) })
			.from(sales)
			.where(and(...periodConditions)),
		db
			.select({ total: sum(saleItems.quantidade) })
			.from(saleItems)
			.where(
				and(
					eq(saleItems.organizacaoId, organizacaoId),
					inArray(
						saleItems.vendaId,
						db
							.select({ id: sales.id })
							.from(sales)
							.where(and(...periodConditions)),
					),
				),
			),
		// Composição do faturamento: clientes que já compravam, clientes novos no período e vendas sem cliente.
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.innerJoin(clients, eq(sales.clienteId, clients.id))
			.where(and(...periodConditions, eq(clients.organizacaoId, organizacaoId), lt(clients.primeiraCompraData, period.after))),
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.innerJoin(clients, eq(sales.clienteId, clients.id))
			.where(
				and(
					...periodConditions,
					eq(clients.organizacaoId, organizacaoId),
					gte(clients.primeiraCompraData, period.after),
					lte(clients.primeiraCompraData, period.before),
				),
			),
		db
			.select({ total: sum(sales.valorTotal) })
			.from(sales)
			.leftJoin(clients, eq(sales.clienteId, clients.id))
			.where(and(...periodConditions, isNull(clients.id))),
	]);

	const toNumber = (value: string | null | undefined) => (value ? Number(value) : 0);
	return {
		qtdeVendas: salesTotalsResult[0]?.qtde ?? 0,
		valorTotal: toNumber(salesTotalsResult[0]?.valorTotal),
		custoTotal: toNumber(salesTotalsResult[0]?.custoTotal),
		qtdeItens: toNumber(itemsTotalsResult[0]?.total),
		clientesRecorrentes: toNumber(existingClientsResult[0]?.total),
		novosClientes: toNumber(newClientsResult[0]?.total),
		naoIdentificados: toNumber(nonIdentifiedResult[0]?.total),
		dias: countPeriodDays(period),
	};
}

/**
 * Resultado comercial do período e, quando informado, do período de comparação.
 *
 * Quem chama escolhe com o que comparar: o painel manda as datas resolvidas no navegador (a regra
 * escolhida pelo usuário, em hora local) e o agente manda o período anterior de mesma duração. Sem
 * `comparisonPeriod`, nenhuma métrica traz `anterior`.
 */
export async function getOverallStats(filters: TSaleStatsGeneralQueryParams, organizacaoId: string, comparisonPeriod?: TStatsPeriod | null) {
	const conditions: SQL[] = [eq(sales.organizacaoId, organizacaoId), eq(sales.statusVenda, "CONFIRMADA")];

	if (filters.total.min) conditions.push(gte(sales.valorTotal, filters.total.min));
	if (filters.total.max) conditions.push(lte(sales.valorTotal, filters.total.max));
	const integrationCondition = getSalesIntegrationCondition(filters.integrationsIds);
	if (integrationCondition) conditions.push(integrationCondition);
	if (filters.sellersIds.length > 0) conditions.push(inArray(sales.vendedorId, filters.sellersIds));
	if (filters.clientRFMTitles.length > 0)
		conditions.push(
			exists(
				db
					.select({ id: clients.id })
					.from(clients)
					.where(
						and(eq(clients.organizacaoId, organizacaoId), eq(clients.id, sales.clienteId), inArray(clients.analiseRFMTitulo, filters.clientRFMTitles)),
					),
			),
		);
	if (filters.excludedSalesIds) conditions.push(notInArray(sales.id, filters.excludedSalesIds));

	const period = { after: new Date(filters.period.after), before: new Date(filters.period.before) };
	const [current, previous] = await Promise.all([
		getPeriodTotals({ conditions, organizacaoId, period }),
		comparisonPeriod ? getPeriodTotals({ conditions, organizacaoId, period: comparisonPeriod }) : null,
	]);

	const revenuePercentage = (val: number) => (current.valorTotal > 0 ? (val / current.valorTotal) * 100 : 0);

	return {
		periodoComparacao: comparisonPeriod
			? {
					after: comparisonPeriod.after.toISOString(),
					before: comparisonPeriod.before.toISOString(),
					dias: previous?.dias ?? countPeriodDays(comparisonPeriod),
				}
			: null,
		faturamento: {
			atual: current.valorTotal,
			anterior: previous?.valorTotal,
		},
		margemBruta: {
			atual: current.valorTotal - current.custoTotal,
			anterior: previous ? previous.valorTotal - previous.custoTotal : undefined,
		},
		qtdeVendas: {
			atual: current.qtdeVendas,
			anterior: previous?.qtdeVendas,
		},
		qtdeItensVendidos: {
			atual: current.qtdeItens,
			anterior: previous?.qtdeItens,
		},
		itensPorVendaMedio: {
			atual: current.qtdeItens / current.qtdeVendas,
			anterior: previous ? previous.qtdeItens / previous.qtdeVendas : undefined,
		},
		ticketMedio: {
			atual: current.valorTotal / current.qtdeVendas,
			anterior: previous ? previous.valorTotal / previous.qtdeVendas : undefined,
		},
		// Cada lado divide pelos próprios dias: um recorte personalizado pode ter outra duração.
		valorDiarioVendido: {
			atual: current.valorTotal / current.dias,
			anterior: previous ? previous.valorTotal / previous.dias : undefined,
		},
		faturamentoViaClientesRecorrentes: {
			atual: current.clientesRecorrentes,
			anterior: previous?.clientesRecorrentes,
			porcentagem: revenuePercentage(current.clientesRecorrentes),
		},
		faturamentoViaNovosClientes: {
			atual: current.novosClientes,
			anterior: previous?.novosClientes,
			porcentagem: revenuePercentage(current.novosClientes),
		},
		faturamentoViaClientesNaoIdentificados: {
			atual: current.naoIdentificados,
			anterior: previous?.naoIdentificados,
			porcentagem: revenuePercentage(current.naoIdentificados),
		},
	};
}

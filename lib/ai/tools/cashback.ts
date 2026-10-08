import { describeCashbackDiscount, describeCashbackPrizeGap, listCashbackRedemptionSurfaceLabels } from "@/lib/cashback/client-position";
import { listProgramCashbackRewards, resolveClientCashbackProgram } from "@/lib/cashback/prizes";
import { cashbackProgramTransactions } from "@/services/drizzle/schema";
import type { TCashbackProgramEntity } from "@/services/drizzle/schema";
import { isSameDay } from "date-fns";
import { and, asc, count, desc, eq, gt, gte, isNotNull, lte } from "drizzle-orm";
import z from "zod";
import { defineAgentTool } from "./define-tool";
import type { TAgentToolContext } from "./types";

/**
 * Consulta o programa de cashback da organização e a posição do cliente nele.
 *
 * O programa é o do saldo do cliente (fallback: programa ativo da organização), pela mesma
 * resolução do PDV e da loja digital (`resolveClientCashbackProgram`) — o agente nunca pode
 * discordar do caixa sobre qual prêmio dá para resgatar.
 *
 * Uma organização sem programa ativo devolve `success: false` com mensagem — é informação
 * legítima para o agente comunicar, não um erro de execução.
 */
export const cashbackTool = defineAgentTool({
	name: "cashback.consultar",
	description: `Consulta o programa de cashback da empresa e a situação do cliente com quem
você está conversando.

Use visao="SALDO" (padrão) — responde quase tudo em uma chamada: o saldo disponível, as regras
do programa (acúmulo, valor mínimo de compra, validade), a próxima expiração de saldo, quanto do
saldo pode virar desconto (quando o programa permite) e, quando o programa trabalha com
recompensas, a lista de prêmios com "resgatavel", "falta" (quanto de saldo ainda falta) e
"compraEstimada" (quanto o cliente precisaria comprar para chegar lá, pela regra de acúmulo).
Use visao="RECOMPENSAS" para a mesma lista de prêmios com descrição completa.
Use visao="EXTRATO" para o histórico de movimentações (acúmulos, resgates, expirações),
opcionalmente filtrado por dataInicio/dataFim em ISO 8601.

Sempre consulte esta ferramenta antes de falar sobre saldo, pontos, cashback, desconto do
programa ou recompensas — nunca estime valores nem prometa benefícios que não vieram daqui.
Você não resgata nada por aqui: aponte o cliente para "ondeResgatar".`,
	inputSchema: z.object({
		visao: z.enum(["SALDO", "EXTRATO", "RECOMPENSAS"]).optional().describe("O que consultar. Padrão: SALDO."),
		dataInicio: z.string().datetime().optional().describe("Início do período no extrato (ISO 8601)."),
		dataFim: z.string().datetime().optional().describe("Fim do período no extrato (ISO 8601)."),
		limite: z
			.number()
			.int()
			.min(1)
			.max(50)
			.optional()
			.describe("Máximo de movimentações no extrato ou de recompensas na lista. Padrão: 10 no extrato, 20 nas recompensas."),
	}),
	async execute(input, context) {
		const { db, organizacaoId, chat } = context;
		const view = input.visao ?? "SALDO";

		const { program, balance } = await resolveClientCashbackProgram({ tx: db, organizacaoId, clienteId: chat.clienteId });

		if (!program?.ativo) {
			return { success: false, message: "A empresa não possui um programa de cashback ativo no momento." };
		}

		const availableBalance = balance?.saldoValorDisponivel ?? 0;
		const redemptionSurfaces = listCashbackRedemptionSurfaceLabels(program);
		const programSummary = { titulo: program.titulo, terminologia: program.terminologia };

		if (view === "RECOMPENSAS") {
			if (!program.modalidadeRecompensasPermitida) {
				return {
					success: false,
					message: "O programa de cashback desta empresa não trabalha com recompensas — o saldo é usado como desconto nas compras.",
					result: {
						programa: programSummary,
						saldo: { disponivel: availableBalance },
						desconto: describeCashbackDiscount({ program, availableBalance }),
						ondeResgatar: redemptionSurfaces,
					},
				};
			}

			const prizes = await listPrizesForClient({ context, program, availableBalance, limit: input.limite ?? 20, detailed: true });
			const redeemableCount = prizes.filter((prize) => prize.resgatavel).length;

			return {
				success: true,
				message: `${prizes.length} recompensa(s) no programa "${program.titulo}", ${redeemableCount} já resgatável(is) com o saldo atual.`,
				result: { programa: programSummary, saldo: { disponivel: availableBalance }, ondeResgatar: redemptionSurfaces, recompensas: prizes },
			};
		}

		if (view === "EXTRATO") {
			const conditions = [
				eq(cashbackProgramTransactions.organizacaoId, organizacaoId),
				eq(cashbackProgramTransactions.clienteId, chat.clienteId),
				eq(cashbackProgramTransactions.programaId, program.id),
			];
			if (input.dataInicio) conditions.push(gte(cashbackProgramTransactions.dataInsercao, new Date(input.dataInicio)));
			if (input.dataFim) conditions.push(lte(cashbackProgramTransactions.dataInsercao, new Date(input.dataFim)));
			const where = and(...conditions);

			const [totalRow] = await db.select({ total: count() }).from(cashbackProgramTransactions).where(where);
			const totalCount = Number(totalRow?.total ?? 0);

			const transactions = await db.query.cashbackProgramTransactions.findMany({
				where,
				orderBy: [desc(cashbackProgramTransactions.dataInsercao)],
				limit: input.limite ?? 10,
				columns: {
					tipo: true,
					status: true,
					valor: true,
					valorRestante: true,
					saldoValorPosterior: true,
					expiracaoData: true,
					dataInsercao: true,
				},
			});

			return {
				success: true,
				message: `${transactions.length} de ${totalCount} movimentação(ões) de cashback.`,
				result: { programa: programSummary, totalEncontrado: totalCount, movimentacoes: transactions },
			};
		}

		const [nextExpiration, prizes] = await Promise.all([
			findNextExpiration({ context, programId: program.id }),
			program.modalidadeRecompensasPermitida
				? listPrizesForClient({ context, program, availableBalance, limit: 20, detailed: false })
				: Promise.resolve(null),
		]);

		return {
			success: true,
			message: balance
				? `Saldo de cashback do cliente no programa "${program.titulo}".`
				: `O cliente ainda não possui saldo no programa "${program.titulo}".`,
			result: {
				programa: {
					...programSummary,
					descricao: program.descricao,
					acumuloTipo: program.acumuloTipo,
					acumuloValor: program.acumuloValor,
					acumuloValorMinimoCompra: program.acumuloRegraValorMinimo,
					validadeDias: program.expiracaoRegraValidadeValor,
					resgateLimiteTipo: program.resgateLimiteTipo,
					resgateLimiteValor: program.resgateLimiteValor,
					usoComoDesconto: program.modalidadeDescontosPermitida,
					usoComoRecompensa: program.modalidadeRecompensasPermitida,
				},
				saldo: {
					disponivel: availableBalance,
					acumuladoTotal: balance?.saldoValorAcumuladoTotal ?? 0,
					resgatadoTotal: balance?.saldoValorResgatadoTotal ?? 0,
					membroDesde: balance?.dataAdesao ?? null,
				},
				proximaExpiracao: nextExpiration,
				ondeResgatar: redemptionSurfaces,
				desconto: describeCashbackDiscount({ program, availableBalance }),
				// `null` = o programa não trabalha com recompensas (já dito em `usoComoRecompensa`);
				// lista vazia = trabalha, mas não há prêmio cadastrado/resgatável.
				recompensas: prizes,
			},
		};
	},
});

/**
 * Prêmios do programa com a posição do cliente em cada um. A lista é a mesma do PDV e da loja
 * (`listProgramCashbackRewards`, sem superfície: o agente informa, não resgata); o preço de venda
 * do prêmio só sai quando o agente pode falar de preços.
 */
async function listPrizesForClient({
	context,
	program,
	availableBalance,
	limit,
	detailed,
}: {
	context: TAgentToolContext;
	program: TCashbackProgramEntity;
	availableBalance: number;
	limit: number;
	detailed: boolean;
}) {
	const rewards = await listProgramCashbackRewards({
		tx: context.db,
		organizacaoId: context.organizacaoId,
		program,
		availableBalance,
		surface: null,
	});
	const pricesVisible = context.capacidades.comercial.precos.visiveis;

	return rewards.slice(0, limit).map((reward) => {
		const gap = describeCashbackPrizeGap({ program, prizeValue: reward.valor, availableBalance });
		return {
			titulo: reward.titulo,
			...(detailed ? { descricao: reward.descricao, grupo: reward.grupo } : {}),
			valor: reward.valor,
			...(pricesVisible ? { valorVenda: reward.valorVenda } : {}),
			...gap,
		};
	});
}

/**
 * O lote de saldo que expira primeiro: acúmulos ativos com saldo restante e data futura, somados
 * por dia (o mesmo dia costuma ter mais de uma compra). `null` sem expiração à vista.
 */
async function findNextExpiration({ context, programId }: { context: TAgentToolContext; programId: string }) {
	const rows = await context.db.query.cashbackProgramTransactions.findMany({
		where: and(
			eq(cashbackProgramTransactions.organizacaoId, context.organizacaoId),
			eq(cashbackProgramTransactions.clienteId, context.chat.clienteId),
			eq(cashbackProgramTransactions.programaId, programId),
			eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
			eq(cashbackProgramTransactions.status, "ATIVO"),
			gt(cashbackProgramTransactions.valorRestante, 0),
			isNotNull(cashbackProgramTransactions.expiracaoData),
			gte(cashbackProgramTransactions.expiracaoData, new Date()),
		),
		orderBy: [asc(cashbackProgramTransactions.expiracaoData)],
		limit: 50,
		columns: { valorRestante: true, expiracaoData: true },
	});
	const first = rows[0];
	if (!first?.expiracaoData) return null;
	const firstDate = first.expiracaoData;
	const expiringValue = rows
		.filter((row) => row.expiracaoData && isSameDay(row.expiracaoData, firstDate))
		.reduce((total, row) => total + row.valorRestante, 0);
	return { data: firstDate, valor: Math.round(expiringValue * 100) / 100 };
}

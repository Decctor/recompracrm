import { listSessionPaymentTerminalPendencies } from "./payment-terminal-pendencies";
import { computeSessionExpectedByMethod } from "./compute-session-expected-by-method";
import { classifyDrawerMovement } from "./drawer-movements";
import type { TSessionCashSaleReceipt, TSessionMovement } from "./session-method-lines";
import { SALE_CHANGE_TRANSACTION_ORIGIN } from "@/lib/sales/sale-change";
import { TAB_PARTIAL_PAYMENT_TRANSACTION_ORIGIN } from "@/lib/tabs/partial-payments";
import { db } from "@/services/drizzle";
import {
	accountingEntries,
	accountsCharts,
	clients,
	financialAccounts,
	financialTransactions,
	fiscalOutboundDocuments,
	sales,
	salesSessions,
	tabPayments,
	users,
} from "@/services/drizzle/schema";
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";

/**
 * Detalhe de uma sessão de caixa: dados da sessão, esperado por método, movimentos da gaveta,
 * recebimentos em dinheiro por venda e pendências. Serve o modal de detalhes, o de fechamento e o
 * de movimento — e qualquer leitura fora da rota (scripts de conferência).
 */
export async function getSalesSessionDetail({ orgId, sessionId }: { orgId: string; sessionId: string }) {
	const found = await db.query.salesSessions.findFirst({
		where: and(eq(salesSessions.id, sessionId), eq(salesSessions.organizacaoId, orgId)),
		with: {
			vendedorPadrao: { columns: { id: true, nome: true } },
			abertaPorUsuario: { columns: { id: true, nome: true } },
			fechadaPorUsuario: { columns: { id: true, nome: true } },
			conferidaPorUsuario: { columns: { id: true, nome: true } },
			conferencias: true,
			vendas: {
				columns: { id: true, valorTotal: true, dataVenda: true, vendedorId: true, vendedorNome: true },
				with: { cliente: { columns: { id: true, nome: true } } },
			},
		},
	});
	if (!found) throw new createHttpError.NotFound("Sessão de venda não encontrada.");

	// O ledger da sessão é a única fonte que explica o esperado (fundo, entradas, troco, sangrias
	// e estornos). Numa sessão aberta ele ainda é a própria verdade; depois do fechamento vira a
	// composição do que `conferencias` congelou — nenhum movimento novo é carimbado numa sessão
	// fechada, então recalcular aqui devolve os mesmos valores e serve o detalhe histórico.
	// As pendências fiscais seguem junto: quem confere o caixa precisa vê-las tanto quanto quem fecha.
	//
	// Lado oposto do parcial: a venda de uma conta fechada neste caixa pode ter sido recebida em
	// parte noutro caixa (ou sem caixa). A lista de vendas mostra o total da venda, mas a gaveta
	// daqui só recebeu o restante — o resumo precisa do valor líquido para bater com o esperado.
	// Só depende das vendas já carregadas com a sessão, então sai na mesma ida das demais leituras.
	const saleIds = found.vendas.map((venda) => venda.id);
	const [resumoEsperado, pendenciasFiscais, movimentosRows, pendenciasMaquininha, partialsElsewhere, cashSaleRows] = await Promise.all([
		computeSessionExpectedByMethod({ orgId, sessaoVendaId: found.id, saldoInicial: found.saldoInicial }),
		db
			.select({
				id: fiscalOutboundDocuments.id,
				referencia: fiscalOutboundDocuments.referencia,
				statusInterno: fiscalOutboundDocuments.statusInterno,
			})
			.from(fiscalOutboundDocuments)
			.innerJoin(sales, eq(fiscalOutboundDocuments.vendaId, sales.id))
			.where(
				and(eq(sales.sessaoVendaId, found.id), eq(fiscalOutboundDocuments.organizacaoId, orgId), ne(fiscalOutboundDocuments.statusInterno, "AUTORIZADO")),
			),
		// Os movimentos que o extrato lista um a um: sangrias, suprimentos, despesas e estornos.
		// Ficam de fora o troco e o recebimento de venda, que o extrato lista a partir dos
		// recebimentos por venda (abaixo). Exceção: o recebimento parcial de uma conta que NÃO foi
		// fechada neste caixa. A venda vai aparecer na lista do caixa que fechar; sem esta linha o
		// dinheiro ficaria invisível aqui.
		db
			.select({
				id: financialTransactions.id,
				titulo: financialTransactions.titulo,
				tipo: financialTransactions.tipo,
				valor: financialTransactions.valor,
				metodo: financialTransactions.metodo,
				contaFinanceiraId: financialTransactions.contaFinanceiraId,
				modificadoresMetadata: financialTransactions.modificadoresMetadata,
				dataEfetivacao: financialTransactions.dataEfetivacao,
				dataPrevisao: financialTransactions.dataPrevisao,
				origemTipo: accountingEntries.origemTipo,
				// A observação do operador (sangria/suprimento) e o motivo do estorno moram no
				// lançamento contábil — o título da transação é sempre genérico.
				observacoes: accountingEntries.anotacoes,
				autorNome: users.nome,
				lancamentoContabilId: financialTransactions.lancamentoContabilId,
				categoriaNome: accountsCharts.nome,
			})
			.from(financialTransactions)
			.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
			.leftJoin(sales, eq(accountingEntries.vendaId, sales.id))
			.leftJoin(users, eq(financialTransactions.autorId, users.id))
			// Categoria da despesa: o débito do lançamento MANUAL.
			.leftJoin(accountsCharts, and(eq(accountingEntries.origemTipo, "MANUAL"), eq(accountsCharts.id, accountingEntries.idContaDebito)))
			.where(
				and(
					eq(financialTransactions.organizacaoId, orgId),
					eq(financialTransactions.sessaoVendaId, found.id),
					sql`coalesce(${financialTransactions.modificadoresMetadata} ->> 'origem', '') <> ${SALE_CHANGE_TRANSACTION_ORIGIN}`,
					or(
						ne(accountingEntries.origemTipo, "VENDA"),
						ne(financialTransactions.tipo, "ENTRADA"),
						and(
							sql`coalesce(${financialTransactions.modificadoresMetadata} ->> 'origem', '') = ${TAB_PARTIAL_PAYMENT_TRANSACTION_ORIGIN}`,
							or(isNull(sales.sessaoVendaId), ne(sales.sessaoVendaId, found.id)),
						),
					),
				),
			)
			.orderBy(asc(financialTransactions.dataPrevisao)),
		// Cobranças na maquininha do turno ainda sem desfecho: quem fecha ou confere o caixa precisa
		// vê-las ao lado das pendências fiscais.
		listSessionPaymentTerminalPendencies({ orgId, sessaoVendaId: found.id }),
		saleIds.length > 0
			? db
					.select({ vendaId: tabPayments.vendaId, valor: sql<number>`coalesce(sum(${tabPayments.valor}), 0)` })
					.from(tabPayments)
					.where(
						and(
							eq(tabPayments.organizacaoId, orgId),
							inArray(tabPayments.vendaId, saleIds),
							eq(tabPayments.status, "ATIVO"),
							or(isNull(tabPayments.sessaoVendaId), ne(tabPayments.sessaoVendaId, found.id)),
						),
					)
					.groupBy(tabPayments.vendaId)
			: [],
		// Recebimentos e trocos em dinheiro das vendas, para o extrato listar venda a venda.
		db
			.select({
				vendaId: accountingEntries.vendaId,
				tipo: financialTransactions.tipo,
				valor: financialTransactions.valor,
				modificadoresMetadata: financialTransactions.modificadoresMetadata,
				dataVenda: sales.dataVenda,
				valorVenda: sales.valorTotal,
				clienteNome: clients.nome,
			})
			.from(financialTransactions)
			.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
			.leftJoin(sales, eq(accountingEntries.vendaId, sales.id))
			.leftJoin(clients, eq(sales.clienteId, clients.id))
			.where(
				and(
					eq(financialTransactions.organizacaoId, orgId),
					eq(financialTransactions.sessaoVendaId, found.id),
					eq(financialTransactions.metodo, "DINHEIRO"),
					eq(accountingEntries.origemTipo, "VENDA"),
				),
			),
	]);
	// A contrapartida de uma sangria/suprimento é a outra perna do mesmo lançamento, fora da gaveta
	// (o cofre, o banco). Movimentos antigos não têm essa perna.
	const entryIds = [...new Set(movimentosRows.map((row) => row.lancamentoContabilId).filter((id): id is string => Boolean(id)))];
	const counterpartRows =
		entryIds.length > 0
			? await db
					.select({ lancamentoContabilId: financialTransactions.lancamentoContabilId, nome: financialAccounts.nome })
					.from(financialTransactions)
					.innerJoin(financialAccounts, eq(financialTransactions.contaFinanceiraId, financialAccounts.id))
					.where(
						and(
							eq(financialTransactions.organizacaoId, orgId),
							inArray(financialTransactions.lancamentoContabilId, entryIds),
							or(isNull(financialTransactions.sessaoVendaId), ne(financialTransactions.sessaoVendaId, found.id)),
						),
					)
			: [];
	const counterpartByEntry = new Map(counterpartRows.map((row) => [row.lancamentoContabilId, row.nome]));

	const movimentos: TSessionMovement[] = movimentosRows.map(
		({ dataEfetivacao, dataPrevisao, modificadoresMetadata, origemTipo, lancamentoContabilId, categoriaNome, ...movimento }) => {
			const contaContrapartidaNome = lancamentoContabilId ? (counterpartByEntry.get(lancamentoContabilId) ?? null) : null;
			const natureza = classifyDrawerMovement({ tipo: movimento.tipo, origemTipo, modificadoresMetadata });
			return {
				...movimento,
				natureza,
				data: dataEfetivacao ?? dataPrevisao,
				contrapartida:
					natureza === "DESPESA" && categoriaNome
						? { tipo: "CATEGORIA" as const, nome: categoriaNome }
						: contaContrapartidaNome
							? { tipo: "CONTA" as const, nome: contaContrapartidaNome }
							: null,
			};
		},
	);

	const receiptsBySale = new Map<string, TSessionCashSaleReceipt>();
	for (const row of cashSaleRows) {
		if (!row.vendaId) continue;
		const receipt = receiptsBySale.get(row.vendaId) ?? {
			vendaId: row.vendaId,
			clienteNome: row.clienteNome,
			data: row.dataVenda,
			valorVenda: row.valorVenda ?? 0,
			recebido: 0,
			troco: 0,
		};
		const cents = Math.round(row.valor * 100);
		const kind = classifyDrawerMovement({ tipo: row.tipo, origemTipo: "VENDA", modificadoresMetadata: row.modificadoresMetadata });
		if (kind === "VENDA") receipt.recebido = (Math.round(receipt.recebido * 100) + cents) / 100;
		else if (kind === "TROCO") receipt.troco = (Math.round(receipt.troco * 100) + cents) / 100;
		receiptsBySale.set(row.vendaId, receipt);
	}
	const recebimentosDinheiro = Array.from(receiptsBySale.values()).sort((a, b) => new Date(a.data ?? 0).getTime() - new Date(b.data ?? 0).getTime());

	const partialsBySale = new Map(partialsElsewhere.map((row) => [row.vendaId, Number(row.valor)]));
	const vendas = found.vendas.map((venda) => {
		const valorRecebidoOutroCaixa = Math.round((partialsBySale.get(venda.id) ?? 0) * 100) / 100;
		return { ...venda, valorRecebidoOutroCaixa, valorNoCaixa: Math.round((venda.valorTotal - valorRecebidoOutroCaixa) * 100) / 100 };
	});

	return { ...found, vendas, resumoEsperado, pendenciasFiscais, pendenciasMaquininha, movimentos, recebimentosDinheiro };
}
export type TSalesSessionDetail = Awaited<ReturnType<typeof getSalesSessionDetail>>;

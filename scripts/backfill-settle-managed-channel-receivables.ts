import "@/utils/scripts/load-next-env";

import { processSaleCashbackAccumulationIfEligible } from "@/lib/sales/sale-processing";
import { connection, db } from "@/services/drizzle";
import { accountingEntries, financialAccounts, financialTransactions, sales } from "@/services/drizzle/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Backfill do modelo clearing de canais gerenciados (iFood): efetiva as transações legadas
 * AGUARDANDO_REPASSE — criadas quando os pagamentos online entravam como recebível pendente
 * até a conciliação do repasse. No modelo clearing elas nascem efetivadas na conta do canal
 * (o consumidor já pagou; o repasse é uma transferência agregada posterior conta do canal →
 * banco).
 *
 * Efetiva com `dataEfetivacao = dataCompetencia` do lançamento (a data da venda) e alinha
 * `dataPrevisao` (era D+7) para não poluir as métricas de atraso. `provedorStatus` vira
 * APROVADO, o mesmo que `processManagedSaleFinancials` grava hoje.
 *
 * Gatilhos pós-efetivação NÃO são disparados por padrão: a emissão fiscal automática já
 * tratava AGUARDANDO_REPASSE como pago (nada muda), e o acúmulo de cashback retroativo é
 * decisão de negócio — habilite com `--with-cashback` (idempotente; só vendas CONFIRMADAS).
 *
 * DRY-RUN por padrão. Uso:
 *   npx tsx ./scripts/backfill-settle-managed-channel-receivables.ts [--org=<id>] [--commit] [--with-cashback]
 */

function arg(name: string, fallback?: string) {
	const found = process.argv.find((value) => value.startsWith(`--${name}=`));
	return found ? found.slice(name.length + 3) : fallback;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
	const orgId = arg("org");
	const commit = hasFlag("commit");
	const withCashback = hasFlag("with-cashback");
	console.log(
		`Modo: ${commit ? "COMMIT" : "DRY-RUN"}${withCashback ? " (+cashback)" : ""}${orgId ? ` | Organização: ${orgId}` : " | Todas as organizações"}\n`,
	);

	const rows = await db
		.select({
			transactionId: financialTransactions.id,
			titulo: financialTransactions.titulo,
			tipo: financialTransactions.tipo,
			valor: financialTransactions.valor,
			organizacaoId: financialTransactions.organizacaoId,
			contaNome: financialAccounts.nome,
			dataCompetencia: accountingEntries.dataCompetencia,
			vendaId: accountingEntries.vendaId,
			statusVenda: sales.statusVenda,
			idExterno: sales.idExterno,
		})
		.from(financialTransactions)
		.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
		.leftJoin(sales, eq(accountingEntries.vendaId, sales.id))
		.leftJoin(financialAccounts, eq(financialTransactions.contaFinanceiraId, financialAccounts.id))
		.where(
			and(
				eq(financialTransactions.provedorStatus, "AGUARDANDO_REPASSE"),
				isNull(financialTransactions.dataEfetivacao),
				orgId ? eq(financialTransactions.organizacaoId, orgId) : undefined,
			),
		);

	if (rows.length === 0) {
		console.log("Nenhuma transação AGUARDANDO_REPASSE pendente encontrada — nada a fazer.");
		return;
	}

	// Guarda: vendas canceladas não deveriam ter recebível AGUARDANDO_REPASSE (o cancelamento
	// marca CANCELADO antes) — se aparecer, é inconsistência para investigar, não para efetivar.
	const cancelled = rows.filter((row) => row.statusVenda === "CANCELADA");
	const targets = rows.filter((row) => row.statusVenda !== "CANCELADA");
	for (const row of cancelled) {
		console.warn(`PULADA (venda CANCELADA): ${row.transactionId} | ${row.titulo} | venda ${row.vendaId}`);
	}

	const byAccount = new Map<string, { entradas: number; saidas: number; count: number }>();
	for (const row of targets) {
		const key = `${row.organizacaoId} | ${row.contaNome ?? "(sem conta)"}`;
		const bucket = byAccount.get(key) ?? { entradas: 0, saidas: 0, count: 0 };
		if (row.tipo === "ENTRADA") bucket.entradas += row.valor;
		else bucket.saidas += row.valor;
		bucket.count += 1;
		byAccount.set(key, bucket);
	}

	console.log(`Transações a efetivar: ${targets.length}\n`);
	for (const [account, bucket] of byAccount) {
		const delta = bucket.entradas - bucket.saidas;
		console.log(
			`  ${account}: ${bucket.count} transação(ões) | entradas ${bucket.entradas.toFixed(2)} | saídas ${bucket.saidas.toFixed(2)} | Δ saldo ${delta.toFixed(2)}`,
		);
	}

	if (!commit) {
		console.log("\nDRY-RUN — nada gravado. Rode com --commit para aplicar.");
		return;
	}

	await db.transaction(async (tx) => {
		for (const row of targets) {
			await tx
				.update(financialTransactions)
				.set({
					dataEfetivacao: row.dataCompetencia,
					dataPrevisao: row.dataCompetencia,
					provedorStatus: "APROVADO",
				})
				.where(and(eq(financialTransactions.id, row.transactionId), isNull(financialTransactions.dataEfetivacao)));
		}
	});
	console.log(`\nEfetivadas: ${targets.length} transação(ões).`);

	if (withCashback) {
		const salesToAccumulate = new Map<string, string>();
		for (const row of targets) {
			if (row.vendaId && row.statusVenda === "CONFIRMADA") salesToAccumulate.set(row.vendaId, row.organizacaoId);
		}
		let accumulated = 0;
		for (const [saleId, organizationId] of salesToAccumulate) {
			try {
				const result = await processSaleCashbackAccumulationIfEligible({ organizationId, saleId, authorId: null });
				if (result && !result.alreadyProcessed) accumulated += 1;
			} catch (error) {
				console.warn(`Cashback falhou para a venda ${saleId}:`, error instanceof Error ? error.message : error);
			}
		}
		console.log(`Cashback acumulado para ${accumulated} de ${salesToAccumulate.size} venda(s) elegível(is).`);
	}
}

main()
	.catch((error) => {
		console.error("Falha no backfill:", error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});

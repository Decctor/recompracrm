import "dotenv/config";
import dayjs from "dayjs";
import { getSalesResultsByPaymentMethod } from "@/lib/sales/results/by-payment-method";
import { getStoreCreditClients, getStoreCreditClientTitles, getStoreCreditStats } from "@/lib/finances/store-credit/queries";
import { connection } from "@/services/drizzle";

/**
 * Exercita, contra o banco real, todo o SQL do módulo de fiados que só um Postgres confirma:
 * `filter (where ...)`, `count` sobre subconsulta agrupada, `nulls last`, e principalmente as
 * expressões que aparecem em mais de uma cláusula — onde a renumeração de parâmetros do drizzle
 * quebrou as três primeiras versões destas consultas.
 *
 *   npx tsx ./scripts/verify-store-credit-queries.ts <organizacaoId>
 */
async function main() {
	const organizacaoId = process.argv[2];
	if (!organizacaoId) throw new Error("Informe o id da organização: npx tsx ./scripts/verify-store-credit-queries.ts <organizacaoId>");

	const periodAfter = dayjs().startOf("month").toDate();
	const periodBefore = dayjs().endOf("month").toDate();

	console.log("\n[1] getStoreCreditStats");
	const stats = await getStoreCreditStats({ organizacaoId, periodAfter, periodBefore });
	console.log({
		totalEmAberto: stats.totalEmAberto,
		clientesEmAberto: stats.clientesEmAberto,
		totalVencido: stats.totalVencido,
		recebidoNoPeriodo: stats.recebidoNoPeriodo,
		recebidoNoPeriodoAnterior: stats.recebidoNoPeriodoAnterior,
		prazoMedioQuitacaoDias: stats.prazoMedioQuitacaoDias,
		faixas: stats.faixas,
	});

	console.log("\n[2] getStoreCreditClients — cada combinação de filtro e ordenação");
	for (const sortField of ["saldo", "previsao", "nome"] as const) {
		for (const sortDirection of ["asc", "desc"] as const) {
			const result = await getStoreCreditClients({ organizacaoId, sortField, sortDirection, statuses: ["EM_ABERTO"] });
			console.log(`  ordenar por ${sortField} ${sortDirection}: ${result.clientesMatched} clientes`);
		}
	}
	for (const statuses of [["EM_ABERTO"], ["VENCIDO"], ["QUITADO"], ["EM_ABERTO", "VENCIDO", "QUITADO"]] as const) {
		const result = await getStoreCreditClients({ organizacaoId, statuses: [...statuses] });
		console.log(`  status ${statuses.join("+")}: ${result.clientesMatched} clientes`);
	}
	for (const bucket of ["A_VENCER", "VENCIDO_1_15", "VENCIDO_16_30", "VENCIDO_30_MAIS"] as const) {
		const result = await getStoreCreditClients({ organizacaoId, statuses: [], agingBuckets: [bucket] });
		console.log(`  faixa ${bucket}: ${result.clientesMatched} clientes`);
	}
	const searched = await getStoreCreditClients({ organizacaoId, search: "a", statuses: [] });
	console.log(`  pesquisa "a": ${searched.clientesMatched} clientes`);

	console.log("\n[2b] recorte por período de ORIGEM (fechamento mensal) — e o resumo do recorte");
	const semRecorte = await getStoreCreditClients({ organizacaoId, statuses: ["EM_ABERTO"] });
	console.log(`  sem recorte: ${semRecorte.clientesMatched} clientes, resumo`, semRecorte.resumo);
	for (const mesesAtras of [0, 1, 2]) {
		const inicio = dayjs().subtract(mesesAtras, "month").startOf("month");
		const recorte = await getStoreCreditClients({
			organizacaoId,
			statuses: ["EM_ABERTO"],
			originAfter: inicio.toDate(),
			originBefore: inicio.endOf("month").toDate(),
		});
		console.log(`  origem em ${inicio.format("MM/YYYY")}: ${recorte.clientesMatched} clientes,`, recorte.resumo);
	}
	// Um recorte só com limite inferior, para exercitar o lado aberto do intervalo.
	const apenasDesde = await getStoreCreditClients({
		organizacaoId,
		statuses: ["EM_ABERTO"],
		originAfter: dayjs().subtract(45, "day").toDate(),
	});
	console.log(`  origem nos últimos 45 dias: ${apenasDesde.clientesMatched} clientes,`, apenasDesde.resumo);

	const listagem = await getStoreCreditClients({ organizacaoId, statuses: [] });
	console.log("\n  primeiros clientes:", listagem.clientes.slice(0, 5));

	console.log("\n[3] getStoreCreditClientTitles");
	const primeiro = listagem.clientes[0];
	if (primeiro) {
		const abertos = await getStoreCreditClientTitles({ organizacaoId, clienteId: primeiro.clienteId });
		const comHistorico = await getStoreCreditClientTitles({ organizacaoId, clienteId: primeiro.clienteId, includeSettled: true });
		console.log(`  ${primeiro.nome}: ${abertos.length} em aberto, ${comHistorico.length} com histórico`);

		// O recorte precisa valer também aqui: a expansão e o menu de baixa leem esta função, e se
		// ela ignorasse o período o operador veria dois saldos diferentes na mesma tela.
		const inicioDoMes = dayjs().startOf("month");
		const recortados = await getStoreCreditClientTitles({
			organizacaoId,
			clienteId: primeiro.clienteId,
			originAfter: inicioDoMes.toDate(),
			originBefore: inicioDoMes.endOf("month").toDate(),
		});
		const somaTotal = abertos.reduce((acc, titulo) => acc + titulo.valor, 0);
		const somaRecorte = recortados.reduce((acc, titulo) => acc + titulo.valor, 0);
		console.log(`  recorte ${inicioDoMes.format("MM/YYYY")}: ${recortados.length} de ${abertos.length} títulos, R$ ${somaRecorte} de R$ ${somaTotal}`);
		if (recortados.length > abertos.length) throw new Error("O recorte devolveu mais títulos que o conjunto completo.");
		console.log("  títulos:", comHistorico.slice(0, 5));
	} else {
		console.log("  nenhum cliente com fiado nesta organização — a listagem voltou vazia (sem erro).");
	}

	console.log("\n[4] getSalesResultsByPaymentMethod — a expressão de atribuição roda em SELECT e GROUP BY");
	const resultados = await getSalesResultsByPaymentMethod({
		filters: {
			organizacaoId,
			// Janela larga de propósito: o fiado quitado que este passo verifica pode ter sido vendido
			// muito antes do mês corrente, e ele precisa aparecer na linha FIADO.
			after: dayjs().subtract(2, "year").startOf("day").toDate(),
			before: dayjs().endOf("day").toDate(),
			sellersIds: [],
			channels: [],
			excludedFinancialAccountIds: [],
		},
	});
	console.log(
		"  linhas:",
		resultados.linhas.map((linha) => ({ metodo: linha.metodo, valor: linha.valor, qtdeVendas: linha.qtdeVendas })),
	);

	console.log("\nOK — nenhuma consulta falhou.");
}

main()
	.catch((error) => {
		console.error("\nFALHOU:", error?.message ?? error);
		// O drizzle embrulha o erro do driver; a mensagem do Postgres — a única que diz o que de fato
		// houve — só aparece descendo a cadeia de `cause`.
		let cause: unknown = error?.cause;
		while (cause) {
			const current = cause as { message?: string; code?: string; hint?: string; position?: string; cause?: unknown };
			console.error("CAUSA:", { code: current.code, message: current.message, hint: current.hint, position: current.position });
			cause = current.cause;
		}
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});

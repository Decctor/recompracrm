import "@/utils/scripts/load-next-env";

import { createCardapioWebClient, getCardapioWebOrderHistory, getCardapioWebOrderDetails } from "@/lib/data-connectors/cardapio-web";
import { mapCardapioWebSale } from "@/lib/data-connectors/cardapio-web/mappers";
import type { TGetCardapioWebOrderHistoryOutput, TGetCardapioWebOrderDetailsOutput } from "@/lib/data-connectors/cardapio-web/types";
import { connection } from "@/services/drizzle";
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import { compareAuditSaleHeaders, isInAuditWindow, isInternalPOIAuditSale, toAuditCents as cents } from "./lib/cardapio-web-sales-audit";

// Exclusivamente diagnóstico. Não importa sync-sales/effects e não oferece --apply.
// npx tsx scripts/audit-cardapio-web-sales.ts [--probe] [--refresh]
const INTEGRATION_ID = "50b56dfc-5807-441c-aa65-e882fa77b7d3";
const ORGANIZATION_ID = "27817d9a-cb04-4704-a1f4-15b81a3610d3";
const START = "2026-01-01T00:00:00-03:00";
const END = "2026-09-01T00:00:00-03:00"; // exclusivo; 31/08 inteiro em São Paulo
const outputDir = resolve("../recompracrm-tmpworks/congelatte-cardapio-web-2026-jan-aug");
type TSummary = TGetCardapioWebOrderHistoryOutput["orders"][number];
type TSale = {
	id: string;
	idExterno: string;
	integracaoId: string | null;
	modelo: string;
	valorTotal: number;
	natureza: string;
	situacao: string;
	statusVenda: string | null;
	dataVenda: string | null;
	descontosTotal: number | null;
	acrescimosTotal: number | null;
	clienteId: string | null;
};

function save(name: string, value: unknown) {
	const path = join(outputDir, name);
	writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2));
	renameSync(`${path}.tmp`, path);
}
function load<T>(name: string): T | null {
	const path = join(outputDir, name);
	return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}
function inWindow(date: string | Date | null) {
	return isInAuditWindow(date, START, END);
}
function safeError(error: unknown) {
	const e = error as { response?: { status?: number; data?: unknown }; name?: string; issues?: unknown[]; message?: string };
	// Nunca serializar AxiosError: config contém credenciais.
	return {
		tipo: e.name ?? "Error",
		statusHttp: e.response?.status ?? null,
		validacao: e.issues ?? null,
		mensagem: e.response?.status === 400 ? JSON.stringify(e.response.data).slice(0, 1200) : e.response ? null : e.message,
	};
}

async function main() {
	mkdirSync(outputDir, { recursive: true });
	const integration = await connection.begin("read only", async (sql) => {
		const rows = await sql`select i.organizacao_id, i.tipo, i.ativo, i.configuracao, o.nome
			from ampmais_integrations i join ampmais_organizations o on o.id = i.organizacao_id where i.id = ${INTEGRATION_ID}`;
		return rows[0];
	});
	if (!integration || integration.organizacao_id !== ORGANIZATION_ID || integration.tipo !== "CARDAPIO-WEB")
		throw new Error("Integração/organização não corresponde à Congelatte esperada.");
	const client = createCardapioWebClient(integration.configuracao);
	client.defaults.timeout = 30_000;
	console.log(
		JSON.stringify({
			organizacao: integration.nome,
			organizacaoId: ORGANIZATION_ID,
			integracaoId: INTEGRATION_ID,
			ativa: integration.ativo,
			inicio: START,
			fimExclusivo: END,
		}),
	);
	const refresh = process.argv.includes("--refresh");
	// Mais conservador que o conector de produção: a API pode aplicar bloqueios adicionais.
	const detailDelay = Number(process.argv.find((value) => value.startsWith("--detail-delay-ms="))?.split("=")[1] ?? 1000);
	if (!Number.isFinite(detailDelay) || detailDelay < 1000) throw new Error("Use --detail-delay-ms >= 1000.");
	let nextDetailAt = 0;
	async function fetchDetail(id: number) {
		await new Promise((done) => setTimeout(done, Math.max(0, nextDetailAt - Date.now())));
		try {
			return await getCardapioWebOrderDetails(client, { order_id: id });
		} finally {
			nextDetailAt = Date.now() + detailDelay;
		}
	}
	const summaries: TSummary[] = [];
	const prefetched = new Set<number>();
	const prefetchFailures = new Set<number>();
	async function prefetch(summary: TSummary) {
		if (prefetched.has(summary.id)) return;
		prefetched.add(summary.id);
		const name = `details/${summary.id}.json`;
		if (!refresh && load(name)) return;
		try {
			const order = await fetchDetail(summary.id);
			if (order.id !== summary.id || String(order.merchant_id) !== String(integration.configuracao.merchantId))
				throw new Error("Pedido/merchant inesperado.");
			save(name, order);
		} catch (error) {
			prefetchFailures.add(summary.id);
			save(`details/failure-${summary.id}.json`, { idExterno: String(summary.id), ...safeError(error) });
			if ((error as { response?: { status?: number } }).response?.status === 429)
				throw new Error("Cardápio Web bloqueou a coleta (429). Cache preservado; aguarde antes de retomar.");
		}
	}
	let expectedTotal = 0;
	// A API aceita no máximo seis meses. Janelas mensais também permitem retomada granular.
	for (let month = 1; month <= 8; month++) {
		let totalPages = 1;
		let expectedCount = 0;
		let collectedCount = 0;
		const start = `2026-${String(month).padStart(2, "0")}-01T00:00:00-03:00`;
		const end = `2026-${String(month + 1).padStart(2, "0")}-01T00:00:00-03:00`;
		for (let page = 1; page <= totalPages; page++) {
			const name = `history-${month}-${page}.json`;
			const response =
				(!refresh && load<TGetCardapioWebOrderHistoryOutput>(name)) ||
				(await getCardapioWebOrderHistory(client, {
					page,
					per_page: 100,
					start_date: start,
					end_date: new Date(new Date(end).getTime() - 1).toISOString(),
					status: ["closed", "canceled"],
				}));
			if (response.pagination.current_page !== page) throw new Error("Paginação retornou página inesperada.");
			save(name, response);
			totalPages = response.pagination.total_pages;
			expectedCount = response.pagination.total_orders;
			summaries.push(...response.orders);
			collectedCount += response.orders.length;
			console.log(`Mês ${month}, histórico ${page}/${totalPages}: ${collectedCount}/${expectedCount} pedidos.`);
			if (process.argv.includes("--probe")) return;
			for (const summary of response.orders) await prefetch(summary);
			save("progress.json", {
				completo: false,
				fase: "COLETA",
				mes: month,
				pagina: page,
				paginasMes: totalPages,
				pedidosMes: expectedCount,
				pedidosHistoricoColetados: summaries.length,
				atualizadoEm: new Date().toISOString(),
			});
		}
		if (collectedCount !== expectedCount) throw new Error("Contagem mensal inconsistente. Execute novamente com --refresh.");
		expectedTotal += expectedCount;
	}
	const unique = new Map(summaries.map((order) => [order.id, order]));
	if (unique.size !== summaries.length || summaries.length !== expectedTotal)
		throw new Error("Histórico incompleto ou com IDs repetidos. Execute novamente com --refresh.");
	save("history-complete.json", { inicio: START, fimExclusivo: END, quantidade: summaries.length, coletadoEm: new Date().toISOString() });
	const orders: TGetCardapioWebOrderDetailsOutput[] = [];
	const failures: unknown[] = [];
	for (const summary of unique.values()) {
		const name = `details/${summary.id}.json`;
		try {
			const order = (!prefetchFailures.has(summary.id) && load<TGetCardapioWebOrderDetailsOutput>(name)) || (await fetchDetail(summary.id));
			if (order.id !== summary.id || String(order.merchant_id) !== String(integration.configuracao.merchantId))
				throw new Error("Pedido/merchant inesperado.");
			save(name, order);
			orders.push(order);
		} catch (error) {
			failures.push({ idExterno: String(summary.id), ...safeError(error) });
			if ((error as { response?: { status?: number } }).response?.status === 429)
				throw new Error("Cardápio Web bloqueou a coleta (429). Cache preservado; aguarde antes de retomar.");
		}
		if ((orders.length + failures.length) % 100 === 0)
			console.log(`Detalhes ${orders.length + failures.length}/${unique.size}; falhas: ${failures.length}.`);
	}
	save("failures.json", failures);
	// Snapshot consistente do app, após a coleta remota. Transação curta e read-only no PostgreSQL.
	const snapshot = await connection.begin("isolation level repeatable read read only", async (sql) => {
		const sales = await sql<TSale[]>`select id, id_externo as "idExterno", integracao_id as "integracaoId", modelo,
			valor_total as "valorTotal", natureza, situacao, status_venda as "statusVenda", data_venda as "dataVenda",
			descontos_total as "descontosTotal", acrescimos_total as "acrescimosTotal", cliente_id as "clienteId"
			from ampmais_sales where organizacao_id = ${ORGANIZATION_ID}`;
		const cashback = await sql`select t.* from ampmais_cashback_program_transactions t
			join ampmais_sales s on s.id = t.venda_id
			where s.organizacao_id = ${ORGANIZATION_ID} and (s.integracao_id = ${INTEGRATION_ID} or (s.integracao_id is null and s.modelo = 'CARDAPIO-WEB'))`;
		const balances = await sql`select * from ampmais_cashback_program_balances where organizacao_id = ${ORGANIZATION_ID}`;
		return { vendas: sales, transacoesCashback: cashback, saldosCashback: balances, capturadoEm: new Date().toISOString() };
	});
	save("app-snapshot.json", snapshot);
	const associatedSales = snapshot.vendas.filter((s) => s.integracaoId === INTEGRATION_ID || (!s.integracaoId && s.modelo === "CARDAPIO-WEB"));
	const internalSales = associatedSales.filter((s) => isInternalPOIAuditSale(s) && inWindow(s.dataVenda));
	const candidates = associatedSales.filter((s) => !isInternalPOIAuditSale(s));
	const byId = new Map<string, TSale[]>();
	for (const sale of candidates) byId.set(sale.idExterno, [...(byId.get(sale.idExterno) ?? []), sale]);
	const differences: Array<Record<string, unknown>> = [];
	let aligned = 0;
	let totalSource = 0;
	const sourceIds = new Set<string>();
	const counts: Record<string, number> = {};
	function add(kind: string, data: Record<string, unknown>) {
		counts[kind] = (counts[kind] ?? 0) + 1;
		differences.push({ tipo: kind, ...data });
	}
	for (const order of orders) {
		const mapped = mapCardapioWebSale(order);
		if (!inWindow(mapped.dataVenda)) continue;
		sourceIds.add(mapped.idExterno);
		if (mapped.isValidSale) totalSource += cents(mapped.valorTotal);
		const matches = byId.get(mapped.idExterno) ?? [];
		const expected = {
			modelo: "CARDAPIO-WEB",
			idExterno: mapped.idExterno,
			valorTotal: mapped.valorTotal,
			natureza: mapped.natureza,
			statusVenda: mapped.isCanceled ? "CANCELADA" : mapped.isValidSale ? "CONFIRMADA" : null,
			dataVenda: mapped.dataVenda.toISOString(),
			descontosTotal: mapped.descontoTotal,
			acrescimosTotal: mapped.taxaEntrega + mapped.taxaServico + mapped.taxaAdicional,
		};
		if (matches.length === 0) {
			add("AUSENTE_NO_APP", { esperado: expected, statusOrigem: order.status });
			continue;
		}
		if (matches.length > 1) {
			add("DUPLICADA_NO_APP", { esperado: expected, vendas: matches });
			continue;
		}
		const actual = matches[0];
		const fields = compareAuditSaleHeaders(actual, { ...expected, situacao: expected.natureza });
		if (fields.length) add("DIVERGENTE", { campos: fields, esperado: expected, atual: actual, statusOrigem: order.status });
		else aligned++;
		if (!actual.integracaoId) add("PROVENIENCIA_LEGADA", { vendaId: actual.id, idExterno: actual.idExterno });
	}
	const failedIds = new Set((failures as Array<{ idExterno: string }>).map((f) => f.idExterno));
	for (const sale of candidates.filter((s) => inWindow(s.dataVenda))) {
		if (!sourceIds.has(sale.idExterno) && !failedIds.has(sale.idExterno)) add("AUSENTE_NA_ORIGEM", { atual: sale });
	}
	const appInWindow = candidates.filter((s) => inWindow(s.dataVenda));
	const report = {
		organizacaoId: ORGANIZATION_ID,
		integracaoId: INTEGRATION_ID,
		inicio: START,
		fimExclusivo: END,
		geradoEm: new Date().toISOString(),
		completo: failures.length === 0,
		alinhadoNosCamposComparados: failures.length === 0 && differences.length === 0,
		pedidosHistorico: summaries.length,
		pedidosOrigemNoPeriodo: sourceIds.size,
		vendasAppNoPeriodo: appInWindow.length,
		vendasInternasPOIAssociadas: internalSales.length,
		valorVendasInternasPOIAssociadas: internalSales.reduce((sum, s) => sum + cents(s.valorTotal), 0) / 100,
		vendasAlinhadas: aligned,
		falhasDetalhes: failures.length,
		ocorrencias: counts,
		totalVendasValidasOrigem: totalSource / 100,
		totalVendasSN01App: appInWindow.filter((s) => s.natureza === "SN01").reduce((sum, s) => sum + cents(s.valorTotal), 0) / 100,
		limites: [
			"Histórico fechado/cancelado, pela data de criação em America/Sao_Paulo.",
			"Comparação de cabeçalhos; itens, pagamentos e identidade do cliente ainda não auditados.",
			"Cache retomável: --refresh coleta uma nova versão da origem.",
			"Ausência na origem exige investigação; não é autorização para excluir.",
			"Nenhuma venda, saldo, transação ou integração foi alterada.",
		],
	};
	save("differences.json", differences);
	save("internal-poi-sales.json", internalSales);
	save("report.json", report);
	save("progress.json", { completo: report.completo, fase: "FINALIZADA", atualizadoEm: new Date().toISOString() });
	console.log(JSON.stringify(report, null, 2));
	if (failures.length) process.exitCode = 2;
}

mkdirSync(join(outputDir, "details"), { recursive: true });
main()
	.catch((error) => {
		console.error("Auditoria interrompida:", safeError(error));
		process.exitCode = 1;
	})
	.finally(() => connection.end());

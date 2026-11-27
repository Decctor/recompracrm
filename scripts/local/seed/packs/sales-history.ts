import { createAndConfirmSale } from "@/lib/sales/create-and-confirm-sale";
import type { TCreateAndConfirmSaleInput } from "@/schemas/sale-checkout";
import { connection } from "@/services/drizzle";
import dayjs from "dayjs";
import { SEED_CASHBACK_PROGRAM, SEED_CLIENTS, SEED_PRODUCTS, SEED_SELLERS, SEED_USERS } from "../ids";
import { createSeedActorSession } from "../session";

const HISTORY_DAYS = 90;

/** Deterministic pseudo-random numbers: the same history on every machine. */
function createRandom(seed: number) {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
}

type TSeedProduct = (typeof SEED_PRODUCTS)[keyof typeof SEED_PRODUCTS];
const PLAIN_PRODUCTS: TSeedProduct[] = [SEED_PRODUCTS.water, SEED_PRODUCTS.soda, SEED_PRODUCTS.coxinha, SEED_PRODUCTS.brigadeiro, SEED_PRODUCTS.cake];

/** How often each client buys: the mix keeps the seeded RFM labels plausible. */
const CLIENT_WEIGHTS: { clienteId: string | null; weight: number; maxDaysAgo: number; minDaysAgo: number }[] = [
	{ clienteId: null, weight: 6, minDaysAgo: 0, maxDaysAgo: HISTORY_DAYS }, // walk-in, no customer linked
	{ clienteId: SEED_CLIENTS.maria.id, weight: 5, minDaysAgo: 0, maxDaysAgo: HISTORY_DAYS },
	{ clienteId: SEED_CLIENTS.joao.id, weight: 3, minDaysAgo: 5, maxDaysAgo: HISTORY_DAYS },
	{ clienteId: SEED_CLIENTS.paula.id, weight: 1, minDaysAgo: 2, maxDaysAgo: 8 },
	{ clienteId: SEED_CLIENTS.lucas.id, weight: 1, minDaysAgo: 30, maxDaysAgo: 50 },
	{ clienteId: SEED_CLIENTS.rafael.id, weight: 1, minDaysAgo: 75, maxDaysAgo: HISTORY_DAYS },
];

function buildItem(product: TSeedProduct, quantidade: number): TCreateAndConfirmSaleInput["itens"][number] {
	const total = Math.round(product.precoVenda * quantidade * 100) / 100;
	return {
		produtoId: product.id,
		produtoVarianteId: null,
		nome: product.nome,
		codigo: product.codigo,
		quantidade,
		valorUnitarioBase: product.precoVenda,
		valorModificadores: 0,
		valorUnitarioFinal: product.precoVenda,
		valorTotalBruto: total,
		valorDesconto: 0,
		valorTotalLiquido: total,
		modificadores: [],
	};
}

/**
 * The confirmation pipeline stamps "now" everywhere. Moving a sale into the past means shifting
 * every timestamp it wrote by the same interval — sale, accounting entry, financial
 * transactions, stock and cashback movements — so the dashboards read a coherent history.
 */
async function backdateSale(saleId: string, interval: string) {
	await connection.begin(async (sql) => {
		await sql`UPDATE ampmais_sales SET data_venda = data_venda - ${interval}::interval WHERE id = ${saleId}`;
		await sql`UPDATE ampmais_financial_transactions SET data_previsao = data_previsao - ${interval}::interval, data_efetivacao = data_efetivacao - ${interval}::interval, data_insercao = data_insercao - ${interval}::interval WHERE lancamento_contabil_id IN (SELECT id FROM ampmais_accounting_entries WHERE venda_id = ${saleId})`;
		await sql`UPDATE ampmais_accounting_entries SET data_competencia = data_competencia - ${interval}::interval, data_insercao = data_insercao - ${interval}::interval WHERE venda_id = ${saleId}`;
		await sql`UPDATE ampmais_product_stock_transactions SET data_insercao = data_insercao - ${interval}::interval WHERE venda_id = ${saleId}`;
		await sql`UPDATE ampmais_cashback_program_transactions SET data_insercao = data_insercao - ${interval}::interval, expiracao_data = expiracao_data - ${interval}::interval WHERE venda_id = ${saleId}`;
	});
}

/**
 * About 90 days of confirmed counter sales, so the hub, Vendas > Resultados and the finance
 * overview have something to show.
 *
 * Every sale goes through `createAndConfirmSale` as the admin — pricing validation, stock,
 * accounting, cashback accrual — and is then moved to its day. No sale lands "today": that keeps
 * "vendas de hoje" at zero for specs that sell and assert the number.
 */
export async function seedSalesHistoryPack() {
	const session = await createSeedActorSession(SEED_USERS.admin.id);
	const random = createRandom(20261123);
	const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
	const sellers = [SEED_SELLERS.admin, SEED_SELLERS.operator, SEED_SELLERS.counter];
	const weightedClients = CLIENT_WEIGHTS.flatMap((entry) => Array.from({ length: entry.weight }, () => entry));
	const methods = ["DINHEIRO", "PIX", "PIX", "CARTAO_DEBITO", "CARTAO_CREDITO"] as const;

	let created = 0;
	for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
		const date = dayjs().subtract(daysAgo, "day");
		// Fewer sales on Sundays, a slow upward trend towards today.
		const base = date.day() === 0 ? 0.6 : 1.6 + (HISTORY_DAYS - daysAgo) / 60;
		const salesToday = Math.floor(base + random() * 1.5);

		for (let index = 0; index < salesToday; index++) {
			const eligible = weightedClients.filter((entry) => daysAgo >= entry.minDaysAgo && daysAgo <= entry.maxDaysAgo);
			const { clienteId } = pick(eligible);
			const seller = pick(sellers);
			const itens = Array.from({ length: 1 + Math.floor(random() * 3) }, () => buildItem(pick(PLAIN_PRODUCTS), 1 + Math.floor(random() * 3)));
			const valorTotal = Math.round(itens.reduce((sum, item) => sum + item.valorTotalLiquido, 0) * 100) / 100;

			const result = await createAndConfirmSale({
				actor: { kind: "USER", session },
				input: {
					clienteId,
					vendedorId: seller.id,
					vendedorNome: seller.nome,
					entregaModalidade: "PRESENCIAL",
					itens,
					pagamentos: [{ metodo: pick([...methods]), valor: valorTotal, efetivacaoTipo: "IMEDIATA", dataPrevisao: dayjs().format("YYYY-MM-DD") }],
					cashbackResgate: 0,
					cashbackProgramaId: clienteId ? SEED_CASHBACK_PROGRAM.id : null,
				},
			});

			// Spread through opening hours (09:00–19:00), keeping the day.
			const target = date.hour(9 + Math.floor(random() * 10)).minute(Math.floor(random() * 60));
			const seconds = Math.max(60, dayjs().diff(target, "second"));
			await backdateSale(result.data.saleId, `${seconds} seconds`);
			created++;
		}
	}

	// The clients' purchase summary follows the moved sales (the pipeline wrote "now").
	await connection`
		UPDATE ampmais_clients c SET
			primeira_compra_data = s.primeira, ultima_compra_data = s.ultima,
			metadata_total_compras = s.total, metadata_valor_total_compras = s.valor
		FROM (
			SELECT cliente_id, min(data_venda) AS primeira, max(data_venda) AS ultima, count(*)::int AS total, sum(valor_total) AS valor
			FROM ampmais_sales WHERE status_venda = 'CONFIRMADA' AND cliente_id IS NOT NULL GROUP BY cliente_id
		) s WHERE s.cliente_id = c.id`;
	console.log(`[local-dev]   ${created} confirmed sales over ${HISTORY_DAYS} days.`);
}

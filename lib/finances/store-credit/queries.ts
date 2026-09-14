import dayjs from "dayjs";
import { and, asc, count, eq, gte, isNull, lte, ne, notInArray, or, type SQL, sql } from "drizzle-orm";
import { formatAsNumber } from "@/lib/formatting";
import { db } from "@/services/drizzle";
import { accountingEntries, clients, financialTransactions, sales } from "@/services/drizzle/schema";
import { bucketStoreCreditByAging, getStoreCreditAgingDueDateRange, type TStoreCreditAgingBucket } from "./aging";
import {
	STORE_CREDIT_METHOD,
	STORE_CREDIT_RECEIPT_ORIGIN,
	STORE_CREDIT_UNLINKED_CLIENT_ID,
	type TStoreCreditSortDirection,
	type TStoreCreditSortField,
	type TStoreCreditStatus,
} from "./constants";

export const STORE_CREDIT_PAGE_SIZE = 25;

/** Status de provedor que marcam uma movimentação desfeita: o cancelamento não apaga a linha. */
const REVERSED_PROVIDER_STATUSES = ["CANCELADO", "ESTORNADO"];

/**
 * O universo do módulo: movimentações de ENTRADA que são, ou já foram, um fiado.
 *
 * O predicado tem duas pernas porque a baixa troca `metodo` pela forma real do recebimento — o
 * fiado quitado em dinheiro deixa de ser `FIADO_NOTA` e só é reconhecível pelo carimbo de origem.
 * A primeira perna, por sua vez, recupera o fiado efetivado pela tela genérica de movimentações,
 * que não carimba origem nenhuma e mantém o método original.
 *
 * Pressupõe o `innerJoin` com `accountingEntries` e o `leftJoin` com `sales` montados pelo chamador.
 */
function buildStoreCreditUniverseConditions(organizacaoId: string): SQL<unknown>[] {
	const conditions: (SQL<unknown> | undefined)[] = [
		eq(financialTransactions.organizacaoId, organizacaoId),
		eq(financialTransactions.tipo, "ENTRADA"),
		or(
			eq(financialTransactions.metodo, STORE_CREDIT_METHOD),
			sql`${financialTransactions.modificadoresMetadata}->>'origem' = ${STORE_CREDIT_RECEIPT_ORIGIN}`,
		),
		// Venda cancelada mantém a movimentação na base, apenas marcada — precisa sair da cobrança.
		or(isNull(sales.statusVenda), ne(sales.statusVenda, "CANCELADA")),
		or(isNull(financialTransactions.provedorStatus), notInArray(financialTransactions.provedorStatus, REVERSED_PROVIDER_STATUSES)),
	];
	return conditions.filter((condition): condition is SQL<unknown> => !!condition);
}

/**
 * Um `Date` interpolado num template `sql` cru não passa pelo conversor da coluna: o drizzle o
 * entrega ao driver como está e o postgres.js estoura com "The string argument must be of type
 * string ... Received an instance of Date". Os operadores tipados (`gte`, `lte`) não têm esse
 * problema porque conhecem a coluna; em SQL cru, a data precisa virar texto aqui.
 *
 * O ISO com `Z` é o mesmo instante que o conversor do drizzle grava para estas colunas
 * (`timestamp` sem fuso, normalizado em UTC), então os dois caminhos comparam a mesma coisa.
 */
function toSqlTimestamp(date: Date) {
	return date.toISOString();
}

const isOpenTitle = sql`${financialTransactions.dataEfetivacao} is null`;

/**
 * Projeção da chave do cliente: o id da venda, ou o balde de órfãos quando a venda perdeu o cliente.
 *
 * O `GROUP BY` agrupa por `sales.clienteId` cru, NÃO por esta expressão. O drizzle serializa o mesmo
 * template `sql` uma vez por cláusula e renumera os parâmetros a cada vez, então a mesma expressão
 * sai como `coalesce(cliente_id, $1)` no SELECT e `coalesce(cliente_id, $9)` no GROUP BY — e o
 * Postgres, que compara as duas estruturalmente, não as reconhece como iguais e exige `cliente_id`
 * no GROUP BY. Agrupar pela coluna resolve na origem: o `coalesce` é função do que foi agrupado.
 */
const clientKeyProjection = sql<string>`coalesce(${sales.clienteId}, ${STORE_CREDIT_UNLINKED_CLIENT_ID})`;

const saldoAbertoExpression = sql<number>`coalesce(sum(case when ${financialTransactions.dataEfetivacao} is null then ${financialTransactions.valor} else 0 end), 0)`;
const previsaoMaisAntigaExpression = sql<Date | null>`min(${financialTransactions.dataPrevisao}) filter (where ${isOpenTitle})`;

export type TStoreCreditClientsFilters = {
	organizacaoId: string;
	search?: string | null;
	statuses?: TStoreCreditStatus[];
	agingBuckets?: TStoreCreditAgingBucket[];
	sortField?: TStoreCreditSortField;
	sortDirection?: TStoreCreditSortDirection;
	page?: number;
};

function buildStoreCreditHavingConditions({
	statuses,
	agingBuckets,
	referenceDate,
}: {
	statuses: TStoreCreditStatus[];
	agingBuckets: TStoreCreditAgingBucket[];
	referenceDate: Date;
}) {
	const startOfToday = dayjs(referenceDate).startOf("day").toDate();
	const havingConditions: SQL<unknown>[] = [];

	if (statuses.length > 0) {
		const statusConditions: SQL<unknown>[] = [];
		if (statuses.includes("EM_ABERTO")) statusConditions.push(sql`${saldoAbertoExpression} > 0`);
		if (statuses.includes("VENCIDO")) statusConditions.push(sql`${previsaoMaisAntigaExpression} < ${toSqlTimestamp(startOfToday)}`);
		if (statuses.includes("QUITADO")) statusConditions.push(sql`${saldoAbertoExpression} <= 0`);
		const combined = or(...statusConditions);
		if (combined) havingConditions.push(combined);
	}

	if (agingBuckets.length > 0) {
		// A faixa qualifica o cliente pelo título em aberto mais antigo: é o atraso que ele carrega.
		const bucketConditions: SQL<unknown>[] = [];
		for (const bucket of agingBuckets) {
			const { from, to } = getStoreCreditAgingDueDateRange(bucket, referenceDate);
			const bounds: SQL<unknown>[] = [];
			if (from) bounds.push(sql`${previsaoMaisAntigaExpression} >= ${toSqlTimestamp(from)}`);
			if (to) bounds.push(sql`${previsaoMaisAntigaExpression} <= ${toSqlTimestamp(to)}`);
			const combinedBounds = bounds.length > 0 ? and(...bounds) : null;
			if (combinedBounds) bucketConditions.push(combinedBounds);
		}
		const combined = or(...bucketConditions);
		if (combined) havingConditions.push(combined);
	}

	return havingConditions;
}

/**
 * Listagem agregada por cliente — a espinha da aba.
 *
 * Pagina sobre o cliente agregado, nunca sobre a movimentação: paginar nos títulos devolveria meio
 * cliente numa página e o resto na seguinte, com os totais da linha errados nas duas.
 */
export async function getStoreCreditClients(filters: TStoreCreditClientsFilters) {
	const { organizacaoId, search, statuses = [], agingBuckets = [], sortField = "saldo", sortDirection = "desc", page = 1 } = filters;
	const referenceDate = new Date();

	const whereConditions = buildStoreCreditUniverseConditions(organizacaoId);
	const trimmedSearch = search?.trim();
	if (trimmedSearch) {
		const searchCondition = or(
			sql`${clients.nome} ilike '%' || ${trimmedSearch} || '%'`,
			sql`${clients.telefone} ilike '%' || ${trimmedSearch} || '%'`,
			sql`${clients.cpfCnpj} ilike '%' || ${trimmedSearch} || '%'`,
		);
		if (searchCondition) whereConditions.push(searchCondition);
	}

	const havingConditions = buildStoreCreditHavingConditions({ statuses, agingBuckets, referenceDate });

	/** Só a chave, para o `count` sobre a subconsulta: projetar os agregados ali dentro produziria
	 *  nomes de coluna repetidos (`max`, `count`, `coalesce`...), que o Postgres recusa num FROM. */
	function buildMatchedSubquery() {
		return db
			.select({ clienteId: sales.clienteId })
			.from(financialTransactions)
			.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
			.leftJoin(sales, eq(accountingEntries.vendaId, sales.id))
			.leftJoin(clients, eq(sales.clienteId, clients.id))
			.where(and(...whereConditions))
			.groupBy(sales.clienteId)
			.having(havingConditions.length > 0 ? and(...havingConditions) : undefined);
	}

	function buildGroupedQuery() {
		return db
			.select({
				clienteId: clientKeyProjection,
				clienteNome: sql<string | null>`max(${clients.nome})`,
				clienteTelefone: sql<string | null>`max(${clients.telefone})`,
				saldoAberto: saldoAbertoExpression,
				titulosAbertos: sql<number>`count(*) filter (where ${isOpenTitle})`,
				previsaoMaisAntiga: previsaoMaisAntigaExpression,
				totalRecebido: sql<number>`coalesce(sum(case when ${financialTransactions.dataEfetivacao} is not null then ${financialTransactions.valor} else 0 end), 0)`,
				titulosQuitados: sql<number>`count(*) filter (where ${financialTransactions.dataEfetivacao} is not null)`,
				ultimoRecebimento: sql<Date | null>`max(${financialTransactions.dataEfetivacao})`,
			})
			.from(financialTransactions)
			.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
			.leftJoin(sales, eq(accountingEntries.vendaId, sales.id))
			.leftJoin(clients, eq(sales.clienteId, clients.id))
			.where(and(...whereConditions))
			.groupBy(sales.clienteId)
			.having(havingConditions.length > 0 ? and(...havingConditions) : undefined);
	}

	const direction = sql.raw(sortDirection === "asc" ? "asc" : "desc");
	const orderByExpression =
		sortField === "nome"
			? sql`max(${clients.nome}) ${direction}`
			: sortField === "previsao"
				? // Cliente sem título em aberto não tem previsão; jogá-lo para o fim mantém o topo da
					// lista com quem precisa de cobrança, nas duas direções.
					sql`${previsaoMaisAntigaExpression} ${direction} nulls last`
				: sql`${saldoAbertoExpression} ${direction}`;

	const [matchedRows, rows] = await Promise.all([
		db.select({ count: count() }).from(buildMatchedSubquery().as("store_credit_clients")),
		buildGroupedQuery()
			.orderBy(orderByExpression)
			.limit(STORE_CREDIT_PAGE_SIZE)
			.offset(STORE_CREDIT_PAGE_SIZE * (page - 1)),
	]);

	const clientesMatched = matchedRows[0]?.count ?? 0;

	return {
		clientes: rows.map((row) => {
			const semCliente = row.clienteId === STORE_CREDIT_UNLINKED_CLIENT_ID;
			return {
				clienteId: row.clienteId,
				nome: semCliente ? "Sem cliente vinculado" : (row.clienteNome ?? "Cliente sem nome"),
				telefone: semCliente ? null : row.clienteTelefone,
				semCliente,
				saldoAberto: formatAsNumber(row.saldoAberto),
				titulosAbertos: formatAsNumber(row.titulosAbertos),
				previsaoMaisAntiga: row.previsaoMaisAntiga,
				totalRecebido: formatAsNumber(row.totalRecebido),
				titulosQuitados: formatAsNumber(row.titulosQuitados),
				ultimoRecebimento: row.ultimoRecebimento,
			};
		}),
		clientesMatched,
		totalPages: Math.ceil(clientesMatched / STORE_CREDIT_PAGE_SIZE),
	};
}

export type TStoreCreditClientsResult = Awaited<ReturnType<typeof getStoreCreditClients>>;
export type TStoreCreditClientRow = TStoreCreditClientsResult["clientes"][number];

/**
 * Títulos de um cliente: os em aberto e, quando pedido, o histórico já recebido.
 *
 * Uma linha é uma movimentação, e como a baixa parcial faz split, o `valor` de uma linha em aberto
 * já É o saldo devedor — não existe "valor original menos recebido" a calcular em lugar nenhum.
 */
export async function getStoreCreditClientTitles({
	organizacaoId,
	clienteId,
	includeSettled = false,
}: {
	organizacaoId: string;
	clienteId: string;
	includeSettled?: boolean;
}) {
	const conditions = buildStoreCreditUniverseConditions(organizacaoId);
	conditions.push(clienteId === STORE_CREDIT_UNLINKED_CLIENT_ID ? isNull(sales.clienteId) : eq(sales.clienteId, clienteId));
	if (!includeSettled) conditions.push(isNull(financialTransactions.dataEfetivacao));

	const rows = await db
		.select({
			transacaoId: financialTransactions.id,
			titulo: financialTransactions.titulo,
			valor: financialTransactions.valor,
			metodo: financialTransactions.metodo,
			dataPrevisao: financialTransactions.dataPrevisao,
			dataEfetivacao: financialTransactions.dataEfetivacao,
			dataInsercao: financialTransactions.dataInsercao,
			origem: sql<string | null>`${financialTransactions.modificadoresMetadata}->>'origem'`,
			lancamentoContabilId: financialTransactions.lancamentoContabilId,
			vendaId: accountingEntries.vendaId,
			vendaDataVenda: sales.dataVenda,
			vendaValorTotal: sales.valorTotal,
			contaFinanceiraId: financialTransactions.contaFinanceiraId,
		})
		.from(financialTransactions)
		.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
		.leftJoin(sales, eq(accountingEntries.vendaId, sales.id))
		.where(and(...conditions))
		.orderBy(asc(financialTransactions.dataPrevisao), asc(financialTransactions.id));

	return rows.map((row) => ({
		...row,
		valor: formatAsNumber(row.valor),
		vendaValorTotal: row.vendaValorTotal === null ? null : formatAsNumber(row.vendaValorTotal),
		emAberto: !row.dataEfetivacao,
	}));
}

export type TStoreCreditClientTitles = Awaited<ReturnType<typeof getStoreCreditClientTitles>>;

/**
 * Indicadores do topo da aba. Cada um responde uma pergunta diferente: quanto está na rua, quanto
 * já passou do prazo, se a cobrança está funcionando e quanto tempo o fiado costuma levar.
 *
 * O período governa apenas o recebido — dívida em aberto não tem período, tem idade.
 */
export async function getStoreCreditStats({
	organizacaoId,
	periodAfter,
	periodBefore,
}: {
	organizacaoId: string;
	periodAfter: Date;
	periodBefore: Date;
}) {
	const referenceDate = new Date();
	// A janela anterior encosta na atual (termina 1ms antes), então o intervalo [anterior, atual] é
	// contínuo e um único `case` separa os dois grupos sem deixar buraco no meio.
	const periodLengthMs = Math.max(1, periodBefore.getTime() - periodAfter.getTime());
	const previousPeriodAfter = new Date(periodAfter.getTime() - periodLengthMs);
	const periodAfterSql = toSqlTimestamp(periodAfter);

	const universeConditions = buildStoreCreditUniverseConditions(organizacaoId);

	const [openRows, receivedRows, settlementRows] = await Promise.all([
		db
			.select({
				clienteId: clientKeyProjection,
				valor: financialTransactions.valor,
				dataPrevisao: financialTransactions.dataPrevisao,
			})
			.from(financialTransactions)
			.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
			.leftJoin(sales, eq(accountingEntries.vendaId, sales.id))
			.where(and(...universeConditions, isNull(financialTransactions.dataEfetivacao))),
		// Agregação condicional em vez de `group by case when ... >= $x`: agrupar por uma expressão
		// com parâmetro esbarra na renumeração do drizzle (ver `clientKeyProjection`), e uma linha só
		// com os dois períodos ainda economiza uma varredura.
		db
			.select({
				totalAtual: sql<number>`coalesce(sum(case when ${financialTransactions.dataEfetivacao} >= ${periodAfterSql} then ${financialTransactions.valor} else 0 end), 0)`,
				titulosAtual: sql<number>`count(*) filter (where ${financialTransactions.dataEfetivacao} >= ${periodAfterSql})`,
				totalAnterior: sql<number>`coalesce(sum(case when ${financialTransactions.dataEfetivacao} < ${periodAfterSql} then ${financialTransactions.valor} else 0 end), 0)`,
			})
			.from(financialTransactions)
			.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
			.leftJoin(sales, eq(accountingEntries.vendaId, sales.id))
			.where(
				and(
					...universeConditions,
					gte(financialTransactions.dataEfetivacao, previousPeriodAfter),
					lte(financialTransactions.dataEfetivacao, periodBefore),
				),
			),
		db
			.select({
				// Prazo real do fiado: da venda até o dinheiro entrar. Sem venda vinculada, a criação
				// da própria movimentação é a melhor origem disponível.
				mediaDias: sql<
					number | null
				>`avg(extract(epoch from (${financialTransactions.dataEfetivacao} - coalesce(${sales.dataVenda}, ${financialTransactions.dataInsercao}))) / 86400)`,
				titulos: sql<number>`count(*)`,
			})
			.from(financialTransactions)
			.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
			.leftJoin(sales, eq(accountingEntries.vendaId, sales.id))
			.where(
				and(...universeConditions, gte(financialTransactions.dataEfetivacao, periodAfter), lte(financialTransactions.dataEfetivacao, periodBefore)),
			),
	]);

	const startOfToday = dayjs(referenceDate).startOf("day").toDate();
	const openTitles = openRows.map((row) => ({ ...row, valor: formatAsNumber(row.valor) }));

	const clientesEmAberto = new Set<string>();
	const clientesVencidos = new Set<string>();
	let totalEmAberto = 0;
	let totalVencido = 0;

	for (const title of openTitles) {
		totalEmAberto += title.valor;
		clientesEmAberto.add(title.clienteId);
		if (title.dataPrevisao && title.dataPrevisao < startOfToday) {
			totalVencido += title.valor;
			clientesVencidos.add(title.clienteId);
		}
	}

	const recebido = receivedRows[0];
	const settlement = settlementRows[0];
	const titulosQuitadosNaJanela = formatAsNumber(settlement?.titulos ?? 0);

	return {
		periodo: { inicio: periodAfter, fim: periodBefore },
		totalEmAberto,
		clientesEmAberto: clientesEmAberto.size,
		titulosEmAberto: openTitles.length,
		totalVencido,
		clientesVencidos: clientesVencidos.size,
		recebidoNoPeriodo: formatAsNumber(recebido?.totalAtual ?? 0),
		recebidoNoPeriodoAnterior: formatAsNumber(recebido?.totalAnterior ?? 0),
		titulosRecebidosNoPeriodo: formatAsNumber(recebido?.titulosAtual ?? 0),
		// Sem quitação no período não há média a informar. Zero seria uma afirmação que o dado não faz.
		prazoMedioQuitacaoDias:
			titulosQuitadosNaJanela > 0 && settlement?.mediaDias !== null && settlement?.mediaDias !== undefined ? formatAsNumber(settlement.mediaDias) : null,
		faixas: bucketStoreCreditByAging(openTitles, referenceDate),
	};
}

export type TStoreCreditStats = Awaited<ReturnType<typeof getStoreCreditStats>>;

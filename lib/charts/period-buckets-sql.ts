import type { TChartBucket } from "@/lib/charts/period-buckets";
import { type SQL, sql } from "drizzle-orm";

/**
 * Posição (1-based) do intervalo de `getChartBuckets` em que cai um timestamp — para agrupar a série
 * direto no banco, um registro por intervalo. 0 = antes do primeiro intervalo.
 *
 * Agrupar por intervalo, e não por dia, é o que mantém certas as contagens distintas ("clientes
 * ativos" numa semana não é a soma dos ativos de cada dia) e os gráficos por hora.
 *
 * Os inícios entram como literal — números calculados aqui, nunca entrada do usuário — para a
 * expressão sair com texto idêntico no SELECT e no GROUP BY (ver `OPERATION_TIMEZONE_LITERAL` em
 * `lib/operation-timezone.ts`). As colunas de data são `timestamp` sem fuso guardando UTC, e
 * `extract(epoch ...)` as lê como UTC; os limites já vêm alinhados ao calendário de São Paulo.
 *
 * `width_bucket` sozinho jogaria tudo que passa do último início na última posição — um filtro
 * de período frouxo (ex.: "fim do dia" em UTC) despejaria horas do dia seguinte no último ponto.
 * Por isso o fim do último intervalo também entra: depois dele, a posição é 0, como antes do início.
 */
export function chartBucketPositionSql(column: SQL | unknown, buckets: TChartBucket[]): SQL<number> {
	const starts = buckets.map((bucket) => bucket.start);
	if (!starts.every(Number.isFinite)) throw new Error("Intervalos de gráfico inválidos.");
	if (starts.length === 0) return sql<number>`0`;
	const lastEnd = buckets[buckets.length - 1].end;
	if (!Number.isFinite(lastEnd)) throw new Error("Intervalos de gráfico inválidos.");
	const epochMs = sql`(extract(epoch from ${column}) * 1000)::float8`;
	const startsLiteral = sql.raw(`ARRAY[${starts.join(",")}]::float8[]`);
	const lastEndLiteral = sql.raw(`${lastEnd}::float8`);
	return sql<number>`(case when ${epochMs} >= ${lastEndLiteral} then 0 else width_bucket(${epochMs}, ${startsLiteral}) end)`;
}

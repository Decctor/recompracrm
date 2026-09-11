import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { clients, sales } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/** Janela que define uma base "ativa": quem não compra há mais de um ano saiu dela. */
const ACTIVE_BASE_MONTHS = 12;
const SPARKLINE_WEEKS = 7;
const MAX_WINDOW_DAYS = 180;

/**
 * Pulso do relacionamento: o tamanho da base que compra e o quanto ela volta.
 *
 * Dois números que a aba de Relacionamento mede lado a lado, na mesma janela, para que a comparação
 * entre eles seja honesta. A taxa de recompra vem com o período anterior junto — o dashboard não
 * tem filtros, então a única referência que ele pode mostrar é a do próprio histórico da loja, e
 * não um benchmark de mercado que não temos.
 */
const GetRelationshipPulseInputSchema = z.object({
	days: z
		.string({ invalid_type_error: "Tipo inválido para a janela em dias." })
		.optional()
		.nullable()
		.transform((v) => (v ? Math.min(Math.max(Number(v), 7), MAX_WINDOW_DAYS) : 30)),
});
export type TGetRelationshipPulseInput = z.infer<typeof GetRelationshipPulseInputSchema>;

/**
 * Clientes distintos com 1+ e com 2+ compras confirmadas no intervalo. A recompra é a razão entre
 * os dois: de quem comprou, quantos voltaram dentro da mesma janela.
 */
async function countRepeatBuyers({ organizacaoId, after, before }: { organizacaoId: string; after: Date; before: Date }) {
	const perClient = db
		.select({ clienteId: sales.clienteId, compras: sql<number>`count(*)`.as("compras") })
		.from(sales)
		.where(
			and(
				eq(sales.organizacaoId, organizacaoId),
				eq(sales.statusVenda, "CONFIRMADA"),
				sql`${sales.clienteId} is not null`,
				gte(sales.dataVenda, after),
				lt(sales.dataVenda, before),
			),
		)
		.groupBy(sales.clienteId)
		.as("compras_por_cliente");

	const [row] = await db
		.select({
			compradores: sql<number>`count(*)`,
			recorrentes: sql<number>`count(*) filter (where ${perClient.compras} > 1)`,
		})
		.from(perClient);

	const compradores = Number(row?.compradores ?? 0);
	const recorrentes = Number(row?.recorrentes ?? 0);
	return { compradores, recorrentes, taxa: compradores > 0 ? (recorrentes / compradores) * 100 : 0 };
}

async function getRelationshipPulse({ input, session }: { input: TGetRelationshipPulseInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const now = dayjs();
	const windowStart = now.subtract(input.days, "day").toDate();
	const previousStart = now.subtract(input.days * 2, "day").toDate();
	const activeSince = now.subtract(ACTIVE_BASE_MONTHS, "month").toDate();
	// Semanas fechadas de 7 dias contadas para trás a partir de agora: a última barra é a semana
	// corrente, que é a que a loja está vivendo.
	const sparklineStart = now.subtract(SPARKLINE_WEEKS * 7, "day").toDate();
	const weekOffset = sql<number>`floor(extract(epoch from (${now.toISOString()}::timestamp - ${sales.dataVenda})) / 604800)::int`;

	const [ativos, novos, semanais, atual, anterior] = await Promise.all([
		db
			.select({ qtde: sql<number>`count(*)` })
			.from(clients)
			.where(and(eq(clients.organizacaoId, organizacaoId), gte(clients.ultimaCompraData, activeSince))),
		db
			.select({ qtde: sql<number>`count(*)` })
			.from(clients)
			.where(and(eq(clients.organizacaoId, organizacaoId), gte(clients.primeiraCompraData, windowStart))),
		db
			.select({ semanasAtras: weekOffset, clientes: sql<number>`count(distinct ${sales.clienteId})` })
			.from(sales)
			.where(
				and(
					eq(sales.organizacaoId, organizacaoId),
					eq(sales.statusVenda, "CONFIRMADA"),
					sql`${sales.clienteId} is not null`,
					gte(sales.dataVenda, sparklineStart),
				),
			)
			// Posicional: repetir a expressão no GROUP BY bindaria o parâmetro duas vezes e o Postgres
			// deixaria de reconhecê-la como a mesma do SELECT (mesma razão de `sales-pulse`).
			.groupBy(sql`1`),
		countRepeatBuyers({ organizacaoId, after: windowStart, before: now.toDate() }),
		countRepeatBuyers({ organizacaoId, after: previousStart, before: windowStart }),
	]);

	const porSemana = new Map(semanais.map((row) => [Number(row.semanasAtras), Number(row.clientes)]));

	return {
		data: {
			janelaDias: input.days,
			baseAtiva: {
				total: Number(ativos[0]?.qtde ?? 0),
				novos: Number(novos[0]?.qtde ?? 0),
				// Da semana mais antiga para a atual, para o sparkline ler da esquerda para a direita.
				serie: Array.from({ length: SPARKLINE_WEEKS }, (_, index) => {
					const semanasAtras = SPARKLINE_WEEKS - 1 - index;
					return {
						semanaInicio: now.subtract((semanasAtras + 1) * 7, "day").toISOString(),
						clientes: porSemana.get(semanasAtras) ?? 0,
					};
				}),
			},
			taxaRecompra: {
				atual: atual.taxa,
				anterior: anterior.taxa,
				compradores: atual.compradores,
				recorrentes: atual.recorrentes,
			},
		},
		message: "Pulso do relacionamento recuperado com sucesso.",
	};
}
export type TGetRelationshipPulseOutput = Awaited<ReturnType<typeof getRelationshipPulse>>;

async function getRelationshipPulseRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetRelationshipPulseInputSchema.parse({ days: request.nextUrl.searchParams.get("days") });
	const result = await getRelationshipPulse({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getRelationshipPulseRoute });

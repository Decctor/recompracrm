import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Segmentos em que uma chegada recente é um alerta (ver `utils/rfm.ts`): o cliente está esfriando.
const AT_RISK_SEGMENTS = ["PRESTES A DORMIR", "EM RISCO", "NÃO PODE PERDÊ-LOS", "PERDIDOS"] as const;
const CLIENTS_LIMIT = 5;

/**
 * Clientes que mudaram de segmento nos últimos N dias e hoje estão em um segmento de risco. Não
 * existe histórico de segmentação: `analiseRFMUltimaAlteracao` só marca quando o rótulo mudou, então
 * o recorte é "chegou a um segmento de risco recentemente", sem saber de onde veio.
 */
const GetRecentSegmentChangesInputSchema = z.object({
	days: z
		.string({ invalid_type_error: "Tipo inválido para a janela em dias." })
		.optional()
		.nullable()
		.transform((v) => (v ? Math.min(Math.max(Number(v), 1), 30) : 7)),
});
export type TGetRecentSegmentChangesInput = z.infer<typeof GetRecentSegmentChangesInputSchema>;

async function getRecentSegmentChanges({ input, session }: { input: TGetRecentSegmentChangesInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const since = dayjs().subtract(input.days, "day").toDate();
	const conditions = and(
		eq(clients.organizacaoId, organizacaoId),
		inArray(clients.analiseRFMTitulo, [...AT_RISK_SEGMENTS]),
		gte(clients.analiseRFMUltimaAlteracao, since),
	);

	const [totals, top] = await Promise.all([
		db
			.select({
				segmento: clients.analiseRFMTitulo,
				qtde: sql<number>`count(*)`,
				// O histórico de compras de quem esfriou é o que está em jogo — é esse total que a faixa
				// do topo do dashboard chama de "valor em risco".
				valor: sql<number>`coalesce(sum(${clients.metadataValorTotalCompras}), 0)`,
			})
			.from(clients)
			.where(conditions)
			.groupBy(clients.analiseRFMTitulo),
		db
			.select({
				id: clients.id,
				nome: clients.nome,
				telefone: clients.telefone,
				segmento: clients.analiseRFMTitulo,
				valorTotalCompras: clients.metadataValorTotalCompras,
				ultimaCompraData: clients.ultimaCompraData,
				alteradoEm: clients.analiseRFMUltimaAlteracao,
			})
			.from(clients)
			.where(conditions)
			.orderBy(desc(clients.metadataValorTotalCompras))
			.limit(CLIENTS_LIMIT),
	]);

	return {
		data: {
			janelaDias: input.days,
			total: totals.reduce((acc, row) => acc + Number(row.qtde), 0),
			valorEmRisco: totals.reduce((acc, row) => acc + Number(row.valor), 0),
			porSegmento: totals.map((row) => ({ segmento: row.segmento ?? "", qtde: Number(row.qtde), valor: Number(row.valor) })),
			clientes: top,
		},
		message: "Mudanças recentes de segmento recuperadas com sucesso.",
	};
}
export type TGetRecentSegmentChangesOutput = Awaited<ReturnType<typeof getRecentSegmentChanges>>;

async function getRecentSegmentChangesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetRecentSegmentChangesInputSchema.parse({ days: request.nextUrl.searchParams.get("days") });
	const result = await getRecentSegmentChanges({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getRecentSegmentChangesRoute });

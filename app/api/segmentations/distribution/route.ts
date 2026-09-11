import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import { RFMLabels } from "@/utils/rfm";
import dayjs from "dayjs";
import { and, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const MAX_WINDOW_DAYS = 90;

/**
 * Distribuição da base pelos 11 segmentos RFM, com quantos clientes chegaram a cada um na janela.
 *
 * `chegaram` é chegada, não saldo. Não existe histórico de segmentação — `analiseRFMUltimaAlteracao`
 * só marca que o rótulo mudou, sem guardar o rótulo anterior —, então é impossível dizer quantos
 * saíram de um segmento, e portanto impossível calcular uma variação líquida. Quem consumir este
 * campo deve rotulá-lo como "entraram", nunca como "+/-": um segmento com 18 chegadas pode ter
 * encolhido no mesmo período.
 */
const GetSegmentDistributionInputSchema = z.object({
	days: z
		.string({ invalid_type_error: "Tipo inválido para a janela em dias." })
		.optional()
		.nullable()
		.transform((v) => (v ? Math.min(Math.max(Number(v), 1), MAX_WINDOW_DAYS) : 30)),
});
export type TGetSegmentDistributionInput = z.infer<typeof GetSegmentDistributionInputSchema>;

async function getSegmentDistribution({ input, session }: { input: TGetSegmentDistributionInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const since = dayjs().subtract(input.days, "day").toDate();
	const rows = await db
		.select({
			segmento: clients.analiseRFMTitulo,
			qtde: sql<number>`count(*)`,
			chegaram: sql<number>`count(*) filter (where ${clients.analiseRFMUltimaAlteracao} >= ${since.toISOString()}::timestamp)`,
		})
		.from(clients)
		.where(and(eq(clients.organizacaoId, organizacaoId), sql`${clients.analiseRFMTitulo} is not null`))
		.groupBy(clients.analiseRFMTitulo);

	const porSegmento = new Map(rows.map((row) => [row.segmento ?? "", row]));
	// A ordem é a de `utils/rfm.ts` — de Campeões a Perdidos. É o que faz a barra proporcional ler
	// como um gradiente de saúde, e não como uma lista alfabética.
	const segmentos = RFMLabels.map((label) => {
		const row = porSegmento.get(label.text);
		return {
			segmento: label.text,
			qtde: Number(row?.qtde ?? 0),
			chegaram: Number(row?.chegaram ?? 0),
		};
	});

	return {
		data: {
			janelaDias: input.days,
			total: segmentos.reduce((acc, segment) => acc + segment.qtde, 0),
			segmentos,
		},
		message: "Distribuição por segmento recuperada com sucesso.",
	};
}
export type TGetSegmentDistributionOutput = Awaited<ReturnType<typeof getSegmentDistribution>>;

async function getSegmentDistributionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetSegmentDistributionInputSchema.parse({ days: request.nextUrl.searchParams.get("days") });
	const result = await getSegmentDistribution({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSegmentDistributionRoute });

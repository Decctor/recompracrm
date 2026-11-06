import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { resolveClientPortfolioSeller } from "@/lib/client-portfolios/resolve-seller";
import { DEFAULT_PAGE_SIZE, pageSizeInputSchema } from "@/lib/pagination";
import { db } from "@/services/drizzle";
import { clientSellerReferences, clients } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, desc, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const MIN_PURCHASES_FOR_RELIABLE_CYCLE = 3;

const GetPortfolioInputSchema = z.object({
	vendedorId: z
		.string({ invalid_type_error: "Tipo inválido para o ID do vendedor." })
		.optional()
		.nullable()
		.transform((v) => v || null),
	segmento: z
		.string({ invalid_type_error: "Tipo inválido para o segmento." })
		.optional()
		.nullable()
		.transform((v) => v || null),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((v) => (v ? Math.max(1, Number(v)) : 1)),
	pageSize: pageSizeInputSchema(),
});
export type TGetPortfolioInput = z.infer<typeof GetPortfolioInputSchema>;

async function getPortfolio({ input, session }: { input: TGetPortfolioInput; session: TAuthUserSession }) {
	const { organizacaoId, seller } = await resolveClientPortfolioSeller({ session, explicitSellerId: input.vendedorId });
	const PAGE_SIZE = input.pageSize ?? DEFAULT_PAGE_SIZE;

	const baseConditions = [
		eq(clientSellerReferences.organizacaoId, organizacaoId),
		eq(clientSellerReferences.vendedorId, seller.id),
		eq(clientSellerReferences.rankingVinculo, 1),
	];
	const where = and(...baseConditions, input.segmento ? eq(clients.analiseRFMTitulo, input.segmento) : undefined);

	const [totals] = await db
		.select({
			total: count(clientSellerReferences.id),
			maxScore: sql<number>`coalesce(max(${clientSellerReferences.scoreVinculo}), 0)`,
		})
		.from(clientSellerReferences)
		.innerJoin(clients, eq(clientSellerReferences.clienteId, clients.id))
		.where(and(...baseConditions));
	const carteiraTotal = Number(totals?.total ?? 0);
	const maxScore = Number(totals?.maxScore ?? 0);

	const [filteredTotals] = await db
		.select({ total: count(clientSellerReferences.id) })
		.from(clientSellerReferences)
		.innerJoin(clients, eq(clientSellerReferences.clienteId, clients.id))
		.where(where);
	const filteredTotal = Number(filteredTotals?.total ?? 0);

	const rows = await db
		.select({
			clienteId: clientSellerReferences.clienteId,
			clienteNome: clients.nome,
			clienteTelefone: clients.telefone,
			segmento: clients.analiseRFMTitulo,
			totalVendasComVendedor: clientSellerReferences.totalVendas,
			valorTotalComVendedor: clientSellerReferences.valorTotalVendas,
			ultimaVendaComVendedor: clientSellerReferences.ultimaVendaData,
			scoreVinculo: clientSellerReferences.scoreVinculo,
			ltv: clients.metadataValorTotalCompras,
			totalCompras: clients.metadataTotalCompras,
			primeiraCompraData: clients.primeiraCompraData,
			ultimaCompraData: clients.ultimaCompraData,
			comunicacaoPausadaAte: clients.comunicacaoPausadaAte,
		})
		.from(clientSellerReferences)
		.innerJoin(clients, eq(clientSellerReferences.clienteId, clients.id))
		.where(where)
		.orderBy(desc(clientSellerReferences.scoreVinculo))
		.limit(PAGE_SIZE)
		.offset((input.page - 1) * PAGE_SIZE);

	const now = dayjs();
	const carteira = rows.map((row) => {
		const cicloMedioDias =
			row.primeiraCompraData && row.ultimaCompraData && (row.totalCompras ?? 0) >= MIN_PURCHASES_FOR_RELIABLE_CYCLE
				? Math.max(1, Math.round(dayjs(row.ultimaCompraData).diff(row.primeiraCompraData, "day") / ((row.totalCompras ?? 2) - 1)))
				: null;
		return {
			clienteId: row.clienteId,
			nome: row.clienteNome,
			telefone: row.clienteTelefone,
			segmento: row.segmento,
			comprasComVoce: row.totalVendasComVendedor,
			valorComVoce: row.valorTotalComVendedor,
			ultimaCompraComVoce: row.ultimaVendaComVendedor,
			ltv: row.ltv ?? 0,
			cicloMedioDias,
			diasDesdeUltimaCompra: row.ultimaCompraData ? now.diff(dayjs(row.ultimaCompraData), "day") : null,
			// Força do vínculo relativa ao cliente mais forte da carteira (0–100).
			forcaVinculo: maxScore > 0 ? Math.round((row.scoreVinculo / maxScore) * 100) : 0,
			comunicacaoPausada: row.comunicacaoPausadaAte ? dayjs(row.comunicacaoPausadaAte).isAfter(now) : false,
		};
	});

	return {
		data: {
			vendedor: seller,
			carteira,
			carteiraTotal,
			pagination: {
				total: filteredTotal,
				totalPages: Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE)),
				page: input.page,
			},
		},
		message: "Carteira carregada com sucesso.",
	};
}
export type TGetPortfolioOutput = Awaited<ReturnType<typeof getPortfolio>>;

async function getPortfolioRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!session.membership.organizacao.configuracao.preferencias.carteirasClientes?.habilitado)
		throw new createHttpError.Forbidden("O módulo de carteira de clientes não está habilitado para esta organização.");

	const { searchParams } = new URL(request.url);
	const input = GetPortfolioInputSchema.parse({
		vendedorId: searchParams.get("vendedorId"),
		segmento: searchParams.get("segmento"),
		page: searchParams.get("page"),
		pageSize: searchParams.get("pageSize"),
	});
	const result = await getPortfolio({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getPortfolioRoute });

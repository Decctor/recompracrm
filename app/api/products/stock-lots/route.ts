import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canViewInventory } from "@/lib/permissions/inventory";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { StockLotStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { productStockLots } from "@/services/drizzle/schema";
import { and, count, eq, gt, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PAGE_SIZE = 20;

const GetProductStockLotsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo inválido para ID do lote." }).optional().nullable(),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
	search: z.string({ invalid_type_error: "Tipo inválido para busca." }).optional().nullable(),
	status: z
		.string({ invalid_type_error: "Tipo inválido para status." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",") : []))
		.pipe(z.array(StockLotStatusEnum)),
	productId: z.string({ invalid_type_error: "Tipo inválido para ID do produto." }).optional().nullable(),
	productVariantId: z.string({ invalid_type_error: "Tipo inválido para ID da variante." }).optional().nullable(),
	dueInDays: z
		.string({ invalid_type_error: "Tipo inválido para dias até vencimento." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : null)),
});
export type TGetProductStockLotsInput = z.infer<typeof GetProductStockLotsInputSchema>;
export type TGetProductStockLotByIdInput = Pick<TGetProductStockLotsInput, "id">;
export type TGetProductStockLotsDefaultInput = Omit<TGetProductStockLotsInput, "id">;

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

async function getProductStockLots({ input, session }: { input: TGetProductStockLotsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	if (input.id) {
		const stockLot = await db.query.productStockLots.findFirst({
			where: and(eq(productStockLots.id, input.id), eq(productStockLots.organizacaoId, organizationId)),
			with: {
				produto: true,
				produtoVariante: true,
				producao: true,
				compra: true,
			},
		});
		if (!stockLot) throw new createHttpError.NotFound("Lote não encontrado.");

		return {
			data: {
				byId: enrichStockLot(stockLot),
				default: undefined,
			},
			message: "Lote encontrado com sucesso.",
		};
	}

	const now = new Date();
	const conditions = [eq(productStockLots.organizacaoId, organizationId)];
	if (input.search) conditions.push(sql`${productStockLots.codigoLote} ILIKE '%' || ${input.search} || '%'`);
	if (input.productId) conditions.push(eq(productStockLots.produtoId, input.productId));
	if (input.productVariantId) conditions.push(eq(productStockLots.produtoVarianteId, input.productVariantId));
	if (input.dueInDays != null) {
		const dueLimit = new Date(now);
		dueLimit.setDate(dueLimit.getDate() + input.dueInDays);
		conditions.push(
			and(
				eq(productStockLots.status, "ATIVO"),
				gt(productStockLots.quantidadeAtual, 0),
				gte(productStockLots.dataValidade, now),
				lt(productStockLots.dataValidade, dueLimit),
			)!,
		);
	}
	if (input.status.length > 0) {
		const statusConditions = input.status.map((status) => {
			if (status === "ATIVO")
				return and(
					eq(productStockLots.status, "ATIVO"),
					gt(productStockLots.quantidadeAtual, 0),
					or(isNull(productStockLots.dataValidade), gte(productStockLots.dataValidade, now)),
				);
			if (status === "VENCIDO")
				return or(eq(productStockLots.status, "VENCIDO"), and(eq(productStockLots.status, "ATIVO"), lt(productStockLots.dataValidade, now)));
			if (status === "ESGOTADO")
				return or(
					eq(productStockLots.status, "ESGOTADO"),
					and(
						eq(productStockLots.status, "ATIVO"),
						lte(productStockLots.quantidadeAtual, 0),
						or(isNull(productStockLots.dataValidade), gte(productStockLots.dataValidade, now)),
					),
				);
			return eq(productStockLots.status, status);
		});
		conditions.push(or(...statusConditions)!);
	}

	const [totalResult, lotsResult] = await Promise.all([
		db
			.select({ total: count(productStockLots.id) })
			.from(productStockLots)
			.where(and(...conditions)),
		db.query.productStockLots.findMany({
			where: and(...conditions),
			with: {
				produto: { columns: { id: true, nome: true, codigo: true, imagemCapaUrl: true, precoCusto: true } },
				produtoVariante: { columns: { id: true, nome: true, codigo: true, imagemCapaUrl: true, precoCusto: true } },
				producao: { columns: { id: true, titulo: true } },
				compra: { columns: { id: true, titulo: true } },
			},
			orderBy: (fields, { desc }) => desc(fields.dataInsercao),
			limit: PAGE_SIZE,
			offset: (input.page - 1) * PAGE_SIZE,
		}),
	]);

	const stockLotsMatched = Number(totalResult[0]?.total ?? 0);

	return {
		data: {
			byId: undefined,
			default: {
				stockLots: lotsResult.map(enrichStockLot),
				stockLotsMatched,
				totalPages: Math.max(1, Math.ceil(stockLotsMatched / PAGE_SIZE)),
			},
		},
		message: "Lotes encontrados com sucesso.",
	};
}
export type TGetProductStockLotsOutput = Awaited<ReturnType<typeof getProductStockLots>>;
export type TGetProductStockLotsOutputById = Exclude<TGetProductStockLotsOutput["data"]["byId"], undefined>;
export type TGetProductStockLotsOutputDefault = Exclude<TGetProductStockLotsOutput["data"]["default"], undefined>;

async function getProductStockLotsRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canViewInventory(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para visualizar o estoque.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetProductStockLotsInputSchema.parse({
		id: searchParams.get("id"),
		page: searchParams.get("page"),
		search: searchParams.get("search"),
		status: searchParams.get("status"),
		productId: searchParams.get("productId"),
		productVariantId: searchParams.get("productVariantId"),
		dueInDays: searchParams.get("dueInDays"),
	});
	const result = await getProductStockLots({ input, session });
	return NextResponse.json(result);
}

function enrichStockLot<TStockLot extends { status: string; dataValidade: Date | string | null; quantidadeAtual: number }>(stockLot: TStockLot) {
	const now = new Date();
	const validityDate = stockLot.dataValidade ? new Date(stockLot.dataValidade) : null;
	const statusEfetivo =
		stockLot.status === "ATIVO" && validityDate && validityDate < now
			? "VENCIDO"
			: stockLot.quantidadeAtual <= 0 && stockLot.status === "ATIVO"
				? "ESGOTADO"
				: stockLot.status;
	const diasAteValidade = validityDate ? Math.ceil((validityDate.getTime() - now.getTime()) / 86_400_000) : null;
	return {
		...stockLot,
		statusEfetivo,
		diasAteValidade,
	};
}

export const GET = appApiHandler({ GET: getProductStockLotsRoute });

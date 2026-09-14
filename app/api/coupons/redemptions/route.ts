import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { CouponRedemptionSourceEnum, CouponRedemptionStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { clients, couponRedemptions, coupons, sales, users } from "@/services/drizzle/schema";
import { type SQL, and, count, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const PAGE_SIZE = 10;

const GetCouponRedemptionsInputSchema = z.object({
	couponId: z.string({
		required_error: "ID do cupom não informado.",
		invalid_type_error: "Tipo inválido para o ID do cupom.",
	}),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
	search: z.string({ invalid_type_error: "Tipo inválido para busca." }).optional().nullable(),
	statuses: z
		.string({ invalid_type_error: "Tipo inválido para status." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",") : []))
		.pipe(z.array(CouponRedemptionStatusEnum)),
	sources: z
		.string({ invalid_type_error: "Tipo inválido para origem." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",") : []))
		.pipe(z.array(CouponRedemptionSourceEnum)),
	periodAfter: z
		.string({ invalid_type_error: "Tipo inválido para período." })
		.datetime({ message: "Formato inválido para período." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	periodBefore: z
		.string({ invalid_type_error: "Tipo inválido para período." })
		.datetime({ message: "Formato inválido para período." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
});
export type TGetCouponRedemptionsInput = z.infer<typeof GetCouponRedemptionsInputSchema>;

/**
 * Ledger de resgates de um cupom, paginado e filtrável — a aba RESGATES da página do cupom.
 *
 * Diferente do `resgatesRecentes` da rota principal (amostra fixa de 10 para o placar), aqui o
 * cancelado aparece: quem audita um cupom precisa ver o resgate que foi desfeito, não só os que
 * valeram. Os totais das estatísticas continuam contando apenas `UTILIZADO`.
 */
async function getCouponRedemptions({ input, session }: { input: TGetCouponRedemptionsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const coupon = await db.query.coupons.findFirst({
		where: and(eq(coupons.id, input.couponId), eq(coupons.organizacaoId, organizationId)),
		columns: { id: true },
	});
	if (!coupon) throw new createHttpError.NotFound("Cupom não encontrado.");

	const conditions: SQL[] = [eq(couponRedemptions.cupomId, coupon.id), eq(couponRedemptions.organizacaoId, organizationId)];
	if (input.statuses.length > 0) conditions.push(inArray(couponRedemptions.status, input.statuses));
	if (input.sources.length > 0) conditions.push(inArray(couponRedemptions.origemResgate, input.sources));
	if (input.periodAfter) conditions.push(gte(couponRedemptions.dataInsercao, input.periodAfter));
	if (input.periodBefore) conditions.push(lte(couponRedemptions.dataInsercao, input.periodBefore));

	// A busca alcança cliente, operador e identificador externo da venda — os três rótulos que a
	// linha do resgate mostra e pelos quais alguém procuraria um caso específico.
	const searchTerm = input.search?.trim();
	if (searchTerm) {
		const pattern = `%${searchTerm}%`;
		const searchCondition = or(ilike(clients.nome, pattern), ilike(users.nome, pattern), ilike(sales.idExterno, pattern));
		if (searchCondition) conditions.push(searchCondition);
	}

	const page = input.page || 1;
	const baseQuery = db
		.select({
			id: couponRedemptions.id,
			status: couponRedemptions.status,
			valorDesconto: couponRedemptions.valorDesconto,
			vendaValor: couponRedemptions.vendaValor,
			origemResgate: couponRedemptions.origemResgate,
			dataInsercao: couponRedemptions.dataInsercao,
			atribuicaoId: couponRedemptions.atribuicaoId,
			clienteId: couponRedemptions.clienteId,
			clienteNome: clients.nome,
			operadorNome: users.nome,
			vendaId: couponRedemptions.vendaId,
			vendaIdExterno: sales.idExterno,
			vendaVendedorNome: sales.vendedorNome,
		})
		.from(couponRedemptions)
		.leftJoin(clients, eq(couponRedemptions.clienteId, clients.id))
		.leftJoin(users, eq(couponRedemptions.operadorId, users.id))
		.leftJoin(sales, eq(couponRedemptions.vendaId, sales.id));

	const [matchedResult, rows] = await Promise.all([
		db
			.select({ total: count() })
			.from(couponRedemptions)
			.leftJoin(clients, eq(couponRedemptions.clienteId, clients.id))
			.leftJoin(users, eq(couponRedemptions.operadorId, users.id))
			.leftJoin(sales, eq(couponRedemptions.vendaId, sales.id))
			.where(and(...conditions)),
		baseQuery
			.where(and(...conditions))
			.orderBy(desc(couponRedemptions.dataInsercao))
			.offset(PAGE_SIZE * (page - 1))
			.limit(PAGE_SIZE),
	]);

	const redemptionsMatched = matchedResult[0]?.total ?? 0;

	// A origem da atribuição só existe para cupons individuais — `atribuicaoId` nulo é um resgate de
	// cupom global, e a tela mostra isso como tal em vez de inventar uma procedência.
	const grantIds = rows.map((row) => row.atribuicaoId).filter((grantId): grantId is string => !!grantId);
	const grants = grantIds.length
		? await db.query.couponGrants.findMany({
				where: (fields, { inArray: inArrayFilter }) => inArrayFilter(fields.id, grantIds),
				columns: { id: true, origem: true },
				with: { campanha: { columns: { id: true, titulo: true } } },
			})
		: [];
	const grantsById = new Map(grants.map((grant) => [grant.id, grant]));

	const resgates = rows.map((row) => {
		const grant = row.atribuicaoId ? grantsById.get(row.atribuicaoId) : null;
		return {
			id: row.id,
			status: row.status,
			valorDesconto: row.valorDesconto,
			vendaValor: row.vendaValor,
			origemResgate: row.origemResgate,
			dataInsercao: row.dataInsercao,
			cliente: row.clienteId ? { id: row.clienteId, nome: row.clienteNome } : null,
			venda: row.vendaId ? { id: row.vendaId, idExterno: row.vendaIdExterno } : null,
			// O operador é o usuário que registrou o resgate; sem ele, o vendedor da venda é a
			// melhor aproximação de quem estava no balcão.
			operadorNome: row.operadorNome ?? row.vendaVendedorNome ?? null,
			atribuicao: grant ? { id: grant.id, origem: grant.origem, campanha: grant.campanha } : null,
		};
	});

	return {
		data: {
			resgates,
			redemptionsMatched,
			totalPages: Math.ceil(redemptionsMatched / PAGE_SIZE),
		},
		message: "Resgates do cupom encontrados com sucesso.",
	};
}
export type TGetCouponRedemptionsOutput = Awaited<ReturnType<typeof getCouponRedemptions>>;
export type TGetCouponRedemptionsOutputItem = TGetCouponRedemptionsOutput["data"]["resgates"][number];

async function getCouponRedemptionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetCouponRedemptionsInputSchema.parse({
		couponId: request.nextUrl.searchParams.get("couponId") ?? undefined,
		page: request.nextUrl.searchParams.get("page") ?? undefined,
		search: request.nextUrl.searchParams.get("search") ?? undefined,
		statuses: request.nextUrl.searchParams.get("statuses") ?? undefined,
		sources: request.nextUrl.searchParams.get("sources") ?? undefined,
		periodAfter: request.nextUrl.searchParams.get("periodAfter") ?? undefined,
		periodBefore: request.nextUrl.searchParams.get("periodBefore") ?? undefined,
	});
	const result = await getCouponRedemptions({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getCouponRedemptionsRoute });

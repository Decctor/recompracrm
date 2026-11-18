import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanEditCampaigns, assertCanViewCampaigns } from "@/lib/campaigns/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { couponGrants, couponRedemptions, coupons } from "@/services/drizzle/schema";
import { and, count, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetCouponGrantsInputSchema = z.object({
	couponId: z.string({
		required_error: "ID do cupom não informado.",
		invalid_type_error: "Tipo inválido para o ID do cupom.",
	}),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
});
export type TGetCouponGrantsInput = z.infer<typeof GetCouponGrantsInputSchema>;

async function getCouponGrants({ input, session }: { input: TGetCouponGrantsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const PAGE_SIZE = 25;
	const page = input.page || 1;
	const conditions = and(eq(couponGrants.cupomId, input.couponId), eq(couponGrants.organizacaoId, organizationId));

	const grantsMatchedResult = await db.select({ count: count() }).from(couponGrants).where(conditions);
	const grantsMatchedCount = grantsMatchedResult[0]?.count ?? 0;

	const grants = await db.query.couponGrants.findMany({
		where: conditions,
		with: {
			cliente: { columns: { id: true, nome: true, telefone: true } },
			campanha: { columns: { id: true, titulo: true } },
		},
		orderBy: (fields, { desc }) => desc(fields.dataInsercao),
		offset: PAGE_SIZE * (page - 1),
		limit: PAGE_SIZE,
	});

	return {
		data: {
			grants,
			grantsMatched: grantsMatchedCount,
			totalPages: Math.ceil(grantsMatchedCount / PAGE_SIZE),
		},
		message: "Atribuições do cupom encontradas com sucesso.",
	};
}
export type TGetCouponGrantsOutput = Awaited<ReturnType<typeof getCouponGrants>>;

async function getCouponGrantsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanViewCampaigns(session);
	const input = GetCouponGrantsInputSchema.parse({
		couponId: request.nextUrl.searchParams.get("couponId") ?? undefined,
		page: request.nextUrl.searchParams.get("page") ?? undefined,
	});
	const result = await getCouponGrants({ input, session });
	return NextResponse.json(result, { status: 200 });
}

const CreateCouponGrantsInputSchema = z.object({
	couponId: z.string({
		required_error: "ID do cupom não informado.",
		invalid_type_error: "Tipo não válido para o ID do cupom.",
	}),
	clienteIds: z
		.array(
			z.string({
				required_error: "ID do cliente não informado.",
				invalid_type_error: "Tipo não válido para o ID do cliente.",
			}),
		)
		.min(1, "Informe pelo menos um cliente para atribuir o cupom."),
	quantidadeDisponivel: z
		.number({ invalid_type_error: "Tipo não válido para a quantidade disponível." })
		.int("A quantidade disponível deve ser um número inteiro.")
		.min(1, "A quantidade disponível deve ser pelo menos 1.")
		.default(1),
	expiracaoData: z
		.string({ invalid_type_error: "Tipo não válido para a data de expiração." })
		.datetime({ message: "Formato inválido para a data de expiração." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
});
export type TCreateCouponGrantsInput = z.infer<typeof CreateCouponGrantsInputSchema>;

async function createCouponGrants({ input, session }: { input: TCreateCouponGrantsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const coupon = await db.query.coupons.findFirst({
		where: and(eq(coupons.id, input.couponId), eq(coupons.organizacaoId, organizationId)),
		columns: { id: true, escopo: true },
	});
	if (!coupon) throw new createHttpError.NotFound("Cupom não encontrado.");
	if (coupon.escopo !== "INDIVIDUAL") throw new createHttpError.BadRequest("Apenas cupons individuais recebem atribuições por cliente.");

	const clients = await db.query.clients.findMany({
		where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, organizationId), inArray(fields.id, input.clienteIds)),
		columns: { id: true },
	});
	if (clients.length !== input.clienteIds.length) throw new createHttpError.BadRequest("Um ou mais clientes informados não foram encontrados.");

	const insertedGrants = await db
		.insert(couponGrants)
		.values(
			input.clienteIds.map((clienteId) => ({
				organizacaoId: organizationId,
				cupomId: input.couponId,
				clienteId,
				origem: "MANUAL" as const,
				quantidadeDisponivel: input.quantidadeDisponivel,
				expiracaoData: input.expiracaoData,
			})),
		)
		.returning({ id: couponGrants.id });

	return {
		data: { insertedIds: insertedGrants.map((grant) => grant.id) },
		message: `Cupom atribuído a ${insertedGrants.length} cliente(s) com sucesso.`,
	};
}
export type TCreateCouponGrantsOutput = Awaited<ReturnType<typeof createCouponGrants>>;

async function createCouponGrantsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanEditCampaigns(session);
	const payload = await request.json();
	const input = CreateCouponGrantsInputSchema.parse(payload);
	const result = await createCouponGrants({ input, session });
	return NextResponse.json(result, { status: 201 });
}

const DeleteCouponGrantInputSchema = z.object({
	id: z.string({
		required_error: "ID da atribuição não informado.",
		invalid_type_error: "Tipo não válido para o ID da atribuição.",
	}),
});
export type TDeleteCouponGrantInput = z.infer<typeof DeleteCouponGrantInputSchema>;

async function deleteCouponGrant({ input, session }: { input: TDeleteCouponGrantInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const redemptionCountResult = await db
		.select({ total: count() })
		.from(couponRedemptions)
		.where(and(eq(couponRedemptions.atribuicaoId, input.id), eq(couponRedemptions.status, "UTILIZADO")));
	if ((redemptionCountResult[0]?.total ?? 0) > 0) {
		throw new createHttpError.BadRequest("Essa atribuição já possui resgates registrados e não pode ser excluída.");
	}

	const deletedGrants = await db
		.delete(couponGrants)
		.where(and(eq(couponGrants.id, input.id), eq(couponGrants.organizacaoId, organizationId)))
		.returning({ id: couponGrants.id });
	if (!deletedGrants[0]?.id) throw new createHttpError.NotFound("Atribuição não encontrada.");

	return {
		data: { deletedId: deletedGrants[0].id },
		message: "Atribuição excluída com sucesso.",
	};
}
export type TDeleteCouponGrantOutput = Awaited<ReturnType<typeof deleteCouponGrant>>;

async function deleteCouponGrantRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanEditCampaigns(session);
	const input = DeleteCouponGrantInputSchema.parse({ id: request.nextUrl.searchParams.get("id") ?? undefined });
	const result = await deleteCouponGrant({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getCouponGrantsRoute });
export const POST = appApiHandler({ POST: createCouponGrantsRoute });
export const DELETE = appApiHandler({ DELETE: deleteCouponGrantRoute });

import { resolvePoiActorContext } from "@/lib/access/poi-actor";
import { appApiHandler } from "@/lib/app-api";
import { getAvailableCouponsForClient } from "@/lib/coupons/availability";
import { evaluateCouponAgainstSaleValue } from "@/lib/coupons/engine";
import { getCouponCheckoutConditionIssue } from "@/lib/coupons/conditions";
import { countPreviousConfirmedPurchases } from "@/lib/coupons/purchase-history";
import { db } from "@/services/drizzle";
import { DeliveryModeEnum } from "@/schemas/enums";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetPoiAvailableCouponsInputSchema = z.object({
	entregaModalidade: DeliveryModeEnum.optional().nullable(),
	// Opcional para dispositivos autenticados (a organização deriva do principal); obrigatório no modo legado.
	orgId: z.string({ invalid_type_error: "Tipo não válido para o ID da organização." }).optional().nullable(),
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para o ID do cliente.",
	}),
	valorVenda: z
		.string({ invalid_type_error: "Tipo não válido para o valor da venda." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : null)),
});
export type TGetPoiAvailableCouponsInput = z.infer<typeof GetPoiAvailableCouponsInputSchema>;

// Dual-mode (plano §9.10): dispositivo autenticado com scope poi:coupons:read, ou modo
// legado anônimo com orgId — a organização efetiva chega já resolvida pelo route handler.
async function getPoiAvailableCoupons({ input }: { input: Omit<TGetPoiAvailableCouponsInput, "orgId"> & { orgId: string } }) {
	const availableCoupons = await getAvailableCouponsForClient({
		organizacaoId: input.orgId,
		clienteId: input.clienteId,
		surface: "PONTO_INTERACAO",
	});

	const context = {
		entregaModalidade: input.entregaModalidade ?? null,
		comprasAnterioresConfirmadas: await countPreviousConfirmedPurchases({ trx: db, organizacaoId: input.orgId, clienteId: input.clienteId }),
	};
	const coupons = availableCoupons.map((coupon) => {
		const conditionIssue = getCouponCheckoutConditionIssue(coupon, context);
		const evaluation = conditionIssue
			? { elegivel: false as const, motivo: conditionIssue }
			: coupon.validacaoModo === "AUTOMATICA" && input.valorVenda
				? evaluateCouponAgainstSaleValue({ coupon, targets: coupon.alvos, saleValue: input.valorVenda, context })
				: null;
		return {
			id: coupon.id,
			titulo: coupon.titulo,
			descricao: coupon.descricao,
			imagemCapaUrl: coupon.imagemCapaUrl,
			codigo: coupon.codigo,
			escopo: coupon.escopo,
			validacaoModo: coupon.validacaoModo,
			condicoesTexto: coupon.condicoesTexto,
			condicaoModalidadesEntrega: coupon.condicaoModalidadesEntrega,
			condicaoPrimeiraCompra: coupon.condicaoPrimeiraCompra,
			beneficioTipo: coupon.beneficioTipo,
			beneficioValor: coupon.beneficioValor,
			beneficioDescontoMaximo: coupon.beneficioDescontoMaximo,
			beneficioAplicacao: coupon.beneficioAplicacao,
			vigenciaFim: coupon.vigenciaFim,
			atribuicaoVigente: coupon.atribuicaoVigente ? { id: coupon.atribuicaoVigente.id, expiracaoData: coupon.atribuicaoVigente.expiracaoData } : null,
			avaliacao: evaluation,
		};
	});

	return {
		data: { coupons },
		message: "Cupons disponíveis encontrados com sucesso.",
	};
}
export type TGetPoiAvailableCouponsOutput = Awaited<ReturnType<typeof getPoiAvailableCoupons>>;

async function getPoiAvailableCouponsRoute(request: NextRequest) {
	const input = GetPoiAvailableCouponsInputSchema.parse({
		entregaModalidade: request.nextUrl.searchParams.get("entregaModalidade"),
		orgId: request.nextUrl.searchParams.get("orgId") ?? undefined,
		clienteId: request.nextUrl.searchParams.get("clienteId") ?? undefined,
		valorVenda: request.nextUrl.searchParams.get("valorVenda") ?? undefined,
	});
	const resolution = await resolvePoiActorContext({ request, requiredScope: "poi:coupons:read", payloadOrgId: input.orgId });
	const result = await getPoiAvailableCoupons({ input: { ...input, orgId: resolution.organizationId } });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getPoiAvailableCouponsRoute });

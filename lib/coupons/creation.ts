import type { CouponAudienceSchema, CouponSchema, CouponTargetSchema } from "@/schemas/coupons";
import type { DBTransaction } from "@/services/drizzle";
import { couponAudiences, couponTargets, coupons } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import type z from "zod";

type TCouponCoherenceInput = Pick<
	z.infer<typeof CouponSchema>,
	| "escopo"
	| "validacaoModo"
	| "condicoesTexto"
	| "beneficioTipo"
	| "beneficioValor"
	| "beneficioAplicacao"
	| "beneficioCompreQuantidade"
	| "beneficioLeveQuantidade"
>;

type TCouponTargetRow = z.infer<typeof CouponTargetSchema> & { deletar?: boolean | null };
type TCouponAudienceRow = z.infer<typeof CouponAudienceSchema> & { deletar?: boolean | null };

/**
 * Valida a coerência entre benefício, modo de validação, alvos e audiências.
 * Regras que o Zod por campo não consegue expressar.
 *
 * Vive aqui (e não na rota de cupons) porque a criação de campanha também materializa cupons —
 * o cupom criado junto com a campanha passa exatamente pelas mesmas regras.
 */
export function assertCouponCoherence({
	coupon,
	targets,
	audiences,
}: {
	coupon: TCouponCoherenceInput;
	targets: TCouponTargetRow[];
	audiences: TCouponAudienceRow[];
}) {
	const activeTargets = targets.filter((target) => !target.deletar);
	const activeAudiences = audiences.filter((audience) => !audience.deletar);

	if (coupon.beneficioTipo === "BRINDE") throw new createHttpError.BadRequest("Cupons de brinde ainda não são suportados.");

	if (coupon.validacaoModo === "MANUAL" && !coupon.condicoesTexto?.trim()) {
		throw new createHttpError.BadRequest("Cupons de validação manual exigem o texto de condições para orientar cliente e operador.");
	}

	if (["DESCONTO_FIXO", "DESCONTO_PERCENTUAL", "PRECO_FIXO"].includes(coupon.beneficioTipo)) {
		if (!coupon.beneficioValor || coupon.beneficioValor <= 0) {
			throw new createHttpError.BadRequest("O valor do benefício do cupom deve ser maior que zero.");
		}
		if (coupon.beneficioTipo === "DESCONTO_PERCENTUAL" && coupon.beneficioValor > 100) {
			throw new createHttpError.BadRequest("O desconto percentual do cupom não pode ser maior que 100%.");
		}
	}

	if (coupon.beneficioTipo === "COMPRE_X_LEVE_Y") {
		const buyQuantity = coupon.beneficioCompreQuantidade ?? 0;
		const takeQuantity = coupon.beneficioLeveQuantidade ?? 0;
		if (buyQuantity < 1 || takeQuantity <= buyQuantity) {
			throw new createHttpError.BadRequest("Na promoção leve X pague Y, a quantidade levada deve ser maior que a quantidade paga.");
		}
	}

	if (coupon.beneficioTipo === "PRECO_FIXO" && coupon.beneficioAplicacao !== "ITENS_ELEGIVEIS") {
		throw new createHttpError.BadRequest("Cupons de preço fixo devem ser aplicados aos itens elegíveis.");
	}

	if (coupon.beneficioAplicacao === "ITENS_ELEGIVEIS" && coupon.validacaoModo === "AUTOMATICA" && activeTargets.length === 0) {
		throw new createHttpError.BadRequest("Cupons aplicados a itens elegíveis exigem pelo menos um alvo de produto.");
	}

	if (coupon.escopo !== "GLOBAL" && activeAudiences.length > 0) {
		throw new createHttpError.BadRequest("Audiências por tag/segmentação são exclusivas de cupons globais.");
	}
}

export async function assertCouponCodeIsAvailable({
	tx,
	organizationId,
	codigo,
}: {
	tx: DBTransaction;
	organizationId: string;
	codigo: string;
}) {
	const existingCouponWithCode = await tx.query.coupons.findFirst({
		where: and(eq(coupons.organizacaoId, organizationId), eq(coupons.codigo, codigo)),
		columns: { id: true },
	});
	if (existingCouponWithCode) throw new createHttpError.BadRequest("Já existe um cupom com esse código na organização.");
}

/**
 * Insere o cupom e suas linhas filhas DENTRO da transação recebida.
 *
 * Receber a transação de fora é o ponto: a criação de campanha com cupom inline precisa que os
 * dois nasçam juntos ou nenhum nasça — do contrário uma campanha recusada na validação deixaria
 * para trás um cupom órfão, e a retentativa esbarraria no código já usado.
 */
export async function insertCouponWithinTransaction({
	tx,
	organizationId,
	authorId,
	coupon,
	couponTargets: targets = [],
	couponAudiences: audiences = [],
}: {
	tx: DBTransaction;
	organizationId: string;
	authorId: string;
	coupon: Omit<z.infer<typeof CouponSchema>, "autorId" | "dataInsercao" | "dataAtualizacao">;
	couponTargets?: TCouponTargetRow[];
	couponAudiences?: TCouponAudienceRow[];
}): Promise<string> {
	await assertCouponCodeIsAvailable({ tx, organizationId, codigo: coupon.codigo });

	const insertedCoupons = await tx
		.insert(coupons)
		.values({ ...coupon, organizacaoId: organizationId, autorId: authorId })
		.returning({ id: coupons.id });
	const couponId = insertedCoupons[0]?.id;
	if (!couponId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar o cupom.");

	if (targets.length > 0) {
		await tx.insert(couponTargets).values(targets.map((target) => ({ ...target, cupomId: couponId, organizacaoId: organizationId })) as never);
	}
	if (audiences.length > 0) {
		await tx
			.insert(couponAudiences)
			.values(audiences.map((audience) => ({ ...audience, cupomId: couponId, organizacaoId: organizationId })) as never);
	}

	return couponId;
}

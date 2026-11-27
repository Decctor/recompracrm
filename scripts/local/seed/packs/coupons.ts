import { assertCouponCoherence, insertCouponWithinTransaction } from "@/lib/coupons/creation";
import { CouponSchema } from "@/schemas/coupons";
import { db } from "@/services/drizzle";
import type z from "zod";
import { SEED_COUPONS, SEED_PRODUCTS, SEED_STORES, SEED_USERS } from "../ids";

type TCouponInput = z.input<typeof CouponSchema>;
type TCouponTargetInput = { papel: "ELEGIVEL" | "BENEFICIADO"; produtoId?: string | null; grupo?: string | null; quantidadeMinima?: number | null };

/**
 * One coupon of each benefit type, plus a manual-validation one.
 *
 * Each goes through `CouponSchema`, `assertCouponCoherence` and `insertCouponWithinTransaction` —
 * the same three steps of `POST /api/coupons` — so a rule change that would reject one of these in
 * the builder rejects it here too.
 */
export async function seedCouponsPack() {
	const common = {
		organizacaoId: SEED_STORES.demo.id,
		autorId: SEED_USERS.admin.id,
		ativo: true,
		escopo: "GLOBAL",
		validacaoModo: "AUTOMATICA",
	} as const;
	const c = SEED_COUPONS;
	const p = SEED_PRODUCTS;

	const definitions: { id: string; coupon: TCouponInput; targets?: TCouponTargetInput[] }[] = [
		{
			id: c.fixed.id,
			coupon: {
				...common,
				...c.fixed,
				beneficioTipo: "DESCONTO_FIXO",
				beneficioValor: 10,
				beneficioAplicacao: "VENDA_TOTAL",
				condicaoValorMinimoVenda: 30,
			},
		},
		{
			id: c.percentage.id,
			coupon: {
				...common,
				...c.percentage,
				beneficioTipo: "DESCONTO_PERCENTUAL",
				beneficioValor: 15,
				beneficioDescontoMaximo: 25,
				beneficioAplicacao: "VENDA_TOTAL",
			},
		},
		{
			id: c.fixedPrice.id,
			coupon: { ...common, ...c.fixedPrice, beneficioTipo: "PRECO_FIXO", beneficioValor: 15, beneficioAplicacao: "ITENS_ELEGIVEIS" },
			targets: [{ papel: "BENEFICIADO", produtoId: p.acai.id }],
		},
		{
			id: c.buyXTakeY.id,
			coupon: {
				...common,
				...c.buyXTakeY,
				beneficioTipo: "COMPRE_X_LEVE_Y",
				beneficioCompreQuantidade: 2,
				beneficioLeveQuantidade: 3,
				beneficioAplicacao: "ITENS_ELEGIVEIS",
			},
			targets: [{ papel: "BENEFICIADO", produtoId: p.brigadeiro.id }],
		},
		{
			id: c.gift.id,
			coupon: { ...common, ...c.gift, beneficioTipo: "BRINDE", beneficioAplicacao: "ITENS_ELEGIVEIS", condicaoValorMinimoVenda: 25 },
			targets: [{ papel: "BENEFICIADO", produtoId: p.water.id }],
		},
		{
			id: c.manual.id,
			coupon: {
				...common,
				...c.manual,
				validacaoModo: "MANUAL",
				condicoesTexto: "Válido no mês de aniversário, mediante documento com foto.",
				beneficioTipo: "DESCONTO_PERCENTUAL",
				beneficioValor: 10,
				beneficioAplicacao: "VENDA_TOTAL",
			},
		},
	];

	await db.transaction(async (tx) => {
		for (const { id, coupon, targets = [] } of definitions) {
			const { autorId: _autorId, dataInsercao: _dataInsercao, dataAtualizacao: _dataAtualizacao, ...parsed } = CouponSchema.parse(coupon);
			const couponTargets = targets.map((target) => ({ produtoId: null, produtoVarianteId: null, grupo: null, quantidadeMinima: 1, ...target }));
			assertCouponCoherence({ coupon: parsed, targets: couponTargets as never, audiences: [] });
			await insertCouponWithinTransaction({
				tx,
				organizationId: SEED_STORES.demo.id,
				authorId: SEED_USERS.admin.id,
				// The fixed id rides along with the validated coupon: specs deep-link to it.
				coupon: { ...parsed, id } as typeof parsed,
				couponTargets: couponTargets as never,
			});
		}
	});
}

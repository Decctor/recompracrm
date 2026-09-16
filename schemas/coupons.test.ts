import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAMPAIGN_INLINE_COUPON_DEFAULTS, CampaignInlineCouponSchema, CouponSchema } from "./coupons";

describe("CampaignInlineCouponSchema", () => {
	const validInput = {
		codigo: "volta15",
		titulo: "Reativação setembro",
		beneficioTipo: "DESCONTO_PERCENTUAL",
		beneficioValor: 15,
		beneficioDescontoMaximo: 50,
	};

	it("aceita o formulário rápido e normaliza o código para caixa alta", () => {
		const parsed = CampaignInlineCouponSchema.parse(validInput);

		assert.equal(parsed.codigo, "VOLTA15");
		assert.equal(parsed.beneficioValor, 15);
	});

	it("recusa benefícios que exigiriam escolher produtos", () => {
		// Preço fixo e leve-X-pague-Y precisam de alvos; o caminho deles é o construtor completo.
		for (const beneficioTipo of ["PRECO_FIXO", "COMPRE_X_LEVE_Y", "BRINDE"]) {
			assert.equal(CampaignInlineCouponSchema.safeParse({ ...validInput, beneficioTipo }).success, false, `${beneficioTipo} deveria ser recusado`);
		}
	});

	it("recusa título vazio", () => {
		assert.equal(CampaignInlineCouponSchema.safeParse({ ...validInput, titulo: "" }).success, false);
	});

	it("não aceita escopo vindo do cliente — o servidor é quem fixa", () => {
		const parsed = CampaignInlineCouponSchema.parse({ ...validInput, escopo: "GLOBAL" });

		assert.equal("escopo" in parsed, false);
	});
});

describe("CAMPAIGN_INLINE_COUPON_DEFAULTS", () => {
	it("compõe com o formulário rápido num cupom que o CouponSchema aceita", () => {
		const inline = CampaignInlineCouponSchema.parse({
			codigo: "VOLTA15",
			titulo: "Reativação setembro",
			beneficioTipo: "DESCONTO_PERCENTUAL",
			beneficioValor: 15,
			beneficioDescontoMaximo: 50,
		});

		const composed = { ...CAMPAIGN_INLINE_COUPON_DEFAULTS, ...inline };
		const parsed = CouponSchema.omit({ dataInsercao: true, dataAtualizacao: true, autorId: true }).safeParse({
			...composed,
		});

		assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
	});

	it("fixa escopo INDIVIDUAL — é o único que a campanha consegue atribuir", () => {
		// `validateCampaignCouponGenerationSettings` recusa qualquer outro escopo, então um padrão
		// diferente aqui criaria um cupom que a própria campanha rejeitaria em seguida.
		assert.equal(CAMPAIGN_INLINE_COUPON_DEFAULTS.escopo, "INDIVIDUAL");
		assert.equal(CAMPAIGN_INLINE_COUPON_DEFAULTS.ativo, true);
		assert.equal(CAMPAIGN_INLINE_COUPON_DEFAULTS.beneficioAplicacao, "VENDA_TOTAL");
		assert.equal(CAMPAIGN_INLINE_COUPON_DEFAULTS.validacaoModo, "AUTOMATICA");
		assert.equal(CAMPAIGN_INLINE_COUPON_DEFAULTS.limiteResgatesPorCliente, 1);
	});
});

import type { TCouponBenefitTypeEnum } from "@/schemas/enums";
import { BadgePercent, Coins, Layers, Tag, Gift } from "lucide-react";
import type { ComponentType } from "react";

/**
 * Benefit-first entry: the builder opens by asking "o que você quer oferecer?".
 * Each card maps directly to a `beneficioTipo`, in plain lojista language.
 * Includes a single selected free product per redemption.
 */
export type TBenefitCard = {
	id: TCouponBenefitTypeEnum;
	label: string;
	tagline: string;
	description: string;
	example: string;
	icon: ComponentType<{ className?: string }>;
};

export const BENEFIT_CARDS: TBenefitCard[] = [
	{
		id: "BRINDE",
		label: "Produto grátis",
		tagline: "Uma unidade de brinde",
		description: "O cliente escolhe um produto entre os brindes permitidos. Adicionais são cobrados à parte.",
		example: "Ex: escolha uma bebida grátis",
		icon: Gift,
	},
	{
		id: "DESCONTO_PERCENTUAL",
		label: "Desconto percentual",
		tagline: "Uma % de desconto",
		description: "Tira uma porcentagem do valor. Você pode limitar o teto em reais.",
		example: "Ex: 10% de desconto, até R$ 50",
		icon: BadgePercent,
	},
	{
		id: "DESCONTO_FIXO",
		label: "Desconto em reais",
		tagline: "Um valor fixo de desconto",
		description: "Abate um valor fixo em reais da compra.",
		example: "Ex: R$ 25 de desconto",
		icon: Coins,
	},
	{
		id: "PRECO_FIXO",
		label: "Preço fixo",
		tagline: "Um preço promocional por unidade",
		description: "Define um preço único por unidade dos produtos escolhidos.",
		example: "Ex: qualquer camiseta por R$ 39,90",
		icon: Tag,
	},
	{
		id: "COMPRE_X_LEVE_Y",
		label: "Leve mais, pague menos",
		tagline: "Leve X e pague Y",
		description: "O cliente leva uma quantidade e paga por outra menor.",
		example: "Ex: leve 3, pague 2",
		icon: Layers,
	},
];

export function getBenefitCard(type: TCouponBenefitTypeEnum | null | undefined): TBenefitCard | null {
	if (!type) return null;
	return BENEFIT_CARDS.find((card) => card.id === type) ?? null;
}

// Benefit types whose discount necessarily applies to specific eligible items.
// For these we force `beneficioAplicacao = ITENS_ELEGIVEIS` and hide the choice.
export const ITEM_SCOPED_BENEFITS: TCouponBenefitTypeEnum[] = ["PRECO_FIXO", "COMPRE_X_LEVE_Y", "BRINDE"];

export function benefitIsItemScoped(type: TCouponBenefitTypeEnum): boolean {
	return ITEM_SCOPED_BENEFITS.includes(type);
}

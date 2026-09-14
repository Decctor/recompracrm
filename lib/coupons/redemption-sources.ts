import type { TCouponRedemptionSourceEnum } from "@/schemas/enums";
import { Globe, type LucideIcon, Monitor, Store } from "lucide-react";

/**
 * Identidade visual de cada superfície de resgate do cupom.
 *
 * O ícone repete o que o resto do app já usa para o canal (`Store` no PDV, `Globe` na loja digital,
 * `Monitor` no ponto de interação), então a leitura é a mesma do `ChannelMark` do cabeçalho. A cor
 * separa interno de externo: a loja digital é autoatendimento do cliente e fica no azul da marca;
 * as superfícies operadas pela loja ficam na escala dourada dos gráficos do DESIGN.md, que é a
 * paleta de dados do app — assim a barra da quebra por origem não inventa cor nova.
 */
export const COUPON_REDEMPTION_SOURCE_META: Record<
	TCouponRedemptionSourceEnum,
	{ label: string; icon: LucideIcon; color: string; softBackground: string }
> = {
	POS: { label: "PDV", icon: Store, color: "#e3b042", softBackground: "rgba(227,176,66,0.14)" },
	LOJA_DIGITAL: { label: "Loja digital", icon: Globe, color: "#24549c", softBackground: "rgba(36,84,156,0.10)" },
	PONTO_INTERACAO: { label: "Ponto de interação", icon: Monitor, color: "#9a691e", softBackground: "rgba(154,105,30,0.14)" },
};

export const COUPON_REDEMPTION_SOURCES = Object.keys(COUPON_REDEMPTION_SOURCE_META) as TCouponRedemptionSourceEnum[];

export function getCouponRedemptionSourceMeta(source: string) {
	return (
		COUPON_REDEMPTION_SOURCE_META[source as TCouponRedemptionSourceEnum] ?? {
			label: source,
			icon: Store,
			color: "#9a691e",
			softBackground: "rgba(154,105,30,0.14)",
		}
	);
}

import type { SegmentFamily, SegmentPage } from "@/app/_content/segment-pages";
import { Gift, Hammer, type LucideIcon, RefreshCcw, Store, UtensilsCrossed } from "lucide-react";

export type TSegmentFamilyTheme = {
	label: string;
	icon: LucideIcon;
	/** Fundo do herói do segmento e das ilustrações dos cartões (famílias claras). */
	bg: string;
	/** Cor de destaque: etiqueta, ícone e pílulas. */
	accent: string;
	/** Herói escuro (marca `data-dock="dark"` para o Dock inverter). */
	dark: boolean;
};

// Ordem dos grupos no hub. As cores vêm do protótipo (Segmentos.dc.html).
export const SEGMENT_FAMILY_ORDER: SegmentFamily[] = ["ALIMENTACAO", "REPOSICAO", "MODA_E_OCASIOES", "CASA_E_OBRA", "REDES_E_VAREJO"];

export const SEGMENT_FAMILY_THEMES: Record<SegmentFamily, TSegmentFamilyTheme> = {
	ALIMENTACAO: { label: "Alimentação", icon: UtensilsCrossed, bg: "#fbf6ec", accent: "#b45309", dark: false },
	REPOSICAO: { label: "Reposição", icon: RefreshCcw, bg: "#0b1628", accent: "#5eead4", dark: true },
	MODA_E_OCASIOES: { label: "Moda e ocasiões", icon: Gift, bg: "#fbf0f2", accent: "#9f1239", dark: false },
	CASA_E_OBRA: { label: "Casa, obra e manutenção", icon: Hammer, bg: "#0f1f33", accent: "#ffb900", dark: true },
	REDES_E_VAREJO: { label: "Redes e varejo", icon: Store, bg: "#eef2f6", accent: "#24549c", dark: false },
};

/** Fundo claro para cartões e palcos: as famílias escuras usam o cinza-azulado neutro. */
export function lightSurface(theme: TSegmentFamilyTheme) {
	return theme.dark ? "#eef2f6" : theme.bg;
}

export function segmentHref(slug: string) {
	return `/segments/${slug}`;
}

export function segmentIllustration(slug: string) {
	return `/images/segments/${slug}.svg`;
}

export const SIGNUP_HREF = "/auth/signup";

export function whatsappHref(text: string) {
	return `https://wa.me/553492465388?text=${encodeURIComponent(text)}`;
}

export const HUB_WHATSAPP_MESSAGE = "Olá! Vi a página de segmentos do RecompraCRM e gostaria de agendar uma demonstração para a minha loja.";

/** "restaurantes, lanchonetes e cafeterias" → "restaurantes" (título curto das quatro frentes). */
export function shortAudience(page: SegmentPage) {
	return page.audience.split(",")[0];
}

export function capitalize(text: string) {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

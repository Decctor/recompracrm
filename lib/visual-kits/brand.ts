import { DEFAULT_ORG_COLORS, ensureReadableForeground } from "@/lib/organizations/colors";
import type { TVisualKitBrand } from "./types";

const HEX = /^#?[a-f\d]{6}$/i;

function normalizeHex(value: string | null | undefined, fallback: string) {
	if (!value || !HEX.test(value)) return fallback;
	return value.startsWith("#") ? value : `#${value}`;
}

/**
 * Marca da organização para as peças. Cores vêm do banco sem garantia: hex inválido cai no padrão e
 * o foreground é trocado por preto/branco quando não lê sobre o fundo.
 */
export function resolveVisualKitBrand(organization: {
	nome: string;
	logoUrl: string | null;
	corPrimaria: string | null;
	corPrimariaForeground: string | null;
	corSecundaria: string | null;
	corSecundariaForeground: string | null;
}): TVisualKitBrand {
	const corPrimaria = normalizeHex(organization.corPrimaria, DEFAULT_ORG_COLORS.primary);
	const corSecundaria = normalizeHex(organization.corSecundaria, DEFAULT_ORG_COLORS.secondary);
	return {
		nome: organization.nome,
		logoUrl: organization.logoUrl,
		corPrimaria,
		corPrimariaForeground: ensureReadableForeground(
			corPrimaria,
			normalizeHex(organization.corPrimariaForeground, DEFAULT_ORG_COLORS.primaryForeground),
		),
		corSecundaria,
		corSecundariaForeground: ensureReadableForeground(
			corSecundaria,
			normalizeHex(organization.corSecundariaForeground, DEFAULT_ORG_COLORS.secondaryForeground),
		),
	};
}

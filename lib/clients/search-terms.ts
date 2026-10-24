import { buildPhoneSearchPatterns, formatStringAsOnlyDigits } from "@/lib/formatting";
import { extractSearchTokens } from "@/lib/search";
import { isValidCPF } from "@/lib/validation";

export const CLIENT_SEARCH_MIN_LENGTH = 2;
export const CLIENT_SEARCH_MAX_LENGTH = 100;
/** Abaixo disso a tolerância a erro de digitação vira ruído ("jo" ~ metade da base). */
export const CLIENT_SEARCH_MIN_FUZZY_LENGTH = 3;
/** Com menos dígitos, telefone e documento casariam com quase todo cliente. */
export const CLIENT_SEARCH_MIN_DIGITS = 4;

export type TClientSearchTerm = {
	/** Termo aparado, espaços colapsados. */
	text: string;
	/**
	 * Palavras com letra: cada uma precisa casar com o nome, em qualquer ordem. `fuzzy` marca as que
	 * podem tolerar erro de digitação; `withClientSearch` desliga as que algum cliente já contém.
	 */
	nameTokens: { value: string; fuzzy: boolean }[];
	/** Números soltos numa busca mista ("Gustavo 9944"): cada um precisa casar com telefone ou documento. */
	digitTokens: string[];
	/** Busca só numérica: dígitos para telefone e CPF/CNPJ. Vazio quando o termo tem letras. */
	digits: string;
	phonePatterns: string[];
	/** Final de telefone digitado — sobe na relevância quem termina exatamente nesses quatro dígitos. */
	phoneFinalFour: string | null;
	/** E-mail não tem espaço: com espaço no termo, o ramo de e-mail nunca casaria. */
	matchesEmail: boolean;
};

/**
 * Interpreta o texto livre da busca de clientes. Puro: decide quais ramos a consulta precisa, para
 * a SQL não carregar comparações que não têm como casar (telefone de "Gustavo", e-mail de
 * "Gustavo Castro") — cada ramo a menos é um índice a menos no plano.
 */
export function parseClientSearchTerm(raw: string | null | undefined): TClientSearchTerm | null {
	const text = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, CLIENT_SEARCH_MAX_LENGTH);
	if (text.length < CLIENT_SEARCH_MIN_LENGTH) return null;

	const hasLetters = /\p{L}/u.test(text);
	const tokens = extractSearchTokens(text);
	const nameTokens = tokens.filter((token) => /\p{L}/u.test(token)).map((value) => ({ value, fuzzy: value.length >= CLIENT_SEARCH_MIN_FUZZY_LENGTH }));
	const digitTokens = hasLetters ? tokens.filter((token) => /^\d+$/.test(token) && token.length >= CLIENT_SEARCH_MIN_DIGITS) : [];

	const allDigits = hasLetters ? "" : formatStringAsOnlyDigits(text);
	const digits = allDigits.length >= CLIENT_SEARCH_MIN_DIGITS ? allDigits : "";
	// 11 dígitos com CPF válido é documento, não telefone: não promove finais de telefone.
	const isPhone = digits.length > 0 && digits.length <= 13 && !(digits.length === 11 && isValidCPF(digits));

	return {
		text,
		nameTokens,
		digitTokens,
		digits,
		phonePatterns: digits ? buildPhoneSearchPatterns(digits) : [],
		phoneFinalFour: isPhone ? digits.slice(-4) : null,
		matchesEmail: !/\s/.test(text),
	};
}

export function clientSearchUsesFuzzy(term: TClientSearchTerm) {
	return term.nameTokens.some((token) => token.fuzzy);
}

export const PRODUCT_SEARCH_MAX_TERMS = 5;
export const PRODUCT_SEARCH_MAX_LENGTH = 100;
export const PRODUCT_SEARCH_MIN_FUZZY_LENGTH = 4;

export function normalizeProductSearchTerms(value: string | readonly string[] | null | undefined): string[] {
	const terms = typeof value === "string" ? value.split(",") : (value ?? []);
	const seen = new Set<string>();
	return terms
		.map((term) => term.trim())
		.filter((term) => {
			const key = term.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

export function supportsFuzzyProductSearch(term: string) {
	return term.length >= PRODUCT_SEARCH_MIN_FUZZY_LENGTH && /\p{L}/u.test(term);
}

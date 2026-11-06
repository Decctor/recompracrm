import { GLOSSARY_CATEGORY_LABELS, GLOSSARY_TERMS, type GlossaryCategory, type GlossaryTerm } from "@/app/_content/glossary";

export const BASE_URL = "https://www.recompracrm.com.br";
export const GLOSSARY_PATH = "/glossary";

export function glossaryHref(slug: string) {
	return `${GLOSSARY_PATH}/${slug}`;
}

/** Verbetes de cada categoria, em ordem alfabética (a ordem do arquivo segue o volume de busca). */
export function getGlossaryGroups(): { category: GlossaryCategory; label: string; terms: GlossaryTerm[] }[] {
	return (Object.keys(GLOSSARY_CATEGORY_LABELS) as GlossaryCategory[]).map((category) => ({
		category,
		label: GLOSSARY_CATEGORY_LABELS[category],
		terms: GLOSSARY_TERMS.filter((term) => term.category === category).sort((a, b) => a.term.localeCompare(b.term, "pt-BR")),
	}));
}

/** Primeira frase da definição, para os cards do índice e dos termos relacionados. */
export function shortDefinition(term: GlossaryTerm) {
	const end = term.definition.search(/\.(\s|$)/);
	return end > 0 ? term.definition.slice(0, end + 1) : term.definition;
}

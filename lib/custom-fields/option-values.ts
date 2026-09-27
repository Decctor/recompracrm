import { SURVEY_OPTION_VALUE_MAX_LENGTH } from "@/lib/message-templates/surveys";

/**
 * Valor canônico de uma opção a partir do título que o usuário digitou: SCREAMING_SNAKE sem
 * acentos, como os valores do catálogo nativo ("PREFIRO_NAO_DIZER"). É o que fica gravado em
 * `client_custom_field_values.valor` e viaja no payload do botão de pesquisa, então tem teto.
 */
export function buildCustomFieldOptionValue(title: string) {
	const value = title
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, SURVEY_OPTION_VALUE_MAX_LENGTH);
	return value || "OPCAO";
}

/** Garante valores únicos numa lista de opções, sufixando repetições. */
export function buildUniqueCustomFieldOptionValues(titles: string[]) {
	const seen = new Map<string, number>();
	return titles.map((title) => {
		const base = buildCustomFieldOptionValue(title);
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return count === 0 ? base : `${base.slice(0, SURVEY_OPTION_VALUE_MAX_LENGTH - 3)}_${count + 1}`;
	});
}

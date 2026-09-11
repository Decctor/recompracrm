import type { TGetClientsInput } from "@/app/api/clients/route";
import { appRoutes } from "@/lib/navigation/routes";
import { createSerializer, parseAsArrayOf, parseAsInteger, parseAsIsoDateTime, parseAsString, parseAsStringEnum } from "nuqs";

/**
 * Filtros do banco de dados de clientes como estado na URL (nuqs) — o mesmo padrão de
 * `lib/sales/history-url-state.ts`. Uma única definição serve ao `useQueryStates` da página e ao
 * `buildClientsDatabaseHref`, usado pelo dashboard para abrir a lista já filtrada. Os nomes das
 * chaves são os do `TGetClientsInput`, então o objeto lido da URL vira o input da API sem
 * mapeamento.
 */
export const clientsDatabaseParsers = {
	page: parseAsInteger.withDefault(1),
	search: parseAsString.withDefault(""),
	acquisitionChannels: parseAsArrayOf(parseAsString).withDefault([]),
	segmentationTitles: parseAsArrayOf(parseAsString).withDefault([]),
	statsPeriodAfter: parseAsIsoDateTime,
	statsPeriodBefore: parseAsIsoDateTime,
	statsIntegrationsIds: parseAsArrayOf(parseAsString).withDefault([]),
	statsExcludedSalesIds: parseAsArrayOf(parseAsString).withDefault([]),
	birthdaysPeriodAfter: parseAsIsoDateTime,
	birthdaysPeriodBefore: parseAsIsoDateTime,
	orderByField: parseAsStringEnum(["nome", "comprasValorTotal", "comprasQtdeTotal", "primeiraCompraData", "ultimaCompraData"]).withDefault("nome"),
	orderByDirection: parseAsStringEnum(["asc", "desc"]).withDefault("asc"),
};

export type TClientsDatabaseUrlState = {
	[K in keyof typeof clientsDatabaseParsers]: NonNullable<ReturnType<(typeof clientsDatabaseParsers)[K]["parse"]>> extends infer V
		? (typeof clientsDatabaseParsers)[K] extends { defaultValue: unknown }
			? V
			: V | null
		: never;
};

/** Estado da URL → input da API (a listagem por URL nunca busca por id). */
export function toClientsInput(state: TClientsDatabaseUrlState): TGetClientsInput {
	return { ...state, id: null };
}

// `view=database` entra fixo no serializer: todo link externo para a listagem cai direto no banco
// de dados, nunca na aba de estatísticas.
const serializeClientsDatabase = createSerializer({ ...clientsDatabaseParsers, view: parseAsStringEnum(["stats", "database"]) });

/** Link para o banco de dados de clientes com filtros ativos; chaves omitidas ficam no padrão. */
export function buildClientsDatabaseHref(filters: Partial<TClientsDatabaseUrlState>) {
	return serializeClientsDatabase(appRoutes.customers.root(), { ...filters, view: "database" });
}

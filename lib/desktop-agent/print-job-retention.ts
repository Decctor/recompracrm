// Retenção do payload dos jobs de impressão.
//
// O cupom de venda embute a logo da organização como data URL (organization-logo.ts) — ~150 KB por
// job, duas vezes: no HTML renderizado (`conteudo`) e no snapshot (`dados.organizacao.logoDataUrl`).
// Em 2026-11 isso somava 3,3 GB em ~11 mil jobs, 43% do banco.
//
// Nada lê esses campos depois do claim: o agent recebe `conteudo` ao claimar, a reimpressão
// reconstrói os `dados` a partir da venda (buildCupomVendaDados) e as listagens selecionam só
// metadados. Por isso:
// - os `dados` são gravados sem data URLs (o HTML renderizado ainda leva a logo para o agent);
// - o cron de manutenção limpa o payload dos jobs terminais após PRINT_JOB_PAYLOAD_RETENTION_DAYS
//   (a linha e os metadados ficam até a purga de 90 dias).

export const PRINT_JOB_PAYLOAD_RETENTION_DAYS = 7;

const INLINE_DATA_URL_PREFIX = "data:";

/** Cópia de `value` com toda string data URL trocada por null, em qualquer profundidade. */
export function omitInlineDataUrls<T>(value: T): T {
	if (typeof value === "string") return (value.startsWith(INLINE_DATA_URL_PREFIX) ? null : value) as T;
	if (Array.isArray(value)) return value.map((item) => omitInlineDataUrls(item)) as T;
	if (value && typeof value === "object" && !(value instanceof Date)) {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, omitInlineDataUrls(item)])) as T;
	}
	return value;
}

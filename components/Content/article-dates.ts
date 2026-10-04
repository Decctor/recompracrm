// Datas dos artigos são dias (ISO "2026-10-04"), não instantes. Formatar em UTC evita que um
// servidor em fuso negativo publique o artigo "no dia anterior".
export function formatArticleDate(iso: string, month: "long" | "short" = "long") {
	return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month, year: "numeric", timeZone: "UTC" });
}

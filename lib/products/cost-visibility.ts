/**
 * Custo de catálogo (`precoCusto` de produto e de variante) para quem não pode vê-lo
 * (`dadosSensiveis.visualizarCustos`, ver lib/permissions/sensitive-data.ts).
 *
 * Varre a árvore inteira porque as leituras relacionais trazem linhas de produto/variante aninhadas
 * (opções de adicional com `produto: true`, variantes, perfis…) — mascarar só a raiz vazaria o custo
 * pelo adicional. `precoCusto` já é anulável no banco, então o tipo devolvido continua honesto.
 */
export function redactCatalogCosts<T>(value: T, canView: boolean): T {
	if (canView) return value;
	return redact(value) as T;
}

function redact(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(redact);
	if (value === null || typeof value !== "object" || value instanceof Date) return value;
	const result: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		result[key] = key === "precoCusto" ? null : redact(entry);
	}
	return result;
}

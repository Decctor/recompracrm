import { createHash } from "node:crypto";

/**
 * Assinatura da projeção de persistência de uma venda importada.
 *
 * A assinatura representa **o que o sync escreveria** (saleValues + linhas de itens
 * resolvidas), e não o payload canônico bruto do conector. Dois motivos:
 *
 * 1. A resolução de produto/variante/modificador acontece contra o estado da plataforma —
 *    um produto irresolvível hoje pode resolver amanhã sem o payload da fonte mudar. Um
 *    hash do canônico bruto ficaria idêntico e a venda seria pulada para sempre.
 * 2. Campo novo em `buildSaleValues`/`buildSaleItemRows` entra na assinatura
 *    automaticamente — sem lista manual de campos para esquecer de atualizar.
 *
 * Bump de {@link SALE_SIGNATURE_VERSION} invalida todas as assinaturas persistidas e força
 * um reprocesso geral único, sem migração.
 */
export const SALE_SIGNATURE_VERSION = "v1";

/**
 * Canonicalização determinística específica deste domínio: chaves ordenadas, `Date` → ISO,
 * `undefined` omitido (espelha o JSON.stringify que o segue) e **arrays ordenados pela forma
 * serializada de cada elemento** — a ordem de chegada de itens/modificadores pode variar
 * entre fetches do conector e não é semântica aqui. Não generalizar para payloads de
 * webhook, onde a ordem de arrays pode ser semântica.
 *
 * Não reutiliza `lib/ai/operations/hash.ts`: aquele canonicalizador trata `Date` como
 * objeto genérico e o colapsa em `{}`.
 */
function canonicalize(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) {
		return value
			.map(canonicalize)
			.map((element) => JSON.stringify(element) ?? "null")
			.sort()
			.map((serialized) => JSON.parse(serialized) as unknown);
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([, nestedValue]) => nestedValue !== undefined)
				// Comparação por code unit (não localeCompare): o resultado não pode depender do
				// locale do ambiente — a assinatura é comparada entre runs locais e de produção.
				.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
				.map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
		);
	}
	return value;
}

export function computeSaleImportSignature({
	saleValues,
	resolvedItems,
	saleItemRewritePolicy,
	payments,
}: {
	/** Retorno de `buildSaleValues` — já inclui IDs resolvidos, statuses mapeados e metadados. */
	saleValues: Record<string, unknown>;
	/** Linhas de itens pós-resolução (produtoId/variante/opções/modificadores com opcaoId). */
	resolvedItems: unknown[];
	/** Mudança de política do conector também deve invalidar a assinatura. */
	saleItemRewritePolicy: string;
	/**
	 * Pagamentos do canônico, quando a fonte os informa. Não são persistidos na venda, mas as regras
	 * de acúmulo de cashback os leem: uma mudança neles (quitação, tradução de forma) precisa
	 * reprocessar a venda. `null`/ausente não entra no hash, então conectores sem pagamentos mantêm
	 * as assinaturas existentes (sem reprocesso geral nem bump de versão).
	 */
	payments?: unknown[] | null;
}): string {
	const canonical = JSON.stringify({
		saleValues: canonicalize(saleValues),
		items: canonicalize(resolvedItems),
		saleItemRewritePolicy,
		payments: payments == null ? undefined : canonicalize(payments),
	});
	return `${SALE_SIGNATURE_VERSION}:${createHash("sha256").update(canonical).digest("hex")}`;
}

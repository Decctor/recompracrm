import type { TPhiboCatalogRow } from "./phibo-catalog";
import { resolveExternalIdentity, type TExternalIdentityTarget } from "./external-identities";

/** Existing mappings own identity and structure. Partial manual decisions wait for the atomic merge. */
export function partitionProtectedPhiboCatalog(rows: TPhiboCatalogRow[], index: Map<string, TExternalIdentityTarget>) {
	const available: TPhiboCatalogRow[] = [];
	const protectedModels: Array<{ modeloPhiboId: number; eans: string[]; produtoId: string }> = [];
	const pending: Array<{ modeloPhiboId: number; motivo: string; eans: string[] }> = [];
	for (const modelId of new Set(rows.map((r) => r.produtoId))) {
		const members = rows.filter((r) => r.produtoId === modelId);
		const parent = resolveExternalIdentity(index, [{ tipo: "PRODUTO", valor: String(modelId) }]);
		const targets = members.map((r) =>
			resolveExternalIdentity(index, [
				{ tipo: "ESTOQUE", valor: r.estoqueId },
				{ tipo: "EAN", valor: r.produtoEan },
			]),
		);
		if (!parent?.protegido && !targets.some((v) => v?.protegido)) {
			available.push(...members);
			continue;
		}
		if (!parent || targets.some((v) => !v?.produtoVarianteId || v.produtoId !== parent.produtoId)) {
			pending.push({
				modeloPhiboId: modelId,
				motivo: "Modelo protegido com de-para parcial; concluir mapeamento/unificação antes de sincronizar.",
				eans: members.map((r) => r.produtoEan),
			});
			continue;
		}
		protectedModels.push({ modeloPhiboId: modelId, eans: members.map((r) => r.produtoEan), produtoId: parent.produtoId });
	}
	return { rows: available, protegidos: protectedModels, pendentes: pending };
}

import { getOrganizationFileById, readStoredFile } from "@/lib/files/service";
import { readNfeItemFacts } from "@/lib/purchase/import-xml";
import { PurchaseImportedDocumentsSnapshotSchema } from "@/schemas/purchases";
import { db } from "@/services/drizzle";
import { purchaseItems, purchases } from "@/services/drizzle/schema";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

/**
 * ST retido na saída (ADR-0002, fluxo G): a NF-e com CSOSN 500 / CST 60 informa `vBCSTRet`, `pST`
 * e `vICMSSTRet`. Eles não são copiados para lugar nenhum — são lidos, pelo ponteiro do item
 * (`documentoRef` + `documentoItem`), do `det` da última compra recebida do produto. Por unidade,
 * para que a saída multiplique pela quantidade vendida.
 *
 * Fonte do valor, em ordem: ST já retido na própria entrada (CST 60: vBCSTRet/vICMSSTRet) ou ST
 * destacado pelo fornecedor substituto (CST 10/70: vBCST/vICMSST) — nos dois casos é o ICMS que a
 * cadeia já recolheu por este produto.
 */

export type TRetainedStPerUnit = { vBCSTRet: number; pST: number | null; vICMSSTRet: number };

function round2(value: number) {
	return Math.round(value * 100) / 100;
}

export async function resolveRetainedStForProducts({
	organizationId,
	produtoIds,
}: {
	organizationId: string;
	produtoIds: string[];
}): Promise<Record<string, TRetainedStPerUnit>> {
	const result: Record<string, TRetainedStPerUnit> = {};
	const ids = [...new Set(produtoIds)];
	if (ids.length === 0) return result;

	// Últimas entradas recebidas com ponteiro para o XML, da mais recente para a mais antiga.
	const rows = await db
		.select({
			produtoId: purchaseItems.produtoId,
			documentoRef: purchaseItems.documentoRef,
			documentoItem: purchaseItems.documentoItem,
			documentosImportados: purchases.documentosImportados,
		})
		.from(purchaseItems)
		.innerJoin(purchases, eq(purchases.id, purchaseItems.compraId))
		.where(
			and(
				eq(purchaseItems.organizacaoId, organizationId),
				inArray(purchaseItems.produtoId, ids),
				isNotNull(purchaseItems.documentoRef),
				isNotNull(purchaseItems.documentoItem),
				eq(purchases.status, "RECEBIDA"),
			),
		)
		.orderBy(desc(purchases.entregaDataRecebimentoEfetivacao), desc(purchases.dataInsercao));

	const xmlCache = new Map<string, string | null>();
	for (const row of rows) {
		if (result[row.produtoId] || !row.documentoRef || !row.documentoItem) continue;
		const snapshot = row.documentosImportados ? PurchaseImportedDocumentsSnapshotSchema.safeParse(row.documentosImportados) : null;
		const document = snapshot?.success ? snapshot.data.documentos.find((candidate) => candidate.referencia === row.documentoRef) : null;
		if (!document?.arquivoId) continue;
		let xml = xmlCache.get(document.arquivoId);
		if (xml === undefined) {
			try {
				const file = await getOrganizationFileById({ arquivoId: document.arquivoId, organizacaoId: organizationId });
				xml = file.mimeType.includes("xml") ? (await readStoredFile(file)).toString("utf8") : null;
			} catch {
				xml = null;
			}
			xmlCache.set(document.arquivoId, xml);
		}
		if (!xml) continue;
		let facts: ReturnType<typeof readNfeItemFacts>;
		try {
			facts = readNfeItemFacts({ xml, numeroItem: row.documentoItem });
		} catch {
			continue;
		}
		const quantity = facts.quantidadeComercial ?? 0;
		if (quantity <= 0) continue;
		const retainedValue = facts.icmsSt.valorRetido ?? facts.icmsSt.valor ?? 0;
		if (retainedValue <= 0) continue;
		const retainedBase = facts.icmsSt.valorRetido != null ? (facts.icmsSt.baseCalculoRetido ?? 0) : (facts.icmsSt.baseCalculo ?? 0);
		result[row.produtoId] = {
			vBCSTRet: round2(retainedBase / quantity),
			pST: facts.icmsSt.valorRetido != null ? facts.icmsSt.aliquotaRetido : facts.icmsSt.aliquota,
			vICMSSTRet: round2(retainedValue / quantity),
		};
	}
	return result;
}

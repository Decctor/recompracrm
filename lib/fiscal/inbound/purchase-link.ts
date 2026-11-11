import type { TPurchaseImportedDocument } from "@/schemas/purchases";
import type { DBTransaction } from "@/services/drizzle";
import { fiscalInboundDocuments, purchases } from "@/services/drizzle/schema";
import { and, eq, inArray, isNull, notInArray, or } from "drizzle-orm";

/** Chaves de acesso (44 dígitos) dos documentos importados numa compra. */
export function getImportedDocumentsAccessKeys(documents: Pick<TPurchaseImportedDocument, "chaveAcesso">[]) {
	const keys = documents.map((document) => document.chaveAcesso?.replace(/[^0-9]/g, "") ?? "").filter((key) => key.length === 44);
	return [...new Set(keys)];
}

/**
 * Liga as notas recebidas à compra que as importou, pela chave de acesso. É o que faz a nota sair de
 * "A registrar" — venha a compra do botão "Registrar compra" ou de alguém que subiu o mesmo XML à mão.
 *
 * Uma nota já ligada a outra compra viva não é roubada; ligada a uma compra cancelada, volta a ser
 * de quem a registrar de novo. Com `importedDocuments` informado (edição), as notas que deixaram de
 * constar na compra são desligadas.
 */
export async function syncInboundDocumentsPurchaseLink({
	trx,
	organizationId,
	purchaseId,
	importedDocuments,
}: {
	trx: DBTransaction;
	organizationId: string;
	purchaseId: string;
	importedDocuments: Pick<TPurchaseImportedDocument, "chaveAcesso">[];
}) {
	const keys = getImportedDocumentsAccessKeys(importedDocuments);
	const now = new Date();

	await trx
		.update(fiscalInboundDocuments)
		.set({ compraId: null, dataAtualizacao: now })
		.where(
			and(
				eq(fiscalInboundDocuments.organizacaoId, organizationId),
				eq(fiscalInboundDocuments.compraId, purchaseId),
				keys.length > 0 ? notInArray(fiscalInboundDocuments.chaveAcesso, keys) : undefined,
			),
		);
	if (keys.length === 0) return;

	const cancelledPurchases = trx
		.select({ id: purchases.id })
		.from(purchases)
		.where(and(eq(purchases.organizacaoId, organizationId), eq(purchases.status, "CANCELADA")));
	await trx
		.update(fiscalInboundDocuments)
		.set({ compraId: purchaseId, dataAtualizacao: now })
		.where(
			and(
				eq(fiscalInboundDocuments.organizacaoId, organizationId),
				inArray(fiscalInboundDocuments.chaveAcesso, keys),
				or(isNull(fiscalInboundDocuments.compraId), inArray(fiscalInboundDocuments.compraId, cancelledPurchases)),
			),
		);
}

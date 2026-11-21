import { createHash } from "node:crypto";

/**
 * Assinatura de um pedido como a LISTAGEM do conector o mostra (status, total, data de
 * atualização…), sem o detalhe. Gravada na venda (`sales.assinaturaExternaListagem`) quando o lote vem do
 * detalhe; no run seguinte, um pedido cuja listagem tem a mesma assinatura já está gravado como a
 * fonte o mostra, e o conector pula o detalhe dele (e os contatos/produtos que só ele pedia).
 *
 * Os campos entram em ordem fixa, decidida por quem chama: mudar a lista de campos de um conector
 * muda todas as assinaturas dele, o que só custa um run completo — nunca um pedido perdido.
 */
export function computeListingSignature(source: string, fields: Record<string, unknown>) {
	const digest = createHash("sha256").update(JSON.stringify(fields)).digest("hex");
	return `${source}:v1:${digest}`;
}

/**
 * Separa os pedidos da listagem entre os que precisam de detalhe e os que já estão gravados com a
 * mesma assinatura. Sem `known` (run completo), todos precisam.
 */
export function partitionListingByKnownSignature<T>({
	items,
	getSourceSaleId,
	getSignature,
	known,
}: {
	items: T[];
	getSourceSaleId: (item: T) => string;
	getSignature: (item: T) => string;
	known: Map<string, string> | null;
}) {
	const toFetch: T[] = [];
	const unchanged: T[] = [];
	for (const item of items) {
		if (known && known.get(getSourceSaleId(item)) === getSignature(item)) unchanged.push(item);
		else toFetch.push(item);
	}
	return { toFetch, unchanged };
}

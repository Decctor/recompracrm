import type { TGetSaleDraftOutput } from "@/app/api/pos/sales/route";
import { parseSaleRewardDraftSnapshots } from "@/lib/sales/sale-reward-snapshot";
import { readShopDeliveryFee } from "@/lib/shop/config";
import type { TSaleState } from "@/state-hooks/use-sale-state";
import { mapItemToCartItem } from "./map-sale-to-sale-state";

/**
 * Hidrata o estado do PDV (`useSaleState`) a partir de um rascunho persistido
 * (GET /api/pos/sales?id=), para que o checkout de um orçamento seja a mesma tela da venda nova.
 *
 * Um rascunho não tem pagamentos: eles só nascem na confirmação. Por isso `pagamentos` começa
 * vazio e `pagamentosEfetivadosTotal` é zero — diferente de `mapSaleForEditToSaleState`, que
 * precisa separar transações já efetivadas das editáveis.
 */

type TSaleDraft = TGetSaleDraftOutput["data"]["sale"];

type TSaleDraftMetadataSnapshot = {
	descontoGeral?: number;
	taxaEntrega?: number;
	cashbackResgate?: number;
	cupom?: { cupomId: string; valorDesconto: number; codigo?: string; titulo?: string } | null;
};

function readDraftMetadata(rascunhoMetadados: unknown): TSaleDraftMetadataSnapshot | null {
	if (!rascunhoMetadados || typeof rascunhoMetadados !== "object" || Array.isArray(rascunhoMetadados)) return null;
	return rascunhoMetadados as TSaleDraftMetadataSnapshot;
}

export function mapSaleDraftToSaleState(sale: TSaleDraft): Partial<TSaleState> {
	const metadata = readDraftMetadata(sale.rascunhoMetadados);
	const itens = sale.itens.map(mapItemToCartItem);

	const cashbackResgate = metadata?.cashbackResgate ?? 0;
	// `descontosTotal` agrega desconto comercial e resgate de cashback; o metadado, quando existe,
	// é a fonte precisa do que foi desconto de fato.
	const descontoGeral = metadata?.descontoGeral ?? Math.max(0, (sale.descontosTotal ?? 0) - cashbackResgate);
	const taxaEntrega = Math.min(metadata?.taxaEntrega ?? readShopDeliveryFee(sale.rascunhoMetadados), sale.acrescimosTotal ?? 0);

	return {
		modoCliente: sale.cliente ? "VINCULADO" : "CONSUMIDOR",
		cliente: sale.cliente ? { id: sale.cliente.id, nome: sale.cliente.nome, telefone: sale.cliente.telefone ?? "" } : null,
		vendedorId: sale.vendedorId ?? null,
		vendedorNome: sale.vendedorNome ?? null,
		itens,
		descontoGeral,
		acrescimoGeral: Math.max(0, (sale.acrescimosTotal ?? 0) - taxaEntrega),
		taxaEntrega,
		observacoes: sale.observacoes ?? "",
		entregaModalidade: (sale.entregaModalidade as TSaleState["entregaModalidade"] | null) ?? "PRESENCIAL",
		entregaLocalizacaoId: sale.entregaLocalizacaoId ?? null,
		comandaNumero: sale.comandaNumero ?? null,
		pagamentos: [],
		pagamentosEfetivadosTotal: 0,
		cashbackResgate,
		cupomResgate: metadata?.cupom
			? {
					cupomId: metadata.cupom.cupomId,
					valorDesconto: metadata.cupom.valorDesconto,
					codigo: metadata.cupom.codigo ?? "",
					titulo: metadata.cupom.titulo ?? "",
				}
			: null,
		// Snapshots carimbados pelo servidor (formato atual ou legado); a imagem não vive no snapshot.
		recompensasResgate: parseSaleRewardDraftSnapshots(sale.rascunhoMetadados).map((snapshot) => ({ ...snapshot, imagemCapaUrl: null })),
	};
}

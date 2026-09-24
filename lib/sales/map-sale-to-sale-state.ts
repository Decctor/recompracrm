import type { TGetSaleForEditOutput } from "@/app/api/pos/sales/edit/route";
import { POS_REWARD_SALE_ITEM_ORIGIN, parseSaleRewardDraftSnapshots } from "@/lib/sales/sale-reward-snapshot";
import { readShopDeliveryFee } from "@/lib/shop/config";
import type { TCartItem, TCartItemModifier, TSaleState } from "@/state-hooks/use-sale-state";
import type { TCheckoutPaymentSplit } from "@/lib/payments/schemas";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TPaymentMethodEnum } from "@/schemas/enums";

type TOrganizationPaymentMethodsConfig = TOrganizationConfiguration["defaults"]["pagamentos"]["metodos"];

/**
 * Hidrata o estado do POS (`useSaleState`) a partir de uma venda persistida (GET /api/pos/sales/edit).
 *
 * Itens vêm do snapshot `saleItems.metadados` (mesmo shape do carrinho), com fallback para o
 * catálogo em linhas legadas. Só as transações PENDENTES viram splits editáveis — as efetivadas
 * entram como `pagamentosEfetivadosTotal` e são exibidas em bloco read-only ("Já recebido").
 */

type TSaleForEditData = TGetSaleForEditOutput["data"];

type TItemMetadataSnapshot = {
	nome?: string;
	codigo?: string;
	imagemUrl?: string | null;
	valorUnitarioBase?: number;
	valorModificadores?: number;
	modificadores?: TCartItemModifier[];
	origem?: string;
	recompensaId?: string;
};

function toDateInputValue(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	const parsed = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString().slice(0, 10);
}

/**
 * Estrutural de propósito: a mesma linha de `saleItems` chega por dois reads com seleções de
 * colunas diferentes (edição de venda confirmada e leitura de rascunho). Amarrar ao tipo de um
 * deles obrigaria a duplicar o mapeamento para o outro.
 */
export type TMappableSaleItem = {
	id: string;
	produtoId: string;
	produtoVarianteId?: string | null;
	quantidade: number;
	quantidadeEntregue?: number | null;
	valorVendaUnitario: number;
	valorVendaTotalBruto: number;
	valorTotalDesconto: number;
	valorVendaTotalLiquido: number;
	observacoes?: string | null;
	metadados?: unknown;
	produto?: { nome?: string | null; codigo?: string | null; imagemCapaUrl?: string | null } | null;
	produtoVariante?: { nome?: string | null; codigo?: string | null } | null;
	adicionais: { opcaoId?: string | null; nome: string; quantidade: number; valorUnitario: number; valorTotal: number }[];
};

export function mapItemToCartItem(item: TMappableSaleItem): TCartItem {
	const snapshot =
		item.metadados && typeof item.metadados === "object" && !Array.isArray(item.metadados) ? (item.metadados as TItemMetadataSnapshot) : null;

	const modificadores: TCartItemModifier[] =
		snapshot?.modificadores ??
		item.adicionais.map((modifier) => ({
			opcaoId: modifier.opcaoId ?? "",
			nome: modifier.nome,
			quantidade: modifier.quantidade,
			valorUnitario: modifier.valorUnitario,
			valorTotal: modifier.valorTotal,
		}));
	const valorModificadores = snapshot?.valorModificadores ?? modificadores.reduce((sum, modifier) => sum + modifier.valorTotal, 0);

	return {
		tempId: item.id,
		itemId: item.id,
		quantidadeEntregue: item.quantidadeEntregue ?? 0,
		recompensaId: snapshot?.origem === POS_REWARD_SALE_ITEM_ORIGIN ? (snapshot.recompensaId ?? null) : null,
		produtoId: item.produtoId,
		produtoVarianteId: item.produtoVarianteId ?? null,
		nome: snapshot?.nome ?? item.produtoVariante?.nome ?? item.produto?.nome ?? "Item",
		codigo: snapshot?.codigo ?? item.produtoVariante?.codigo ?? item.produto?.codigo ?? "",
		imagemUrl: snapshot?.imagemUrl ?? item.produto?.imagemCapaUrl ?? null,
		quantidade: item.quantidade,
		valorUnitarioBase: snapshot?.valorUnitarioBase ?? Math.max(0, item.valorVendaUnitario - valorModificadores),
		valorModificadores,
		valorUnitarioFinal: item.valorVendaUnitario,
		valorTotalBruto: item.valorVendaTotalBruto,
		valorDesconto: item.valorTotalDesconto,
		valorTotalLiquido: item.valorVendaTotalLiquido,
		modificadores,
		observacoes: item.observacoes ?? null,
	};
}

/**
 * Colapsa as transações pendentes (editáveis) em splits do checkout; parcelas do mesmo grupo viram
 * um split só.
 *
 * A conta gravada só é reidratada em métodos com `contaFinanceiraEditavel` — nos demais o split
 * mantém `null` ("usar a padrão do método"), que é o único valor que o servidor aceita ali.
 */
function mapPendingPaymentsToSplits(
	pagamentos: TSaleForEditData["pagamentos"],
	methodsConfig: TOrganizationPaymentMethodsConfig,
): TCheckoutPaymentSplit[] {
	const contaEditavel = (metodo: TPaymentMethodEnum) => methodsConfig[metodo]?.contaFinanceiraEditavel ?? false;
	const pending = pagamentos.todas.filter((payment) => payment.editavel);
	const splits: TCheckoutPaymentSplit[] = [];
	const groupedIds = new Set<string>();

	for (const payment of pending) {
		if (!payment.grupoParcelasId) continue;
		if (groupedIds.has(payment.grupoParcelasId)) continue;
		groupedIds.add(payment.grupoParcelasId);
		const groupPending = pending.filter((entry) => entry.grupoParcelasId === payment.grupoParcelasId);
		splits.push({
			id: crypto.randomUUID(),
			metodo: payment.metodo,
			valor: groupPending.reduce((sum, entry) => sum + entry.valor, 0),
			totalParcelas: groupPending.length,
			efetivacaoTipo: "PENDENTE",
			dataPrevisao: toDateInputValue(groupPending[0]?.dataPrevisao),
			observacoes: null,
			// Preserva a conta já gravada — reeditar a venda não pode reverter para a padrão do método.
			contaFinanceiraId: contaEditavel(payment.metodo) ? (payment.contaFinanceiraId ?? null) : null,
		});
	}

	for (const payment of pending.filter((entry) => !entry.grupoParcelasId)) {
		splits.push({
			id: crypto.randomUUID(),
			metodo: payment.metodo,
			valor: payment.valor,
			totalParcelas: null,
			efetivacaoTipo: "PENDENTE",
			dataPrevisao: toDateInputValue(payment.dataPrevisao),
			observacoes: null,
			contaFinanceiraId: contaEditavel(payment.metodo) ? (payment.contaFinanceiraId ?? null) : null,
		});
	}

	return splits;
}

export function mapSaleForEditToSaleState(
	data: TSaleForEditData,
	{ methodsConfig }: { methodsConfig: TOrganizationPaymentMethodsConfig },
): Partial<TSaleState> {
	const venda = data.venda;
	const draftMetadata =
		venda.rascunhoMetadados && typeof venda.rascunhoMetadados === "object" && !Array.isArray(venda.rascunhoMetadados)
			? (venda.rascunhoMetadados as { descontoGeral?: number; taxaEntrega?: number })
			: null;

	// Já exclui o resgate de recompensa (que está em moeda cashback, não em R$).
	const cashbackResgate = data.cashbackResgate;
	const cupomDesconto = data.cupomResgatado?.valorDesconto ?? 0;
	const itens = venda.itens.map(mapItemToCartItem);
	// Recompensas resgatadas: cada item dá o valor comercial e a identidade visual; o débito de
	// saldo vem do ledger (`recompensasResgatadas`), nunca do snapshot do rascunho, que pode estar
	// velho. `descontoGeral` derivado subtrai TODAS as recompensas — subtrair só uma inventaria um
	// desconto geral igual ao valor comercial das outras, e salvar a tela persistiria isso.
	const rewardItems = itens.filter((item): item is TCartItem & { recompensaId: string } => !!item.recompensaId);
	const recompensaSnapshots = parseSaleRewardDraftSnapshots(venda.rascunhoMetadados);
	const descontoRecompensas = rewardItems.reduce((sum, item) => sum + item.valorDesconto, 0);
	const descontoGeral =
		draftMetadata?.descontoGeral ?? Math.max(0, (venda.descontosTotal ?? 0) - cupomDesconto - cashbackResgate - descontoRecompensas);
	const taxaEntrega = Math.min(draftMetadata?.taxaEntrega ?? readShopDeliveryFee(venda.rascunhoMetadados), venda.acrescimosTotal ?? 0);

	return {
		modoCliente: venda.cliente ? "VINCULADO" : "CONSUMIDOR",
		cliente: venda.cliente ? { id: venda.cliente.id, nome: venda.cliente.nome, telefone: venda.cliente.telefone ?? "" } : null,
		vendedorId: venda.vendedorId ?? null,
		vendedorNome: venda.vendedorNome ?? null,
		itens,
		descontoGeral,
		acrescimoGeral: Math.max(0, (venda.acrescimosTotal ?? 0) - taxaEntrega),
		taxaEntrega,
		observacoes: venda.observacoes ?? "",
		entregaModalidade: (venda.entregaModalidade as TSaleState["entregaModalidade"] | null) ?? "PRESENCIAL",
		entregaLocalizacaoId: venda.entregaLocalizacaoId ?? null,
		comandaNumero: venda.comandaNumero ?? null,
		pagamentos: mapPendingPaymentsToSplits(data.pagamentos, methodsConfig),
		pagamentosEfetivadosTotal: data.editabilidade.valorMinimoEdicao,
		cashbackResgate,
		cupomResgate: data.cupomResgatado
			? {
					cupomId: data.cupomResgatado.cupomId,
					valorDesconto: data.cupomResgatado.valorDesconto,
					codigo: data.cupomResgatado.cupomCodigo,
					titulo: data.cupomResgatado.cupomTitulo,
				}
			: null,
		recompensasResgate: rewardItems.map((rewardItem) => {
			const snapshot = recompensaSnapshots.find((entry) => entry.recompensaId === rewardItem.recompensaId) ?? null;
			const ledger = data.recompensasResgatadas.find((entry) => entry.recompensaId === rewardItem.recompensaId) ?? null;
			const quantidade = Math.max(1, rewardItem.quantidade);
			return {
				recompensaId: rewardItem.recompensaId,
				programaId: snapshot?.programaId ?? "",
				titulo: snapshot?.titulo || rewardItem.nome,
				// Por unidade: o ledger guarda o total da linha.
				valor: ledger ? ledger.valor / quantidade : (snapshot?.valor ?? 0),
				valorVenda: rewardItem.valorUnitarioFinal,
				imagemCapaUrl: rewardItem.imagemUrl ?? null,
				quantidade,
			};
		}),
		emissaoFiscalAutomatica: venda.emissaoFiscalAutomatica ?? null,
	};
}

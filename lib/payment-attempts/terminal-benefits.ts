import { listAvailableCashbackRewards, resolveClientCashbackProgram } from "@/lib/cashback/prizes";
import { getCashbackRedemptionBlockReason } from "@/lib/cashback/redemption-policy";
import { listCouponsForClientCart } from "@/lib/coupons/client-cart-coupons";
import { hydratePOSProducts } from "@/lib/pos/hydrate-pos-products";
import type { TSaleCheckoutItemInput } from "@/schemas/sale-checkout";
import { db } from "@/services/drizzle";
import { type TTerminalSaleItemInput, buildTerminalCartItem } from "./terminal-cart-item";
import { buildTerminalCashbackView, buildTerminalCouponView } from "./terminal-benefits-policy";

// Benefícios do cliente para a venda no terminal: saldo e regra de cashback, cupons avaliados no
// carrinho e recompensas. A superfície é a do PDV ("POS"): a maquininha é um caixa da loja, e o
// lojista que desliga resgates no PDV os desliga aqui também.

/** Itens do terminal precificados pelo catálogo do canal (PDV na venda, COMANDA no pedido da conta). */
export async function buildTerminalCartItems({
	organizationId,
	itens,
	canal = "POS",
}: {
	organizationId: string;
	itens: TTerminalSaleItemInput[];
	/** COMANDA para pedidos de conta de atendimento (preço e disponibilidade do canal da conta). */
	canal?: "POS" | "COMANDA";
}) {
	if (itens.length === 0) return [];
	const productIds = [...new Set(itens.map((item) => item.produtoId))];
	const catalog = new Map((await hydratePOSProducts({ orgId: organizationId, productIds, canal })).map((product) => [product.id, product]));
	return itens.map((item) => buildTerminalCartItem(catalog.get(item.produtoId), item));
}

export async function loadTerminalClientBenefits({
	organizationId,
	clienteId,
	itens,
}: {
	organizationId: string;
	clienteId: string;
	itens: TSaleCheckoutItemInput[];
}) {
	const [{ program, balance }, coupons, rewards] = await Promise.all([
		resolveClientCashbackProgram({ tx: db, organizacaoId: organizationId, clienteId }),
		listCouponsForClientCart({
			organizacaoId: organizationId,
			clienteId,
			surface: "POS",
			itens: itens.map((item) => ({
				produtoId: item.produtoId,
				produtoVarianteId: item.produtoVarianteId ?? null,
				quantidade: item.quantidade,
				valorVendaUnitario: item.valorUnitarioFinal,
			})),
			entregaModalidade: "PRESENCIAL",
		}),
		listAvailableCashbackRewards({ tx: db, organizacaoId: organizationId, clienteId, surface: "POS" }),
	]);

	const cashback = program
		? buildTerminalCashbackView({
				program,
				availableBalance: balance?.saldoValorDisponivel ?? 0,
				surfaceBlockReason: getCashbackRedemptionBlockReason({ program, surface: "POS" }),
			})
		: null;

	return {
		cashback,
		cupons: coupons.map(buildTerminalCouponView),
		recompensas: rewards.rewards.map((reward) => ({
			id: reward.id,
			titulo: reward.titulo,
			descricao: reward.descricao,
			imagemCapaUrl: reward.imagemCapaUrl,
			valor: reward.valor,
			valorVenda: reward.valorVenda,
			elegivel: reward.elegivel,
			motivo: reward.motivo,
		})),
	};
}
export type TTerminalClientBenefits = Awaited<ReturnType<typeof loadTerminalClientBenefits>>;

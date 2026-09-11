"use client";

import { IFOOD_CONFIRMATION_SLA_MINUTES } from "@/app/dashboard/sales/_components/fulfillment/pending-confirmation";
import { canAccessDashboardCapability, type TCapabilityContext } from "@/lib/access/capabilities";
import { appRoutes } from "@/lib/navigation/routes";
import { useActionApprovals } from "@/lib/queries/action-approvals";
import { useFinancesOverallStats } from "@/lib/queries/finances";
import { useFiscalPending } from "@/lib/queries/fiscal";
import { useProductsStock } from "@/lib/queries/products";
import { useSalesFulfillment } from "@/lib/queries/sales-fulfillment";
import type { TSaleAttendanceStatusEnum } from "@/schemas/enums";
import dayjs from "dayjs";
import { useMemo } from "react";

/**
 * As pendências da operação somadas por frente, a partir das consultas que cada módulo já expõe.
 *
 * Vive num hook porque duas coisas leem o mesmo resultado: a tabela da aba de Operação e o bloco de
 * risco da faixa do topo, que precisa do total antes de a tabela existir. O React Query desduplica,
 * então chamar o hook nos dois lugares custa uma consulta só.
 *
 * Cada frente é governada pela sua capability e a consulta correspondente fica desligada quando ela
 * é falsa: numa organização sem ERP nenhum destes endpoints chega a ser chamado.
 *
 * Uma célula sem número é uma célula que o dado não responde — reposição de estoque não tem "valor
 * parado" e recebíveis vencidos não trazem contagem nem idade pela rota de totais. Fica `null`, e a
 * tabela imprime "—": um zero ali seria uma afirmação que não podemos fazer.
 */

export type TOperationFront = {
	id: string;
	titulo: string;
	href: string;
	itens: number | null;
	valorParado: number | null;
	maisAntigo: Date | null;
	/** Prazo estourado ou dinheiro de terceiro parado: a linha merece o tom de atenção. */
	urgente: boolean;
};

// Etapas em que o pedido ainda depende da loja — entregue e cancelado saem da conta.
const IN_PROGRESS_STATUSES: TSaleAttendanceStatusEnum[] = ["NAO_INICIADO", "EM_PREPARO", "PRONTO", "EM_ENTREGA"];

function oldestDate(dates: (Date | string | null | undefined)[]): Date | null {
	const valid = dates.filter((date): date is Date | string => !!date).map((date) => dayjs(date));
	if (valid.length === 0) return null;
	return valid.reduce((oldest, current) => (current.isBefore(oldest) ? current : oldest)).toDate();
}

export function useOperationsPending(context: TCapabilityContext) {
	const canViewOrders = canAccessDashboardCapability("orders", context);
	const canViewFiscal = canAccessDashboardCapability("fiscal", context);
	const canViewApprovals = canAccessDashboardCapability("approvals", context);
	const canViewInventory =
		canAccessDashboardCapability("inventory", context) && context.organization.configuracao.preferencias.rastreamentoEstoque === true;
	const canViewFinance = canAccessDashboardCapability("finance", context);

	const fulfillment = useSalesFulfillment({ enabled: canViewOrders });
	const fiscal = useFiscalPending({ enabled: canViewFiscal, refetchInterval: 120_000 });
	const approvals = useActionApprovals({ status: "PENDENTE", enabled: canViewApprovals });
	const stock = useProductsStock({
		enabled: canViewInventory,
		initialFilters: { stockStatus: ["out", "low"], trackedOnly: true, orderByField: "quantidade", orderByDirection: "asc" },
	});
	const finance = useFinancesOverallStats({ enabled: canViewFinance, initialParams: {} });

	const frentes = useMemo(() => {
		const rows: TOperationFront[] = [];

		if (canViewOrders && fulfillment.data) {
			const inProgress = fulfillment.data.cards.filter((card) => IN_PROGRESS_STATUSES.includes(card.statusAtendimento));
			const pendingConfirmation = fulfillment.data.pendingConfirmation;
			const itens = inProgress.length + pendingConfirmation.length;
			// Pedido de canal esperando confirmação corre contra um SLA de minutos: se algum já passou
			// do prazo, a frente inteira é urgente.
			const overdueConfirmation = pendingConfirmation.some(
				(order) => order.dataVenda && dayjs(order.dataVenda).add(IFOOD_CONFIRMATION_SLA_MINUTES, "minute").isBefore(dayjs()),
			);
			if (itens > 0) {
				rows.push({
					id: "orders",
					titulo: "Pedidos em aberto",
					href: appRoutes.sales.orders(),
					itens,
					valorParado: [...inProgress, ...pendingConfirmation].reduce((acc, card) => acc + (card.valorTotal ?? 0), 0),
					maisAntigo: oldestDate([...inProgress, ...pendingConfirmation].map((card) => card.dataVenda)),
					urgente: overdueConfirmation,
				});
			}
		}

		if (canViewFiscal && fiscal.data && fiscal.data.resumo.documentos > 0) {
			rows.push({
				id: "fiscal",
				titulo: "Fiscal travado",
				href: appRoutes.fiscal.pending(),
				itens: fiscal.data.resumo.documentos,
				valorParado: fiscal.data.resumo.valorTravado,
				maisAntigo: null,
				// Prazo de cancelamento acabando é o relógio mais curto do módulo.
				urgente: fiscal.data.resumo.prazosExpirando > 0,
			});
		}

		if (canViewApprovals && approvals.data && approvals.data.length > 0) {
			rows.push({
				id: "approvals",
				titulo: "Aprovações",
				href: appRoutes.approvals(),
				itens: approvals.data.length,
				valorParado: approvals.data.reduce((acc, request) => acc + (request.resumo.valorPrincipal ?? 0), 0),
				maisAntigo: oldestDate(approvals.data.map((request) => request.dataInsercao)),
				// Alguém está parado esperando uma decisão que é sua.
				urgente: true,
			});
		}

		if (canViewInventory && stock.data && stock.data.productsMatched > 0) {
			rows.push({
				id: "inventory",
				titulo: "Reposição de estoque",
				href: appRoutes.inventory.root(),
				itens: stock.data.productsMatched,
				// A visão de estoque conta produtos, não dinheiro parado.
				valorParado: null,
				maisAntigo: null,
				urgente: stock.data.resumo.produtosSemEstoque > 0,
			});
		}

		if (canViewFinance && finance.data) {
			const overdue = finance.data.totalPendingTransactionsOverdue;
			const total = (overdue?.inflow ?? 0) + (overdue?.outflow ?? 0);
			if (total > 0) {
				rows.push({
					id: "finance",
					titulo: "Recebíveis vencidos",
					href: appRoutes.finance.transactions(),
					// A rota de totais responde valor, não quantidade nem idade.
					itens: null,
					valorParado: total,
					maisAntigo: null,
					urgente: true,
				});
			}
		}

		return rows;
	}, [
		canViewOrders,
		canViewFiscal,
		canViewApprovals,
		canViewInventory,
		canViewFinance,
		fulfillment.data,
		fiscal.data,
		approvals.data,
		stock.data,
		finance.data,
	]);

	const enabledQueries = [
		canViewOrders && fulfillment,
		canViewFiscal && fiscal,
		canViewApprovals && approvals,
		canViewInventory && stock,
		canViewFinance && finance,
	].filter((query): query is Exclude<typeof query, false> => query !== false);

	return {
		frentes,
		valorParado: frentes.reduce((acc, front) => acc + (front.valorParado ?? 0), 0),
		totalItens: frentes.reduce((acc, front) => acc + (front.itens ?? 0), 0),
		// Uma frente sem permissão não existe, então "nenhuma consulta habilitada" não é carregamento.
		isPending: enabledQueries.some((query) => query.isPending),
		isError: enabledQueries.some((query) => query.isError),
		error: enabledQueries.find((query) => query.isError)?.error ?? null,
	};
}

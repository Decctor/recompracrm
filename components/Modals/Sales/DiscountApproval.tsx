"use client";
import { formatToMoney } from "@/lib/formatting";
import type { TVendaDescontoApprovalPayload } from "@/schemas/action-approvals";
import { useMemo } from "react";
import { ActionApprovalPrompt } from "./ActionApprovalPrompt";

type DiscountApprovalProps = {
	vendedorId: string | null;
	valorBase: number;
	descontoTotal: number;
	limiteSolicitante: TVendaDescontoApprovalPayload["limiteSolicitante"];
	closeModal: () => void;
	// Chamado com o ID da aprovação válida — o chamador finaliza a venda com ele.
	onApproved: (approvalRequestId: string) => void;
};

/**
 * Aprovação de desconto acima do teto do operador. A mecânica (senha do gestor presente ou
 * solicitação remota com espera) é a de `ActionApprovalPrompt`; aqui ficam só o payload
 * VENDA_DESCONTO e o resumo do desconto.
 */
export function DiscountApproval({ vendedorId, valorBase, descontoTotal, limiteSolicitante, closeModal, onApproved }: DiscountApprovalProps) {
	const payload: TVendaDescontoApprovalPayload = useMemo(
		() => ({
			tipo: "VENDA_DESCONTO",
			vendedorId,
			valorBase,
			descontoSolicitado: descontoTotal,
			descontoPercentual: valorBase > 0 ? (descontoTotal / valorBase) * 100 : 0,
			limiteSolicitante,
		}),
		[vendedorId, valorBase, descontoTotal, limiteSolicitante],
	);

	const descontoPercentualLabel = `${payload.descontoPercentual.toFixed(1).replace(".", ",")}%`;

	return (
		<ActionApprovalPrompt
			payload={payload}
			title="APROVAÇÃO DE DESCONTO"
			description="O desconto aplicado excede o limite do operador e precisa da aprovação de um gestor."
			pinInputId="discount-approval-operator-password"
			pinHint="Um gestor com permissão de aprovar descontos informa a senha de operador do vendedor vinculado ao seu usuário."
			remoteWaitingHint="A solicitação está na fila de aprovações (Vendas → Aprovações) e expira em 15 minutos. Você também pode salvar a venda como orçamento e finalizá-la depois da aprovação."
			remoteApprovedMessage="Desconto aprovado pelo gestor."
			closeModal={closeModal}
			onApproved={onApproved}
			details={
				<div className="flex flex-col gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800/40 dark:bg-red-900/10">
					<p className="text-xs font-bold text-red-700 dark:text-red-300">
						Desconto solicitado: {formatToMoney(descontoTotal)} ({descontoPercentualLabel})
					</p>
					<p className="text-[0.65rem] text-red-700/80 dark:text-red-300/80">Valor bruto da venda: {formatToMoney(valorBase)}</p>
					{limiteSolicitante?.tipo && limiteSolicitante.valor !== null ? (
						<p className="text-[0.65rem] text-red-700/80 dark:text-red-300/80">
							Limite do operador: {limiteSolicitante.tipo === "PERCENTUAL" ? `${limiteSolicitante.valor}%` : formatToMoney(limiteSolicitante.valor)}
						</p>
					) : null}
				</div>
			}
		/>
	);
}

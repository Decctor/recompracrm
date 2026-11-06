"use client";
import { formatToMoney } from "@/lib/formatting";
import type { TVendaFiadoApprovalPayload } from "@/schemas/action-approvals";
import { ActionApprovalPrompt } from "./ActionApprovalPrompt";

type StoreCreditApprovalProps = {
	/** Montado por `useStoreCreditGuard` a partir da posição do cliente e do fiado desta venda. */
	payload: TVendaFiadoApprovalPayload;
	/** Disponível do cliente na avaliação (`null` = sem limite). */
	disponivel: number | null;
	/** Motivo do bloqueio, o mesmo texto do servidor (`describeStoreCreditDenial`). */
	denialText: string | null;
	closeModal: () => void;
	// Chamado com o ID da aprovação válida — o chamador finaliza a venda com ele.
	onApproved: (approvalRequestId: string) => void;
};

/**
 * Liberação de fiado fora da regra do cliente (não liberado ou acima do limite). O gestor autoriza
 * ESTE fiado — um valor, para um cliente — sem mexer no cadastro; mesma mecânica de senha/remota
 * da aprovação de desconto (`ActionApprovalPrompt`).
 */
export function StoreCreditApproval({ payload, disponivel, denialText, closeModal, onApproved }: StoreCreditApprovalProps) {
	const motivoLabel = payload.motivo === "NAO_LIBERADO" ? "Cliente não liberado para fiado" : "Fiado acima do limite do cliente";

	return (
		<ActionApprovalPrompt
			payload={payload}
			title="LIBERAÇÃO DE FIADO"
			description="O fiado desta venda está fora da regra de liberação do cliente e precisa da autorização de um gestor."
			pinInputId="store-credit-approval-operator-password"
			pinHint="Um gestor com permissão de liberar fiado informa a senha de operador do vendedor vinculado ao seu usuário."
			remoteWaitingHint="A solicitação está na fila de aprovações (Vendas → Aprovações) e expira em 15 minutos. A liberação vale só para este fiado, neste valor."
			remoteApprovedMessage="Fiado liberado pelo gestor."
			closeModal={closeModal}
			onApproved={onApproved}
			details={
				<div className="flex flex-col gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800/40 dark:bg-red-900/10">
					<p className="text-xs font-bold text-red-700 dark:text-red-300">{motivoLabel}</p>
					{denialText ? <p className="text-[0.65rem] text-red-700/80 dark:text-red-300/80">{denialText}</p> : null}
					<div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[0.65rem] text-red-700/80 dark:text-red-300/80">
						<span>Cliente</span>
						<span className="min-w-0 truncate text-right font-semibold">{payload.clienteNome}</span>
						<span>Fiado desta venda</span>
						<span className="text-right font-bold tabular-nums">{formatToMoney(payload.valorSolicitado)}</span>
						<span>Em aberto</span>
						<span className="text-right tabular-nums">{formatToMoney(payload.saldoEmAberto)}</span>
						{payload.motivo === "ACIMA_DO_LIMITE" ? (
							<>
								<span>Limite</span>
								<span className="text-right tabular-nums">{payload.limite === null ? "Sem limite" : formatToMoney(payload.limite)}</span>
								<span>Disponível</span>
								<span className="text-right tabular-nums">{disponivel === null ? "Sem limite" : formatToMoney(disponivel)}</span>
							</>
						) : null}
					</div>
				</div>
			}
		/>
	);
}

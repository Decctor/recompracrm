"use client";

import { SalesSessionPicker, useOpenSalesSessionSelection } from "@/components/CashSessions/SalesSessionPicker";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { findFiscalAction, formatRemainingTime } from "@/components/Fiscal/fiscal-problem-presentation";
import type { TFiscalDocumentAction } from "@/lib/fiscal/document-actions";
import { getErrorMessage } from "@/lib/errors";
import { appRoutes } from "@/lib/navigation/routes";
import { formatToMoney } from "@/lib/formatting";
import { cancelConfirmedSale } from "@/lib/mutations/pos";
import { SALES_FULFILLMENT_QUERY_KEY } from "@/lib/queries/sales-fulfillment";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileWarning } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

type CancelConfirmedSaleDialogProps = {
	saleId: string;
	idExterno: string;
	valorTotal: number;
	clienteNome?: string | null;
	// Venda recebida em dinheiro: o cancelamento devolve o valor por uma gaveta, então pede o caixa.
	hasCashPayment: boolean;
	// Documento fiscal vivo: o cancelamento da venda exige cancelar/inutilizar a nota primeiro.
	exigeCancelamentoFiscal: boolean;
	// Documentos da venda com a matriz de acoes: decide entre "cancele a nota" e "gere a devolucao".
	documentosFiscais?: Array<{ id: string; tipo: string; numero: string | null; statusInterno: string; acoes?: TFiscalDocumentAction[] }>;
	closeModal: () => void;
	onSuccess?: () => void;
};

/**
 * Cancelamento com estorno de venda CONFIRMADA. Não é exclusão: a venda permanece no histórico
 * como CANCELADA, com estorno contábil espelhado, transações canceladas/estornadas, devolução de
 * estoque e reversão de cashback/cupons — tudo feito pelo fluxo existente no servidor.
 */
export function CancelConfirmedSaleDialog({
	saleId,
	idExterno,
	valorTotal,
	clienteNome,
	hasCashPayment,
	exigeCancelamentoFiscal,
	documentosFiscais = [],
	closeModal,
	onSuccess,
}: CancelConfirmedSaleDialogProps) {
	// A nota que trava a venda: autorizada (ou a caminho) e sem devolucao autorizada apontando para ela.
	const blockingDocument = documentosFiscais.find((document) => !["CANCELADO", "INUTILIZADO"].includes(document.statusInterno));
	const cancelAction = blockingDocument ? findFiscalAction(blockingDocument.acoes, "CANCELAR") : null;
	const cancelRemaining = cancelAction?.prazoLimite ? formatRemainingTime(cancelAction.prazoLimite) : null;
	const blockingLabel = blockingDocument
		? `${blockingDocument.tipo === "NFCE" ? "NFC-e" : blockingDocument.tipo === "NFE" ? "NF-e" : blockingDocument.tipo}${blockingDocument.numero ? ` nº ${blockingDocument.numero}` : ""}`
		: "documento fiscal";
	const queryClient = useQueryClient();
	const [reason, setReason] = useState("");
	const reasonIsValid = reason.trim().length >= 3;
	// Sem escolha, o servidor usa o caixa onde o dinheiro entrou (se ainda aberto) ou o único aberto;
	// com vários abertos e nenhum deles o de origem, ele recusa e pede a escolha feita aqui.
	const { openSessions, sessaoVendaId, setSessaoVendaId, selectedSession } = useOpenSalesSessionSelection();

	const { mutate: cancelSale, isPending } = useMutation({
		mutationKey: ["cancel-confirmed-sale", saleId],
		mutationFn: cancelConfirmedSale,
		onSuccess: async (data) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["sales"] }),
				queryClient.invalidateQueries({ queryKey: ["sales-by-id", saleId] }),
				queryClient.invalidateQueries({ queryKey: SALES_FULFILLMENT_QUERY_KEY }),
				queryClient.invalidateQueries({ queryKey: ["sales-fulfillment-by-id", saleId] }),
				queryClient.invalidateQueries({ queryKey: ["sales-session-by-id"] }),
			]);
			toast.success(data.message);
			onSuccess?.();
			closeModal();
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	return (
		<Dialog open onOpenChange={(open) => (!isPending && !open ? closeModal() : null)}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<div className="flex items-center gap-2 text-destructive">
						<AlertTriangle className="h-5 w-5" />
						<DialogTitle>Cancelar venda?</DialogTitle>
					</div>
					<DialogDescription>
						O cancelamento estorna o lançamento contábil, cancela ou estorna os recebimentos, devolve o estoque entregue e reverte cashback e cupons. A
						venda permanece no histórico como CANCELADA.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
					<div className="flex items-center justify-between gap-3 text-sm">
						<span className="text-muted-foreground">Identificador</span>
						<span className="font-bold">{idExterno}</span>
					</div>
					<div className="flex items-center justify-between gap-3 text-sm">
						<span className="text-muted-foreground">Valor</span>
						<span className="font-bold">{formatToMoney(valorTotal)}</span>
					</div>
					<div className="flex items-center justify-between gap-3 text-sm">
						<span className="text-muted-foreground">Cliente</span>
						<span className="font-bold">{clienteNome ?? "AO CONSUMIDOR"}</span>
					</div>
				</div>

				{exigeCancelamentoFiscal ? (
					<div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
						<div className="flex items-center gap-2 font-bold">
							<FileWarning className="h-4 w-4 text-destructive" />
							{cancelAction && !cancelAction.disponivel ? "Prazo de cancelamento da nota encerrado" : "Cancele primeiro o documento fiscal"}
						</div>
						{blockingDocument?.statusInterno === "AUTORIZADO" && cancelAction ? (
							cancelAction.disponivel ? (
								<p className="text-muted-foreground">
									A {blockingLabel} está autorizada e ainda pode ser cancelada por mais {cancelRemaining ?? "alguns minutos"}. Cancele a nota primeiro e volte
									aqui para cancelar a venda.
								</p>
							) : (
								<p className="text-muted-foreground">
									{cancelAction.motivoIndisponivel} A {blockingLabel} continua válida na SEFAZ. Gere a NF-e de devolução referenciando ela; assim que a
									devolução for autorizada, esta venda poderá ser cancelada.
								</p>
							)
						) : (
							<p className="text-muted-foreground">
								Esta venda possui {blockingLabel} em andamento ({blockingDocument?.statusInterno ?? "vivo"}). Aguarde o desfecho ou resolva o documento antes
								do cancelamento da venda — sem isso os valores fiscais ficariam dessincronizados.
							</p>
						)}
						<Button variant="outline" asChild>
							<Link href={blockingDocument ? appRoutes.fiscal.document(blockingDocument.id) : appRoutes.sales.details(saleId)}>
								{cancelAction?.disponivel ? "CANCELAR A NOTA" : cancelAction ? "GERAR NF-E DE DEVOLUÇÃO" : "VER DOCUMENTO FISCAL"}
							</Link>
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						<label htmlFor="cancel-sale-reason" className="text-xs font-bold uppercase tracking-wide">
							Motivo do cancelamento
						</label>
						<Textarea
							id="cancel-sale-reason"
							placeholder="Descreva o motivo do cancelamento (mínimo 3 caracteres)..."
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							disabled={isPending}
						/>
						{hasCashPayment && openSessions.length > 0 ? (
							<SalesSessionPicker
								openSessions={openSessions}
								selectedSession={selectedSession}
								onSelect={setSessaoVendaId}
								required
								label="Caixa que devolve o dinheiro"
							/>
						) : null}
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" disabled={isPending} onClick={closeModal}>
						VOLTAR
					</Button>
					{!exigeCancelamentoFiscal ? (
						<LoadingButton
							variant="destructive"
							loading={isPending}
							disabled={!reasonIsValid}
							onClick={() => cancelSale({ id: saleId, reason: reason.trim(), saleSessionId: hasCashPayment ? sessaoVendaId : null })}
						>
							CANCELAR VENDA E ESTORNAR
						</LoadingButton>
					) : null}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

"use client";

import SelectClientInput, { type TSelectClientValue } from "@/components/Inputs/SelectClient";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { reassignSaleClient } from "@/lib/mutations/sales";
import { SALES_FULFILLMENT_QUERY_KEY } from "@/lib/queries/sales-fulfillment";
import { useSaleClientReassignmentPreview } from "@/lib/queries/sales";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileWarning, UserRoundPen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ReassignSaleClientDialogProps = {
	saleId: string;
	cliente: { id: string; nome: string; telefone: string | null } | null;
	closeModal: () => void;
	onSuccess?: () => void;
};

/**
 * Definir, trocar ou desvincular o cliente de uma venda CONFIRMADA. A prévia vem do servidor
 * (política + cashback) e é o que decide o que o operador vê: recusas viram estado desabilitado
 * com o motivo, nunca um submit que falha; o consentimento fiscal só aparece quando a NFC-e viva
 * carrega o CPF do cliente atual.
 */
export function ReassignSaleClientDialog({ saleId, cliente, closeModal, onSuccess }: ReassignSaleClientDialogProps) {
	const queryClient = useQueryClient();
	const [nextClient, setNextClient] = useState<TSelectClientValue>(null);
	const [fiscalConfirmed, setFiscalConfirmed] = useState(false);
	const { data: preview, isLoading, isError, error } = useSaleClientReassignmentPreview({ saleId, clienteId: nextClient?.id ?? null });

	const isDefining = !cliente;
	const politica = preview?.politica ?? null;
	const cashback = preview?.cashback ?? null;
	const sameClient = !!nextClient && nextClient.id === cliente?.id;
	const canSubmit = !!politica?.elegivel && !!nextClient && !sameClient && (!politica.confirmacaoFiscalExigida || fiscalConfirmed);

	const { mutate, isPending } = useMutation({
		mutationKey: ["reassign-sale-client", saleId],
		mutationFn: reassignSaleClient,
		onSuccess: async (data) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["sales"] }),
				queryClient.invalidateQueries({ queryKey: ["sales-by-id", saleId] }),
				queryClient.invalidateQueries({ queryKey: SALES_FULFILLMENT_QUERY_KEY }),
				queryClient.invalidateQueries({ queryKey: ["sales-fulfillment-by-id", saleId] }),
				queryClient.invalidateQueries({ queryKey: ["sale-client-reassignment-preview", saleId] }),
			]);
			toast.success(data.message);
			onSuccess?.();
			closeModal();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	return (
		<Dialog open onOpenChange={(open) => (!isPending && !open ? closeModal() : null)}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<div className="flex items-center gap-2">
						<UserRoundPen className="h-5 w-5 text-brand" />
						<DialogTitle>{isDefining ? "Definir cliente da venda" : "Trocar cliente da venda"}</DialogTitle>
					</div>
					<DialogDescription>
						{isDefining
							? "A venda passa a contar no histórico do cliente escolhido, com acúmulo de cashback quando a venda estiver paga."
							: "O cashback acumulado nesta venda sai do cliente atual e entra no novo. Resgates e cupons usados nesta venda impedem a troca."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">Cliente atual</span>
						<span className="font-bold">{cliente?.nome ?? "AO CONSUMIDOR"}</span>
					</div>
					{preview ? (
						<div className="flex items-center justify-between gap-3">
							<span className="text-muted-foreground">Venda</span>
							<span className="font-bold">
								{preview.venda.idExterno} · {formatToMoney(preview.venda.valorTotal)}
							</span>
						</div>
					) : null}
				</div>

				{isLoading ? (
					<div className="flex flex-col gap-2">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-16 w-full" />
					</div>
				) : isError ? (
					<p className="text-sm text-destructive">{getErrorMessage(error)}</p>
				) : politica && !politica.elegivel ? (
					<div className="flex flex-col gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
						<p className="font-bold">Esta venda não permite alteração de cliente</p>
						<ul className="list-disc space-y-1 pl-4 text-muted-foreground">
							{politica.motivos.map((motivo) => (
								<li key={motivo}>{motivo}</li>
							))}
						</ul>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<SelectClientInput
							label="NOVO CLIENTE"
							value={nextClient}
							handleChange={(client) => {
								setNextClient({ id: client.id, nome: client.nome, telefone: client.telefone });
								setFiscalConfirmed(false);
							}}
							onReset={() => setNextClient(null)}
						/>
						{sameClient ? <p className="text-xs text-destructive">A venda já pertence a este cliente.</p> : null}

						{cashback && (cashback.estornavel > 0 || cashback.naoEstornavel > 0 || (nextClient && cashback.acumuloPrevisto > 0)) ? (
							<div className="flex flex-col gap-2 rounded-2xl border border-border p-4 text-sm">
								<p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Cashback</p>
								{cashback.estornavel > 0 ? (
									<div className="flex items-center justify-between gap-3">
										<span className="text-muted-foreground">Sai do cliente atual</span>
										<span className="font-bold tabular-nums">{formatToMoney(cashback.estornavel)}</span>
									</div>
								) : null}
								{cashback.naoEstornavel > 0 ? (
									<div className="flex items-center justify-between gap-3">
										<span className="text-muted-foreground">Já usado pelo cliente atual (não será cobrado)</span>
										<span className="font-bold tabular-nums">{formatToMoney(cashback.naoEstornavel)}</span>
									</div>
								) : null}
								{nextClient && cashback.acumuloPrevisto > 0 ? (
									<div className="flex items-center justify-between gap-3">
										<span className="text-muted-foreground">Entra para {nextClient.nome}</span>
										<span className="font-bold tabular-nums text-success">{formatToMoney(cashback.acumuloPrevisto)}</span>
									</div>
								) : null}
								{nextClient && cashback.acumuloPrevisto <= 0 ? (
									<p className="text-xs text-muted-foreground">O novo cliente não acumula nesta venda (venda em aberto ou fora da regra do programa).</p>
								) : null}
							</div>
						) : null}

						{politica?.confirmacaoFiscalExigida && politica.documentoFiscal ? (
							<div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
								<div className="flex items-center gap-2 font-bold">
									<FileWarning className="h-4 w-4 text-amber-600" />A NFC-e{politica.documentoFiscal.numero ? ` nº ${politica.documentoFiscal.numero}` : ""}{" "}
									tem o CPF do cliente atual
								</div>
								<p className="text-muted-foreground">
									A NFC-e não admite correção de destinatário e permanecerá como está. A venda passa a pertencer ao novo cliente, mas a nota continua
									identificando o cliente atual.
								</p>
								<label className="flex cursor-pointer items-start gap-2">
									<Checkbox checked={fiscalConfirmed} onCheckedChange={(checked) => setFiscalConfirmed(checked === true)} className="mt-0.5" />
									<span>Entendo que a nota fiscal não será alterada.</span>
								</label>
							</div>
						) : null}
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" disabled={isPending} onClick={closeModal}>
						VOLTAR
					</Button>
					{politica?.elegivel ? (
						<LoadingButton
							loading={isPending}
							disabled={!canSubmit}
							onClick={() => mutate({ saleId, clienteId: nextClient?.id ?? null, confirmacoes: { fiscal: fiscalConfirmed } })}
						>
							{isDefining ? "DEFINIR CLIENTE" : "TROCAR CLIENTE"}
						</LoadingButton>
					) : null}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

"use client";
import { LoadingButton } from "@/components/loading-button";
import { POI_OPERATION_KINDS, type TPoiOperationKind } from "@/components/PointOfInteraction/operation-kinds";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { rejectPoiTransactionRequest } from "@/lib/mutations/poi-transaction-requests";
import { POI_REJECTION_NOTE_MAX_LENGTH } from "@/lib/point-of-interaction/transaction-requests";
import { cn } from "@/lib/utils";
import { POI_TRANSACTION_REJECTION_REASON_LABELS, PoiTransactionRejectionReasonEnum, type TPoiTransactionRejectionReasonEnum } from "@/schemas/enums";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

type RejectTransactionProps = {
	requestId: string;
	clientDisplayName: string;
	/** O que foi pedido, para o operador confirmar que rejeita a solicitação certa. */
	summary: { kind: TPoiOperationKind; title: string; details: string | null };
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/** Rejeição de uma solicitação do ponto de interação. O motivo (e a observação) aparecem no celular do cliente. */
export function RejectTransaction({ requestId, clientDisplayName, summary, closeModal, callbacks }: RejectTransactionProps) {
	const [motivo, setMotivo] = useState<TPoiTransactionRejectionReasonEnum | null>(null);
	const [observacao, setObservacao] = useState("");
	const reasonGroupId = useId();
	const meta = POI_OPERATION_KINDS[summary.kind];
	const Icon = meta.icon;

	const { mutate, isPending } = useMutation({
		mutationKey: ["reject-poi-transaction-request", requestId],
		mutationFn: rejectPoiTransactionRequest,
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => {
			callbacks?.onError?.(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	function handleReject() {
		if (!motivo) return toast.error("Escolha o motivo da rejeição.");
		if (motivo === "OUTRO" && !observacao.trim()) return toast.error("Descreva o motivo na observação.");
		mutate({ requestId, motivo, observacao: observacao.trim() || null });
	}

	return (
		<ResponsiveMenu.Root
			open
			onOpenChange={(open) => {
				if (!open) closeModal();
			}}
		>
			<ResponsiveMenu.Content dialogClassName="min-w-0 sm:max-w-lg" drawerVariant="fit">
				<ResponsiveMenu.Header>
					<ResponsiveMenu.Title>REJEITAR SOLICITAÇÃO</ResponsiveMenu.Title>
					<ResponsiveMenu.Description>Cliente: {clientDisplayName}. O motivo aparece para o cliente no celular.</ResponsiveMenu.Description>
				</ResponsiveMenu.Header>
				<ResponsiveMenu.Body className="gap-4">
					<div className={cn("flex items-center gap-3 rounded-2xl border px-3.5 py-3", meta.classes.surface)}>
						<span className={cn("flex size-9 min-w-9 items-center justify-center rounded-xl", meta.classes.iconTile)}>
							<Icon className="size-4.5" />
						</span>
						<div className="flex min-w-0 flex-col">
							<span className={cn("text-[0.65rem] font-semibold", meta.classes.text)}>{meta.label.toUpperCase()}</span>
							<span className="text-sm font-semibold break-words">{summary.title}</span>
							{summary.details ? <span className="text-xs text-muted-foreground">{summary.details}</span> : null}
						</div>
					</div>

					<fieldset className="flex flex-col gap-2">
						<legend className="mb-2 text-sm font-medium tracking-tight text-foreground/80">
							MOTIVO<span className="text-red-500">*</span>
						</legend>
						{PoiTransactionRejectionReasonEnum.options.map((reason) => (
							<label
								key={reason}
								className={cn(
									"flex cursor-pointer items-center gap-2.5 rounded-full border px-3.5 py-2.5 text-sm transition-colors",
									motivo === reason ? "border-primary bg-secondary font-medium" : "border-border hover:bg-secondary/60",
								)}
							>
								<input
									type="radio"
									name={reasonGroupId}
									value={reason}
									checked={motivo === reason}
									onChange={() => setMotivo(reason)}
									className="size-4 accent-primary"
								/>
								{POI_TRANSACTION_REJECTION_REASON_LABELS[reason]}
							</label>
						))}
					</fieldset>

					<div className="flex flex-col gap-1">
						<Label htmlFor={`${reasonGroupId}-note`} className="text-sm font-medium tracking-tight text-foreground/80">
							OBSERVAÇÃO{motivo === "OUTRO" ? <span className="text-red-500">*</span> : null}
						</Label>
						<Input
							id={`${reasonGroupId}-note`}
							placeholder={motivo === "OUTRO" ? "Descreva o motivo para o cliente" : "Opcional. Ex: o item volta na sexta."}
							maxLength={POI_REJECTION_NOTE_MAX_LENGTH}
							value={observacao}
							onChange={(event) => setObservacao(event.target.value)}
						/>
					</div>
				</ResponsiveMenu.Body>
				<ResponsiveMenu.Footer>
					<ResponsiveMenu.Close variant="outline">CANCELAR</ResponsiveMenu.Close>
					<LoadingButton variant="destructive" loading={isPending} onClick={handleReject}>
						<X />
						REJEITAR
					</LoadingButton>
				</ResponsiveMenu.Footer>
			</ResponsiveMenu.Content>
		</ResponsiveMenu.Root>
	);
}

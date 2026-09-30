"use client";

import DateInput from "@/components/Inputs/DateInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { createAdminPlatformPartnerPayoutReceipt, updateAdminPlatformPartnerPayout } from "@/lib/mutations/platform-partnerships";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import { FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ControlAdminPlatformPartnerPayoutProps = {
	payout: {
		id: string;
		status: "RASCUNHO" | "APROVADO" | "PAGO" | "CANCELADO";
		valorTotalCentavos: number;
		chavePixSnapshot: string | null;
		comprovanteUrl: string | null;
		observacoes: string | null;
		partner: { nome: string };
	};
	closeModal: () => void;
	callbacks?: {
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/**
 * Fecha um payout: anexa o comprovante (bucket privado) e marca como pago. Payout já pago só
 * troca/anexa o comprovante — a data de pagamento e as comissões já foram baixadas.
 */
export function ControlAdminPlatformPartnerPayout({ payout, closeModal, callbacks }: ControlAdminPlatformPartnerPayoutProps) {
	const alreadyPaid = payout.status === "PAGO";
	const [dataPagamento, setDataPagamento] = useState<string | undefined>(dayjs().format("YYYY-MM-DD"));
	const [observacoes, setObservacoes] = useState(payout.observacoes ?? "");
	const [file, setFile] = useState<File | null>(null);

	const { mutate, isPending } = useMutation({
		mutationKey: ["control-admin-platform-partner-payout", payout.id],
		mutationFn: async () => {
			if (file) await createAdminPlatformPartnerPayoutReceipt({ payoutId: payout.id, file });
			if (alreadyPaid) return { message: "Comprovante enviado com sucesso." };
			return updateAdminPlatformPartnerPayout({
				payoutId: payout.id,
				status: "PAGO",
				// Meio-dia de São Paulo: a data escolhida não escorrega para o dia anterior em UTC.
				dataPagamento: dataPagamento ? new Date(`${dataPagamento}T12:00:00-03:00`) : null,
				observacoes: observacoes.trim() || null,
				comprovanteUrl: null,
			});
		},
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

	return (
		<ResponsiveMenu
			menuTitle={alreadyPaid ? "COMPROVANTE DO PIX" : "MARCAR PIX COMO PAGO"}
			menuDescription={`${payout.partner.nome} · ${formatToMoney(payout.valorTotalCentavos / 100)} · chave ${payout.chavePixSnapshot ?? "—"}`}
			menuActionButtonText={alreadyPaid ? "ENVIAR COMPROVANTE" : "MARCAR COMO PAGO"}
			menuCancelButtonText="CANCELAR"
			menuActionButtonDisabled={alreadyPaid ? !file : !dataPagamento}
			actionFunction={() => mutate()}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			{!alreadyPaid ? <DateInput label="DATA DO PAGAMENTO" value={dataPagamento} handleChange={setDataPagamento} /> : null}
			<label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm transition-colors hover:bg-muted/50">
				<FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
				<span className="flex-1">
					{file ? file.name : payout.comprovanteUrl ? "Trocar comprovante (já anexado)" : "Anexar comprovante (PDF ou imagem, até 10 MB)"}
				</span>
				<input
					type="file"
					accept="application/pdf,image/jpeg,image/png,image/webp"
					className="hidden"
					onChange={(event) => setFile(event.target.files?.[0] ?? null)}
				/>
			</label>
			{!alreadyPaid ? (
				<>
					<TextareaInput
						label="OBSERVAÇÕES (INTERNAS)"
						placeholder="ID da transação, banco..."
						value={observacoes}
						handleChange={setObservacoes}
						rows={2}
					/>
					<p className="text-xs text-muted-foreground">As comissões deste payout passam para PAGA e o parceiro vê o PIX no extrato.</p>
				</>
			) : null}
		</ResponsiveMenu>
	);
}

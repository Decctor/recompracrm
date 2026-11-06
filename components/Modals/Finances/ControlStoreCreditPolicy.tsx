"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { TGetStoreCreditPolicyOutput, TUpdateStoreCreditPolicyInput } from "@/app/api/finances/store-credit/policy/route";
import CheckboxInput from "@/components/Inputs/CheckboxInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { updateStoreCreditPolicy } from "@/lib/mutations/store-credit";

type ControlStoreCreditPolicyProps = {
	/** O estado para onde a política vai: `true` liga a exigência, `false` desliga. */
	exigeLiberacao: boolean;
	preApproval: TGetStoreCreditPolicyOutput["data"]["preApproval"];
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdateStoreCreditPolicyInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/**
 * Confirmação da política de fiado. Ligar a exigência muda o balcão no mesmo instante, então o menu
 * diz antes quem será pré-liberado — sem isso o cliente de sempre seria barrado na próxima compra.
 */
export function ControlStoreCreditPolicy({ exigeLiberacao, preApproval, closeModal, callbacks }: ControlStoreCreditPolicyProps) {
	const queryClient = useQueryClient();
	const [preApproveExisting, setPreApproveExisting] = useState(true);
	const hasCandidates = preApproval.clientCount > 0;

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-store-credit-policy"],
		mutationFn: updateStoreCreditPolicy,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: async (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["store-credit-policy"] }),
				queryClient.invalidateQueries({ queryKey: ["client-store-credit"] }),
			]);
			closeModal();
		},
		onError: (err) => {
			callbacks?.onError?.(err);
			toast.error(getErrorMessage(err));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	if (!exigeLiberacao) {
		return (
			<ResponsiveMenu
				menuTitle="DEIXAR DE EXIGIR LIBERAÇÃO"
				menuDescription="Qualquer cliente identificado volta a poder comprar fiado, sem limite."
				menuActionButtonText="DESLIGAR"
				menuCancelButtonText="CANCELAR"
				actionFunction={() => mutate({ exigeLiberacao: false })}
				actionIsLoading={isPending}
				stateIsLoading={false}
				stateError={null}
				closeMenu={closeModal}
			>
				<p className="text-sm text-muted-foreground">
					As liberações e limites que você já definiu ficam guardados. Se ligar a exigência de novo, cada cliente volta como estava.
				</p>
			</ResponsiveMenu>
		);
	}

	const clientesLabel =
		preApproval.clientCount === 1
			? "1 cliente que já compra fiado será liberado"
			: `${preApproval.clientCount} clientes que já compram fiado serão liberados`;

	return (
		<ResponsiveMenu
			menuTitle="EXIGIR LIBERAÇÃO DE FIADO"
			menuDescription="Só clientes liberados vão poder comprar fiado, até o limite de cada um."
			menuActionButtonText="EXIGIR LIBERAÇÃO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate({ exigeLiberacao: true, preApproveExisting: hasCandidates && preApproveExisting })}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
				<li>O limite vale para a soma do que o cliente tem em aberto, não para cada venda.</li>
				<li>Um cliente sem liberação, ou que passaria do limite, só compra fiado com a aprovação de um gestor no balcão.</li>
				<li>A liberação e o limite de cada cliente ficam no cadastro dele.</li>
			</ul>

			{hasCandidates ? (
				<div className="rounded-lg border border-border">
					<CheckboxInput
						checked={preApproveExisting}
						labelTrue="Pré-liberar quem já compra fiado"
						labelFalse="Pré-liberar quem já compra fiado"
						description={`${clientesLabel} com limite inicial baseado no histórico (soma ${formatToMoney(preApproval.totalLimit)}). Você pode ajustar cada um no cadastro do cliente.`}
						handleChange={setPreApproveExisting}
						justify="justify-start"
					/>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">Nenhum cliente comprou fiado até agora, então ninguém é pré-liberado. Libere cada um no cadastro.</p>
			)}

			{hasCandidates && !preApproveExisting ? (
				<div role="status" className="flex items-start gap-2 rounded-lg bg-warning-surface p-3 text-warning-surface-foreground">
					<AlertTriangle className="mt-0.5 h-4 w-4 min-h-4 min-w-4" />
					<p className="text-xs">
						Sem a pré-liberação, {preApproval.clientCount === 1 ? "esse cliente vai" : `esses ${preApproval.clientCount} clientes vão`} precisar da
						aprovação de um gestor na próxima compra fiado.
					</p>
				</div>
			) : null}
		</ResponsiveMenu>
	);
}

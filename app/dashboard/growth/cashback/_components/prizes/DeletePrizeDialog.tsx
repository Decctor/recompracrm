"use client";

import type { TGetCashbackProgramPrizesOutputDefault } from "@/app/api/cashback-programs/prizes/route";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/errors";
import { deleteCashbackProgramPrize } from "@/lib/mutations/cashback-programs";
import { useMutation } from "@tanstack/react-query";
import { Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";

type TPrize = TGetCashbackProgramPrizesOutputDefault[number];

type DeletePrizeDialogProps = {
	prize: TPrize;
	closeDialog: () => void;
	callbacks: {
		onMutate: () => Promise<void>;
		onSettled: () => Promise<void>;
	};
};

/**
 * Um único "Excluir" na interface; o servidor decide entre excluir e arquivar. O texto antecipa a
 * decisão pela contagem de resgates para que o usuário saiba o que vai acontecer antes de confirmar.
 */
export default function DeletePrizeDialog({ prize, closeDialog, callbacks }: DeletePrizeDialogProps) {
	const willArchive = prize.resgatesQuantidade > 0;

	const { mutate: handleDelete, isPending } = useMutation({
		mutationKey: ["delete-cashback-program-prize", prize.id],
		mutationFn: deleteCashbackProgramPrize,
		onMutate: callbacks.onMutate,
		onSuccess: (data) => {
			toast.success(data.message);
			closeDialog();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled: callbacks.onSettled,
	});

	return (
		<Dialog open onOpenChange={(open) => (!open && !isPending ? closeDialog() : null)}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>{willArchive ? "Arquivar recompensa?" : "Excluir recompensa?"}</DialogTitle>
					<DialogDescription>
						{willArchive
							? `"${prize.titulo}" já foi resgatada ${prize.resgatesQuantidade === 1 ? "1 vez" : `${prize.resgatesQuantidade} vezes`}, então não pode sair do histórico. Ela será arquivada: some do tablet, do PDV e da loja, e você pode restaurá-la em Arquivadas.`
							: `"${prize.titulo}" nunca foi resgatada e será removida de vez.`}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" disabled={isPending} onClick={closeDialog}>
						CANCELAR
					</Button>
					<LoadingButton variant="destructive" loading={isPending} onClick={() => handleDelete({ id: prize.id })}>
						{willArchive ? <Archive className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
						{willArchive ? "ARQUIVAR" : "EXCLUIR"}
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

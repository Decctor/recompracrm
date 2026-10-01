"use client";

import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type TCashbackProgram, mapCashbackProgramToDraft } from "@/lib/cashback/program-registry-state";
import { describeCashbackProgram } from "@/lib/cashback/program-summary";
import { getErrorMessage } from "@/lib/errors";
import { getCashbackUnitLabel } from "@/lib/formatting";
import { updateCashbackProgram } from "@/lib/mutations/cashback-programs";
import { useMutation } from "@tanstack/react-query";
import { Check, Pause, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type CashbackProgramHeaderProps = {
	program: TCashbackProgram;
	callbacks: {
		onMutate?: () => void;
		onSettled?: () => void;
	};
};

/**
 * Identidade do programa e o liga/desliga. A frase-resumo traduz a configuração salva para o que o
 * cliente vive ("ganha 5% de cada venda...") e fica visível em todas as abas.
 *
 * Pausar pede confirmação e ativar não: pausado, o programa para acúmulo, resgate e cashback de
 * campanha (todos checam `ativo`); ativar só devolve o que já estava configurado.
 */
export default function CashbackProgramHeader({ program, callbacks }: CashbackProgramHeaderProps) {
	const [pauseDialogIsOpen, setPauseDialogIsOpen] = useState(false);

	const { mutate: setActive, isPending } = useMutation({
		mutationKey: ["toggle-cashback-program-active", program.id],
		mutationFn: async (ativo: boolean) =>
			await updateCashbackProgram({ cashbackProgramId: program.id, cashbackProgram: { ...mapCashbackProgramToDraft(program), ativo } }),
		onMutate: () => callbacks.onMutate?.(),
		onSuccess: (_data, ativo) => {
			setPauseDialogIsOpen(false);
			toast.success(ativo ? "Programa ativado." : "Programa pausado.");
		},
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled: () => callbacks.onSettled?.(),
	});

	return (
		<div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div className="flex min-w-0 flex-col gap-1">
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="text-xl font-extrabold leading-tight tracking-tight">{program.titulo}</h1>
					{program.ativo ? (
						<Chip.Root variant="success" shape="pill">
							<Chip.Icon>
								<Check />
							</Chip.Icon>
							<Chip.Label caps>Ativo</Chip.Label>
						</Chip.Root>
					) : (
						<Chip.Root variant="muted" shape="pill">
							<Chip.Icon>
								<Pause />
							</Chip.Icon>
							<Chip.Label caps>Pausado</Chip.Label>
						</Chip.Root>
					)}
				</div>
				<p className="max-w-[75ch] text-sm text-muted-foreground text-numeric">{describeCashbackProgram(program)}</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{program.ativo ? (
					<Button variant="outline" size="sm" disabled={isPending} onClick={() => setPauseDialogIsOpen(true)}>
						<Pause className="h-4 w-4" />
						PAUSAR PROGRAMA
					</Button>
				) : (
					<LoadingButton size="sm" loading={isPending} onClick={() => setActive(true)}>
						<Play className="h-4 w-4" />
						ATIVAR PROGRAMA
					</LoadingButton>
				)}
			</div>

			<Dialog open={pauseDialogIsOpen} onOpenChange={(open) => (!isPending ? setPauseDialogIsOpen(open) : null)}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Pausar o programa?</DialogTitle>
						<DialogDescription>
							Enquanto estiver pausado, vendas novas não geram {getCashbackUnitLabel(program.terminologia)}, clientes não resgatam e campanhas não
							presenteiam. Os saldos continuam guardados e voltam a valer quando você reativar.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" disabled={isPending} onClick={() => setPauseDialogIsOpen(false)}>
							CANCELAR
						</Button>
						<LoadingButton variant="destructive" loading={isPending} onClick={() => setActive(false)}>
							PAUSAR
						</LoadingButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

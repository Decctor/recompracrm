import type { TGetCashbackProgramOutput } from "@/app/api/cashback-programs/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { updateCashbackProgram } from "@/lib/mutations/cashback-programs";
import { useCashbackProgramState } from "@/state-hooks/use-cashback-program-state";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import CashbackProgramsAccumulationBlock from "./Blocks/Accumulation";
import CashbackProgramsExpirationBlock from "./Blocks/Expiration";
import CashbackProgramsGeneralBlock from "./Blocks/General";
import CashbackProgramsRedemptionLimitBlock from "./Blocks/RedemptionLimit";

type EditCashbackProgramProps = {
	user: TAuthUserSession["user"];
	userOrg: Exclude<TAuthUserSession["membership"], null>["organizacao"];
	cashbackProgram: Exclude<TGetCashbackProgramOutput["data"], null>;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

export default function EditCashbackProgram({ user, userOrg, cashbackProgram, closeModal, callbacks }: EditCashbackProgramProps) {
	const { state, updateCashbackProgram: updateState, redefineState } = useCashbackProgramState({});

	useEffect(() => {
		if (cashbackProgram) {
			redefineState({
				cashbackProgram: {
					ativo: cashbackProgram.ativo,
					titulo: cashbackProgram.titulo,
					descricao: cashbackProgram.descricao,
					acumuloTipo: cashbackProgram.acumuloTipo,
					acumuloValor: cashbackProgram.acumuloValor,
					acumuloValorParceiro: cashbackProgram.acumuloValorParceiro,
					acumuloRegraValorMinimo: cashbackProgram.acumuloRegraValorMinimo,
					acumuloPermitirViaIntegracao: cashbackProgram.acumuloPermitirViaIntegracao,
					acumuloPermitirViaPontoIntegracao: cashbackProgram.acumuloPermitirViaPontoIntegracao,
					expiracaoRegraValidadeValor: cashbackProgram.expiracaoRegraValidadeValor,
					resgateLimiteTipo: cashbackProgram.resgateLimiteTipo,
					resgateLimiteValor: cashbackProgram.resgateLimiteValor,
				},
			});
		}
	}, [cashbackProgram, redefineState]);

	const { mutate: handleUpdateCashbackProgramMutation, isPending } = useMutation({
		mutationKey: ["update-cashback-program", cashbackProgram.id],
		mutationFn: updateCashbackProgram,
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate();
			return;
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			return toast.success(data.message);
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			return closeModal();
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="EDITAR PROGRAMA DE CASHBACK"
			menuDescription="Atualize os campos abaixo para editar o programa de cashback"
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={() =>
				handleUpdateCashbackProgramMutation({
					cashbackProgramId: cashbackProgram.id,
					cashbackProgram: state.cashbackProgram,
				})
			}
			closeMenu={closeModal}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
		>
			<CashbackProgramsGeneralBlock cashbackProgram={state.cashbackProgram} updateCashbackProgram={updateState} />
			<CashbackProgramsAccumulationBlock
				userOrgHasIntegration={!!userOrg.integracaoTipo}
				cashbackProgram={state.cashbackProgram}
				updateCashbackProgram={updateState}
			/>
			<CashbackProgramsExpirationBlock cashbackProgram={state.cashbackProgram} updateCashbackProgram={updateState} />
			<CashbackProgramsRedemptionLimitBlock cashbackProgram={state.cashbackProgram} updateCashbackProgram={updateState} />
		</ResponsiveMenu>
	);
}

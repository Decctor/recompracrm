import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { createCashbackProgram } from "@/lib/mutations/cashback-programs";
import { useCashbackProgramState } from "@/state-hooks/use-cashback-program-state";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import CashbackProgramsAccumulationBlock from "./Blocks/Accumulation";
import CashbackProgramsExpirationBlock from "./Blocks/Expiration";
import CashbackProgramsGeneralBlock from "./Blocks/General";
import CashbackProgramsRedemptionLimitBlock from "./Blocks/RedemptionLimit";

type NewCashbackProgramProps = {
	user: TAuthUserSession["user"];
	userOrg: Exclude<TAuthUserSession["membership"], null>["organizacao"];
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};
export default function NewCashbackProgram({ user, userOrg, closeModal, callbacks }: NewCashbackProgramProps) {
	const { state, updateCashbackProgram, resetState, redefineState } = useCashbackProgramState({
		initialState: {
			cashbackProgram: {
				ativo: true,
				titulo: "",
				acumuloTipo: "FIXO",
				acumuloValor: 0,
				acumuloValorParceiro: 0,
				acumuloRegraValorMinimo: 0,
				expiracaoRegraValidadeValor: 0,
				acumuloPermitirViaIntegracao: !!userOrg.integracaoTipo,
				acumuloPermitirViaPontoIntegracao: !userOrg.integracaoTipo,
				descricao: "",
				resgateLimiteTipo: null,
				resgateLimiteValor: null,
			},
		},
	});

	const { mutate: handleCreateCashbackProgramMutation, isPending } = useMutation({
		mutationKey: ["create-cashback-program"],
		mutationFn: createCashbackProgram,
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
			menuTitle="NOVO PROGRAMA DE CASHBACK"
			menuDescription="Preencha os campos abaixo para criar um novo programa de cashback"
			menuActionButtonText="CRIAR PROGRAMA DE CASHBACK"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleCreateCashbackProgramMutation({ cashbackProgram: state.cashbackProgram })}
			closeMenu={closeModal}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
		>
			<CashbackProgramsGeneralBlock cashbackProgram={state.cashbackProgram} updateCashbackProgram={updateCashbackProgram} />
			<CashbackProgramsAccumulationBlock
				userOrgHasIntegration={!!userOrg.integracaoTipo}
				cashbackProgram={state.cashbackProgram}
				updateCashbackProgram={updateCashbackProgram}
			/>
			<CashbackProgramsExpirationBlock cashbackProgram={state.cashbackProgram} updateCashbackProgram={updateCashbackProgram} />
			<CashbackProgramsRedemptionLimitBlock cashbackProgram={state.cashbackProgram} updateCashbackProgram={updateCashbackProgram} />
		</ResponsiveMenu>
	);
}

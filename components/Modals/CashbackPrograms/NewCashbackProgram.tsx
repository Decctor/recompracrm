import { NO_CASHBACK_REDEMPTION_SURFACE_MESSAGE, hasAnyCashbackRedemptionSurface } from "@/lib/cashback/redemption-policy";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { createCashbackProgram } from "@/lib/mutations/cashback-programs";
import { DataSourceIntegrationTipoEnum, type TDataSourceIntegrationTipoEnum } from "@/schemas/enums";
import { useCashbackProgramState } from "@/state-hooks/use-cashback-program-state";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import CashbackProgramsAccumulationBlock from "./Blocks/Accumulation";
import CashbackProgramsExpirationBlock from "./Blocks/Expiration";
import CashbackProgramsGeneralBlock from "./Blocks/General";
import CashbackProgramsRedemptionBlock from "./Blocks/Redemption";
import CashbackProgramsRedemptionSurfacesBlock from "./Blocks/RedemptionSurfaces";

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
	// Os dois canais podem estar ativos juntos (fonte de dados + POI registrando balcão) — os
	// defaults refletem cada canal, não são mais mutuamente exclusivos por derivação.
	const userOrgHasActiveDataSource = userOrg.integracoes.some(
		(integration) => integration.ativo && DataSourceIntegrationTipoEnum.options.includes(integration.tipo as TDataSourceIntegrationTipoEnum),
	);
	const poiSalesRegistrationEnabled = userOrg.poiConfiguracao?.vendas.registroAtivo ?? !userOrgHasActiveDataSource;
	// Org com ERP tem PDV próprio: o resgate nasce desligado no POI para não abrir dois caminhos
	// de baixa de saldo. Sem ERP, o POI é o único canal de resgate e nasce ligado.
	const userOrgHasErpAccess = !!userOrg.configuracao?.recursos?.erp?.acesso;
	const { state, updateCashbackProgram, resetState, redefineState } = useCashbackProgramState({
		initialState: {
			cashbackProgram: {
				ativo: true,
				titulo: "",
				terminologia: "DINHEIRO",
				modalidadeDescontosPermitida: true,
				modalidadeRecompensasPermitida: false,
				acumuloTipo: "FIXO",
				acumuloValor: 0,
				acumuloValorParceiro: 0,
				acumuloRegraValorMinimo: 0,
				expiracaoRegraValidadeValor: 0,
				acumuloPermitirViaIntegracao: userOrgHasActiveDataSource,
				acumuloPermitirViaPontoIntegracao: poiSalesRegistrationEnabled,
				resgatePermitirViaPos: true,
				resgatePermitirViaPontoIntegracao: !userOrgHasErpAccess,
				resgatePermitirViaLojaDigital: true,
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
			actionFunction={() => {
				if (!hasAnyCashbackRedemptionSurface(state.cashbackProgram)) return toast.error(NO_CASHBACK_REDEMPTION_SURFACE_MESSAGE);
				return handleCreateCashbackProgramMutation({ cashbackProgram: state.cashbackProgram, cashbackProgramPrizes: state.cashbackProgramPrizes });
			}}
			closeMenu={closeModal}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			dialogVariant="md"
		>
			<CashbackProgramsGeneralBlock cashbackProgram={state.cashbackProgram} updateCashbackProgram={updateCashbackProgram} />
			<CashbackProgramsAccumulationBlock
				userOrgHasIntegration={userOrgHasActiveDataSource}
				cashbackProgram={state.cashbackProgram}
				updateCashbackProgram={updateCashbackProgram}
			/>
			<CashbackProgramsExpirationBlock cashbackProgram={state.cashbackProgram} updateCashbackProgram={updateCashbackProgram} />
			<CashbackProgramsRedemptionBlock cashbackProgram={state.cashbackProgram} updateCashbackProgram={updateCashbackProgram} />
			<CashbackProgramsRedemptionSurfacesBlock cashbackProgram={state.cashbackProgram} updateCashbackProgram={updateCashbackProgram} />
		</ResponsiveMenu>
	);
}

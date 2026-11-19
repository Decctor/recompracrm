import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { updateFiscalTaxGroupMutation } from "@/lib/mutations/fiscal";
import { useFiscalTaxGroupById } from "@/lib/queries/fiscal";
import { useFiscalTaxGroupState } from "@/state-hooks/use-fiscal-tax-group-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import FiscalTaxGroupGeneralBlock from "./Blocks/General";
import FiscalTaxGroupIcmsBlock from "./Blocks/Icms";
import FiscalTaxGroupPisCofinsBlock from "./Blocks/PisCofins";
import FiscalTaxGroupRulesBlock from "./Blocks/Rules";

type ControlFiscalTaxGroupProps = {
	taxGroupId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};
export default function ControlFiscalTaxGroup({ taxGroupId, closeModal, callbacks }: ControlFiscalTaxGroupProps) {
	const queryClient = useQueryClient();
	const { data: taxGroup, queryKey, isLoading, error } = useFiscalTaxGroupById({ id: taxGroupId });
	const { state, updateFiscalTaxGroup, addRegra, updateRegra, removeRegra, redefineState } = useFiscalTaxGroupState({});

	useEffect(() => {
		if (!taxGroup) return;
		redefineState({
			fiscalTaxGroup: {
				nome: taxGroup.nome,
				descricao: taxGroup.descricao,
				csosn: taxGroup.csosn,
				csosnComCredito: taxGroup.csosnComCredito,
				csosnSemCredito: taxGroup.csosnSemCredito,
				aliquotaIcms: taxGroup.aliquotaIcms,
				percentualReducaoBc: taxGroup.percentualReducaoBc,
				modalidadeBc: taxGroup.modalidadeBc,
				percentualCreditoSn: taxGroup.percentualCreditoSn,
				temSubstituicaoTributaria: taxGroup.temSubstituicaoTributaria,
				mvaSt: taxGroup.mvaSt,
				aliquotaIcmsSt: taxGroup.aliquotaIcmsSt,
				aliquotaInternaDestino: taxGroup.aliquotaInternaDestino,
				percentualReducaoBcSt: taxGroup.percentualReducaoBcSt,
				aliquotaFcp: taxGroup.aliquotaFcp,
				aliquotaFcpSt: taxGroup.aliquotaFcpSt,
				cstPis: taxGroup.cstPis,
				aliquotaPis: taxGroup.aliquotaPis,
				cstCofins: taxGroup.cstCofins,
				aliquotaCofins: taxGroup.aliquotaCofins,
				ativo: taxGroup.ativo,
			},
			regras: taxGroup.regras.map((regra) => ({
				id: regra.id,
				escopo: regra.escopo,
				ufDestino: regra.ufDestino,
				indicadorDestinatario: regra.indicadorDestinatario,
				finalidade: regra.finalidade,
				csosn: regra.csosn,
				cfop: regra.cfop,
				aliquotaIcms: regra.aliquotaIcms,
				percentualReducaoBc: regra.percentualReducaoBc,
				percentualCreditoSn: regra.percentualCreditoSn,
				temSubstituicaoTributaria: regra.temSubstituicaoTributaria,
				mvaSt: regra.mvaSt,
				aliquotaIcmsSt: regra.aliquotaIcmsSt,
				aliquotaInternaDestino: regra.aliquotaInternaDestino,
				percentualReducaoBcSt: regra.percentualReducaoBcSt,
				aliquotaFcp: regra.aliquotaFcp,
				aliquotaFcpSt: regra.aliquotaFcpSt,
				ativo: regra.ativo,
			})),
		});
	}, [taxGroup, redefineState]);

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-fiscal-tax-group", taxGroupId],
		mutationFn: updateFiscalTaxGroupMutation,
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey });
			if (callbacks?.onMutate) callbacks.onMutate();
		},
		onSuccess: (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(data.message);
			return closeModal();
		},
		onError: (error) => {
			if (callbacks?.onError) callbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			await queryClient.invalidateQueries({ queryKey });
			await queryClient.invalidateQueries({ queryKey: ["fiscal-tax-groups"] });
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="EDITAR GRUPO TRIBUTÁRIO"
			menuDescription="Atualize a tributação e as regras por cenário"
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate({ taxGroupId, taxGroup: state.fiscalTaxGroup, regras: state.regras })}
			actionIsLoading={isPending || isLoading}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<FiscalTaxGroupGeneralBlock fiscalTaxGroup={state.fiscalTaxGroup} updateFiscalTaxGroup={updateFiscalTaxGroup} />
			<FiscalTaxGroupIcmsBlock fiscalTaxGroup={state.fiscalTaxGroup} updateFiscalTaxGroup={updateFiscalTaxGroup} />
			<FiscalTaxGroupPisCofinsBlock fiscalTaxGroup={state.fiscalTaxGroup} updateFiscalTaxGroup={updateFiscalTaxGroup} />
			<FiscalTaxGroupRulesBlock regras={state.regras} addRegra={addRegra} updateRegra={updateRegra} removeRegra={removeRegra} />
		</ResponsiveMenu>
	);
}

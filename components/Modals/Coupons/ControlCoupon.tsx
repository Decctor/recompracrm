import type { TUpdateCouponInput } from "@/app/api/coupons/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { updateCoupon as updateCouponMutation } from "@/lib/mutations/coupons";
import { useCouponById } from "@/lib/queries/coupons";
import { useInternalCouponState } from "@/state-hooks/use-internal-coupon-state";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import CouponAudienceBlock from "./Blocks/Audience";
import CouponBenefitBlock from "./Blocks/Benefit";
import CouponGeneralBlock from "./Blocks/General";
import CouponTargetsBlock from "./Blocks/Targets";
import CouponCheckoutConditionsBlock from "./Blocks/CheckoutConditions";
import CouponValidityAndLimitsBlock from "./Blocks/ValidityAndLimits";

type ControlCouponProps = {
	couponId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdateCouponInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function ControlCoupon({ couponId, closeModal, callbacks }: ControlCouponProps) {
	const { data: coupon, isLoading, error } = useCouponById({ couponId });
	const { state, updateCoupon, addCouponTarget, updateCouponTarget, removeCouponTarget, addCouponAudience, removeCouponAudience, redefineState } =
		useInternalCouponState({});

	useEffect(() => {
		if (coupon) {
			redefineState({
				coupon: {
					ativo: coupon.ativo,
					titulo: coupon.titulo,
					descricao: coupon.descricao,
					imagemCapaUrl: coupon.imagemCapaUrl,
					codigo: coupon.codigo,
					escopo: coupon.escopo,
					validacaoModo: coupon.validacaoModo,
					condicoesTexto: coupon.condicoesTexto,
					beneficioTipo: coupon.beneficioTipo,
					beneficioValor: coupon.beneficioValor,
					beneficioDescontoMaximo: coupon.beneficioDescontoMaximo,
					beneficioAplicacao: coupon.beneficioAplicacao,
					beneficioCompreQuantidade: coupon.beneficioCompreQuantidade,
					beneficioLeveQuantidade: coupon.beneficioLeveQuantidade,
					condicaoValorMinimoVenda: coupon.condicaoValorMinimoVenda,
					condicaoQuantidadeMinimaItens: coupon.condicaoQuantidadeMinimaItens,
					condicaoModalidadesEntrega: coupon.condicaoModalidadesEntrega,
					condicaoPrimeiraCompra: coupon.condicaoPrimeiraCompra,
					condicaoAlvosOperador: coupon.condicaoAlvosOperador,
					vigenciaInicio: coupon.vigenciaInicio ? new Date(coupon.vigenciaInicio) : null,
					vigenciaFim: coupon.vigenciaFim ? new Date(coupon.vigenciaFim) : null,
					limiteResgatesTotal: coupon.limiteResgatesTotal,
					limiteResgatesPorCliente: coupon.limiteResgatesPorCliente,
					acumulavel: coupon.acumulavel,
					resgatePermitirViaPos: coupon.resgatePermitirViaPos,
					resgatePermitirViaPontoInteracao: coupon.resgatePermitirViaPontoInteracao,
					resgatePermitirViaLojaDigital: coupon.resgatePermitirViaLojaDigital,
				},
				couponTargets: coupon.alvos.map((target) => ({
					id: target.id,
					papel: target.papel,
					produtoId: target.produtoId,
					produtoVarianteId: target.produtoVarianteId,
					grupo: target.grupo,
					quantidadeMinima: target.quantidadeMinima,
					produtoNome: target.produto?.nome ?? null,
					produtoVarianteNome: target.produtoVariante?.nome ?? null,
				})),
				couponAudiences: coupon.audiencias.map((audience) => ({
					id: audience.id,
					clienteTagId: audience.clienteTagId,
					segmentacaoRFM: audience.segmentacaoRFM,
					clienteTagTitulo: audience.clienteTag?.titulo ?? null,
				})),
			});
		}
	}, [coupon, redefineState]);

	const { mutate: handleUpdateCouponMutation, isPending } = useMutation({
		mutationKey: ["update-coupon", couponId],
		mutationFn: updateCouponMutation,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			closeModal();
		},
		onError: (mutationError) => {
			callbacks?.onError?.(mutationError);
			toast.error(getErrorMessage(mutationError));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	return (
		<ResponsiveMenu
			menuTitle="EDITAR CUPOM"
			menuDescription="Atualize os campos abaixo para editar o cupom"
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={() =>
				handleUpdateCouponMutation({
					couponId,
					coupon: state.coupon,
					couponTargets: state.couponTargets,
					couponAudiences: state.couponAudiences,
				})
			}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<CouponGeneralBlock coupon={state.coupon} updateCoupon={updateCoupon} />
			<CouponBenefitBlock coupon={state.coupon} updateCoupon={updateCoupon} />
			{state.coupon.validacaoModo === "AUTOMATICA" ? (
				<CouponTargetsBlock
					coupon={state.coupon}
					couponTargets={state.couponTargets}
					updateCoupon={updateCoupon}
					addCouponTarget={addCouponTarget}
					updateCouponTarget={updateCouponTarget}
					removeCouponTarget={removeCouponTarget}
				/>
			) : (
				<CouponCheckoutConditionsBlock coupon={state.coupon} updateCoupon={updateCoupon} />
			)}
			{state.coupon.escopo === "GLOBAL" ? (
				<CouponAudienceBlock couponAudiences={state.couponAudiences} addCouponAudience={addCouponAudience} removeCouponAudience={removeCouponAudience} />
			) : null}
			<CouponValidityAndLimitsBlock coupon={state.coupon} updateCoupon={updateCoupon} />
		</ResponsiveMenu>
	);
}

import { CouponAudienceSchema, CouponSchema, CouponTargetSchema } from "@/schemas/coupons";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

const CouponStateSchema = z.object({
	coupon: CouponSchema.omit({ dataInsercao: true, dataAtualizacao: true, autorId: true }),
	couponTargets: z.array(
		CouponTargetSchema.innerType().extend({
			id: z.string({ invalid_type_error: "Tipo não válido para o ID do alvo do cupom." }).optional().nullable(),
			deletar: z.boolean({ invalid_type_error: "Tipo não válido para deletar alvo do cupom." }).optional().nullable(),
			// Informações auxiliares de exibição (não persistidas)
			produtoNome: z.string().optional().nullable(),
			produtoVarianteNome: z.string().optional().nullable(),
		}),
	),
	couponAudiences: z.array(
		CouponAudienceSchema.innerType().extend({
			id: z.string({ invalid_type_error: "Tipo não válido para o ID da audiência do cupom." }).optional().nullable(),
			deletar: z.boolean({ invalid_type_error: "Tipo não válido para deletar audiência do cupom." }).optional().nullable(),
			// Informação auxiliar de exibição (não persistida)
			clienteTagTitulo: z.string().optional().nullable(),
		}),
	),
});
type TCouponState = z.infer<typeof CouponStateSchema>;

type TUseInternalCouponStateProps = {
	initialState?: Partial<TCouponState>;
};
export function useInternalCouponState({ initialState }: TUseInternalCouponStateProps) {
	const initialStateHolder: TCouponState = useMemo(() => {
		return {
			coupon: {
				ativo: initialState?.coupon?.ativo ?? true,
				titulo: initialState?.coupon?.titulo ?? "",
				descricao: initialState?.coupon?.descricao ?? null,
				imagemCapaUrl: initialState?.coupon?.imagemCapaUrl ?? null,
				codigo: initialState?.coupon?.codigo ?? "",
				escopo: initialState?.coupon?.escopo ?? "GLOBAL",
				validacaoModo: initialState?.coupon?.validacaoModo ?? "AUTOMATICA",
				condicoesTexto: initialState?.coupon?.condicoesTexto ?? null,
				beneficioTipo: initialState?.coupon?.beneficioTipo ?? "DESCONTO_PERCENTUAL",
				beneficioValor: initialState?.coupon?.beneficioValor ?? null,
				beneficioDescontoMaximo: initialState?.coupon?.beneficioDescontoMaximo ?? null,
				beneficioAplicacao: initialState?.coupon?.beneficioAplicacao ?? "VENDA_TOTAL",
				beneficioCompreQuantidade: initialState?.coupon?.beneficioCompreQuantidade ?? null,
				beneficioLeveQuantidade: initialState?.coupon?.beneficioLeveQuantidade ?? null,
				condicaoValorMinimoVenda: initialState?.coupon?.condicaoValorMinimoVenda ?? null,
				condicaoQuantidadeMinimaItens: initialState?.coupon?.condicaoQuantidadeMinimaItens ?? null,
				condicaoModalidadesEntrega: initialState?.coupon?.condicaoModalidadesEntrega ?? [],
				condicaoPrimeiraCompra: initialState?.coupon?.condicaoPrimeiraCompra ?? false,
				condicaoAlvosOperador: initialState?.coupon?.condicaoAlvosOperador ?? "QUALQUER",
				vigenciaInicio: initialState?.coupon?.vigenciaInicio ?? null,
				vigenciaFim: initialState?.coupon?.vigenciaFim ?? null,
				limiteResgatesTotal: initialState?.coupon?.limiteResgatesTotal ?? null,
				limiteResgatesPorCliente: initialState?.coupon?.limiteResgatesPorCliente ?? 1,
				acumulavel: initialState?.coupon?.acumulavel ?? false,
				resgatePermitirViaPos: initialState?.coupon?.resgatePermitirViaPos ?? true,
				resgatePermitirViaPontoInteracao: initialState?.coupon?.resgatePermitirViaPontoInteracao ?? true,
				resgatePermitirViaLojaDigital: initialState?.coupon?.resgatePermitirViaLojaDigital ?? true,
			},
			couponTargets: initialState?.couponTargets ?? [],
			couponAudiences: initialState?.couponAudiences ?? [],
		};
	}, []);
	const [state, setState] = useState<TCouponState>(initialStateHolder);

	const updateCoupon = useCallback((coupon: Partial<TCouponState["coupon"]>) => {
		setState((prev) => ({ ...prev, coupon: { ...prev.coupon, ...coupon } }));
	}, []);

	const addCouponTarget = useCallback((couponTarget: TCouponState["couponTargets"][number]) => {
		setState((prev) => ({ ...prev, couponTargets: [...prev.couponTargets, couponTarget] }));
	}, []);

	const updateCouponTarget = useCallback((index: number, couponTarget: Partial<TCouponState["couponTargets"][number]>) => {
		setState((prev) => ({
			...prev,
			couponTargets: prev.couponTargets.map((item, i) => (i === index ? { ...item, ...couponTarget } : item)),
		}));
	}, []);

	const removeCouponTarget = useCallback((index: number) => {
		setState((prev) => {
			const isExistingItem = prev.couponTargets.find((target, i) => i === index && !!target.id);
			if (!isExistingItem) return { ...prev, couponTargets: prev.couponTargets.filter((_, i) => i !== index) };
			return {
				...prev,
				couponTargets: prev.couponTargets.map((item, i) => (i === index ? { ...item, deletar: true } : item)),
			};
		});
	}, []);

	const addCouponAudience = useCallback((couponAudience: TCouponState["couponAudiences"][number]) => {
		setState((prev) => ({ ...prev, couponAudiences: [...prev.couponAudiences, couponAudience] }));
	}, []);

	const removeCouponAudience = useCallback((index: number) => {
		setState((prev) => {
			const isExistingItem = prev.couponAudiences.find((audience, i) => i === index && !!audience.id);
			if (!isExistingItem) return { ...prev, couponAudiences: prev.couponAudiences.filter((_, i) => i !== index) };
			return {
				...prev,
				couponAudiences: prev.couponAudiences.map((item, i) => (i === index ? { ...item, deletar: true } : item)),
			};
		});
	}, []);

	const resetState = useCallback(() => {
		setState(initialStateHolder);
	}, [initialStateHolder]);

	const redefineState = useCallback((state: TCouponState) => {
		setState(state);
	}, []);

	return {
		state,
		updateCoupon,
		addCouponTarget,
		updateCouponTarget,
		removeCouponTarget,
		addCouponAudience,
		removeCouponAudience,
		resetState,
		redefineState,
	};
}
export type TUseInternalCouponState = ReturnType<typeof useInternalCouponState>;

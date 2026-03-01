import type { TDeliveryModeEnum, TPaymentMethodEnum } from "@/schemas/enums";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

// ============================================================================
// Payment split schema
// ============================================================================

export const CheckoutPaymentSplitSchema = z.object({
	id: z.string({
		required_error: "ID do pagamento não informado.",
		invalid_type_error: "Tipo não válido para ID do pagamento.",
	}),
	metodo: z.enum(["DINHEIRO", "PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "BOLETO", "TRANSFERENCIA", "CASHBACK", "VALE", "OUTRO"], {
		required_error: "Método de pagamento não informado.",
		invalid_type_error: "Tipo não válido para método de pagamento.",
	}),
	valor: z.number({
		required_error: "Valor do pagamento não informado.",
		invalid_type_error: "Tipo não válido para valor do pagamento.",
	}),
	parcela: z.number({ invalid_type_error: "Tipo não válido para parcela." }).optional().nullable(),
	totalParcelas: z.number({ invalid_type_error: "Tipo não válido para total de parcelas." }).optional().nullable(),
});

// ============================================================================
// Checkout state schema
// ============================================================================

export const CheckoutStateSchema = z.object({
	step: z.number().min(1).max(4).default(1),

	// Step 1: Review
	vendedorId: z.string({ invalid_type_error: "Tipo não válido para ID do vendedor." }).optional().nullable(),
	vendedorNome: z.string({ invalid_type_error: "Tipo não válido para nome do vendedor." }).optional().nullable(),
	descontoGeral: z.number({ invalid_type_error: "Tipo não válido para desconto geral." }).default(0),
	acrescimoGeral: z.number({ invalid_type_error: "Tipo não válido para acréscimo geral." }).default(0),
	observacoes: z.string({ invalid_type_error: "Tipo não válido para observações." }).default(""),

	// Step 2: Delivery
	entregaModalidade: z
		.enum(["PRESENCIAL", "RETIRADA", "ENTREGA", "COMANDA"], {
			invalid_type_error: "Tipo não válido para modalidade de entrega.",
		})
		.default("PRESENCIAL"),
	entregaLocalizacaoId: z.string({ invalid_type_error: "Tipo não válido para ID da localização." }).optional().nullable(),
	comandaNumero: z.string({ invalid_type_error: "Tipo não válido para número da comanda." }).optional().nullable(),

	// Step 3: Payments
	pagamentos: z.array(CheckoutPaymentSplitSchema).default([]),
	cashbackResgate: z.number({ invalid_type_error: "Tipo não válido para resgate de cashback." }).default(0),
});

export type TCheckoutPaymentSplit = z.infer<typeof CheckoutPaymentSplitSchema>;
export type TCheckoutState = z.infer<typeof CheckoutStateSchema>;

// ============================================================================
// Hook
// ============================================================================

type UseCheckoutStateProps = {
	initialState?: Partial<TCheckoutState>;
	/** Total value of the sale (from the draft), used for payment validation */
	valorTotal: number;
};

export const useCheckoutState = ({ initialState, valorTotal }: UseCheckoutStateProps) => {
	const [state, setState] = useState<TCheckoutState>({
		step: initialState?.step ?? 1,
		vendedorId: initialState?.vendedorId ?? null,
		vendedorNome: initialState?.vendedorNome ?? null,
		descontoGeral: initialState?.descontoGeral ?? 0,
		acrescimoGeral: initialState?.acrescimoGeral ?? 0,
		observacoes: initialState?.observacoes ?? "",
		entregaModalidade: initialState?.entregaModalidade ?? "PRESENCIAL",
		entregaLocalizacaoId: initialState?.entregaLocalizacaoId ?? null,
		comandaNumero: initialState?.comandaNumero ?? null,
		pagamentos: initialState?.pagamentos ?? [],
		cashbackResgate: initialState?.cashbackResgate ?? 0,
	});

	// ===== STEP NAVIGATION =====

	const goToStep = useCallback((step: number) => {
		setState((prev) => ({ ...prev, step: Math.max(1, Math.min(4, step)) }));
	}, []);

	const nextStep = useCallback(() => {
		setState((prev) => ({ ...prev, step: Math.min(4, prev.step + 1) }));
	}, []);

	const prevStep = useCallback(() => {
		setState((prev) => ({ ...prev, step: Math.max(1, prev.step - 1) }));
	}, []);

	// ===== STEP 1: REVIEW =====

	const setVendedor = useCallback((vendedorId: string | null, vendedorNome: string | null) => {
		setState((prev) => ({ ...prev, vendedorId, vendedorNome }));
	}, []);

	const setDescontoGeral = useCallback((descontoGeral: number) => {
		setState((prev) => ({ ...prev, descontoGeral }));
	}, []);

	const setAcrescimoGeral = useCallback((acrescimoGeral: number) => {
		setState((prev) => ({ ...prev, acrescimoGeral }));
	}, []);

	const setObservacoes = useCallback((observacoes: string) => {
		setState((prev) => ({ ...prev, observacoes }));
	}, []);

	// ===== STEP 2: DELIVERY =====

	const setEntregaModalidade = useCallback((entregaModalidade: TDeliveryModeEnum) => {
		setState((prev) => ({
			...prev,
			entregaModalidade,
			// Clear location when switching away from ENTREGA
			entregaLocalizacaoId: entregaModalidade === "ENTREGA" ? prev.entregaLocalizacaoId : null,
			// Clear comanda when switching away from COMANDA
			comandaNumero: entregaModalidade === "COMANDA" ? prev.comandaNumero : null,
		}));
	}, []);

	const setEntregaLocalizacaoId = useCallback((entregaLocalizacaoId: string | null) => {
		setState((prev) => ({ ...prev, entregaLocalizacaoId }));
	}, []);

	const setComandaNumero = useCallback((comandaNumero: string | null) => {
		setState((prev) => ({ ...prev, comandaNumero }));
	}, []);

	// ===== STEP 3: PAYMENTS =====

	const addPagamento = useCallback((pagamento: Omit<TCheckoutPaymentSplit, "id">) => {
		setState((prev) => ({
			...prev,
			pagamentos: [...prev.pagamentos, { ...pagamento, id: crypto.randomUUID() }],
		}));
	}, []);

	const removePagamento = useCallback((id: string) => {
		setState((prev) => ({
			...prev,
			pagamentos: prev.pagamentos.filter((p) => p.id !== id),
		}));
	}, []);

	const updatePagamento = useCallback((id: string, updates: Partial<Omit<TCheckoutPaymentSplit, "id">>) => {
		setState((prev) => ({
			...prev,
			pagamentos: prev.pagamentos.map((p) => (p.id === id ? { ...p, ...updates } : p)),
		}));
	}, []);

	const setCashbackResgate = useCallback((cashbackResgate: number) => {
		setState((prev) => ({ ...prev, cashbackResgate }));
	}, []);

	// ===== COMPUTED VALUES =====

	const computedValues = useMemo(() => {
		const totalPagamentos = state.pagamentos.reduce((sum, p) => sum + p.valor, 0) + state.cashbackResgate;
		const valorFinal = valorTotal - state.descontoGeral + state.acrescimoGeral;
		const valorRestante = valorFinal - totalPagamentos;
		const troco = totalPagamentos > valorFinal ? totalPagamentos - valorFinal : 0;
		const pagamentoCompleto = valorRestante <= 0.01; // float tolerance

		return {
			valorFinal,
			totalPagamentos,
			valorRestante,
			troco,
			pagamentoCompleto,
		};
	}, [valorTotal, state.descontoGeral, state.acrescimoGeral, state.pagamentos, state.cashbackResgate]);

	// ===== VALIDATION =====

	const canProceedFromStep = useCallback(
		(step: number): boolean => {
			switch (step) {
				case 1: // Review — always can proceed
					return true;
				case 2: // Delivery
					if (state.entregaModalidade === "ENTREGA" && !state.entregaLocalizacaoId) return false;
					if (state.entregaModalidade === "COMANDA" && !state.comandaNumero) return false;
					return true;
				case 3: // Payment — must cover the full amount
					return computedValues.pagamentoCompleto;
				default:
					return true;
			}
		},
		[state.entregaModalidade, state.entregaLocalizacaoId, state.comandaNumero, computedValues.pagamentoCompleto],
	);

	// ===== RESET =====

	const resetState = useCallback((newState: TCheckoutState) => {
		setState(newState);
	}, []);

	return {
		state,
		// Step navigation
		goToStep,
		nextStep,
		prevStep,
		// Step 1
		setVendedor,
		setDescontoGeral,
		setAcrescimoGeral,
		setObservacoes,
		// Step 2
		setEntregaModalidade,
		setEntregaLocalizacaoId,
		setComandaNumero,
		// Step 3
		addPagamento,
		removePagamento,
		updatePagamento,
		setCashbackResgate,
		// Computed
		...computedValues,
		// Validation
		canProceedFromStep,
		// Utilities
		resetState,
	};
};

export type TUseCheckoutState = ReturnType<typeof useCheckoutState>;

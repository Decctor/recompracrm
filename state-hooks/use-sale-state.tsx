import type { TDeliveryModeEnum } from "@/schemas/enums";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

export const CartItemModifierSchema = z.object({
	opcaoId: z.string({ required_error: "ID da opção não informado.", invalid_type_error: "Tipo não válido para ID da opção." }),
	nome: z.string({ required_error: "Nome do modificador não informado.", invalid_type_error: "Tipo não válido para nome do modificador." }),
	quantidade: z.number({
		required_error: "Quantidade do modificador não informada.",
		invalid_type_error: "Tipo não válido para quantidade do modificador.",
	}),
	valorUnitario: z.number({
		required_error: "Valor unitário do modificador não informado.",
		invalid_type_error: "Tipo não válido para valor unitário do modificador.",
	}),
	valorTotal: z.number({
		required_error: "Valor total do modificador não informado.",
		invalid_type_error: "Tipo não válido para valor total do modificador.",
	}),
});

export const CartItemSchema = z.object({
	tempId: z.string({ required_error: "ID temporário não informado.", invalid_type_error: "Tipo não válido para ID temporário." }),
	produtoId: z.string({ required_error: "ID do produto não informado.", invalid_type_error: "Tipo não válido para ID do produto." }),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo não válido para ID da variante." }).optional().nullable(),
	nome: z.string({ required_error: "Nome do item não informado.", invalid_type_error: "Tipo não válido para nome do item." }),
	codigo: z.string({ required_error: "Código do item não informado.", invalid_type_error: "Tipo não válido para código do item." }),
	imagemUrl: z.string({ invalid_type_error: "Tipo não válido para URL da imagem." }).optional().nullable(),
	quantidade: z
		.number({ required_error: "Quantidade não informada.", invalid_type_error: "Tipo não válido para quantidade." })
		.min(1, { message: "Quantidade deve ser no mínimo 1." }),
	valorUnitarioBase: z.number({
		required_error: "Valor unitário base não informado.",
		invalid_type_error: "Tipo não válido para valor unitário base.",
	}),
	valorModificadores: z.number({
		required_error: "Valor de modificadores não informado.",
		invalid_type_error: "Tipo não válido para valor de modificadores.",
	}),
	valorUnitarioFinal: z.number({
		required_error: "Valor unitário final não informado.",
		invalid_type_error: "Tipo não válido para valor unitário final.",
	}),
	valorTotalBruto: z.number({ required_error: "Valor total bruto não informado.", invalid_type_error: "Tipo não válido para valor total bruto." }),
	valorDesconto: z.number({ invalid_type_error: "Tipo não válido para valor de desconto." }).default(0),
	valorTotalLiquido: z.number({
		required_error: "Valor total líquido não informado.",
		invalid_type_error: "Tipo não válido para valor total líquido.",
	}),
	modificadores: z.array(CartItemModifierSchema),
});

export const CheckoutPaymentSplitSchema = z.object({
	id: z.string({ required_error: "ID do pagamento não informado.", invalid_type_error: "Tipo não válido para ID do pagamento." }),
	metodo: z.enum(["DINHEIRO", "PIX", "CARTAO_CREDITO", "CARTAO_DEBITO", "BOLETO", "TRANSFERENCIA", "CASHBACK", "VALE", "OUTRO"], {
		required_error: "Método de pagamento não informado.",
		invalid_type_error: "Tipo não válido para método de pagamento.",
	}),
	valor: z.number({ required_error: "Valor do pagamento não informado.", invalid_type_error: "Tipo não válido para valor do pagamento." }),
	parcela: z.number({ invalid_type_error: "Tipo não válido para parcela." }).optional().nullable(),
	totalParcelas: z.number({ invalid_type_error: "Tipo não válido para total de parcelas." }).optional().nullable(),
});

export const SaleDraftMetadataSchema = z.object({
	pagamentos: z.array(CheckoutPaymentSplitSchema),
	cashbackResgate: z.number({ invalid_type_error: "Tipo não válido para resgate de cashback." }),
	cashbackProgramaId: z.string({ invalid_type_error: "Tipo não válido para ID do programa de cashback." }).optional().nullable(),
	valorFinal: z.number({ invalid_type_error: "Tipo não válido para valor final." }),
	valorRestante: z.number({ invalid_type_error: "Tipo não válido para valor restante." }),
	troco: z.number({ invalid_type_error: "Tipo não válido para troco." }),
});

const SaleSuccessSchema = z
	.object({
		mode: z.enum(["ORCAMENTO", "FINALIZADA"]),
		title: z.string(),
		description: z.string(),
	})
	.optional()
	.nullable();

export const SaleStateSchema = z.object({
	modoCliente: z.enum(["CONSUMIDOR", "VINCULADO"], {
		required_error: "Modo de cliente não informado.",
		invalid_type_error: "Tipo não válido para modo de cliente.",
	}),
	cliente: z
		.object({
			id: z.string({ required_error: "ID do cliente não informado.", invalid_type_error: "Tipo não válido para ID do cliente." }),
			nome: z.string({ required_error: "Nome do cliente não informado.", invalid_type_error: "Tipo não válido para nome do cliente." }),
			telefone: z.string({ required_error: "Telefone do cliente não informado.", invalid_type_error: "Tipo não válido para telefone do cliente." }),
		})
		.optional()
		.nullable(),
	vendedorId: z.string({ invalid_type_error: "Tipo não válido para ID do vendedor." }).optional().nullable(),
	vendedorNome: z.string({ invalid_type_error: "Tipo não válido para nome do vendedor." }).optional().nullable(),
	itens: z.array(CartItemSchema),
	descontoGeral: z.number({ invalid_type_error: "Tipo não válido para desconto geral." }).default(0),
	acrescimoGeral: z.number({ invalid_type_error: "Tipo não válido para acréscimo geral." }).default(0),
	observacoes: z.string({ invalid_type_error: "Tipo não válido para observações." }).default(""),
	entregaModalidade: z
		.enum(["PRESENCIAL", "RETIRADA", "ENTREGA", "COMANDA"], { invalid_type_error: "Tipo não válido para modalidade de entrega." })
		.default("PRESENCIAL"),
	entregaLocalizacaoId: z.string({ invalid_type_error: "Tipo não válido para ID da localização." }).optional().nullable(),
	comandaNumero: z.string({ invalid_type_error: "Tipo não válido para número da comanda." }).optional().nullable(),
	pagamentos: z.array(CheckoutPaymentSplitSchema),
	cashbackResgate: z.number({ invalid_type_error: "Tipo não válido para resgate de cashback." }).default(0),
	success: SaleSuccessSchema,
});

export type TCartItemModifier = z.infer<typeof CartItemModifierSchema>;
export type TCartItem = z.infer<typeof CartItemSchema>;
export type TCheckoutPaymentSplit = z.infer<typeof CheckoutPaymentSplitSchema>;
export type TSaleDraftMetadata = z.infer<typeof SaleDraftMetadataSchema>;
export type TSaleState = z.infer<typeof SaleStateSchema>;

type UseSaleStateProps = {
	initialState?: Partial<TSaleState>;
};

export function getDefaultSaleState(initialState?: Partial<TSaleState>): TSaleState {
	return {
		modoCliente: initialState?.modoCliente ?? "CONSUMIDOR",
		cliente: initialState?.cliente ?? null,
		vendedorId: initialState?.vendedorId ?? null,
		vendedorNome: initialState?.vendedorNome ?? null,
		itens: initialState?.itens ?? [],
		descontoGeral: initialState?.descontoGeral ?? 0,
		acrescimoGeral: initialState?.acrescimoGeral ?? 0,
		observacoes: initialState?.observacoes ?? "",
		entregaModalidade: initialState?.entregaModalidade ?? "PRESENCIAL",
		entregaLocalizacaoId: initialState?.entregaLocalizacaoId ?? null,
		comandaNumero: initialState?.comandaNumero ?? null,
		pagamentos: initialState?.pagamentos ?? [],
		cashbackResgate: initialState?.cashbackResgate ?? 0,
		success: initialState?.success ?? null,
	};
}

export const useSaleState = ({ initialState }: UseSaleStateProps = {}) => {
	const [state, setState] = useState<TSaleState>(() => getDefaultSaleState(initialState));

	const setCliente = useCallback((cliente: TSaleState["cliente"]) => {
		setState((prev) => ({ ...prev, modoCliente: "VINCULADO", cliente }));
	}, []);

	const clearCliente = useCallback(() => {
		setState((prev) => ({ ...prev, cliente: null, entregaLocalizacaoId: null, cashbackResgate: 0 }));
	}, []);

	const setModoCliente = useCallback((modoCliente: TSaleState["modoCliente"]) => {
		setState((prev) => ({
			...prev,
			modoCliente,
			cliente: modoCliente === "CONSUMIDOR" ? null : prev.cliente,
			entregaModalidade: modoCliente === "CONSUMIDOR" && prev.entregaModalidade === "ENTREGA" ? "PRESENCIAL" : prev.entregaModalidade,
			entregaLocalizacaoId: modoCliente === "CONSUMIDOR" ? null : prev.entregaLocalizacaoId,
			cashbackResgate: modoCliente === "CONSUMIDOR" ? 0 : prev.cashbackResgate,
		}));
	}, []);

	const setVendedor = useCallback((vendedorId: string | null, vendedorNome: string | null) => {
		setState((prev) => ({ ...prev, vendedorId, vendedorNome }));
	}, []);

	const addItem = useCallback((item: TCartItem) => {
		setState((prev) => ({ ...prev, itens: [...prev.itens, item] }));
	}, []);

	const updateItemQuantity = useCallback((tempId: string, quantidade: number) => {
		if (quantidade < 1) return;
		setState((prev) => ({
			...prev,
			itens: prev.itens.map((item) => {
				if (item.tempId !== tempId) return item;
				const valorTotalBruto = item.valorUnitarioFinal * quantidade;
				const valorDesconto = Math.min(item.valorDesconto, valorTotalBruto);
				const valorTotalLiquido = valorTotalBruto - valorDesconto;
				return { ...item, quantidade, valorTotalBruto, valorDesconto, valorTotalLiquido };
			}),
		}));
	}, []);

	const removeItem = useCallback((tempId: string) => {
		setState((prev) => ({ ...prev, itens: prev.itens.filter((item) => item.tempId !== tempId) }));
	}, []);

	const clearCart = useCallback(() => {
		setState((prev) => ({ ...prev, itens: [], pagamentos: [], cashbackResgate: 0, cashbackProgramaId: null }));
	}, []);

	const setDescontoGeral = useCallback((descontoGeral: number) => {
		setState((prev) => ({ ...prev, descontoGeral: Math.max(0, descontoGeral || 0) }));
	}, []);

	const setAcrescimoGeral = useCallback((acrescimoGeral: number) => {
		setState((prev) => ({ ...prev, acrescimoGeral: Math.max(0, acrescimoGeral || 0) }));
	}, []);

	const setObservacoes = useCallback((observacoes: string) => {
		setState((prev) => ({ ...prev, observacoes }));
	}, []);

	const setEntregaModalidade = useCallback((entregaModalidade: TDeliveryModeEnum) => {
		setState((prev) => {
			if (entregaModalidade === "ENTREGA" && prev.modoCliente === "CONSUMIDOR") return prev;
			return {
				...prev,
				entregaModalidade,
				entregaLocalizacaoId: entregaModalidade === "ENTREGA" ? prev.entregaLocalizacaoId : null,
				comandaNumero: entregaModalidade === "COMANDA" ? prev.comandaNumero : null,
			};
		});
	}, []);

	const setEntregaLocalizacaoId = useCallback((entregaLocalizacaoId: string | null) => {
		setState((prev) => ({ ...prev, entregaLocalizacaoId }));
	}, []);

	const setComandaNumero = useCallback((comandaNumero: string | null) => {
		setState((prev) => ({ ...prev, comandaNumero }));
	}, []);

	const addPagamento = useCallback((pagamento?: Partial<Omit<TCheckoutPaymentSplit, "id">>) => {
		setState((prev) => ({
			...prev,
			pagamentos: [
				...prev.pagamentos,
				{
					id: crypto.randomUUID(),
					metodo: pagamento?.metodo ?? "DINHEIRO",
					valor: pagamento?.valor ?? 0,
					parcela: pagamento?.parcela ?? null,
					totalParcelas: pagamento?.totalParcelas ?? null,
				},
			],
		}));
	}, []);

	const removePagamento = useCallback((id: string) => {
		setState((prev) => ({ ...prev, pagamentos: prev.pagamentos.filter((payment) => payment.id !== id) }));
	}, []);

	const updatePagamento = useCallback((id: string, updates: Partial<Omit<TCheckoutPaymentSplit, "id">>) => {
		setState((prev) => ({
			...prev,
			pagamentos: prev.pagamentos.map((payment) => {
				if (payment.id !== id) return payment;
				return {
					...payment,
					...updates,
					valor: typeof updates.valor === "number" ? Math.max(0, updates.valor) : payment.valor,
				};
			}),
		}));
	}, []);

	const setCashbackResgate = useCallback((cashbackResgate: number) => {
		setState((prev) => {
			const nextValue = Math.max(0, cashbackResgate || 0);
			if (prev.cashbackResgate === nextValue) return prev;
			return { ...prev, cashbackResgate: nextValue };
		});
	}, []);

	const clearSuccess = useCallback(() => {
		setState((prev) => ({ ...prev, success: null }));
	}, []);

	const setSuccess = useCallback((success: TSaleState["success"]) => {
		setState((prev) => ({ ...prev, success }));
	}, []);

	const ensureEntregaLocation = useCallback((locationId: string | null) => {
		setState((prev) => {
			if (prev.entregaModalidade !== "ENTREGA") return prev;
			if (prev.entregaLocalizacaoId) return prev;
			if (!locationId) return prev;
			return {
				...prev,
				entregaLocalizacaoId: locationId,
			};
		});
	}, []);

	const subtotal = useMemo(() => state.itens.reduce((sum, item) => sum + item.valorTotalBruto, 0), [state.itens]);
	const totalDescontoItens = useMemo(() => state.itens.reduce((sum, item) => sum + item.valorDesconto, 0), [state.itens]);
	const totalItens = useMemo(() => state.itens.reduce((sum, item) => sum + item.valorTotalLiquido, 0), [state.itens]);
	const itemCount = useMemo(() => state.itens.reduce((sum, item) => sum + item.quantidade, 0), [state.itens]);
	const valorFinal = useMemo(
		() => Math.max(0, totalItens - state.descontoGeral + state.acrescimoGeral),
		[totalItens, state.descontoGeral, state.acrescimoGeral],
	);
	const totalPagamentos = useMemo(
		() => state.pagamentos.reduce((sum, p) => sum + p.valor, 0) + state.cashbackResgate,
		[state.pagamentos, state.cashbackResgate],
	);
	const valorRestante = useMemo(() => Math.max(0, valorFinal - totalPagamentos), [valorFinal, totalPagamentos]);
	const troco = useMemo(() => (totalPagamentos > valorFinal ? totalPagamentos - valorFinal : 0), [totalPagamentos, valorFinal]);
	const pagamentoCompleto = useMemo(() => valorRestante <= 0.01, [valorRestante]);

	const isReadyForDraft = useMemo(() => {
		if (state.itens.length === 0) return false;
		if (state.modoCliente === "VINCULADO" && !state.cliente) return false;
		return true;
	}, [state.itens.length, state.modoCliente, state.cliente]);

	const isReadyForFinalize = useMemo(() => {
		if (!isReadyForDraft) return false;
		if (state.entregaModalidade === "ENTREGA" && !state.entregaLocalizacaoId) return false;
		if (state.entregaModalidade === "COMANDA" && !state.comandaNumero?.trim()) return false;
		if (!pagamentoCompleto) return false;
		return true;
	}, [isReadyForDraft, state.entregaModalidade, state.entregaLocalizacaoId, state.comandaNumero, pagamentoCompleto]);

	const getDraftMetadata = useCallback((): TSaleDraftMetadata => {
		return {
			pagamentos: state.pagamentos,
			cashbackResgate: state.cashbackResgate,
			valorFinal,
			valorRestante,
			troco,
		};
	}, [state.pagamentos, state.cashbackResgate, valorFinal, valorRestante, troco]);

	const resetState = useCallback((newState?: Partial<TSaleState>) => {
		setState(getDefaultSaleState(newState));
	}, []);

	return {
		state,
		setModoCliente,
		setCliente,
		clearCliente,
		setVendedor,
		addItem,
		updateItemQuantity,
		removeItem,
		clearCart,
		setDescontoGeral,
		setAcrescimoGeral,
		setObservacoes,
		setEntregaModalidade,
		setEntregaLocalizacaoId,
		setComandaNumero,
		ensureEntregaLocation,
		addPagamento,
		removePagamento,
		updatePagamento,
		setCashbackResgate,
		setSuccess,
		clearSuccess,
		subtotal,
		totalDescontoItens,
		totalItens,
		itemCount,
		valorFinal,
		totalPagamentos,
		valorRestante,
		troco,
		pagamentoCompleto,
		isReadyForDraft,
		isReadyForFinalize,
		getDraftMetadata,
		resetState,
	};
};

export type TUseSaleState = ReturnType<typeof useSaleState>;

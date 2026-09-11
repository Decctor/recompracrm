import {
	CheckoutPaymentSplitSchema,
	type TCheckoutPaymentSplit,
	getDefaultCheckoutPaymentSplit,
	isCheckoutPaymentSplitValid,
} from "@/lib/payments/schemas";
import {
	getOrganizationPaymentMethodDefault,
	getOrganizationPaymentMethodsConfig,
	type TResolvedPaymentMethodDefault,
} from "@/lib/payments/defaults";
import { resolveSaleChange } from "@/lib/sales/sale-change";
import type { TDeliveryModeEnum } from "@/schemas/enums";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
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
	// Presentes apenas no modo edição: id do saleItem persistido e quantidade já entregue (para
	// avisos de estoque na UI). Ausentes no fluxo de criação.
	itemId: z.string({ invalid_type_error: "Tipo não válido para ID do item persistido." }).optional().nullable(),
	quantidadeEntregue: z.number({ invalid_type_error: "Tipo não válido para quantidade entregue." }).optional().nullable(),
	// Item de recompensa resgatada (100% de desconto): imutável na edição, como cupom e cashback.
	recompensaId: z.string({ invalid_type_error: "Tipo não válido para ID da recompensa do item." }).optional().nullable(),
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
	// Observação livre do item ("sem cebola") — chega à cozinha e ao cupom impresso.
	observacoes: z
		.string({ invalid_type_error: "Tipo não válido para observações do item." })
		.max(500, { message: "Observação do item deve ter no máximo 500 caracteres." })
		.optional()
		.nullable(),
});

// Recompensa (prêmio) selecionada para resgate via saldo de cashback. `valor` é o débito de
// saldo (moeda cashback — R$ ou pontos); `valorVenda` é o valor comercial do prêmio (sempre R$).
// O item da recompensa não entra em `itens` — o servidor o constrói a partir do catálogo.
export const SaleRewardRedemptionSchema = z.object({
	recompensaId: z.string({ required_error: "ID da recompensa não informado.", invalid_type_error: "Tipo não válido para ID da recompensa." }),
	programaId: z.string({ required_error: "ID do programa não informado.", invalid_type_error: "Tipo não válido para ID do programa." }),
	titulo: z.string({ required_error: "Título da recompensa não informado.", invalid_type_error: "Tipo não válido para título da recompensa." }),
	valor: z.number({ required_error: "Valor da recompensa não informado.", invalid_type_error: "Tipo não válido para valor da recompensa." }),
	valorVenda: z.number({
		required_error: "Valor comercial da recompensa não informado.",
		invalid_type_error: "Tipo não válido para valor comercial da recompensa.",
	}),
	imagemCapaUrl: z.string({ invalid_type_error: "Tipo não válido para URL da imagem da recompensa." }).optional().nullable(),
});
export type TSaleRewardRedemption = z.infer<typeof SaleRewardRedemptionSchema>;

export const SaleAppliedCouponSchema = z.object({
	cupomId: z.string({ required_error: "ID do cupom não informado.", invalid_type_error: "Tipo não válido para ID do cupom." }),
	valorDesconto: z.number({
		required_error: "Valor de desconto do cupom não informado.",
		invalid_type_error: "Tipo não válido para valor de desconto do cupom.",
	}),
	codigo: z.string({ invalid_type_error: "Tipo não válido para código do cupom." }).optional().nullable(),
	titulo: z.string({ invalid_type_error: "Tipo não válido para título do cupom." }).optional().nullable(),
	validacaoModo: z.enum(["AUTOMATICA", "MANUAL"], { invalid_type_error: "Tipo não válido para modo de validação do cupom." }).optional().nullable(),
});
export type TSaleAppliedCoupon = z.infer<typeof SaleAppliedCouponSchema>;

export const SaleDraftMetadataSchema = z.object({
	pagamentos: z.array(CheckoutPaymentSplitSchema),
	descontoGeral: z.number({ invalid_type_error: "Tipo não válido para desconto geral." }),
	taxaEntrega: z.number({ invalid_type_error: "Tipo não válido para taxa de entrega." }).default(0),
	cashbackResgate: z.number({ invalid_type_error: "Tipo não válido para resgate de cashback." }),
	cashbackProgramaId: z.string({ invalid_type_error: "Tipo não válido para ID do programa de cashback." }).optional().nullable(),
	recompensaResgate: SaleRewardRedemptionSchema.optional().nullable(),
	valorFinal: z.number({ invalid_type_error: "Tipo não válido para valor final." }),
	valorRestante: z.number({ invalid_type_error: "Tipo não válido para valor restante." }),
	troco: z.number({ invalid_type_error: "Tipo não válido para troco." }),
});

const SaleSuccessSchema = z
	.object({
		mode: z.enum(["ORCAMENTO", "FINALIZADA"]),
		saleId: z.string(),
		title: z.string(),
		description: z.string(),
		valorFinal: z.number(),
		itemCount: z.number(),
		clienteNome: z.string().optional().nullable(),
		vendedorNome: z.string().optional().nullable(),
		entregaModalidade: z.enum(["PRESENCIAL", "RETIRADA", "ENTREGA", "COMANDA"]),
		pagamentos: z.array(CheckoutPaymentSplitSchema.pick({ metodo: true, valor: true })),
		troco: z.number(),
		cashbackAcumulado: z.number().optional().nullable(),
		fiscal: z
			.object({
				status: z.enum(["NAO_SOLICITADO", "SOLICITADO", "ERRO"]),
				error: z.string().optional().nullable(),
			})
			.optional()
			.nullable(),
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
	taxaEntrega: z.number({ invalid_type_error: "Tipo não válido para taxa de entrega." }).default(0),
	observacoes: z.string({ invalid_type_error: "Tipo não válido para observações." }).default(""),
	entregaModalidade: z
		.enum(["PRESENCIAL", "RETIRADA", "ENTREGA", "COMANDA"], {
			invalid_type_error: "Tipo não válido para modalidade de entrega.",
		})
		.default("PRESENCIAL"),
	entregaLocalizacaoId: z.string({ invalid_type_error: "Tipo não válido para ID da localização." }).optional().nullable(),
	comandaNumero: z.string({ invalid_type_error: "Tipo não válido para número da comanda." }).optional().nullable(),
	pagamentos: z.array(CheckoutPaymentSplitSchema),
	// Modo edição: total já recebido (transações efetivadas) — abate do restante a cobrir pelos
	// splits editáveis. Sempre 0 no fluxo de criação.
	pagamentosEfetivadosTotal: z.number({ invalid_type_error: "Tipo não válido para total de pagamentos efetivados." }).default(0),
	cashbackResgate: z.number({ invalid_type_error: "Tipo não válido para resgate de cashback." }).default(0),
	cupomResgate: SaleAppliedCouponSchema.optional().nullable(),
	recompensaResgate: SaleRewardRedemptionSchema.optional().nullable(),
	// Override tri-state da emissão fiscal automática. null = herda a preferência da organização.
	emissaoFiscalAutomatica: z.boolean({ invalid_type_error: "Tipo não válido para emissão fiscal automática." }).nullable().default(null),
	success: SaleSuccessSchema,
});

export type TCartItemModifier = z.infer<typeof CartItemModifierSchema>;
export type TCartItem = z.infer<typeof CartItemSchema>;
export type TSaleDraftMetadata = z.infer<typeof SaleDraftMetadataSchema>;
export type TSaleState = z.infer<typeof SaleStateSchema>;
export type TSaleSuccess = NonNullable<TSaleState["success"]>;

export type TSaleFinancialAccountOption = { id: string; nome: string };

type UseSaleStateProps = {
	initialState?: Partial<TSaleState>;
	organizationConfig?: Pick<TOrganizationConfiguration, "defaults"> | null;
	// Contas ativas da organização, usadas apenas pelos métodos com contaFinanceiraEditavel.
	contasFinanceiras?: TSaleFinancialAccountOption[];
};

// Reaplica o default de efetivação — função de (método, modalidade) — sobre os splits quando a
// modalidade muda. Split cuja efetivação resolvida já coincide com a atual fica intacto, o que
// preserva uma previsão escolhida a dedo (ex.: FIADO com data negociada segue PENDENTE nas duas
// modalidades). `changed` alimenta o aviso na UI.
function rederivePaymentsForModalidade({
	pagamentos,
	entregaModalidade,
	organizationConfig,
}: {
	pagamentos: TCheckoutPaymentSplit[];
	entregaModalidade: TDeliveryModeEnum;
	organizationConfig?: Pick<TOrganizationConfiguration, "defaults"> | null;
}): { pagamentos: TCheckoutPaymentSplit[]; changed: number } {
	let changed = 0;
	const next = pagamentos.map((payment) => {
		const paymentDefaults = getOrganizationPaymentMethodDefault({ organizationConfig, metodo: payment.metodo, entregaModalidade });
		if (paymentDefaults.efetivacaoTipo === payment.efetivacaoTipo) return payment;
		changed += 1;
		return { ...payment, efetivacaoTipo: paymentDefaults.efetivacaoTipo, dataPrevisao: paymentDefaults.dataPrevisao };
	});
	return { pagamentos: changed > 0 ? next : pagamentos, changed };
}

export function getDefaultSaleState(initialState?: Partial<TSaleState>): TSaleState {
	return {
		modoCliente: initialState?.modoCliente ?? "CONSUMIDOR",
		cliente: initialState?.cliente ?? null,
		vendedorId: initialState?.vendedorId ?? null,
		vendedorNome: initialState?.vendedorNome ?? null,
		itens: initialState?.itens ?? [],
		descontoGeral: initialState?.descontoGeral ?? 0,
		acrescimoGeral: initialState?.acrescimoGeral ?? 0,
		taxaEntrega: initialState?.taxaEntrega ?? 0,
		observacoes: initialState?.observacoes ?? "",
		entregaModalidade: initialState?.entregaModalidade ?? "PRESENCIAL",
		entregaLocalizacaoId: initialState?.entregaLocalizacaoId ?? null,
		comandaNumero: initialState?.comandaNumero ?? null,
		pagamentos: initialState?.pagamentos ?? [],
		pagamentosEfetivadosTotal: initialState?.pagamentosEfetivadosTotal ?? 0,
		cashbackResgate: initialState?.cashbackResgate ?? 0,
		cupomResgate: initialState?.cupomResgate ?? null,
		recompensaResgate: initialState?.recompensaResgate ?? null,
		emissaoFiscalAutomatica: initialState?.emissaoFiscalAutomatica ?? null,
		success: initialState?.success ?? null,
	};
}

export const useSaleState = ({ initialState, organizationConfig, contasFinanceiras }: UseSaleStateProps = {}) => {
	const [state, setState] = useState<TSaleState>(() => getDefaultSaleState(initialState));
	const organizationPaymentMethodsConfig = useMemo(() => getOrganizationPaymentMethodsConfig(organizationConfig), [organizationConfig]);

	const setCliente = useCallback((cliente: TSaleState["cliente"]) => {
		setState((prev) => ({ ...prev, modoCliente: "VINCULADO", cliente }));
	}, []);

	const clearCliente = useCallback(() => {
		setState((prev) => ({ ...prev, cliente: null, entregaLocalizacaoId: null, cashbackResgate: 0, cupomResgate: null, recompensaResgate: null }));
	}, []);

	const setModoCliente = useCallback((modoCliente: TSaleState["modoCliente"]) => {
		setState((prev) => ({
			...prev,
			modoCliente,
			cliente: modoCliente === "CONSUMIDOR" ? null : prev.cliente,
			entregaModalidade: modoCliente === "CONSUMIDOR" && prev.entregaModalidade === "ENTREGA" ? "PRESENCIAL" : prev.entregaModalidade,
			entregaLocalizacaoId: modoCliente === "CONSUMIDOR" ? null : prev.entregaLocalizacaoId,
			cashbackResgate: modoCliente === "CONSUMIDOR" ? 0 : prev.cashbackResgate,
			cupomResgate: modoCliente === "CONSUMIDOR" ? null : prev.cupomResgate,
			recompensaResgate: modoCliente === "CONSUMIDOR" ? null : prev.recompensaResgate,
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

	// Guarda o texto cru: aparar aqui comeria o espaço em branco enquanto o operador digita
	// ("sem " viraria "sem"). A normalização para null acontece na borda da API.
	const updateItemObservacoes = useCallback((tempId: string, observacoes: string) => {
		setState((prev) => ({
			...prev,
			itens: prev.itens.map((item) => (item.tempId === tempId ? { ...item, observacoes } : item)),
		}));
	}, []);

	const removeItem = useCallback((tempId: string) => {
		// Item de recompensa não sai pelo carrinho: o débito de saldo já está no ledger.
		setState((prev) => ({ ...prev, itens: prev.itens.filter((item) => item.tempId !== tempId || !!item.recompensaId) }));
	}, []);

	/**
	 * Traz os itens do carrinho para os preços vigentes do catálogo, casando por `itemId`.
	 *
	 * O desconto em valor absoluto é preservado (foi uma decisão comercial sobre aquele item), apenas
	 * limitado ao novo bruto — um preço que caiu não pode deixar o líquido negativo. Itens de
	 * recompensa ficam de fora: o preço deles é o do resgate, não o do catálogo.
	 */
	const repriceItems = useCallback((precos: { itemId: string; valorUnitarioBase: number; valorModificadores: number }[]) => {
		const precoPorItemId = new Map(precos.map((preco) => [preco.itemId, preco]));
		setState((prev) => ({
			...prev,
			itens: prev.itens.map((item) => {
				if (item.recompensaId) return item;
				const preco = item.itemId ? precoPorItemId.get(item.itemId) : undefined;
				if (!preco) return item;
				const valorUnitarioFinal = preco.valorUnitarioBase + preco.valorModificadores;
				const valorTotalBruto = valorUnitarioFinal * item.quantidade;
				const valorDesconto = Math.min(item.valorDesconto, valorTotalBruto);
				return {
					...item,
					valorUnitarioBase: preco.valorUnitarioBase,
					valorModificadores: preco.valorModificadores,
					valorUnitarioFinal,
					valorTotalBruto,
					valorDesconto,
					valorTotalLiquido: valorTotalBruto - valorDesconto,
				};
			}),
		}));
	}, []);

	const clearCart = useCallback(() => {
		setState((prev) => {
			// Itens de recompensa só existem no modo edição (a recompensa já foi resgatada e está
			// materializada como item). Esvaziar o carrinho não pode desfazer um resgate — a válvula
			// é o cancelamento da venda. Na criação não há item de recompensa e tudo é limpo.
			const itensRecompensa = prev.itens.filter((item) => !!item.recompensaId);
			return {
				...prev,
				itens: itensRecompensa,
				pagamentos: [],
				cashbackResgate: 0,
				cupomResgate: null,
				recompensaResgate: itensRecompensa.length > 0 ? prev.recompensaResgate : null,
			};
		});
	}, []);

	const setDescontoGeral = useCallback((descontoGeral: number) => {
		setState((prev) => ({ ...prev, descontoGeral: Math.max(0, descontoGeral || 0) }));
	}, []);

	const setAcrescimoGeral = useCallback((acrescimoGeral: number) => {
		setState((prev) => ({ ...prev, acrescimoGeral: Math.max(0, acrescimoGeral || 0) }));
	}, []);

	const setTaxaEntrega = useCallback((taxaEntrega: number) => {
		const normalizedFee = Math.max(0, taxaEntrega || 0);
		setState((prev) => (prev.taxaEntrega === normalizedFee ? prev : { ...prev, taxaEntrega: normalizedFee }));
	}, []);

	const setObservacoes = useCallback((observacoes: string) => {
		setState((prev) => ({ ...prev, observacoes }));
	}, []);

	const setEntregaModalidade = useCallback(
		(entregaModalidade: TDeliveryModeEnum) => {
			setState((prev) => {
				if (prev.entregaModalidade === entregaModalidade) return prev;
				if (entregaModalidade === "ENTREGA" && prev.modoCliente === "CONSUMIDOR") return prev;
				return {
					...prev,
					entregaModalidade,
					// Mudar a modalidade reaplica o default de efetivação (ENTREGA nasce PENDENTE; sair de
					// ENTREGA devolve ao default do método) — mesma regra da troca de método, que reseta
					// conta e parcelas. A escolha manual vale até o próximo input upstream mudar.
					pagamentos: rederivePaymentsForModalidade({ pagamentos: prev.pagamentos, entregaModalidade, organizationConfig }).pagamentos,
					entregaLocalizacaoId: entregaModalidade === "ENTREGA" ? prev.entregaLocalizacaoId : null,
					comandaNumero: entregaModalidade === "COMANDA" ? prev.comandaNumero : null,
				};
			});
		},
		[organizationConfig],
	);

	// Espelho puro da re-derivação de setEntregaModalidade, para a UI avisar o operador ANTES/AO
	// trocar a modalidade quantos pagamentos terão a efetivação ajustada.
	const countPaymentsRederivedByModalidade = useCallback(
		(entregaModalidade: TDeliveryModeEnum) => {
			if (state.entregaModalidade === entregaModalidade) return 0;
			if (entregaModalidade === "ENTREGA" && state.modoCliente === "CONSUMIDOR") return 0;
			return rederivePaymentsForModalidade({ pagamentos: state.pagamentos, entregaModalidade, organizationConfig }).changed;
		},
		[state.entregaModalidade, state.modoCliente, state.pagamentos, organizationConfig],
	);

	const setEntregaLocalizacaoId = useCallback((entregaLocalizacaoId: string | null) => {
		setState((prev) => ({ ...prev, entregaLocalizacaoId }));
	}, []);

	const setComandaNumero = useCallback((comandaNumero: string | null) => {
		setState((prev) => ({ ...prev, comandaNumero }));
	}, []);

	// Pré-seleção da conta padrão: só quando o método é editável E a conta padrão ainda está entre as
	// ativas. Uma conta desativada depois de virar padrão do método deixaria um id morto no state,
	// que o servidor recusaria no fechamento — melhor cair em "DEFINIR CONTA" e deixar o operador escolher.
	const resolveSeedContaFinanceiraId = useCallback(
		(paymentDefaults: TResolvedPaymentMethodDefault) => {
			if (!paymentDefaults.contaFinanceiraEditavel) return null;
			const padraoId = paymentDefaults.contaFinanceiraPadraoId;
			if (!padraoId) return null;
			return (contasFinanceiras ?? []).some((conta) => conta.id === padraoId) ? padraoId : null;
		},
		[contasFinanceiras],
	);

	const addPagamento = useCallback(
		(pagamento?: Partial<Omit<TCheckoutPaymentSplit, "id">>) => {
			const metodo = pagamento?.metodo ?? "DINHEIRO";
			// Resolvido dentro do setState: o default de efetivação depende da modalidade vigente.
			setState((prev) => {
				const paymentDefaults = getOrganizationPaymentMethodDefault({
					organizationConfig,
					metodo,
					entregaModalidade: prev.entregaModalidade,
				});
				return {
					...prev,
					pagamentos: [
						...prev.pagamentos,
						getDefaultCheckoutPaymentSplit({
							metodo: paymentDefaults.metodo,
							efetivacaoTipo: paymentDefaults.efetivacaoTipo,
							dataPrevisao: paymentDefaults.dataPrevisao,
							totalParcelas: paymentDefaults.totalParcelas,
							contaFinanceiraId: resolveSeedContaFinanceiraId(paymentDefaults),
							...pagamento,
						}),
					],
				};
			});
		},
		[organizationConfig, resolveSeedContaFinanceiraId],
	);

	const removePagamento = useCallback((id: string) => {
		setState((prev) => ({ ...prev, pagamentos: prev.pagamentos.filter((payment) => payment.id !== id) }));
	}, []);

	const updatePagamento = useCallback(
		(id: string, updates: Partial<Omit<TCheckoutPaymentSplit, "id">>) => {
			setState((prev) => ({
				...prev,
				pagamentos: prev.pagamentos.map((payment) => {
					if (payment.id !== id) return payment;
					const metodoAtualizado = updates.metodo ?? payment.metodo;
					const nextPaymentDefaults =
						updates.metodo && updates.metodo !== payment.metodo
							? getOrganizationPaymentMethodDefault({
									organizationConfig,
									metodo: updates.metodo,
									entregaModalidade: prev.entregaModalidade,
								})
							: null;
					return {
						...payment,
						...(nextPaymentDefaults
							? {
									metodo: metodoAtualizado,
									efetivacaoTipo: nextPaymentDefaults.efetivacaoTipo,
									dataPrevisao: nextPaymentDefaults.dataPrevisao,
									totalParcelas: nextPaymentDefaults.totalParcelas,
									// Trocar o método reseta a conta: a escolhida para PIX não vale para DINHEIRO.
									contaFinanceiraId: resolveSeedContaFinanceiraId(nextPaymentDefaults),
								}
							: {}),
						...updates,
						valor: typeof updates.valor === "number" ? Math.max(0, updates.valor) : payment.valor,
					};
				}),
			}));
		},
		[organizationConfig, resolveSeedContaFinanceiraId],
	);

	const setCupomResgate = useCallback((cupomResgate: TSaleAppliedCoupon | null) => {
		setState((prev) => ({ ...prev, cupomResgate, recompensaResgate: cupomResgate ? null : prev.recompensaResgate }));
	}, []);

	const setEmissaoFiscalAutomatica = useCallback((emissaoFiscalAutomatica: boolean | null) => {
		setState((prev) => ({ ...prev, emissaoFiscalAutomatica }));
	}, []);

	const setCashbackResgate = useCallback((cashbackResgate: number) => {
		setState((prev) => {
			const nextValue = Math.max(0, cashbackResgate || 0);
			if (prev.cashbackResgate === nextValue) return prev;
			return { ...prev, cashbackResgate: nextValue, recompensaResgate: nextValue > 0 ? null : prev.recompensaResgate };
		});
	}, []);

	// Recompensa é exclusiva com cupom e com resgate-desconto (invariante do ledger: 1 RESGATE
	// por venda; cupom não combinável espelha o POI) — selecionar uma zera os outros.
	const setRecompensaResgate = useCallback((recompensaResgate: TSaleRewardRedemption | null) => {
		setState((prev) => {
			if (!recompensaResgate) return { ...prev, recompensaResgate: null };
			return { ...prev, recompensaResgate, cashbackResgate: 0, cupomResgate: null };
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
	// Base e desconto avaliados contra o teto do operador: itens de recompensa ficam de fora
	// (o resgate tem regras próprias, como cashback e cupom AUTOMATICA). Mesmo recorte do servidor.
	const itensAvaliaveis = useMemo(() => state.itens.filter((item) => !item.recompensaId), [state.itens]);
	const subtotalAvaliavel = useMemo(() => itensAvaliaveis.reduce((sum, item) => sum + item.valorTotalBruto, 0), [itensAvaliaveis]);
	const totalDescontoItensAvaliavel = useMemo(() => itensAvaliaveis.reduce((sum, item) => sum + item.valorDesconto, 0), [itensAvaliaveis]);
	const totalItens = useMemo(() => state.itens.reduce((sum, item) => sum + item.valorTotalLiquido, 0), [state.itens]);
	const itemCount = useMemo(() => state.itens.reduce((sum, item) => sum + item.quantidade, 0), [state.itens]);
	const cupomDesconto = useMemo(() => state.cupomResgate?.valorDesconto ?? 0, [state.cupomResgate]);
	// Descontos incidem só sobre os itens; o acréscimo entra por último e não é consumido
	// por cupom nem cashback. Mesma ordem da loja digital e do backend.
	const valorAntesCupom = useMemo(() => Math.max(0, totalItens - state.descontoGeral), [totalItens, state.descontoGeral]);
	const valorAntesCashback = useMemo(() => Math.max(0, valorAntesCupom - cupomDesconto), [valorAntesCupom, cupomDesconto]);
	const acrescimosTotal = state.acrescimoGeral + state.taxaEntrega;
	const valorFinal = useMemo(
		() => Math.max(0, valorAntesCashback - state.cashbackResgate) + acrescimosTotal,
		[valorAntesCashback, state.cashbackResgate, acrescimosTotal],
	);
	const totalPagamentos = useMemo(() => state.pagamentos.reduce((sum, p) => sum + p.valor, 0), [state.pagamentos]);
	// Modo edição: os splits editáveis só precisam cobrir o que ainda não foi recebido.
	const valorAposEfetivados = useMemo(() => Math.max(0, valorFinal - state.pagamentosEfetivadosTotal), [valorFinal, state.pagamentosEfetivadosTotal]);
	const valorRestante = useMemo(() => Math.max(0, valorAposEfetivados - totalPagamentos), [valorAposEfetivados, totalPagamentos]);
	// Troco: mesmas regras do servidor (lib/sales/sale-change.ts) — excesso só sobre pagamentos
	// imediatos; excesso fora do dinheiro pede confirmação explícita antes de finalizar.
	const change = useMemo(
		() => resolveSaleChange({ payments: state.pagamentos, saleTotal: valorAposEfetivados }),
		[state.pagamentos, valorAposEfetivados],
	);
	const troco = change.troco;
	const trocoBloqueio = change.bloqueio;
	const trocoCobertoPorDinheiro = change.cobertoPorDinheiro;
	const pagamentoCompleto = useMemo(() => valorRestante <= 0.01, [valorRestante]);

	const isReadyForDraft = useMemo(() => {
		// Venda só-recompensa é válida: o item do prêmio é construído pelo servidor.
		if (state.itens.length === 0 && !state.recompensaResgate) return false;
		if (state.modoCliente === "VINCULADO" && !state.cliente) return false;
		return true;
	}, [state.itens.length, state.recompensaResgate, state.modoCliente, state.cliente]);

	const isReadyForFinalize = useMemo(() => {
		if (!isReadyForDraft) return false;
		if (state.entregaModalidade === "ENTREGA" && !state.entregaLocalizacaoId) return false;
		if (state.entregaModalidade === "COMANDA" && !state.comandaNumero?.trim()) return false;
		if (!pagamentoCompleto) return false;
		if (trocoBloqueio) return false;
		if (valorAposEfetivados > 0.01 && state.pagamentos.length === 0) return false;
		if (
			state.pagamentos.some(
				(payment) =>
					!isCheckoutPaymentSplitValid(payment, {
						hasLinkedClient: !!state.cliente,
						entregaModalidade: state.entregaModalidade,
					}),
			)
		) {
			return false;
		}
		return true;
	}, [
		isReadyForDraft,
		state.entregaModalidade,
		state.entregaLocalizacaoId,
		state.comandaNumero,
		state.pagamentos,
		state.cliente,
		pagamentoCompleto,
		trocoBloqueio,
		valorAposEfetivados,
	]);

	const getDraftMetadata = useCallback((): TSaleDraftMetadata => {
		return {
			pagamentos: state.pagamentos,
			descontoGeral: state.descontoGeral,
			taxaEntrega: state.taxaEntrega,
			cashbackResgate: state.cashbackResgate,
			recompensaResgate: state.recompensaResgate,
			valorFinal,
			valorRestante,
			troco,
		};
	}, [state.pagamentos, state.descontoGeral, state.taxaEntrega, state.cashbackResgate, state.recompensaResgate, valorFinal, valorRestante, troco]);

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
		updateItemObservacoes,
		removeItem,
		repriceItems,
		clearCart,
		setDescontoGeral,
		setAcrescimoGeral,
		setTaxaEntrega,
		setObservacoes,
		setEntregaModalidade,
		countPaymentsRederivedByModalidade,
		setEntregaLocalizacaoId,
		setComandaNumero,
		ensureEntregaLocation,
		addPagamento,
		removePagamento,
		updatePagamento,
		setCashbackResgate,
		setRecompensaResgate,
		setCupomResgate,
		setEmissaoFiscalAutomatica,
		setSuccess,
		clearSuccess,
		subtotal,
		totalDescontoItens,
		subtotalAvaliavel,
		totalDescontoItensAvaliavel,
		totalItens,
		itemCount,
		cupomDesconto,
		valorAntesCupom,
		valorAntesCashback,
		acrescimosTotal,
		valorFinal,
		totalPagamentos,
		valorAposEfetivados,
		valorRestante,
		troco,
		trocoBloqueio,
		trocoCobertoPorDinheiro,
		pagamentoCompleto,
		isReadyForDraft,
		isReadyForFinalize,
		getDraftMetadata,
		resetState,
		organizationPaymentMethodsConfig,
		organizationFinancialAccounts: contasFinanceiras ?? [],
	};
};

export type TUseSaleState = ReturnType<typeof useSaleState>;

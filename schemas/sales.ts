import { z } from "zod";
import { SaleNatureEnum } from "./enums";

const SaleItemSchema = z.object({
	codigo: z.string({}),
	descricao: z.string({}),
	unidade: z.string({}),
	qtde: z.number(),
	valorunit: z.number(),
	vprod: z.number(),
	vdesc: z.number(),
	vcusto: z.number(),
	baseicms: z.number(),
	percent: z.number(),
	icms: z.number(),
	cst_icms: z.string({}),
	csosn: z.string({}),
	cst_pis: z.string({}),
	cfop: z.string({}),
	tipo: z.string({}),
	vfrete: z.number(),
	vseg: z.number(),
	voutro: z.number(),
	vipi: z.number(),
	vicmsst: z.number(),
	vicms_desonera: z.number(),
	ncm: z.string({}),
	cest: z.string({}),
	grupo: z.string({}),
});
export const SaleSchema = z.object({
	id: z.string({}),
	chave: z.string({}),
	cliente: z.string({}).optional().nullable(),
	data: z.string({}),
	dataVenda: z.string({}),
	modelo: z.enum(["DV", "55", "65", "3A", "02"]),
	movimento: z.enum(["RECEITAS"]),
	natureza: SaleNatureEnum,
	parceiro: z.string({}),
	serie: z.string(),
	situacao: z.enum(["00", "04", "02", "05"]),
	tipo: z.enum(["Devolucao de compra", "Outras Saidas Nao Especificadas", "Remessa para conserto", "Condicional", "Venda de produtos"]),
	valor: z.number({}),
	vendedor: z.string({}),
	idCliente: z.string({}),
	itens: z.array(SaleItemSchema),
	custoTotal: z.number(),
});

export const SalesSimplifiedSearchQueryParams = z.object({
	search: z.string({ required_error: "Parâmetro de busca não informado.", invalid_type_error: "Parâmetro de busca não informado." }),
	page: z
		.number({ required_error: "Parâmetro de página não informado.", invalid_type_error: "Parâmetro de página não informado." })
		.min(1, { message: "Página não informada." }),
});
export type TSalesSimplifiedSearchQueryParams = z.infer<typeof SalesSimplifiedSearchQueryParams>;

export type TSale = z.infer<typeof SaleSchema>;

/**
 * Estado do envio de conversão (Purchase) ao Conversions API da Meta, gravado na própria venda
 * (`sales.capiMetadados`) — sem tabela dedicada, pois é 1 venda = 1 evento Purchase.
 * Nunca guarda PII crua: só o resumo do envio (o hash só vai no payload enviado à Meta).
 */
export const SaleCapiMetadataSchema = z.object({
	status: z.enum(["PENDENTE", "ENVIADO", "FALHA"], {
		required_error: "Status do CAPI não informado.",
		invalid_type_error: "Tipo não válido para o status do CAPI.",
	}),
	eventId: z.string({ required_error: "eventId do CAPI não informado.", invalid_type_error: "Tipo não válido para o eventId do CAPI." }),
	eventName: z.string({ required_error: "eventName do CAPI não informado.", invalid_type_error: "Tipo não válido para o eventName do CAPI." }),
	integrationId: z.string({ invalid_type_error: "Tipo não válido para o ID da integração." }).optional(),
	actionSource: z.string({ invalid_type_error: "Tipo não válido para o action_source." }).optional(),
	eventsReceived: z.number({ invalid_type_error: "Tipo não válido para eventos recebidos." }).optional(),
	tentativas: z.number({ invalid_type_error: "Tipo não válido para tentativas." }).default(0),
	ultimoErro: z.string({ invalid_type_error: "Tipo não válido para o último erro." }).optional().nullable(),
	dataEnvio: z.string({ invalid_type_error: "Tipo não válido para a data de envio." }).datetime().optional(),
});
export type TSaleCapiMetadata = z.infer<typeof SaleCapiMetadataSchema>;

/**
 * Metadados de venda de canal de integração (ex.: iFood) — detalhamento que não cabe nas colunas
 * da venda mas é necessário para o fiscal (frete próprio, descontos por patrocinador) e para a
 * conciliação do repasse (taxas do canal). Escrito uma vez pela ingestão; null em vendas internas.
 */
export const SaleIntegrationMetadataSchema = z.object({
	versao: z.literal(1),
	canal: z.string({ required_error: "Canal dos metadados de integração não informado." }),
	entrega: z.object({
		/** LOJA = entrega própria (frete é receita da loja, entra na NF); CANAL = entregador do canal. */
		realizadaPor: z.enum(["LOJA", "CANAL"], { invalid_type_error: "Tipo não válido para o responsável pela entrega." }).nullable(),
		valorFrete: z.number({ invalid_type_error: "Tipo não válido para o valor do frete." }),
		/** Ponto de referência do endereço informado no pedido. Opcional: linhas antigas não têm. */
		referencia: z.string({ invalid_type_error: "Tipo não válido para o ponto de referência." }).nullable().optional(),
	}),
	descontos: z.object({
		/** Desconto bancado pela loja (sponsorship MERCHANT) — reduz a NF (rateado nos itens). */
		loja: z.number({ invalid_type_error: "Tipo não válido para o desconto da loja." }),
		/** Descontos bancados por terceiros (IFOOD/EXTERNAL/CHAIN) — NF cheia; entram como pagamento. */
		patrocinados: z.array(
			z.object({
				patrocinador: z.string({ required_error: "Patrocinador do desconto não informado." }),
				valor: z.number({ invalid_type_error: "Tipo não válido para o valor patrocinado." }),
			}),
		),
	}),
	pagamentos: z
		.object({
			prePago: z.number({ invalid_type_error: "Tipo não válido para o valor pré-pago." }),
			pendente: z.number({ invalid_type_error: "Tipo não válido para o valor pendente." }),
			metodos: z.array(
				z.object({
					metodo: z.string({ required_error: "Método de pagamento do canal não informado." }),
					valor: z.number({ invalid_type_error: "Tipo não válido para o valor do pagamento do canal." }),
					pagoOnline: z.boolean({ invalid_type_error: "Tipo não válido para o indicador de pagamento online." }),
					descricao: z.string({ invalid_type_error: "Tipo não válido para a descrição do pagamento do canal." }).nullable(),
					/** Dinheiro na entrega: nota com que o cliente vai pagar (troco = trocoPara − valor). */
					trocoPara: z.number({ invalid_type_error: "Tipo não válido para o valor do troco." }).nullable().optional(),
				}),
			),
		})
		.optional(),
	/** Pagamentos e referência fiscal já concluídos no Phibo; apenas histórico, sem lançamento financeiro. */
	phibo: z
		.object({
			cupomTrocaId: z.number({ invalid_type_error: "Tipo não válido para o cupom Phibo." }).nullable(),
			nfeNumero: z.number({ invalid_type_error: "Tipo não válido para o número da NFC-e Phibo." }),
			formasPagamento: z.array(
				z.object({
					descricao: z.string({ invalid_type_error: "Tipo não válido para a forma de pagamento Phibo." }),
					parcelas: z.array(
						z.object({
							parcelaNumero: z.number({ invalid_type_error: "Tipo não válido para a parcela Phibo." }),
							dataVencto: z.string({ invalid_type_error: "Tipo não válido para o vencimento Phibo." }),
							valorParcela: z.number({ invalid_type_error: "Tipo não válido para o valor da parcela Phibo." }),
							valorRecebido: z.number({ invalid_type_error: "Tipo não válido para o valor recebido Phibo." }),
							situacao: z.string({ invalid_type_error: "Tipo não válido para a situação da parcela Phibo." }),
						}),
					),
				}),
			),
		})
		.optional(),
	/** Rota temporária de contato do iFood. Nunca deve virar telefone cadastral do cliente. */
	contatoTemporario: z
		.object({
			telefone: z.string({ invalid_type_error: "Tipo não válido para o telefone temporário." }).nullable(),
			localizador: z.string({ required_error: "Localizador temporário não informado." }),
			expiraEm: z.string({ invalid_type_error: "Tipo não válido para a expiração do localizador." }).nullable(),
		})
		.nullable()
		.optional(),
	/**
	 * Solicitação de cancelamento registrada no canal e ainda sem desfecho — informativa, não exige
	 * resposta da loja. Só o canal escreve aqui (ingestão); o desfecho (cancelado ou rejeitado)
	 * limpa o bloco. Opcional para não invalidar as linhas gravadas antes deste campo existir.
	 */
	cancelamentoSolicitado: z
		.object({
			solicitadoEm: z.string({ required_error: "Data da solicitação de cancelamento não informada." }),
			motivo: z.string({ invalid_type_error: "Tipo não válido para o motivo do cancelamento." }).nullable(),
		})
		.nullable()
		.optional(),
	/**
	 * Disputa de cancelamento ABERTA na Plataforma de Negociação do canal (iFood HANDSHAKE_DISPUTE)
	 * — esta sim exige resposta da loja antes de `expiraEm`, senão o canal executa `acaoTimeout`.
	 * Só o canal escreve aqui (ingestão); o desfecho (HANDSHAKE_SETTLEMENT ou cancelamento
	 * efetivado) limpa o bloco. Valores monetários trafegam como o canal envia: centavos em string
	 * (ex.: "5000" = R$ 50,00).
	 */
	disputaAberta: z
		.object({
			disputaId: z.string({ required_error: "ID da disputa não informado." }),
			abertaEm: z.string({ invalid_type_error: "Tipo não válido para a data de abertura da disputa." }).nullable(),
			expiraEm: z.string({ invalid_type_error: "Tipo não válido para o prazo da disputa." }).nullable(),
			acao: z.string({ invalid_type_error: "Tipo não válido para a ação da disputa." }).nullable(),
			acaoTimeout: z.string({ invalid_type_error: "Tipo não válido para a ação de timeout da disputa." }).nullable(),
			tipo: z.string({ invalid_type_error: "Tipo não válido para o tipo da disputa." }).nullable(),
			mensagem: z.string({ invalid_type_error: "Tipo não válido para a mensagem da disputa." }).nullable(),
			alternativas: z.array(
				z.object({
					id: z.string({ invalid_type_error: "Tipo não válido para o ID da alternativa." }).nullable(),
					tipo: z.string({ invalid_type_error: "Tipo não válido para o tipo da alternativa." }).nullable(),
					valorMaximo: z
						.object({
							valor: z.string({ required_error: "Valor máximo da alternativa não informado." }),
							moeda: z.string({ invalid_type_error: "Tipo não válido para a moeda da alternativa." }).nullable(),
						})
						.nullable(),
				}),
			),
		})
		.nullable()
		.optional(),
	/** Taxas do canal (ex.: additionalFees do iFood) — receita do canal, fora da NF; material da conciliação. */
	taxasCanal: z.array(
		z.object({
			tipo: z.string({ required_error: "Tipo da taxa do canal não informado." }),
			valor: z.number({ invalid_type_error: "Tipo não válido para o valor da taxa do canal." }),
		}),
	),
});
export type TSaleIntegrationMetadata = z.infer<typeof SaleIntegrationMetadataSchema>;

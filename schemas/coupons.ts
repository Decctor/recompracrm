import z from "zod";
import type { TDeliveryModeEnum } from "./enums";
import {
	CouponBenefitScopeEnum,
	CouponBenefitTypeEnum,
	CouponGrantOriginEnum,
	CouponRedemptionSourceEnum,
	CouponRedemptionStatusEnum,
	CouponScopeEnum,
	CouponTargetOperatorEnum,
	CouponTargetRoleEnum,
	CouponValidationModeEnum,
	DeliveryModeEnum,
} from "./enums";

export const CouponSchema = z.object({
	ativo: z
		.boolean({
			required_error: "Ativo do cupom não informado.",
			invalid_type_error: "Tipo não válido para o ativo do cupom.",
		})
		.default(true),
	titulo: z.string({
		required_error: "Título do cupom não informado.",
		invalid_type_error: "Tipo não válido para o título do cupom.",
	}),
	descricao: z
		.string({
			required_error: "Descrição do cupom não informada.",
			invalid_type_error: "Tipo não válido para a descrição do cupom.",
		})
		.optional()
		.nullable(),
	imagemCapaUrl: z
		.string({
			required_error: "URL da imagem de capa do cupom não informada.",
			invalid_type_error: "Tipo não válido para a URL da imagem de capa do cupom.",
		})
		.optional()
		.nullable(),
	codigo: z
		.string({
			required_error: "Código do cupom não informado.",
			invalid_type_error: "Tipo não válido para o código do cupom.",
		})
		.min(1, "O código do cupom não pode ser vazio.")
		.transform((val) => val.trim().toUpperCase()),
	escopo: CouponScopeEnum.default("GLOBAL"),
	validacaoModo: CouponValidationModeEnum.default("AUTOMATICA"),
	condicoesTexto: z
		.string({
			required_error: "Condições em texto do cupom não informadas.",
			invalid_type_error: "Tipo não válido para as condições em texto do cupom.",
		})
		.optional()
		.nullable(),
	beneficioTipo: CouponBenefitTypeEnum,
	beneficioValor: z
		.number({
			required_error: "Valor do benefício do cupom não informado.",
			invalid_type_error: "Tipo não válido para o valor do benefício do cupom.",
		})
		.optional()
		.nullable(),
	beneficioDescontoMaximo: z
		.number({
			required_error: "Desconto máximo do benefício do cupom não informado.",
			invalid_type_error: "Tipo não válido para o desconto máximo do benefício do cupom.",
		})
		.optional()
		.nullable(),
	beneficioAplicacao: CouponBenefitScopeEnum.default("VENDA_TOTAL"),
	beneficioCompreQuantidade: z
		.number({
			required_error: "Quantidade de compra do benefício do cupom não informada.",
			invalid_type_error: "Tipo não válido para a quantidade de compra do benefício do cupom.",
		})
		.int("A quantidade de compra do benefício deve ser um número inteiro.")
		.optional()
		.nullable(),
	beneficioLeveQuantidade: z
		.number({
			required_error: "Quantidade levada do benefício do cupom não informada.",
			invalid_type_error: "Tipo não válido para a quantidade levada do benefício do cupom.",
		})
		.int("A quantidade levada do benefício deve ser um número inteiro.")
		.optional()
		.nullable(),
	condicaoValorMinimoVenda: z
		.number({
			required_error: "Valor mínimo de venda do cupom não informado.",
			invalid_type_error: "Tipo não válido para o valor mínimo de venda do cupom.",
		})
		.optional()
		.nullable(),
	condicaoQuantidadeMinimaItens: z
		.number({
			required_error: "Quantidade mínima de itens do cupom não informada.",
			invalid_type_error: "Tipo não válido para a quantidade mínima de itens do cupom.",
		})
		.int("A quantidade mínima de itens deve ser um número inteiro.")
		.optional()
		.nullable(),
	condicaoModalidadesEntrega: z
		.array(DeliveryModeEnum, {
			required_error: "Modalidades de atendimento do cupom não informadas.",
			invalid_type_error: "Tipo não válido para as modalidades de atendimento do cupom.",
		})
		.optional()
		.nullable(),
	condicaoPrimeiraCompra: z
		.boolean({
			required_error: "Condição de primeira compra do cupom não informada.",
			invalid_type_error: "Tipo não válido para a condição de primeira compra do cupom.",
		})
		.default(false),
	condicaoAlvosOperador: CouponTargetOperatorEnum.default("QUALQUER"),
	vigenciaInicio: z
		.string({
			required_error: "Início da vigência do cupom não informado.",
			invalid_type_error: "Tipo não válido para o início da vigência do cupom.",
		})
		.datetime({ message: "Formato inválido para o início da vigência do cupom." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	vigenciaFim: z
		.string({
			required_error: "Fim da vigência do cupom não informado.",
			invalid_type_error: "Tipo não válido para o fim da vigência do cupom.",
		})
		.datetime({ message: "Formato inválido para o fim da vigência do cupom." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	limiteResgatesTotal: z
		.number({
			required_error: "Limite total de resgates do cupom não informado.",
			invalid_type_error: "Tipo não válido para o limite total de resgates do cupom.",
		})
		.int("O limite total de resgates deve ser um número inteiro.")
		.optional()
		.nullable(),
	limiteResgatesPorCliente: z
		.number({
			required_error: "Limite de resgates por cliente do cupom não informado.",
			invalid_type_error: "Tipo não válido para o limite de resgates por cliente do cupom.",
		})
		.int("O limite de resgates por cliente deve ser um número inteiro.")
		.optional()
		.nullable()
		.default(1),
	acumulavel: z
		.boolean({
			required_error: "Acumulável do cupom não informado.",
			invalid_type_error: "Tipo não válido para o acumulável do cupom.",
		})
		.default(false),
	resgatePermitirViaPos: z
		.boolean({
			required_error: "Permissão de resgate via POS não informada.",
			invalid_type_error: "Tipo não válido para a permissão de resgate via POS.",
		})
		.default(true),
	resgatePermitirViaPontoInteracao: z
		.boolean({
			required_error: "Permissão de resgate via ponto de interação não informada.",
			invalid_type_error: "Tipo não válido para a permissão de resgate via ponto de interação.",
		})
		.default(true),
	resgatePermitirViaLojaDigital: z
		.boolean({
			required_error: "Permissão de resgate via loja digital não informada.",
			invalid_type_error: "Tipo não válido para a permissão de resgate via loja digital.",
		})
		.default(true),
	autorId: z
		.string({
			required_error: "ID do autor do cupom não informado.",
			invalid_type_error: "Tipo não válido para o ID do autor do cupom.",
		})
		.optional()
		.nullable(),
	dataInsercao: z
		.string({
			required_error: "Data de inserção do cupom não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção do cupom.",
		})
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
	dataAtualizacao: z
		.string({
			required_error: "Data de atualização do cupom não informada.",
			invalid_type_error: "Tipo não válido para a data de atualização do cupom.",
		})
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TCoupon = z.infer<typeof CouponSchema>;

/**
 * Cupom criado DE DENTRO do construtor de campanhas ("criar cupom para esta campanha").
 *
 * É deliberadamente um subconjunto de `CouponSchema`, não o schema inteiro. A campanha materializa
 * atribuições individuais, então escopo, modo de validação, aplicação e limite de resgate não são
 * escolha do formulário rápido — o servidor os fixa em `CAMPAIGN_INLINE_COUPON_DEFAULTS`. Aceitar o
 * `CouponSchema` completo aqui deixaria a rota de campanhas criar cupons GLOBAIS ou por item, que
 * ela recusaria logo em seguida, e transformaria os "padrões aplicados" que a UI promete em algo
 * que qualquer requisição montada à mão poderia contradizer.
 *
 * Preço fixo e "leve X pague Y" ficam de fora porque ambos exigem alvos de produto — para esses,
 * o caminho continua sendo o construtor de cupons completo.
 *
 * A vigência do cupom também fica de fora: o prazo que o formulário rápido oferece é o da
 * ATRIBUIÇÃO (`cupomGeracaoExpiracaoMedida`/`Valor`, campos da campanha), não o do cupom em si.
 */
export const CampaignInlineCouponSchema = CouponSchema.pick({
	codigo: true,
	titulo: true,
	beneficioTipo: true,
	beneficioValor: true,
	beneficioDescontoMaximo: true,
}).extend({
	beneficioTipo: z.enum(["DESCONTO_PERCENTUAL", "DESCONTO_FIXO"], {
		required_error: "Tipo do benefício do cupom não informado.",
		invalid_type_error: "O cupom criado pela campanha aceita apenas desconto percentual ou desconto em reais.",
	}),
	titulo: z
		.string({
			required_error: "Título do cupom não informado.",
			invalid_type_error: "Tipo não válido para o título do cupom.",
		})
		.min(1, "O título do cupom não pode ser vazio."),
});
export type TCampaignInlineCoupon = z.infer<typeof CampaignInlineCouponSchema>;
/**
 * Forma do lado do cliente: é o que trafega em JSON, antes das transformações do Zod
 * (`vigenciaFim` ainda é string ISO, `codigo` ainda não foi normalizado para caixa alta).
 */
export type TCampaignInlineCouponInput = z.input<typeof CampaignInlineCouponSchema>;

/** Fixados pelo servidor ao materializar o cupom inline — refletem os "padrões aplicados" da UI. */
export const CAMPAIGN_INLINE_COUPON_DEFAULTS = {
	ativo: true,
	// Cupom sem janela de vigência própria: quem limita o prazo é a expiração da atribuição,
	// configurada na própria campanha.
	vigenciaInicio: null,
	vigenciaFim: null,
	// A campanha materializa atribuições por cliente, então só cupons INDIVIDUAIS fazem sentido.
	escopo: "INDIVIDUAL",
	validacaoModo: "AUTOMATICA",
	beneficioAplicacao: "VENDA_TOTAL",
	condicaoPrimeiraCompra: false,
	condicaoAlvosOperador: "QUALQUER",
	limiteResgatesPorCliente: 1,
	acumulavel: false,
	resgatePermitirViaPos: true,
	resgatePermitirViaPontoInteracao: true,
	resgatePermitirViaLojaDigital: true,
} as const satisfies Partial<TCoupon>;

export const CouponTargetSchema = z
	.object({
		papel: CouponTargetRoleEnum.default("ELEGIVEL"),
		produtoId: z
			.string({
				required_error: "ID do produto do alvo do cupom não informado.",
				invalid_type_error: "Tipo não válido para o ID do produto do alvo do cupom.",
			})
			.optional()
			.nullable(),
		produtoVarianteId: z
			.string({
				required_error: "ID da variante do produto do alvo do cupom não informado.",
				invalid_type_error: "Tipo não válido para o ID da variante do produto do alvo do cupom.",
			})
			.optional()
			.nullable(),
		grupo: z
			.string({
				required_error: "Grupo de produtos do alvo do cupom não informado.",
				invalid_type_error: "Tipo não válido para o grupo de produtos do alvo do cupom.",
			})
			.optional()
			.nullable(),
		quantidadeMinima: z
			.number({
				required_error: "Quantidade mínima do alvo do cupom não informada.",
				invalid_type_error: "Tipo não válido para a quantidade mínima do alvo do cupom.",
			})
			.int("A quantidade mínima do alvo deve ser um número inteiro.")
			.min(1, "A quantidade mínima do alvo deve ser pelo menos 1.")
			.default(1),
	})
	.refine((target) => [target.produtoId, target.produtoVarianteId, target.grupo].filter(Boolean).length === 1, {
		message: "Cada alvo do cupom deve referenciar exatamente um produto, variante ou grupo de produtos.",
	});
export type TCouponTarget = z.infer<typeof CouponTargetSchema>;

export const CouponAudienceSchema = z
	.object({
		clienteTagId: z
			.string({
				required_error: "ID da tag de cliente da audiência do cupom não informado.",
				invalid_type_error: "Tipo não válido para o ID da tag de cliente da audiência do cupom.",
			})
			.optional()
			.nullable(),
		segmentacaoRFM: z
			.string({
				required_error: "Segmentação RFM da audiência do cupom não informada.",
				invalid_type_error: "Tipo não válido para a segmentação RFM da audiência do cupom.",
			})
			.optional()
			.nullable(),
	})
	.refine((audience) => [audience.clienteTagId, audience.segmentacaoRFM].filter(Boolean).length === 1, {
		message: "Cada audiência do cupom deve referenciar exatamente uma tag de cliente ou segmentação RFM.",
	});
export type TCouponAudience = z.infer<typeof CouponAudienceSchema>;

export const CouponGrantSchema = z.object({
	cupomId: z.string({
		required_error: "ID do cupom da atribuição não informado.",
		invalid_type_error: "Tipo não válido para o ID do cupom da atribuição.",
	}),
	clienteId: z.string({
		required_error: "ID do cliente da atribuição não informado.",
		invalid_type_error: "Tipo não válido para o ID do cliente da atribuição.",
	}),
	codigo: z
		.string({
			required_error: "Código da atribuição do cupom não informado.",
			invalid_type_error: "Tipo não válido para o código da atribuição do cupom.",
		})
		.optional()
		.nullable(),
	origem: CouponGrantOriginEnum.default("MANUAL"),
	campanhaId: z
		.string({
			required_error: "ID da campanha da atribuição do cupom não informado.",
			invalid_type_error: "Tipo não válido para o ID da campanha da atribuição do cupom.",
		})
		.optional()
		.nullable(),
	quantidadeDisponivel: z
		.number({
			required_error: "Quantidade disponível da atribuição do cupom não informada.",
			invalid_type_error: "Tipo não válido para a quantidade disponível da atribuição do cupom.",
		})
		.int("A quantidade disponível deve ser um número inteiro.")
		.min(1, "A quantidade disponível deve ser pelo menos 1.")
		.default(1),
	expiracaoData: z
		.string({
			required_error: "Data de expiração da atribuição do cupom não informada.",
			invalid_type_error: "Tipo não válido para a data de expiração da atribuição do cupom.",
		})
		.datetime({ message: "Formato inválido para a data de expiração da atribuição do cupom." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	dataInsercao: z
		.string({
			required_error: "Data de inserção da atribuição do cupom não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção da atribuição do cupom.",
		})
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
	dataAtualizacao: z
		.string({
			required_error: "Data de atualização da atribuição do cupom não informada.",
			invalid_type_error: "Tipo não válido para a data de atualização da atribuição do cupom.",
		})
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TCouponGrant = z.infer<typeof CouponGrantSchema>;

export const CouponRedemptionSchema = z.object({
	cupomId: z.string({
		required_error: "ID do cupom do resgate não informado.",
		invalid_type_error: "Tipo não válido para o ID do cupom do resgate.",
	}),
	atribuicaoId: z
		.string({
			required_error: "ID da atribuição do resgate do cupom não informado.",
			invalid_type_error: "Tipo não válido para o ID da atribuição do resgate do cupom.",
		})
		.optional()
		.nullable(),
	clienteId: z
		.string({
			required_error: "ID do cliente do resgate do cupom não informado.",
			invalid_type_error: "Tipo não válido para o ID do cliente do resgate do cupom.",
		})
		.optional()
		.nullable(),
	status: CouponRedemptionStatusEnum.default("UTILIZADO"),
	vendaId: z
		.string({
			required_error: "ID da venda do resgate do cupom não informado.",
			invalid_type_error: "Tipo não válido para o ID da venda do resgate do cupom.",
		})
		.optional()
		.nullable(),
	vendaValor: z
		.number({
			required_error: "Valor da venda do resgate do cupom não informado.",
			invalid_type_error: "Tipo não válido para o valor da venda do resgate do cupom.",
		})
		.optional()
		.nullable(),
	valorDesconto: z.number({
		required_error: "Valor do desconto do resgate do cupom não informado.",
		invalid_type_error: "Tipo não válido para o valor do desconto do resgate do cupom.",
	}),
	origemResgate: CouponRedemptionSourceEnum,
});
export type TCouponRedemption = z.infer<typeof CouponRedemptionSchema>;

/**
 * Cupom aplicado a uma venda em andamento (rascunho do POS / pedido da loja).
 * Persistido em sales.rascunhoMetadados.cupom até a confirmação, quando o resgate
 * é registrado no ledger. O desconto entra nos totais da venda como o cashbackResgate.
 */
export const AppliedCouponSchema = z.object({
	cupomId: z.string({
		required_error: "ID do cupom aplicado não informado.",
		invalid_type_error: "Tipo não válido para o ID do cupom aplicado.",
	}),
	valorDesconto: z
		.number({
			required_error: "Valor de desconto do cupom aplicado não informado.",
			invalid_type_error: "Tipo não válido para o valor de desconto do cupom aplicado.",
		})
		.min(0.01, "O valor de desconto do cupom aplicado deve ser maior que zero."),
	codigo: z.string({ invalid_type_error: "Tipo não válido para o código do cupom aplicado." }).optional().nullable(),
	titulo: z.string({ invalid_type_error: "Tipo não válido para o título do cupom aplicado." }).optional().nullable(),
});
export type TAppliedCoupon = z.infer<typeof AppliedCouponSchema>;

/**
 * Snapshot do benefício persistido em couponRedemptions.beneficioSnapshot para auditoria,
 * já que a definição do cupom pode mudar depois do uso.
 */
export type TCouponBenefitSnapshot = {
	beneficioTipo: TCoupon["beneficioTipo"];
	beneficioValor: number | null;
	beneficioDescontoMaximo: number | null;
	beneficioAplicacao: TCoupon["beneficioAplicacao"];
	beneficioCompreQuantidade: number | null;
	beneficioLeveQuantidade: number | null;
	validacaoModo: TCoupon["validacaoModo"];
	condicoesTexto: string | null;
	condicaoModalidadesEntrega?: TCoupon["condicaoModalidadesEntrega"];
	condicaoPrimeiraCompra?: boolean;
	contextoAplicacao?: {
		entregaModalidade: TDeliveryModeEnum | null;
		comprasAnterioresConfirmadas: number;
	};
	alvos: Array<{
		papel: TCouponTarget["papel"];
		produtoId: string | null;
		produtoVarianteId: string | null;
		grupo: string | null;
		quantidadeMinima: number;
	}>;
};

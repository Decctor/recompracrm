import z from "zod";
import {
	CashbackProgramAccumulationTypeEnum,
	CashbackProgramRedemptionLimitTypeEnum,
	CashbackProgramTransactionStatusEnum,
	CashbackProgramTransactionTypeEnum,
} from "./enums";

export const CashbackProgramSchema = z.object({
	ativo: z
		.boolean({
			required_error: "Ativo do programa de cashback não informado.",
			invalid_type_error: "Tipo não válido para o ativo do programa de cashback.",
		})
		.default(true),
	titulo: z.string({
		required_error: "Título do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o título do programa de cashback.",
	}),
	descricao: z
		.string({
			required_error: "Descrição do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a descrição do programa de cashback.",
		})
		.optional()
		.nullable(),
	modalidadeDescontosPermitida: z
		.boolean({
			required_error: "Modalidade de descontos permitida do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a modalidade de descontos permitida do programa de cashback.",
		})
		.default(true),
	modalidadeRecompensasPermitida: z
		.boolean({
			required_error: "Modalidade de recompensas permitida do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a modalidade de recompensas permitida do programa de cashback.",
		})
		.default(false),
	acumuloTipo: CashbackProgramAccumulationTypeEnum,
	acumuloValor: z.number({
		required_error: "Valor de acumulação do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o valor de acumulação do programa de cashback.",
	}),
	acumuloValorParceiro: z
		.number({
			required_error: "Valor de acumulação do parceiro não informado.",
			invalid_type_error: "Tipo não válido para o valor de acumulação do parceiro.",
		})
		.default(0),
	acumuloRegraValorMinimo: z
		.number({
			required_error: "Valor mínimo de acumulação do programa de cashback não informado.",
			invalid_type_error: "Tipo não válido para o valor mínimo de acumulação do programa de cashback.",
		})
		.default(0),
	// Configurations for accumulation source
	acumuloPermitirViaIntegracao: z
		.boolean({
			required_error: "Permissão de acumulação via integração não informada.",
			invalid_type_error: "Tipo não válido para a permissão de acumulação via integração.",
		})
		.default(false),
	acumuloPermitirViaPontoIntegracao: z
		.boolean({
			required_error: "Permissão de acumulação via ponto de integração não informada.",
			invalid_type_error: "Tipo não válido para a permissão de acumulação via ponto de integração.",
		})
		.default(false),
	expiracaoRegraValidadeValor: z
		.number({
			required_error: "Valor de validade do saldo do programa de cashback não informado.",
			invalid_type_error: "Tipo não válido para o valor de validade do saldo do programa de cashback.",
		})
		.default(0),
	resgateLimiteTipo: CashbackProgramRedemptionLimitTypeEnum.optional().nullable(),
	resgateLimiteValor: z
		.number({
			invalid_type_error: "Tipo não válido para o valor do limite de resgate do programa de cashback.",
		})
		.optional()
		.nullable(),
	dataInsercao: z
		.string({
			required_error: "Data de inserção do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção do programa de cashback.",
		})
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
	dataAtualizacao: z
		.string({
			required_error: "Data de atualização do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a data de atualização do programa de cashback.",
		})
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});

export const CashbackProgramPrizeSchema = z.object({
	organizacaoId: z.string({
		required_error: "ID da organização não informado.",
		invalid_type_error: "Tipo não válido para o ID da organização.",
	}),
	programaId: z.string({
		required_error: "ID do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o ID do programa de cashback.",
	}),
	ativo: z
		.boolean({
			required_error: "Ativo do prêmio do programa de cashback não informado.",
			invalid_type_error: "Tipo não válido para o ativo do prêmio do programa de cashback.",
		})
		.default(true),
	produtoId: z
		.string({
			required_error: "ID do produto não informado.",
			invalid_type_error: "Tipo não válido para o ID do produto.",
		})
		.optional()
		.nullable(),
	produtoVarianteId: z
		.string({
			required_error: "ID da variante do produto não informado.",
			invalid_type_error: "Tipo não válido para o ID da variante do produto.",
		})
		.optional()
		.nullable(),
	titulo: z.string({
		required_error: "Título do prêmio do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o título do prêmio do programa de cashback.",
	}),
	descricao: z
		.string({
			required_error: "Descrição do prêmio do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a descrição do prêmio do programa de cashback.",
		})
		.optional()
		.nullable(),
	imagemCapaUrl: z
		.string({
			required_error: "URL da imagem de capa do prêmio do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a URL da imagem de capa do prêmio do programa de cashback.",
		})
		.optional()
		.nullable(),
	valor: z.number({
		required_error: "Valor do prêmio do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o valor do prêmio do programa de cashback.",
	}),
	dataInsercao: z
		.string({
			required_error: "Data de inserção do prêmio do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção do prêmio do programa de cashback.",
		})
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
	dataAtualizacao: z
		.string({
			required_error: "Data de atualização do prêmio do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a data de atualização do prêmio do programa de cashback.",
		})
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});

export const CashbackProgramBalanceSchema = z.object({
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para o ID do cliente.",
	}),
	programaId: z.string({
		required_error: "ID do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o ID do programa de cashback.",
	}),
	saldoValorDisponivel: z
		.number({
			required_error: "Valor de saldo disponível do programa de cashback não informado.",
			invalid_type_error: "Tipo não válido para o valor de saldo disponível do programa de cashback.",
		})
		.default(0),
	saldoValorAcumuladoTotal: z
		.number({
			required_error: "Valor de saldo acumulado total do programa de cashback não informado.",
			invalid_type_error: "Tipo não válido para o valor de saldo acumulado total do programa de cashback.",
		})
		.default(0),
	saldoValorResgatadoTotal: z
		.number({
			required_error: "Valor de saldo resgatado total do programa de cashback não informado.",
			invalid_type_error: "Tipo não válido para o valor de saldo resgatado total do programa de cashback.",
		})
		.default(0),
	dataInsercao: z
		.string({
			required_error: "Data de inserção do saldo do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção do saldo do programa de cashback.",
		})
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
	dataAtualizacao: z
		.string({
			required_error: "Data de atualização do saldo do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a data de atualização do saldo do programa de cashback.",
		})
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});

export const CashbackProgramTransactionSchema = z.object({
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para o ID do cliente.",
	}),
	vendaId: z
		.string({
			required_error: "ID da venda não informada.",
			invalid_type_error: "Tipo não válido para o ID da venda.",
		})
		.optional()
		.nullable(),
	programaId: z.string({
		required_error: "ID do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o ID do programa de cashback.",
	}),
	status: CashbackProgramTransactionStatusEnum,
	tipo: CashbackProgramTransactionTypeEnum,
	valor: z.number({
		required_error: "Valor da transação do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o valor da transação do programa de cashback.",
	}),
	valorRestante: z.number({
		required_error: "Valor restante da transação do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o valor restante da transação do programa de cashback.",
	}),
	saldoValorAnterior: z.number({
		required_error: "Valor do saldo anterior da transação do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o valor do saldo anterior da transação do programa de cashback.",
	}),
	saldoValorPosterior: z.number({
		required_error: "Valor do saldo posterior da transação do programa de cashback não informado.",
		invalid_type_error: "Tipo não válido para o valor do saldo posterior da transação do programa de cashback.",
	}),
	expiracaoData: z
		.string({
			required_error: "Data de expiração da transação do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a data de expiração da transação do programa de cashback.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),

	// Fields to track the reward given for the redemption
	resgateRecompensaId: z
		.string({
			required_error: "ID do prêmio do programa de cashback não informado.",
			invalid_type_error: "Tipo não válido para o ID do prêmio do programa de cashback.",
		})
		.optional()
		.nullable(),
	resgateRecompensaValor: z
		.number({
			required_error: "Valor do prêmio do programa de cashback não informado.",
			invalid_type_error: "Tipo não válido para o valor do prêmio do programa de cashback.",
		})
		.optional()
		.nullable(),

	dataInsercao: z
		.string({
			required_error: "Data de inserção da transação do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção da transação do programa de cashback.",
		})
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
	dataAtualizacao: z
		.string({
			required_error: "Data de atualização da transação do programa de cashback não informada.",
			invalid_type_error: "Tipo não válido para a data de atualização da transação do programa de cashback.",
		})
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});

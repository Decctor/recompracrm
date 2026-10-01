import z from "zod";
import {
	PlatformPartnerCommissionStatusEnum,
	PlatformPartnerPayoutStatusEnum,
	PlatformPartnerPersonTypeEnum,
	PlatformPartnerPixKeyTypeEnum,
	PlatformPartnerReferralStatusEnum,
	PlatformPartnerStatusEnum,
} from "./enums";

export const PlatformPartnerFilesSchema = z
	.object({
		cpf: z.string({ invalid_type_error: "Tipo nao valido para o arquivo de CPF." }).optional(),
		cnpj: z.string({ invalid_type_error: "Tipo nao valido para o arquivo de CNPJ." }).optional(),
	})
	.default({});
export type TPlatformPartnerFiles = z.infer<typeof PlatformPartnerFilesSchema>;

export const PlatformPartnerSchema = z.object({
	usuarioId: z.string({ invalid_type_error: "Tipo nao valido para o ID do usuario do parceiro." }).optional().nullable(),
	status: PlatformPartnerStatusEnum.default("PENDENTE_APROVACAO"),
	codigo: z.string({
		required_error: "Codigo do parceiro nao informado.",
		invalid_type_error: "Tipo nao valido para o codigo do parceiro.",
	}),
	nome: z.string({
		required_error: "Nome do parceiro nao informado.",
		invalid_type_error: "Tipo nao valido para o nome do parceiro.",
	}),
	email: z
		.string({
			required_error: "Email do parceiro nao informado.",
			invalid_type_error: "Tipo nao valido para o email do parceiro.",
		})
		.email("Email do parceiro invalido."),
	telefone: z.string({
		required_error: "Telefone do parceiro nao informado.",
		invalid_type_error: "Tipo nao valido para o telefone do parceiro.",
	}),
	tipoPessoa: PlatformPartnerPersonTypeEnum.optional().nullable(),
	cpfCnpj: z.string({
		required_error: "CPF ou CNPJ do parceiro nao informado.",
		invalid_type_error: "Tipo nao valido para o CPF ou CNPJ do parceiro.",
	}),
	chavePix: z.string({
		required_error: "Chave PIX do parceiro nao informada.",
		invalid_type_error: "Tipo nao valido para a chave PIX do parceiro.",
	}),
	chavePixTipo: PlatformPartnerPixKeyTypeEnum.optional().nullable(),
	dataConfirmacaoTitularPix: z
		.string({ invalid_type_error: "Tipo nao valido para a data de confirmacao do titular da chave PIX." })
		.datetime({ message: "Tipo nao valido para a data de confirmacao do titular da chave PIX." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	arquivos: PlatformPartnerFilesSchema,
	aceiteTermos: z.boolean({
		required_error: "Aceite dos termos nao informado.",
		invalid_type_error: "Tipo nao valido para o aceite dos termos.",
	}),
	dataAceiteTermos: z
		.string({ invalid_type_error: "Tipo nao valido para a data de aceite dos termos." })
		.datetime({ message: "Tipo nao valido para a data de aceite dos termos." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	mensagemDivulgacao: z.string({ invalid_type_error: "Tipo nao valido para a mensagem de divulgacao." }).optional().nullable(),
	dataCartaoVisualizado: z
		.string({ invalid_type_error: "Tipo nao valido para a data de visualizacao do cartao." })
		.datetime({ message: "Tipo nao valido para a data de visualizacao do cartao." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	observacoesInternas: z.string({ invalid_type_error: "Tipo nao valido para observacoes internas." }).optional().nullable(),
	dataAprovacao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de aprovacao." })
		.datetime({ message: "Tipo nao valido para a data de aprovacao." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	aprovadoPorId: z.string({ invalid_type_error: "Tipo nao valido para o ID do aprovador." }).optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de insercao do parceiro." })
		.datetime({ message: "Tipo nao valido para a data de insercao do parceiro." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
	dataAtualizacao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de atualizacao do parceiro." })
		.datetime({ message: "Tipo nao valido para a data de atualizacao do parceiro." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
});
export type TPlatformPartner = z.infer<typeof PlatformPartnerSchema>;

export const PlatformPartnerReferralSchema = z.object({
	partnerId: z.string({
		required_error: "ID do parceiro nao informado.",
		invalid_type_error: "Tipo nao valido para o ID do parceiro.",
	}),
	organizacaoId: z.string({
		required_error: "ID da organizacao nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da organizacao.",
	}),
	usuarioId: z.string({ invalid_type_error: "Tipo nao valido para o ID do usuario indicado." }).optional().nullable(),
	codigoUsado: z.string({
		required_error: "Codigo usado nao informado.",
		invalid_type_error: "Tipo nao valido para o codigo usado.",
	}),
	origem: z.string({
		required_error: "Origem da indicacao nao informada.",
		invalid_type_error: "Tipo nao valido para a origem da indicacao.",
	}),
	status: PlatformPartnerReferralStatusEnum.default("ORGANIZACAO_CRIADA"),
	dataCaptura: z
		.string({ invalid_type_error: "Tipo nao valido para a data de captura." })
		.datetime({ message: "Tipo nao valido para a data de captura." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	dataOnboarding: z
		.string({ invalid_type_error: "Tipo nao valido para a data de onboarding." })
		.datetime({ message: "Tipo nao valido para a data de onboarding." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
	dataPrimeiroPagamento: z
		.string({ invalid_type_error: "Tipo nao valido para a data do primeiro pagamento." })
		.datetime({ message: "Tipo nao valido para a data do primeiro pagamento." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	metadata: z.record(z.unknown()).default({}),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de insercao da indicacao." })
		.datetime({ message: "Tipo nao valido para a data de insercao da indicacao." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TPlatformPartnerReferral = z.infer<typeof PlatformPartnerReferralSchema>;

export const PlatformPartnerCommissionSchema = z.object({
	partnerId: z.string({ required_error: "ID do parceiro nao informado.", invalid_type_error: "Tipo nao valido para o ID do parceiro." }),
	referralId: z.string({ required_error: "ID da indicacao nao informado.", invalid_type_error: "Tipo nao valido para o ID da indicacao." }),
	organizacaoId: z.string({ required_error: "ID da organizacao nao informado.", invalid_type_error: "Tipo nao valido para o ID da organizacao." }),
	payoutId: z.string({ invalid_type_error: "Tipo nao valido para o ID do payout." }).optional().nullable(),
	stripeInvoiceId: z.string({ invalid_type_error: "Tipo nao valido para o ID da invoice Stripe." }).optional().nullable(),
	stripeSubscriptionId: z.string({ invalid_type_error: "Tipo nao valido para o ID da assinatura Stripe." }).optional().nullable(),
	stripeCustomerId: z.string({ invalid_type_error: "Tipo nao valido para o ID do customer Stripe." }).optional().nullable(),
	numeroInvoiceAssinatura: z.number({
		required_error: "Numero da invoice na assinatura nao informado.",
		invalid_type_error: "Tipo nao valido para o numero da invoice na assinatura.",
	}),
	valorInvoiceBrutoCentavos: z.number({
		required_error: "Valor bruto da invoice nao informado.",
		invalid_type_error: "Tipo nao valido para o valor bruto da invoice.",
	}),
	valorConsultoriaCentavos: z.number({ invalid_type_error: "Tipo nao valido para o valor de consultoria." }).default(0),
	valorBaseComissionavelCentavos: z.number({
		required_error: "Base comissionavel nao informada.",
		invalid_type_error: "Tipo nao valido para a base comissionavel.",
	}),
	percentualComissaoBps: z.number({
		required_error: "Percentual de comissao nao informado.",
		invalid_type_error: "Tipo nao valido para o percentual de comissao.",
	}),
	valorComissaoCentavos: z.number({
		required_error: "Valor da comissao nao informado.",
		invalid_type_error: "Tipo nao valido para o valor da comissao.",
	}),
	regraVersao: z.string({
		required_error: "Versao da regra nao informada.",
		invalid_type_error: "Tipo nao valido para a versao da regra.",
	}),
	regraSnapshot: z.record(z.unknown()).default({}),
	invoiceSnapshot: z.record(z.unknown()).default({}),
	ajusteOrigemCommissionId: z.string({ invalid_type_error: "Tipo nao valido para o ID da comissao original." }).optional().nullable(),
	ajusteMotivo: z.string({ invalid_type_error: "Tipo nao valido para o motivo do ajuste." }).optional().nullable(),
	status: PlatformPartnerCommissionStatusEnum.default("PENDENTE"),
	dataElegibilidade: z
		.string({
			required_error: "Data de elegibilidade nao informada.",
			invalid_type_error: "Tipo nao valido para a data de elegibilidade.",
		})
		.datetime({ message: "Tipo nao valido para a data de elegibilidade." })
		.transform((val) => new Date(val)),
	dataAprovacao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de aprovacao." })
		.datetime({ message: "Tipo nao valido para a data de aprovacao." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	aprovadoPorId: z.string({ invalid_type_error: "Tipo nao valido para o ID do aprovador." }).optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de insercao da comissao." })
		.datetime({ message: "Tipo nao valido para a data de insercao da comissao." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
});
export type TPlatformPartnerCommission = z.infer<typeof PlatformPartnerCommissionSchema>;

export const PlatformPartnerPayoutSchema = z.object({
	partnerId: z.string({ required_error: "ID do parceiro nao informado.", invalid_type_error: "Tipo nao valido para o ID do parceiro." }),
	status: PlatformPartnerPayoutStatusEnum.default("RASCUNHO"),
	competenciaInicio: z
		.string({
			required_error: "Inicio da competencia nao informado.",
			invalid_type_error: "Tipo nao valido para o inicio da competencia.",
		})
		.datetime({ message: "Tipo nao valido para o inicio da competencia." })
		.transform((val) => new Date(val)),
	competenciaFim: z
		.string({ required_error: "Fim da competencia nao informado.", invalid_type_error: "Tipo nao valido para o fim da competencia." })
		.datetime({ message: "Tipo nao valido para o fim da competencia." })
		.transform((val) => new Date(val)),
	valorTotalCentavos: z.number({ invalid_type_error: "Tipo nao valido para o valor total do payout." }).default(0),
	metodo: z.string({ invalid_type_error: "Tipo nao valido para o metodo do payout." }).optional().nullable(),
	chavePixSnapshot: z.string({ invalid_type_error: "Tipo nao valido para a chave PIX do payout." }).optional().nullable(),
	comprovanteUrl: z.string({ invalid_type_error: "Tipo nao valido para o comprovante do payout." }).optional().nullable(),
	dataPrevista: z
		.string({ invalid_type_error: "Tipo nao valido para a data prevista." })
		.datetime({ message: "Tipo nao valido para a data prevista." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	dataPagamento: z
		.string({ invalid_type_error: "Tipo nao valido para a data de pagamento." })
		.datetime({ message: "Tipo nao valido para a data de pagamento." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	observacoes: z.string({ invalid_type_error: "Tipo nao valido para as observacoes do payout." }).optional().nullable(),
	autorId: z.string({ invalid_type_error: "Tipo nao valido para o ID do autor." }).optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de insercao do payout." })
		.datetime({ message: "Tipo nao valido para a data de insercao do payout." })
		.default(new Date().toISOString())
		.transform((val) => new Date(val)),
	dataAtualizacao: z
		.string({ invalid_type_error: "Tipo nao valido para a data de atualizacao do payout." })
		.datetime({ message: "Tipo nao valido para a data de atualizacao do payout." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
});
export type TPlatformPartnerPayout = z.infer<typeof PlatformPartnerPayoutSchema>;

// Dados cadastrais que o admin também edita. O onboarding (abaixo) é a versão estrita: exige tipo de
// pessoa, tipo de chave, confirmação do titular e o documento — o admin cadastra parceiros antigos
// que não passaram por esse fluxo.
export const PlatformPartnerRegistrationSchema = z.object({
	nome: PlatformPartnerSchema.shape.nome,
	email: PlatformPartnerSchema.shape.email,
	telefone: PlatformPartnerSchema.shape.telefone,
	tipoPessoa: PlatformPartnerSchema.shape.tipoPessoa,
	cpfCnpj: PlatformPartnerSchema.shape.cpfCnpj,
	chavePix: PlatformPartnerSchema.shape.chavePix,
	chavePixTipo: PlatformPartnerSchema.shape.chavePixTipo,
	arquivos: PlatformPartnerFilesSchema,
	aceiteTermos: z
		.boolean({
			required_error: "Aceite dos termos nao informado.",
			invalid_type_error: "Tipo nao valido para o aceite dos termos.",
		})
		.refine((value) => value === true, "Aceite os termos para continuar."),
});
export type TPlatformPartnerRegistration = z.infer<typeof PlatformPartnerRegistrationSchema>;

export const PlatformPartnerOnboardingSchema = z
	.object({
		nome: PlatformPartnerSchema.shape.nome.trim().min(3, "Informe seu nome completo."),
		email: PlatformPartnerSchema.shape.email,
		telefone: PlatformPartnerSchema.shape.telefone.min(14, "Informe um telefone com DDD."),
		tipoPessoa: PlatformPartnerPersonTypeEnum,
		cpfCnpj: PlatformPartnerSchema.shape.cpfCnpj,
		chavePix: PlatformPartnerSchema.shape.chavePix.trim().min(1, "Chave PIX do parceiro nao informada."),
		chavePixTipo: PlatformPartnerPixKeyTypeEnum,
		// Autodeclaração de titularidade: não há consulta ao DICT, o parceiro confirma que a chave é dele.
		titularPixConfirmado: z
			.boolean({
				required_error: "Confirmacao do titular da chave PIX nao informada.",
				invalid_type_error: "Tipo nao valido para a confirmacao do titular da chave PIX.",
			})
			.refine((value) => value === true, "Confirme que a chave PIX está no seu nome."),
		arquivos: PlatformPartnerFilesSchema,
		aceiteTermos: z
			.boolean({
				required_error: "Aceite dos termos nao informado.",
				invalid_type_error: "Tipo nao valido para o aceite dos termos.",
			})
			.refine((value) => value === true, "Aceite os termos para continuar."),
	})
	.superRefine((partner, ctx) => {
		const documentDigits = partner.cpfCnpj.replace(/\D/g, "");
		const pessoaFisica = partner.tipoPessoa === "PESSOA_FISICA";
		if (documentDigits.length !== (pessoaFisica ? 11 : 14)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cpfCnpj"], message: pessoaFisica ? "Informe um CPF válido." : "Informe um CNPJ válido." });
		}
		if (!(pessoaFisica ? partner.arquivos.cpf : partner.arquivos.cnpj)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["arquivos"],
				message: pessoaFisica ? "Envie um documento com o seu CPF." : "Envie o cartão CNPJ ou o contrato social.",
			});
		}
	});
export type TPlatformPartnerOnboarding = z.infer<typeof PlatformPartnerOnboardingSchema>;

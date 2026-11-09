import z from "zod";
import { DealIntervaloEnum, DealStatusEnum, StripeAccountEnum } from "./enums";

// Deal personalizado (venda B2B multi-licença): uma assinatura Stripe única cobre
// quantidadeLicencas organizações. Espelha a tabela ampmais_deals.
export const DealSchema = z.object({
	nome: z
		.string({ required_error: "Nome do deal não informado.", invalid_type_error: "Tipo não válido para o nome do deal." })
		.min(3, "O nome do deal deve ter ao menos 3 caracteres."),
	descricao: z.string({ invalid_type_error: "Tipo não válido para a descrição do deal." }).optional().nullable(),
	usuarioObtentorId: z.string({ invalid_type_error: "Tipo não válido para o usuário obtentor." }).optional().nullable(),
	nomeObtentor: z
		.string({ required_error: "Nome do obtentor não informado.", invalid_type_error: "Tipo não válido para o nome do obtentor." })
		.min(2, "O nome do obtentor deve ter ao menos 2 caracteres."),
	emailObtentor: z
		.string({ required_error: "Email do obtentor não informado.", invalid_type_error: "Tipo não válido para o email do obtentor." })
		.email("Email do obtentor inválido."),
	telefoneObtentor: z.string({ invalid_type_error: "Tipo não válido para o telefone do obtentor." }).optional().nullable(),
	planoBase: z.enum(["ESSENCIAL", "CRESCIMENTO", "ESCALA"], {
		required_error: "Plano base do deal não informado.",
		invalid_type_error: "Tipo não válido para o plano base do deal.",
	}),
	quantidadeLicencas: z
		.number({
			required_error: "Quantidade de licenças não informada.",
			invalid_type_error: "Tipo não válido para a quantidade de licenças.",
		})
		.int("A quantidade de licenças deve ser um número inteiro.")
		.min(1, "O deal deve ter ao menos 1 licença."),
	valorUnitarioCentavos: z
		.number({
			required_error: "Valor unitário não informado.",
			invalid_type_error: "Tipo não válido para o valor unitário.",
		})
		.int("O valor unitário deve ser em centavos (inteiro).")
		.min(100, "O valor unitário mínimo é R$ 1,00."),
	intervalo: DealIntervaloEnum,
	status: DealStatusEnum,
	stripeConta: StripeAccountEnum.optional().nullable(),
	stripePriceId: z.string({ invalid_type_error: "Tipo não válido para o price do Stripe." }).optional().nullable(),
	stripeCustomerId: z.string({ invalid_type_error: "Tipo não válido para o customer do Stripe." }).optional().nullable(),
	stripeSubscriptionId: z.string({ invalid_type_error: "Tipo não válido para a subscription do Stripe." }).optional().nullable(),
	stripeCheckoutSessionId: z.string({ invalid_type_error: "Tipo não válido para a sessão de checkout do Stripe." }).optional().nullable(),
	stripeSubscriptionStatus: z.string({ invalid_type_error: "Tipo não válido para o status da assinatura no Stripe." }).optional().nullable(),
	stripeSubscriptionStatusUltimaAlteracao: z
		.string({ invalid_type_error: "Tipo não válido para a data de alteração do status da assinatura." })
		.datetime({ message: "Data de alteração do status da assinatura inválida." })
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	autorId: z.string({
		required_error: "Autor do deal não informado.",
		invalid_type_error: "Tipo não válido para o autor do deal.",
	}),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime({ message: "Data de inserção inválida." })
		.transform((val) => new Date(val))
		.optional(),
});
export type TDeal = z.infer<typeof DealSchema>;

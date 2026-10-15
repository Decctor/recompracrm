import { z } from "zod";
import { PreparationStationRuleCriterionEnum, PreparationStationTicketScopeEnum } from "./enums";

// ============================================================================
// ESTAÇÕES DE PREPARO (roteamento do TICKET_PREPARO por impressora)
// Ver docs/dev-planning/preparation-stations-plan.md.
// ============================================================================

export const PreparationStationSchema = z.object({
	organizacaoId: z.string({
		required_error: "Organização da estação de preparo não informada.",
		invalid_type_error: "Tipo não válido para a organização da estação de preparo.",
	}),
	nome: z
		.string({
			required_error: "Nome da estação de preparo não informado.",
			invalid_type_error: "Tipo não válido para o nome da estação de preparo.",
		})
		.trim()
		.min(1, "Nome da estação de preparo não informado."),
	ordem: z
		.number({
			required_error: "Ordem da estação de preparo não informada.",
			invalid_type_error: "Tipo não válido para a ordem da estação de preparo.",
		})
		.int("A ordem da estação de preparo deve ser um número inteiro.")
		.default(0),
	ativa: z
		.boolean({
			required_error: "Ativa da estação de preparo não informado.",
			invalid_type_error: "Tipo não válido para ativa da estação de preparo.",
		})
		.default(true),
	padrao: z
		.boolean({
			required_error: "Padrão da estação de preparo não informado.",
			invalid_type_error: "Tipo não válido para padrão da estação de preparo.",
		})
		.default(false),
	escopoTicket: PreparationStationTicketScopeEnum.default("PEDIDO"),
	dataInsercao: z
		.string({
			required_error: "Data de inserção da estação de preparo não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção da estação de preparo.",
		})
		.datetime({ message: "Formato inválido para a data de inserção da estação de preparo." })
		.transform((value) => new Date(value)),
	dataAtualizacao: z
		.string({
			required_error: "Data de atualização da estação de preparo não informada.",
			invalid_type_error: "Tipo não válido para a data de atualização da estação de preparo.",
		})
		.datetime({ message: "Formato inválido para a data de atualização da estação de preparo." })
		.transform((value) => new Date(value))
		.optional()
		.nullable(),
});
export type TPreparationStation = z.infer<typeof PreparationStationSchema>;

// O sujeito da regra é sempre o item: só atributos do produto viram critério.
// Canal/modalidade/horário pertencem à estação, não à regra.
export const PreparationStationRuleValueSchema = z.discriminatedUnion(
	"criterio",
	[
		z.object({
			criterio: z.literal("GRUPO", {
				required_error: "Critério da regra não informado.",
				invalid_type_error: "Tipo não válido para o critério da regra.",
			}),
			grupo: z
				.string({
					required_error: "Grupo da regra não informado.",
					invalid_type_error: "Tipo não válido para o grupo da regra.",
				})
				.trim()
				.min(1, "Grupo da regra não informado."),
		}),
		z.object({
			criterio: z.literal("PRODUTO", {
				required_error: "Critério da regra não informado.",
				invalid_type_error: "Tipo não válido para o critério da regra.",
			}),
			produtoId: z
				.string({
					required_error: "Produto da regra não informado.",
					invalid_type_error: "Tipo não válido para o produto da regra.",
				})
				.min(1, "Produto da regra não informado."),
		}),
	],
	{
		errorMap: (issue, ctx) =>
			issue.code === "invalid_union_discriminator" ? { message: "Critério da regra inválido. Use GRUPO ou PRODUTO." } : { message: ctx.defaultError },
	},
);
export type TPreparationStationRuleValue = z.infer<typeof PreparationStationRuleValueSchema>;

export const PreparationStationRuleSchema = z.object({
	organizacaoId: z.string({
		required_error: "Organização da regra da estação não informada.",
		invalid_type_error: "Tipo não válido para a organização da regra da estação.",
	}),
	estacaoId: z.string({
		required_error: "Estação da regra não informada.",
		invalid_type_error: "Tipo não válido para a estação da regra.",
	}),
	// Espelha valor.criterio (coluna fora do jsonb para filtrar e indexar). A coerência entre os dois é
	// validada no input das rotas de escrita: um .refine aqui viraria ZodEffects e travaria .omit/.pick/.extend.
	criterio: PreparationStationRuleCriterionEnum,
	valor: PreparationStationRuleValueSchema,
	dataInsercao: z
		.string({
			required_error: "Data de inserção da regra da estação não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção da regra da estação.",
		})
		.datetime({ message: "Formato inválido para a data de inserção da regra da estação." })
		.transform((value) => new Date(value)),
});
export type TPreparationStationRule = z.infer<typeof PreparationStationRuleSchema>;

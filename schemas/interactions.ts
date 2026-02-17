import z from "zod";
import { InteractionTypeEnum, InteractionsCronJobTimeBlocksEnum } from "./enums";

export const InteractionsStatusEnum = z.enum(["PENDENTE", "ENVIADO", "ENTREGUE", "FALHOU"]);
export type TInteractionsStatusEnum = z.infer<typeof InteractionsStatusEnum>;
export const InteractionSchema = z.object({
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para o ID do cliente.",
	}),
	campanhaId: z
		.string({
			required_error: "ID da campanha não informado.",
			invalid_type_error: "Tipo não válido para o ID da campanha.",
		})
		.optional()
		.nullable(),
	titulo: z.string({
		required_error: "Título da interação não informado.",
		invalid_type_error: "Tipo não válido para o título da interação.",
	}),
	descricao: z
		.string({
			required_error: "Descrição da interação não informada.",
			invalid_type_error: "Tipo não válido para a descrição da interação.",
		})
		.optional()
		.nullable(),
	tipo: InteractionTypeEnum,
	autorId: z
		.string({
			required_error: "ID do autor da interação não informado.",
			invalid_type_error: "Tipo não válido para o ID do autor da interação.",
		})
		.optional()
		.nullable(),

	// Scheduling specific
	agendamentoDataReferencia: z
		.string({
			required_error: "Data de referência da agendamento não informada.",
			invalid_type_error: "Tipo não válido para a data de referência da agendamento.",
		})
		.optional()
		.nullable(),
	agendamentoBlocoReferencia: InteractionsCronJobTimeBlocksEnum,
	dataInsercao: z
		.string({
			required_error: "Data de inserção da interação não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção da interação.",
		})
		.datetime({ message: "Tipo não válido para a data de inserção da interação." })
		.transform((val) => new Date(val))
		.default(new Date().toISOString()),
	dataExecucao: z
		.string({
			required_error: "Data de execução da interação não informada.",
			invalid_type_error: "Tipo não válido para a data de execução da interação.",
		})
		.datetime({ message: "Tipo não válido para a data de execução da interação." })
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	metadados: z.object({
		cashbackAcumuladoValor: z
			.number({
				required_error: "Valor de cashback acumulado não informado.",
				invalid_type_error: "Tipo não válido para o valor de cashback acumulado.",
			})
			.optional()
			.nullable(),
		whatsappMensagemId: z
			.string({
				required_error: "ID da mensagem do WhatsApp não informado.",
				invalid_type_error: "Tipo não válido para o ID da mensagem do WhatsApp.",
			})
			.optional()
			.nullable(),
		whatsappTemplateId: z
			.string({
				required_error: "ID do template do WhatsApp não informado.",
				invalid_type_error: "Tipo não válido para o ID do template do WhatsApp.",
			})
			.optional()
			.nullable(),
	}),

	// Delivery status tracking
	statusEnvio: InteractionsStatusEnum.optional().nullable(),
	dataEnvio: z
		.string({
			required_error: "Data de envio da interação não informada.",
			invalid_type_error: "Tipo não válido para a data de envio da interação.",
		})
		.datetime({ message: "Tipo não válido para a data de envio da interação." })
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
});

export const InteractionStateSchema = z.object({
	interaction: InteractionSchema.omit({ dataInsercao: true, autorId: true }),
});
export type TInteractionState = z.infer<typeof InteractionStateSchema>;

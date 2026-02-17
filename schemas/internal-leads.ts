import { InternalLeadActivityStatusEnum, InternalLeadActivityTypeEnum, InternalLeadOriginEnum, InternalLeadStatusCRMEnum } from "./enums";
import z from "zod";

// ==================== Recurrence / Reminder ====================

export const ActivityRecurrenceSchema = z.object({
	tipo: z.enum(["DIARIO", "SEMANAL", "MENSAL"], {
		required_error: "Tipo de recorrência não informado.",
	}),
	intervalo: z.number({
		required_error: "Intervalo de recorrência não informado.",
		invalid_type_error: "Tipo não válido para o intervalo de recorrência.",
	}),
	dataFim: z.string({ invalid_type_error: "Tipo não válido para a data fim da recorrência." }).nullable().default(null),
});
export type TActivityRecurrence = z.infer<typeof ActivityRecurrenceSchema>;

export const ActivityReminderSchema = z.object({
	minutosAntes: z.number({
		required_error: "Minutos antes do lembrete não informado.",
		invalid_type_error: "Tipo não válido para minutos antes do lembrete.",
	}),
	notificado: z.boolean().default(false),
});
export type TActivityReminder = z.infer<typeof ActivityReminderSchema>;

// ==================== Internal Lead ====================

export const InternalLeadSchema = z.object({
	statusCRM: InternalLeadStatusCRMEnum.default("NOVO"),
	posicaoKanban: z.number({ invalid_type_error: "Tipo não válido para a posição no kanban." }).optional().nullable(),
	titulo: z.string({ invalid_type_error: "Tipo não válido para o título." }).optional().nullable(),
	descricao: z.string({ invalid_type_error: "Tipo não válido para a descrição." }).optional().nullable(),
	valor: z.number({ invalid_type_error: "Tipo não válido para o valor." }).optional().nullable(),
	probabilidade: z.number({ invalid_type_error: "Tipo não válido para a probabilidade." }).min(0).max(100).optional().nullable(),
	origemLead: InternalLeadOriginEnum.optional().nullable(),
	motivoPerda: z.string({ invalid_type_error: "Tipo não válido para o motivo de perda." }).optional().nullable(),

	// Organization
	organizacaoId: z.string({ invalid_type_error: "Tipo não válido para o ID da organização." }).optional().nullable(),
	organizacaoNome: z.string({
		required_error: "Nome da organização não informado.",
		invalid_type_error: "Tipo não válido para o nome da organização.",
	}),
	organizacaoCnpj: z.string({
		required_error: "CNPJ da organização não informado.",
		invalid_type_error: "Tipo não válido para o CNPJ da organização.",
	}),
	organizacaoLogoUrl: z.string({ invalid_type_error: "Tipo não válido para a logo da organização." }).optional().nullable(),
	organizacaoTelefone: z.string({ invalid_type_error: "Tipo não válido para o telefone da organização." }).optional().nullable(),
	organizacaoEmail: z.string({ invalid_type_error: "Tipo não válido para o email da organização." }).optional().nullable(),
	organizacaoSite: z.string({ invalid_type_error: "Tipo não válido para o site da organização." }).optional().nullable(),

	// Contact
	contatoNome: z.string({
		required_error: "Nome do contato não informado.",
		invalid_type_error: "Tipo não válido para o nome do contato.",
	}),
	contatoEmail: z.string({
		required_error: "Email do contato não informado.",
		invalid_type_error: "Tipo não válido para o email do contato.",
	}),
	contatoTelefone: z.string({ invalid_type_error: "Tipo não válido para o telefone do contato." }).optional().nullable(),
	contatoCargo: z.string({ invalid_type_error: "Tipo não válido para o cargo do contato." }).optional().nullable(),
	contatoUsuarioId: z.string({ invalid_type_error: "Tipo não válido para o ID do usuário do contato." }).optional().nullable(),

	// Assignment
	responsavelId: z.string({ invalid_type_error: "Tipo não válido para o ID do responsável." }).optional().nullable(),
});
export type TInternalLead = z.infer<typeof InternalLeadSchema>;

// ==================== Activity ====================

export const InternalLeadActivitySchema = z.object({
	leadId: z.string({
		required_error: "ID do lead não informado.",
		invalid_type_error: "Tipo não válido para o ID do lead.",
	}),
	tipo: InternalLeadActivityTypeEnum,
	titulo: z.string({
		required_error: "Título da atividade não informado.",
		invalid_type_error: "Tipo não válido para o título da atividade.",
	}),
	descricao: z.string({ invalid_type_error: "Tipo não válido para a descrição da atividade." }).optional().nullable(),
	status: InternalLeadActivityStatusEnum.default("PENDENTE"),
	dataAgendada: z
		.string({
			required_error: "Data agendada não informada.",
			invalid_type_error: "Tipo não válido para a data agendada.",
		})
		.transform((val) => new Date(val)),
	duracaoMinutos: z.number({ invalid_type_error: "Tipo não válido para a duração em minutos." }).optional().nullable(),
	recorrencia: ActivityRecurrenceSchema.optional().nullable(),
	templateId: z.string({ invalid_type_error: "Tipo não válido para o ID do template." }).optional().nullable(),
	lembrete: ActivityReminderSchema.optional().nullable(),
});
export type TInternalLeadActivity = z.infer<typeof InternalLeadActivitySchema>;

// ==================== Note ====================

export const InternalLeadNoteSchema = z.object({
	leadId: z.string({
		required_error: "ID do lead não informado.",
		invalid_type_error: "Tipo não válido para o ID do lead.",
	}),
	conteudo: z.string({
		required_error: "Conteúdo da nota não informado.",
		invalid_type_error: "Tipo não válido para o conteúdo da nota.",
	}),
});
export type TInternalLeadNote = z.infer<typeof InternalLeadNoteSchema>;

// ==================== Activity Template ====================

export const InternalLeadActivityTemplateSchema = z.object({
	nome: z.string({
		required_error: "Nome do template não informado.",
		invalid_type_error: "Tipo não válido para o nome do template.",
	}),
	tipo: InternalLeadActivityTypeEnum,
	descricaoPadrao: z.string({ invalid_type_error: "Tipo não válido para a descrição padrão." }).optional().nullable(),
	duracaoPadraoMinutos: z.number({ invalid_type_error: "Tipo não válido para a duração padrão em minutos." }).optional().nullable(),
});
export type TInternalLeadActivityTemplate = z.infer<typeof InternalLeadActivityTemplateSchema>;

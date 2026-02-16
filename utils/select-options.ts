import type {
	TAttributionModelEnum,
	TCampaignTriggerTypeEnum,
	TCashbackProgramAccumulationTypeEnum,
	TCashbackProgramRedemptionLimitTypeEnum,
	TInteractionsCronJobTimeBlocksEnum,
	TRecurrenceFrequencyEnum,
	TTimeDurationUnitsEnum,
} from "@/schemas/enums";
import type { TInternalLeadStatusCRMEnum } from "@/schemas/internal-leads";

export const InternalLeadStatusCRMOptions: { id: number; label: string; value: TInternalLeadStatusCRMEnum }[] = [
	{ id: 1, label: "NOVO", value: "NOVO" },
	{ id: 2, label: "CONTATO INICIAL", value: "CONTATO_INICIAL" },
	{ id: 3, label: "QUALIFICADO", value: "QUALIFICADO" },
	{ id: 4, label: "PROPOSTA", value: "PROPOSTA" },
	{ id: 5, label: "NEGOCIACAO", value: "NEGOCIACAO" },
	{ id: 6, label: "GANHO", value: "GANHO" },
];

export const OrganizationNicheOptions: { id: number; label: string; value: string }[] = [
	{ id: 1, label: "ALIMENTAÇÃO", value: "Alimentação" },
	{ id: 2, label: "CONSTRUÇÃO", value: "Construção" },
	{ id: 3, label: "MODA", value: "Moda" },
	{ id: 4, label: "PERFUMARIA", value: "Perfumaria" },
];

export const CustomersAcquisitionChannels = [
	{ id: 1, label: "ANUNCIO GOOGLE", value: "ANUNCIO GOOGLE" },
	{ id: 2, label: "ANUNCIO FB", value: "ANUNCIO FB" },
	{ id: 3, label: "ANUNCIO INSTA", value: "ANUNCIO INSTA" },
	{ id: 4, label: "BIO INSTA", value: "BIO INSTA" },
	{ id: 5, label: "CRM INTERNO", value: "CRM INTERNO" },
	{ id: 6, label: "INDICAÇÃO", value: "INDICAÇÃO" },
	{ id: 7, label: "COLD CALL", value: "COLD CALL" },
	{ id: 8, label: "WhatsApp Recp.", value: "WhatsApp Recp." },
	{ id: 9, label: "Landing Page", value: "Landing Page" },
];

export const CampaignTriggerTypeOptions: { id: number; label: string; value: TCampaignTriggerTypeEnum }[] = [
	{ id: 1, label: "NOVA COMPRA", value: "NOVA-COMPRA" },
	{ id: 2, label: "PRIMEIRA COMPRA", value: "PRIMEIRA-COMPRA" },
	{ id: 3, label: "PERMANÊNCIA NA SEGMENTAÇÃO", value: "PERMANÊNCIA-SEGMENTAÇÃO" },
	{ id: 4, label: "ENTRADA NA SEGMENTAÇÃO", value: "ENTRADA-SEGMENTAÇÃO" },
	{ id: 5, label: "CASHBACK ACUMULADO", value: "CASHBACK-ACUMULADO" },
	{ id: 6, label: "CASHBACK EXPIRANDO", value: "CASHBACK-EXPIRANDO" },
	{ id: 7, label: "ANIVERSÁRIO DO CLIENTE", value: "ANIVERSARIO_CLIENTE" },
	{ id: 8, label: "QUANTIDADE TOTAL DE COMPRAS", value: "QUANTIDADE-TOTAL-COMPRAS" },
	{ id: 9, label: "VALOR TOTAL DE COMPRAS", value: "VALOR-TOTAL-COMPRAS" },
	{ id: 10, label: "RECORRENTE (AGENDAMENTO)", value: "RECORRENTE" },
];

export const RecurrenceFrequencyOptions: { id: number; label: string; value: TRecurrenceFrequencyEnum }[] = [
	{ id: 1, label: "DIÁRIO", value: "DIARIO" },
	{ id: 2, label: "SEMANAL", value: "SEMANAL" },
	{ id: 3, label: "MENSAL", value: "MENSAL" },
];

export const DaysOfWeekOptions: { id: number; label: string; value: number }[] = [
	{ id: 0, label: "DOMINGO", value: 0 },
	{ id: 1, label: "SEGUNDA", value: 1 },
	{ id: 2, label: "TERÇA", value: 2 },
	{ id: 3, label: "QUARTA", value: 3 },
	{ id: 4, label: "QUINTA", value: 4 },
	{ id: 5, label: "SEXTA", value: 5 },
	{ id: 6, label: "SÁBADO", value: 6 },
];

export const TimeDurationUnitsOptions: { id: number; label: string; value: TTimeDurationUnitsEnum }[] = [
	{ id: 1, label: "DIAS", value: "DIAS" },
	{ id: 2, label: "SEMANAS", value: "SEMANAS" },
	{ id: 3, label: "MESES", value: "MESES" },
	{ id: 4, label: "ANOS", value: "ANOS" },
];

export const InteractionsCronJobTimeBlocksOptions: { id: number; label: string; value: TInteractionsCronJobTimeBlocksEnum }[] = [
	{ id: 1, label: "00:00", value: "00:00" },
	{ id: 2, label: "03:00", value: "03:00" },
	{ id: 3, label: "06:00", value: "06:00" },
	{ id: 4, label: "09:00", value: "09:00" },
	{ id: 5, label: "12:00", value: "12:00" },
	{ id: 6, label: "15:00", value: "15:00" },
	{ id: 7, label: "18:00", value: "18:00" },
	{ id: 8, label: "21:00", value: "21:00" },
];

export const CashbackProgramAccumulationTypeOptions: { id: number; label: string; value: TCashbackProgramAccumulationTypeEnum }[] = [
	{ id: 1, label: "FIXO", value: "FIXO" },
	{ id: 2, label: "PERCENTUAL", value: "PERCENTUAL" },
];

export const CashbackProgramRedemptionLimitTypeOptions: { id: number; label: string; value: TCashbackProgramRedemptionLimitTypeEnum }[] = [
	{ id: 1, label: "FIXO", value: "FIXO" },
	{ id: 2, label: "PERCENTUAL", value: "PERCENTUAL" },
];

export const UnitsOfMeasurementOptions: { id: number; label: string; value: string }[] = [
	{ id: 1, label: "UN", value: "UN" }, // Unidade
	{ id: 2, label: "KG", value: "KG" }, // Quilograma
	{ id: 3, label: "G", value: "G" }, // Grama
	{ id: 4, label: "MG", value: "MG" }, // Miligrama
	{ id: 5, label: "L", value: "L" }, // Litro
	{ id: 6, label: "ML", value: "ML" }, // Mililitro
	{ id: 7, label: "DZ", value: "DZ" }, // Dúzia
	{ id: 8, label: "CX", value: "CX" }, // Caixa
	{ id: 9, label: "PC", value: "PC" }, // Peça
	{ id: 10, label: "SC", value: "SC" }, // Saco
	{ id: 11, label: "FARDO", value: "FARDO" }, // Fardo
	{ id: 12, label: "BANDEJA", value: "BANDEJA" }, // Bandeja
	{ id: 13, label: "ROLO", value: "ROLO" }, // Rolo
	{ id: 14, label: "POTE", value: "POTE" }, // Pote
	{ id: 15, label: "FRASCO", value: "FRASCO" }, // Frasco
	{ id: 16, label: "GALÃO", value: "GALÃO" }, // Galão
	{ id: 17, label: "LATA", value: "LATA" }, // Lata
	{ id: 18, label: "PACOTE", value: "PACOTE" }, // Pacote
	{ id: 19, label: "BARRA", value: "BARRA" }, // Barra
	{ id: 20, label: "FATIA", value: "FATIA" }, // Fatia
];

export const AttributionModelOptions: { id: number; label: string; value: TAttributionModelEnum }[] = [
	{ id: 1, label: "ÚLTIMA INTERAÇÃO", value: "LAST_TOUCH" },
	{ id: 2, label: "PRIMEIRA INTERAÇÃO", value: "FIRST_TOUCH" },
	{ id: 3, label: "MÉDIA DE INTERAÇÕES", value: "LINEAR" },
];

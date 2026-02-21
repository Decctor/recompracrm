import type {
	TAttributionModelEnum,
	TCampaignTriggerTypeEnum,
	TCashbackProgramAccumulationTypeEnum,
	TCashbackProgramRedemptionLimitTypeEnum,
	TCommunityCourseStatusEnum,
	TCommunityLessonContentTypeEnum,
	TInteractionsCronJobTimeBlocksEnum,
	TInternalLeadActivityTypeEnum,
	TRecurrenceFrequencyEnum,
	TTimeDurationUnitsEnum,
} from "@/schemas/enums";
import type { TInternalLeadOriginEnum, TInternalLeadStatusCRMEnum } from "@/schemas/enums";
import {
	Archive,
	Clock,
	FileIcon,
	FileText,
	Globe,
	Mail,
	MessageSquare,
	Minus,
	Percent,
	Phone,
	Target,
	TrendingDown,
	TrendingUp,
	Video,
} from "lucide-react";

export const InternalActivityTypeOptions: { id: number; label: string; value: TInternalLeadActivityTypeEnum; icon: React.ReactNode }[] = [
	{
		id: 1,
		label: "LIGAÇÃO",
		value: "LIGACAO",
		icon: <Phone className="w-4 h-4" />,
	},
	{
		id: 2,
		label: "E-MAIL",
		value: "EMAIL",
		icon: <Mail className="w-4 h-4" />,
	},
	{
		id: 3,
		label: "REUNIÃO",
		value: "REUNIAO",
		icon: <Video className="w-4 h-4" />,
	},
	{
		id: 4,
		label: "TAREFA",
		value: "TAREFA",
		icon: <Clock className="w-4 h-4" />,
	},
	{
		id: 5,
		label: "WHATSAPP",
		value: "WHATSAPP",
		icon: <MessageSquare className="w-4 h-4" />,
	},
];

export const InternalLeadProbabilityOptions: {
	id: number;
	label: string;
	value: number;
	icon: React.ReactNode;
	className: string;
}[] = [
	{
		id: 1,
		label: "MUITO BAIXA",
		value: 20,
		icon: <TrendingDown className="w-4 h-4" />,
		className: "bg-red-200 text-red-600 border border-red-600 hover:bg-red-100 hover:text-red-500 hover:border-red-500",
	},
	{
		id: 2,
		label: "BAIXA",
		value: 40,
		icon: <Minus className="w-4 h-4" />,
		className: "bg-amber-200 text-amber-600 border border-amber-600 hover:bg-amber-100 hover:text-amber-500 hover:border-amber-500",
	},
	{
		id: 3,
		label: "MÉDIA",
		value: 60,
		icon: <Percent className="w-4 h-4" />,
		className: "bg-yellow-200 text-yellow-600 border border-yellow-600 hover:bg-yellow-100 hover:text-yellow-500 hover:border-yellow-500",
	},
	{
		id: 4,
		label: "ALTA",
		value: 80,
		icon: <TrendingUp className="w-4 h-4" />,
		className: "bg-lime-200 text-lime-600 border border-lime-600 hover:bg-lime-100 hover:text-lime-500 hover:border-lime-500",
	},
	{
		id: 5,
		label: "MUITO ALTA",
		value: 100,
		icon: <Target className="w-4 h-4" />,
		className: "bg-emerald-200 text-emerald-600 border border-emerald-600 hover:bg-emerald-100 hover:text-emerald-500 hover:border-emerald-500",
	},
];

export const CommunityCourseStatusOptions: {
	id: number;
	label: string;
	value: TCommunityCourseStatusEnum;
	icon: React.ReactNode;
	className: string;
}[] = [
	{
		id: 1,
		label: "RASCUNHO",
		value: "RASCUNHO",
		icon: <FileIcon className="w-4 h-4" />,
		className: "bg-gray-200 text-gray-600 border border-gray-600 hover:bg-gray-100 hover:text-gray-500 hover:border-gray-500",
	},
	{
		id: 2,
		label: "PUBLICADO",
		value: "PUBLICADO",
		icon: <Globe className="w-4 h-4" />,
		className: "bg-green-200 text-green-600 border border-green-600 hover:bg-green-100 hover:text-green-500 hover:border-green-500",
	},
	{
		id: 3,
		label: "ARQUIVADO",
		value: "ARQUIVADO",
		icon: <Archive className="w-4 h-4" />,
		className: "bg-red-200 text-red-600 border border-red-600 hover:bg-red-100 hover:text-red-500 hover:border-red-500",
	},
];

export const LessonContentTypeOptions: { id: number; label: string; value: TCommunityLessonContentTypeEnum; icon: React.ReactNode }[] = [
	{ id: 1, label: "VÍDEO", value: "VIDEO", icon: <Video className="w-4 h-4" /> },
	{ id: 2, label: "TEXTO", value: "TEXTO", icon: <FileText className="w-4 h-4" /> },
	{ id: 3, label: "VÍDEO + TEXTO", value: "VIDEO_TEXTO", icon: <Video className="w-4 h-4" /> },
];

const PROBABILITY_TIERS = [20, 40, 60, 80, 100] as const;

export function getProbabilityTier(value: number | null | undefined): (typeof InternalLeadProbabilityOptions)[number] | null {
	if (value == null || Number.isNaN(value)) return null;
	const clamped = Math.max(0, Math.min(100, value));
	const nearest = PROBABILITY_TIERS.reduce((prev, curr) => (Math.abs(clamped - curr) < Math.abs(clamped - prev) ? curr : prev));
	return InternalLeadProbabilityOptions.find((opt) => opt.value === nearest) ?? null;
}

export const InternalLeadStatusCRMOptions: { id: number; label: string; value: TInternalLeadStatusCRMEnum }[] = [
	{ id: 1, label: "NOVO", value: "NOVO" },
	{ id: 2, label: "CONTATO INICIAL", value: "CONTATO_INICIAL" },
	{ id: 3, label: "QUALIFICADO", value: "QUALIFICADO" },
	{ id: 4, label: "PROPOSTA", value: "PROPOSTA" },
	{ id: 5, label: "NEGOCIACAO", value: "NEGOCIACAO" },
	{ id: 6, label: "GANHO", value: "GANHO" },
];

export const InternalLeadOriginOptions: { id: string; label: string; value: TInternalLeadOriginEnum }[] = [
	{ id: "INDICACAO", value: "INDICACAO", label: "Indicação" },
	{ id: "SITE", value: "SITE", label: "Site" },
	{ id: "COLD_CALL", value: "COLD_CALL", label: "Cold Call" },
	{ id: "COLD_EMAIL", value: "COLD_EMAIL", label: "Cold Email" },
	{ id: "LINKEDIN", value: "LINKEDIN", label: "LinkedIn" },
	{ id: "EVENTO", value: "EVENTO", label: "Evento" },
	{ id: "INBOUND", value: "INBOUND", label: "Inbound" },
	{ id: "OUTRO", value: "OUTRO", label: "Outro" },
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

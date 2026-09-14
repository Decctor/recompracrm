import type {
	TAccountingEntryOriginTypeEnum,
	TAttributionModelEnum,
	TCampaignExecutionDelayDirectionEnum,
	TCampaignTriggerTypeEnum,
	TCashbackProgramAccumulationTypeEnum,
	TCashbackProgramRedemptionLimitTypeEnum,
	TCashbackProgramTerminologyEnum,
	TCommunityCourseStatusEnum,
	TCommunityLessonContentTypeEnum,
	TCouponBenefitScopeEnum,
	TCouponBenefitTypeEnum,
	TCouponScopeEnum,
	TCouponTargetOperatorEnum,
	TCouponTargetRoleEnum,
	TCouponValidationModeEnum,
	TDeliveryModeEnum,
	TFinancialAccountTypeEnum,
	TFinancialTransactionTypeEnum,
	TFiscalProductOriginEnum,
	TInteractionsCronJobTimeBlocksEnum,
	TPaymentMethodEnum,
	TPurchaseStatusEnum,
	TRecurrenceFrequencyEnum,
	TShopModeEnum,
	TShopProductsModeEnum,
	TTimeDurationUnitsEnum,
	TMessageTemplatePhoneStatusEnum,
} from "@/schemas/enums";
import { INTERACTIONS_CRON_TIME_BLOCKS } from "@/lib/campaigns/time-blocks";
import { TInteractionsStatusEnum } from "@/schemas/interactions";
import {
	Archive,
	ArrowDown,
	ArrowUp,
	BadgePercent,
	Ban,
	Banknote,
	BookOpen,
	Check,
	CheckCheck,
	ChefHat,
	CheckCircleIcon,
	ClipboardIcon,
	Clock,
	CreditCard,
	FileIcon,
	FileText,
	Globe,
	MapPin,
	Package,
	PauseCircleIcon,
	Pencil,
	QrCode,
	ShoppingCart,
	Stars,
	Store,
	Video,
	Wallet,
	CircleCheck,
	ListIcon,
	X,
	XCircle,
	XCircleIcon,
	ArrowRight,
	Tag,
	Tags,
	Utensils,
	ShoppingBag,
	Truck,
	Building2,
	BriefcaseBusiness,
	TrendingUp,
	Star,
	Heart,
	BadgeCheck,
	Sparkles,
	MessageCircle,
	Mail,
	Users,
	PackageX,
} from "lucide-react";

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

export const ProductFiscalProfileOriginOptions: { id: TFiscalProductOriginEnum; value: TFiscalProductOriginEnum; label: string }[] = [
	{ id: "NACIONAL", value: "NACIONAL", label: "NACIONAL" },
	{ id: "ESTRANGEIRA_IMPORTACAO_DIRETA", value: "ESTRANGEIRA_IMPORTACAO_DIRETA", label: "ESTRANGEIRA — IMPORTAÇÃO DIRETA" },
	{ id: "ESTRANGEIRA_ADQUIRIDA_BRASIL", value: "ESTRANGEIRA_ADQUIRIDA_BRASIL", label: "ESTRANGEIRA — ADQUIRIDA NO BRASIL" },
	{
		id: "NACIONAL_CONTEUDO_IMPORTACAO_SUPERIOR_40",
		value: "NACIONAL_CONTEUDO_IMPORTACAO_SUPERIOR_40",
		label: "NACIONAL — CONTEÚDO IMPORT. > 40%",
	},
	{ id: "NACIONAL_PROCESSOS_BASICOS", value: "NACIONAL_PROCESSOS_BASICOS", label: "NACIONAL — PROCESSOS BÁSICOS" },
	{
		id: "NACIONAL_CONTEUDO_IMPORTACAO_INFERIOR_IGUAL_40",
		value: "NACIONAL_CONTEUDO_IMPORTACAO_INFERIOR_IGUAL_40",
		label: "NACIONAL — CONTEÚDO IMPORT. ≤ 40%",
	},
	{
		id: "ESTRANGEIRA_IMPORTACAO_DIRETA_SEM_SIMILAR",
		value: "ESTRANGEIRA_IMPORTACAO_DIRETA_SEM_SIMILAR",
		label: "ESTRANGEIRA — IMPORT. DIRETA SEM SIMILAR",
	},
	{
		id: "ESTRANGEIRA_ADQUIRIDA_BRASIL_SEM_SIMILAR",
		value: "ESTRANGEIRA_ADQUIRIDA_BRASIL_SEM_SIMILAR",
		label: "ESTRANGEIRA — ADQUIRIDA BRASIL SEM SIMILAR",
	},
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

export const CampaignTriggerTypeOptions: {
	id: number;
	label: string;
	value: TCampaignTriggerTypeEnum;
	icon: React.ReactNode;
	description: string;
}[] = [
	{
		id: 1,
		label: "NOVA COMPRA",
		value: "NOVA-COMPRA",
		icon: <ShoppingCart className="w-4 h-4" />,
		description: "A campanha será disparada quando um cliente realizar uma nova compra.",
	},
	{
		id: 2,
		label: "PRIMEIRA COMPRA",
		value: "PRIMEIRA-COMPRA",
		icon: <ShoppingCart className="w-4 h-4" />,
		description: "A campanha será disparada quando um cliente realizar sua primeira compra.",
	},
	{
		id: 3,
		label: "PERMANÊNCIA NA SEGMENTAÇÃO",
		value: "PERMANÊNCIA-SEGMENTAÇÃO",
		icon: <ShoppingCart className="w-4 h-4" />,
		description: "A campanha será disparada quando um cliente permanecer na segmentação por um determinado tempo.",
	},
	{
		id: 4,
		label: "ENTRADA NA SEGMENTAÇÃO",
		value: "ENTRADA-SEGMENTAÇÃO",
		icon: <ShoppingCart className="w-4 h-4" />,
		description: "A campanha será disparada quando um cliente entrar na segmentação.",
	},
	{
		id: 5,
		label: "CASHBACK ACUMULADO",
		value: "CASHBACK-ACUMULADO",
		icon: <ShoppingCart className="w-4 h-4" />,
		description: "A campanha será disparada quando um cliente acumular um determinado valor de cashback.",
	},
	{
		id: 6,
		label: "CASHBACK EXPIRANDO",
		value: "CASHBACK-EXPIRANDO",
		icon: <ShoppingCart className="w-4 h-4" />,
		description: "A campanha será disparada quando um cliente tiver um cashback expirando.",
	},
	{
		id: 7,
		label: "ANIVERSÁRIO DO CLIENTE",
		value: "ANIVERSARIO_CLIENTE",
		icon: <ShoppingCart className="w-4 h-4" />,
		description: "A campanha será disparada quando um cliente fizer aniversário.",
	},
	{
		id: 8,
		label: "QUANTIDADE TOTAL DE COMPRAS",
		value: "QUANTIDADE-TOTAL-COMPRAS",
		icon: <ShoppingCart className="w-4 h-4" />,
		description: "A campanha será disparada quando um cliente realizar um determinado número de compras.",
	},
	{
		id: 9,
		label: "VALOR TOTAL DE COMPRAS",
		value: "VALOR-TOTAL-COMPRAS",
		icon: <ShoppingCart className="w-4 h-4" />,
		description: "A campanha será disparada quando um cliente realizar um determinado valor de compras.",
	},
	{
		id: 10,
		label: "RECORRENTE (AGENDAMENTO)",
		value: "RECORRENTE",
		icon: <ShoppingCart className="w-4 h-4" />,
		description: "A campanha será disparada de acordo com um agendamento recorrente.",
	},
	{
		id: 11,
		label: "PIOR DIA DE VENDAS",
		value: "PIOR-DIA-VENDAS",
		icon: <ShoppingCart className="w-4 h-4" />,
		description: "A campanha será disparada com base no pior dia de vendas da semana.",
	},
	{
		id: 12,
		label: "USO ÚNICO",
		value: "USO-UNICO",
		icon: <ShoppingCart className="w-4 h-4" />,
		description: "A campanha será disparada uma única vez na data selecionada e no bloco de horário configurado.",
	},
	{
		id: 13,
		label: "PROMOÇÃO DE PRODUTOS",
		value: "PROMOCAO-PRODUTOS",
		icon: <BadgePercent className="w-4 h-4" />,
		description: "Divulga uma lista de produtos numa data única — cada cliente recebe o produto com mais chance de recompra.",
	},
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

export const CampaignExecutionDelayDirectionOptions: { id: number; label: string; value: TCampaignExecutionDelayDirectionEnum }[] = [
	{ id: 1, label: "ANTES", value: "ANTES" },
	{ id: 2, label: "DEPOIS", value: "DEPOIS" },
];

export const TimeDurationUnitsOptions: { id: number; label: string; value: TTimeDurationUnitsEnum }[] = [
	{ id: 1, label: "DIAS", value: "DIAS" },
	{ id: 2, label: "SEMANAS", value: "SEMANAS" },
	{ id: 3, label: "MESES", value: "MESES" },
	{ id: 4, label: "ANOS", value: "ANOS" },
];

export const InteractionsCronJobTimeBlocksOptions: { id: number; label: string; value: TInteractionsCronJobTimeBlocksEnum }[] =
	INTERACTIONS_CRON_TIME_BLOCKS.map((block, index) => ({ id: index + 1, label: block, value: block }));

export const InteractionsSentStatusOptions: {
	id: number;
	label: string;
	value: TInteractionsStatusEnum;
	icon: React.ReactNode;
	className: string;
	message: (overwrite?: string) => string;
}[] = [
	{
		id: 1,
		label: "PENDENTE",
		value: "PENDENTE",
		message: (overwrite) => overwrite ?? "Mensagem com envio ainda pendente.",
		icon: <Clock className="w-4 h-4" />,
		className: "bg-gray-200 text-gray-600 border border-gray-600 hover:bg-gray-100 hover:text-gray-500 hover:border-gray-600",
	},
	{
		id: 2,
		label: "ENVIADO",
		value: "ENVIADO",
		message: (overwrite) => overwrite ?? "Mensagem enviada ao cliente.",
		icon: <Check className="w-4 h-4" />,
		className: "bg-gray-200 text-gray-600 border border-gray-600 hover:bg-gray-100 hover:text-gray-500 hover:border-gray-600",
	},
	{
		id: 3,
		label: "ENTREGUE",
		value: "ENTREGUE",
		message: (overwrite) => overwrite ?? "Mensagem entregue ao cliente.",
		icon: <CheckCheck className="w-4 h-4" />,
		className: "bg-blue-200 text-blue-600 border border-blue-600 hover:bg-blue-100 hover:text-blue-500 hover:border-blue-600",
	},
	{
		id: 4,
		label: "LIDO",
		value: "LIDO",
		message: (overwrite) => overwrite ?? "Mensagem lida pelo cliente.",
		icon: <CheckCheck className="w-4 h-4" />,
		className: "bg-green-200 text-green-600 border border-green-600 hover:bg-green-100 hover:text-green-500 hover:border-green-600",
	},
	{
		id: 5,
		label: "FALHOU",
		value: "FALHOU",
		message: (overwrite) => overwrite ?? "O envio da mensagem falhou.",
		icon: <X className="w-4 h-4" />,
		className: "bg-red-200 text-red-600 border border-red-600 hover:bg-red-100 hover:text-red-500 hover:border-red-600",
	},
	{
		id: 6,
		label: "BLOQUEADA",
		value: "BLOQUEADA",
		message: (overwrite) => overwrite ?? "Interação bloqueada — envio não realizado.",
		icon: <Ban className="w-4 h-4" />,
		className: "bg-amber-200 text-amber-700 border border-amber-600 hover:bg-amber-100 hover:text-amber-600 hover:border-amber-600",
	},
];

export const CashbackProgramAccumulationTypeOptions: { id: number; label: string; value: TCashbackProgramAccumulationTypeEnum }[] = [
	{ id: 1, label: "FIXO", value: "FIXO" },
	{ id: 2, label: "PERCENTUAL", value: "PERCENTUAL" },
];

export const CashbackProgramTerminologyOptions: { id: number; label: string; value: TCashbackProgramTerminologyEnum; icon: React.ReactNode }[] = [
	{ id: 1, label: "DINHEIRO", value: "DINHEIRO", icon: <Banknote className="w-4 h-4" /> },
	{ id: 2, label: "PONTOS", value: "PONTOS", icon: <Stars className="w-4 h-4" /> },
];

export const CashbackProgramRedemptionLimitTypeOptions: { id: number; label: string; value: TCashbackProgramRedemptionLimitTypeEnum }[] = [
	{ id: 1, label: "FIXO", value: "FIXO" },
	{ id: 2, label: "PERCENTUAL", value: "PERCENTUAL" },
];

export const SaleFullfilmentModesOptions: { id: number; label: string; value: TDeliveryModeEnum; icon: React.ReactNode }[] = [
	{ id: 1, label: "PRESENCIAL", value: "PRESENCIAL", icon: <Store className="w-4 h-4" /> },
	{ id: 2, label: "RETIRADA", value: "RETIRADA", icon: <Package className="w-4 h-4" /> },
	{ id: 3, label: "ENTREGA", value: "ENTREGA", icon: <MapPin className="w-4 h-4" /> },
	{ id: 4, label: "COMANDA", value: "COMANDA", icon: <ClipboardIcon className="w-4 h-4" /> },
];

export const SalePaymentMethodsOptions: {
	id: number;
	label: string;
	value: TPaymentMethodEnum;
	icon: React.ReactNode;
	renderIcon: (className: string) => React.ReactNode;
}[] = [
	{
		id: 1,
		label: "DINHEIRO",
		value: "DINHEIRO",
		icon: <Banknote className="w-4 h-4" />,
		renderIcon: (className: string) => <Banknote className={className} />,
	},
	{ id: 2, label: "PIX", value: "PIX", icon: <QrCode className="w-4 h-4" />, renderIcon: (className: string) => <QrCode className={className} /> },
	{
		id: 3,
		label: "CARTÃO DE CRÉDITO",
		value: "CARTAO_CREDITO",
		icon: <CreditCard className="w-4 h-4" />,
		renderIcon: (className: string) => <CreditCard className={className} />,
	},
	{
		id: 4,
		label: "CARTÃO DE DÉBITO",
		value: "CARTAO_DEBITO",
		icon: <CreditCard className="w-4 h-4" />,
		renderIcon: (className: string) => <CreditCard className={className} />,
	},
	{
		id: 5,
		label: "BOLETO",
		value: "BOLETO",
		icon: <FileText className="w-4 h-4" />,
		renderIcon: (className: string) => <FileText className={className} />,
	},
	{
		id: 6,
		label: "TRANSFERÊNCIA",
		value: "TRANSFERENCIA",
		icon: <Wallet className="w-4 h-4" />,
		renderIcon: (className: string) => <Wallet className={className} />,
	},
	// {
	// 	id: 7,
	// 	label: "CASHBACK",
	// 	value: "CASHBACK",
	// 	icon: <Stars className="w-4 h-4" />,
	// 	renderIcon: (className: string) => <Stars className={className} />,
	// },
	{ id: 8, label: "VALE", value: "VALE", icon: <Wallet className="w-4 h-4" />, renderIcon: (className: string) => <Wallet className={className} /> },
	{
		id: 9,
		label: "A DEFINIR",
		value: "A_DEFINIR",
		icon: <Clock className="w-4 h-4" />,
		renderIcon: (className: string) => <Clock className={className} />,
	},
	{
		id: 10,
		label: "FIADO / NOTA",
		value: "FIADO_NOTA",
		icon: <BookOpen className="w-4 h-4" />,
		renderIcon: (className: string) => <BookOpen className={className} />,
	},
	{
		id: 11,
		label: "OUTRO",
		value: "OUTRO",
		icon: <Wallet className="w-4 h-4" />,
		renderIcon: (className: string) => <Wallet className={className} />,
	},
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

export const PurchaseStatusOptions: { id: number; label: string; value: TPurchaseStatusEnum; icon: React.ReactNode; className: string }[] = [
	{
		id: 1,
		label: "RASCUNHO",
		value: "RASCUNHO",
		icon: <FileIcon className="w-4 h-4 text-gray-600" />,
		className: "bg-gray-200 text-gray-600 border border-gray-600 hover:bg-gray-100 hover:text-gray-500 hover:border-gray-500",
	},
	{
		id: 2,
		label: "CONFIRMADA",
		value: "CONFIRMADA",
		icon: <Check className="w-4 h-4 text-blue-600	" />,
		className: "bg-blue-200 text-blue-600 border border-blue-600 hover:bg-blue-100 hover:text-blue-500 hover:border-blue-500",
	},
	{
		id: 3,
		label: "RECEBIMENTO PARCIAL",
		value: "RECEBIMENTO_PARCIAL",
		icon: <FileIcon className="w-4 h-4 text-yellow-600" />,
		className: "bg-yellow-200 text-yellow-600 border border-yellow-600 hover:bg-yellow-100 hover:text-yellow-500 hover:border-yellow-500",
	},
	{
		id: 4,
		label: "RECEBIDA",
		value: "RECEBIDA",
		icon: <CheckCheck className="w-4 h-4 text-green-600" />,
		className: "bg-green-200 text-green-600 border border-green-600 hover:bg-green-100 hover:text-green-500 hover:border-green-500",
	},
	{
		id: 5,
		label: "CANCELADA",
		value: "CANCELADA",
		icon: <X className="w-4 h-4 text-red-600" />,
		className: "bg-red-200 text-red-600 border border-red-600 hover:bg-red-100 hover:text-red-500 hover:border-red-500",
	},
];

export const FinancialAccountTypeOptions: {
	id: number;
	label: string;
	value: TFinancialAccountTypeEnum;
	icon: React.ReactNode;
	className: string;
	colors: { text: string; background: string };
	renderIcon: (className: string) => React.ReactNode;
}[] = [
	{
		id: 1,
		label: "CAIXA",
		value: "CAIXA",
		icon: <Wallet className="w-4 h-4" />,
		className: "bg-green-200 text-green-600 border border-green-600 hover:bg-green-100 hover:text-green-500 hover:border-green-500",
		colors: { text: "text-green-600", background: "bg-green-200" },
		renderIcon: (className: string) => <Wallet className={className} />,
	},
	{
		id: 2,
		label: "BANCO",
		value: "BANCO",
		icon: <Banknote className="w-4 h-4" />,
		className: "bg-blue-200 text-blue-600 border border-blue-600 hover:bg-blue-100 hover:text-blue-500 hover:border-blue-500",
		colors: { text: "text-blue-600", background: "bg-blue-200" },
		renderIcon: (className: string) => <Banknote className={className} />,
	},
	{
		id: 3,
		label: "CARTEIRA DIGITAL",
		value: "CARTEIRA_DIGITAL",
		icon: <Wallet className="w-4 h-4" />,
		className: "bg-purple-200 text-purple-600 border border-purple-600 hover:bg-purple-100 hover:text-purple-500 hover:border-purple-500",
		colors: { text: "text-purple-600", background: "bg-purple-200" },
		renderIcon: (className: string) => <Wallet className={className} />,
	},
	{
		id: 4,
		label: "CARTÃO DE CRÉDITO",
		value: "CARTAO_CREDITO",
		icon: <CreditCard className="w-4 h-4" />,
		className: "bg-red-200 text-red-600 border border-red-600 hover:bg-red-100 hover:text-red-500 hover:border-red-500",
		colors: { text: "text-red-600", background: "bg-red-200" },
		renderIcon: (className: string) => <CreditCard className={className} />,
	},
	{
		id: 5,
		label: "INVESTIMENTO",
		value: "INVESTIMENTO",
		icon: <TrendingUp className="w-4 h-4" />,
		className: "bg-amber-200 text-amber-700 border border-amber-600 hover:bg-amber-100 hover:text-amber-600 hover:border-amber-500",
		colors: { text: "text-amber-700", background: "bg-amber-200" },
		renderIcon: (className: string) => <TrendingUp className={className} />,
	},
	{
		id: 6,
		label: "OUTRO",
		value: "OUTRO",
		icon: <Wallet className="w-4 h-4" />,
		className: "bg-gray-200 text-gray-600 border border-gray-600 hover:bg-gray-100 hover:text-gray-500 hover:border-gray-500",
		colors: { text: "text-gray-600", background: "bg-gray-200" },
		renderIcon: (className: string) => <Wallet className={className} />,
	},
];
export const AccountingEntryOriginTypeOptions: {
	id: number;
	label: string;
	value: TAccountingEntryOriginTypeEnum;
	icon: React.ReactNode;
	colors: { text: string; background: string };
}[] = [
	{
		id: 1,
		label: "VENDA",
		value: "VENDA",
		icon: <ShoppingCart className="w-4 h-4" />,
		colors: {
			text: "text-green-600",
			background: "bg-green-200",
		},
	},
	{
		id: 2,
		label: "MANUAL",
		value: "MANUAL",
		icon: <Pencil className="w-4 h-4" />,
		colors: {
			text: "text-amber-600",
			background: "bg-amber-200",
		},
	},
	{
		id: 3,
		label: "ESTORNO",
		value: "ESTORNO",
		icon: <X className="w-4 h-4" />,
		colors: {
			text: "text-red-600",
			background: "bg-red-200",
		},
	},
	{
		id: 4,
		label: "TRANSFERÊNCIA",
		value: "TRANSFERENCIA",
		icon: <ArrowRight className="w-4 h-4" />,
		colors: {
			text: "text-blue-600",
			background: "bg-blue-200",
		},
	},
	{
		id: 5,
		label: "COMPRA",
		value: "COMPRA",
		icon: <ShoppingBag className="w-4 h-4" />,
		colors: {
			text: "text-purple-600",
			background: "bg-purple-200",
		},
	},
	{
		id: 6,
		label: "PERDA DE ESTOQUE",
		value: "PERDA_ESTOQUE",
		icon: <PackageX className="w-4 h-4" />,
		colors: {
			text: "text-orange-600",
			background: "bg-orange-200",
		},
	},
	{
		id: 7,
		label: "RECORRÊNCIA",
		value: "RECORRENCIA",
		icon: <Clock className="w-4 h-4" />,
		colors: {
			text: "text-indigo-600",
			background: "bg-indigo-200",
		},
	},
	{
		id: 8,
		label: "PAGAMENTO DE CARTÃO",
		value: "PAGAMENTO_CARTAO",
		icon: <CreditCard className="w-4 h-4" />,
		colors: {
			text: "text-cyan-600",
			background: "bg-cyan-200",
		},
	},
];

export const FinancialTransactionTypeOptions: {
	id: number;
	label: string;
	value: TFinancialTransactionTypeEnum;
	icon: React.ReactNode;
	colors: { text: string; background: string };
}[] = [
	{
		id: 1,
		label: "ENTRADA",
		value: "ENTRADA",
		icon: <ArrowUp className="w-4 h-4 text-green-600" />,
		colors: { text: "text-green-600", background: "bg-green-200" },
	},
	{
		id: 2,
		label: "SAÍDA",
		value: "SAIDA",
		icon: <ArrowDown className="w-4 h-4 text-red-600" />,
		colors: { text: "text-red-600", background: "bg-red-200" },
	},
];

export const ShopModeOptions: { id: number; label: string; value: TShopModeEnum; icon: React.ReactNode }[] = [
	{ id: 1, label: "CARDÁPIO", value: "CARDAPIO", icon: <ChefHat className="w-4 h-4 min-w-4 min-h-4" /> },
	{ id: 2, label: "CATÁLOGO", value: "CATALOGO", icon: <BookOpen className="w-4 h-4 min-w-4 min-h-4" /> },
];
export const ShopProductsModeOptions: { id: number; label: string; value: TShopProductsModeEnum; icon: React.ReactNode }[] = [
	{ id: 1, label: "ATIVOS", value: "ATIVOS", icon: <CircleCheck className="w-4 h-4 min-w-4 min-h-4" /> },
	{ id: 2, label: "INCLUIR", value: "INCLUIR", icon: <ListIcon className="w-4 h-4 min-w-4 min-h-4" /> },
	{ id: 3, label: "EXCLUIR", value: "EXCLUIR", icon: <XCircle className="w-4 h-4 min-w-4 min-h-4" /> },
];

export const MessageTemplatePhoneStatusUIDetailsMap: Record<
	TMessageTemplatePhoneStatusEnum,
	{ id: number; label: string; value: TMessageTemplatePhoneStatusEnum; icon: React.ReactNode; colors: { text: string; background: string } }
> = {
	RASCUNHO: {
		id: 1,
		label: "RASCUNHO",
		value: "RASCUNHO",
		icon: <FileIcon className="w-4 h-4 text-gray-600" />,
		colors: { text: "text-gray-600", background: "bg-gray-200" },
	},
	PENDENTE: {
		id: 2,
		label: "PENDENTE",
		value: "PENDENTE",
		icon: <Clock className="w-4 h-4 text-yellow-600" />,
		colors: { text: "text-yellow-600", background: "bg-yellow-200" },
	},
	REJEITADO: {
		id: 3,
		label: "REJEITADO",
		value: "REJEITADO",
		icon: <XCircleIcon className="w-4 h-4 text-red-600" />,
		colors: { text: "text-red-600", background: "bg-red-200" },
	},
	PAUSADO: {
		id: 4,
		label: "PAUSADO",
		value: "PAUSADO",
		icon: <PauseCircleIcon className="w-4 h-4 text-orange-600" />,
		colors: { text: "text-orange-600", background: "bg-orange-200" },
	},
	DESABILITADO: {
		id: 6,
		label: "DESABILITADO",
		value: "DESABILITADO",
		icon: <Ban className="w-4 h-4 text-gray-600" />,
		colors: { text: "text-gray-600", background: "bg-gray-200" },
	},
	APROVADO: {
		id: 5,
		label: "APROVADO",
		value: "APROVADO",
		icon: <CheckCircleIcon className="w-4 h-4 text-green-600" />,
		colors: { text: "text-green-600", background: "bg-green-200" },
	},
};
export function getMessageTemplatePhoneStatusUIDetails(status: TMessageTemplatePhoneStatusEnum) {
	return MessageTemplatePhoneStatusUIDetailsMap[status];
}

export const TagsColorPalette = [
	{ primary: "#FF0000", secondary: "#FFCCCB" },
	{ primary: "#0000FF", secondary: "#DCEFFF" },
	{ primary: "#008000", secondary: "#C1E1C1" },
	{ primary: "#FEAD41", secondary: "#FFFACD" },
	{ primary: "#800080", secondary: "#E6E6FA" },
	{ primary: "#C13F55", secondary: "#FFE4E1" },
	{ primary: "#4B0082", secondary: "#D9D9F3" },
	{ primary: "#000000", secondary: "#F8F8F8" },
	{ primary: "#FF9D00", secondary: "#FFF4E2" },
	{ primary: "#07ABAB", secondary: "#E0FFFF" },
	{ primary: "#8B4513", secondary: "#EFE8E2" },
	{ primary: "#008CFF", secondary: "#D8EFFA" },
	{ primary: "#2E8B57", secondary: "#98FB98" },
	{ primary: "#DC143C", secondary: "#FFCBB7" },
	{ primary: "#9932CC", secondary: "#D9D0F3" },
	{ primary: "#FF1493", secondary: "#FCD8DD" },
	{ primary: "#003365", secondary: "#87CEFA" },
	{ primary: "#FF4500", secondary: "#FCE0D4" },
	{ primary: "#058A05", secondary: "#B7FDB7" },
	{ primary: "#ECAA02", secondary: "#F3F0D3" },
];

export const ClientTagIconMap = {
	Tag,
	Tags,
	Store,
	Utensils,
	ShoppingBag,
	Truck,
	Building2,
	BriefcaseBusiness,
	Star,
	Heart,
	BadgeCheck,
	Sparkles,
	MessageCircle,
	Mail,
	Users,
} satisfies Record<string, React.ComponentType>;

// ============================================================================
// COUPONS
// ============================================================================

export const CouponScopeOptions: { id: number; label: string; value: TCouponScopeEnum }[] = [
	{ id: 1, label: "QUALQUER CLIENTE", value: "GLOBAL" },
	{ id: 2, label: "CLIENTES ESPECÍFICOS", value: "INDIVIDUAL" },
];

export const CouponValidationModeOptions: { id: number; label: string; value: TCouponValidationModeEnum }[] = [
	{ id: 1, label: "AUTOMÁTICA (SISTEMA CONFERE)", value: "AUTOMATICA" },
	{ id: 2, label: "MANUAL (OPERADOR CONFERE NO BALCÃO)", value: "MANUAL" },
];

export const CouponBenefitTypeOptions: { id: number; label: string; value: TCouponBenefitTypeEnum }[] = [
	{ id: 1, label: "DESCONTO EM REAIS (R$)", value: "DESCONTO_FIXO" },
	{ id: 2, label: "DESCONTO PERCENTUAL (%)", value: "DESCONTO_PERCENTUAL" },
	{ id: 3, label: "PREÇO FIXO POR UNIDADE", value: "PRECO_FIXO" },
	{ id: 4, label: "LEVE MAIS, PAGUE MENOS", value: "COMPRE_X_LEVE_Y" },
];

export const CouponBenefitScopeOptions: { id: number; label: string; value: TCouponBenefitScopeEnum }[] = [
	{ id: 1, label: "NA COMPRA TODA", value: "VENDA_TOTAL" },
	{ id: 2, label: "EM PRODUTOS ESPECÍFICOS", value: "ITENS_ELEGIVEIS" },
];

export const CouponTargetOperatorOptions: { id: number; label: string; value: TCouponTargetOperatorEnum }[] = [
	{ id: 1, label: "BASTA UM DOS PRODUTOS", value: "QUALQUER" },
	{ id: 2, label: "PRECISA DE TODOS OS PRODUTOS", value: "TODOS" },
];

export const CouponTargetRoleOptions: { id: number; label: string; value: TCouponTargetRoleEnum }[] = [
	{ id: 1, label: "ATIVA O CUPOM", value: "ELEGIVEL" },
	{ id: 2, label: "GANHA O DESCONTO", value: "BENEFICIADO" },
];

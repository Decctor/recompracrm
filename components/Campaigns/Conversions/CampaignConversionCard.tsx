"use client";

import type { TGetCampaignConversionsOutputItems } from "@/app/api/campaigns/conversions/route";
import ClientHoverCard from "@/components/Clients/ClientHoverCard";
import { Chip } from "@/components/ui/chip";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import { getTriggerMeta } from "@/app/dashboard/growth/campaigns/_module/builder/helpers/triggers";
import { ArrowLeftRight, Calendar, Clock, Megaphone, RefreshCw, TrendingDown, TrendingUp, UserPlus, UserRound, Zap } from "lucide-react";
import Link from "next/link";
import { createContext, use, type ComponentType, type ReactNode } from "react";

export const CONVERSION_TYPE_CONFIG: Record<
	string,
	{ label: string; bgClass: string; textClass: string; icon: ComponentType<{ className?: string }> }
> = {
	AQUISICAO: { label: "Aquisição", bgClass: "bg-green-500", textClass: "text-green-600 dark:text-green-400", icon: UserPlus },
	REATIVACAO: { label: "Reativação", bgClass: "bg-blue-500", textClass: "text-blue-600 dark:text-blue-400", icon: RefreshCw },
	ACELERACAO: { label: "Aceleração", bgClass: "bg-yellow-500", textClass: "text-yellow-600 dark:text-yellow-400", icon: Zap },
	REGULAR: { label: "Regular", bgClass: "bg-gray-400", textClass: "text-gray-600 dark:text-gray-400", icon: ArrowLeftRight },
	ATRASADA: { label: "Atrasada", bgClass: "bg-red-500", textClass: "text-red-600 dark:text-red-400", icon: Clock },
};

export type TCampaignConversion = TGetCampaignConversionsOutputItems[number];

type CampaignConversionCardContextValue = {
	conversion: TCampaignConversion;
};

const CampaignConversionCardContext = createContext<CampaignConversionCardContextValue | null>(null);

function useCampaignConversionCard() {
	const context = use(CampaignConversionCardContext);
	if (!context) {
		throw new Error("CampaignConversionCard compound components must be used within CampaignConversionCard.Provider.");
	}
	return context;
}

function CampaignConversionCardProvider({ conversion, children }: { conversion: TCampaignConversion; children: ReactNode }) {
	return <CampaignConversionCardContext value={{ conversion }}>{children}</CampaignConversionCardContext>;
}

function CampaignConversionCardFrame({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("bg-card border-border flex w-full flex-col gap-2 rounded-xl border px-3 py-3 shadow-2xs", className)}>{children}</div>;
}

function CampaignConversionCardCampaignLink() {
	const { conversion } = useCampaignConversionCard();
	const campaign = conversion.campanha;

	if (!campaign?.id || !campaign.titulo) return null;
	const TriggerIcon = getTriggerMeta(campaign.gatilhoTipo)?.icon ?? Megaphone;

	return (
		<div className="border-border flex items-center gap-2 border-b pb-1.5">
			<span className="shrink-0 text-[0.6rem] font-medium text-muted-foreground uppercase">Campanha</span>
			<TriggerIcon className="size-3.5 min-h-3.5 min-w-3.5 shrink-0 text-muted-foreground" />
			<Link href={appRoutes.growth.campaign(campaign.id)} className="min-w-0 truncate text-[0.7rem] font-semibold text-foreground hover:underline">
				{campaign.titulo}
			</Link>
		</div>
	);
}

function CampaignConversionCardHeader({ children }: { children: ReactNode }) {
	return <div className="flex w-full flex-wrap items-start justify-between gap-2">{children}</div>;
}

function CampaignConversionCardLeading({ children }: { children: ReactNode }) {
	return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function CampaignConversionCardMetadata({ children }: { children: ReactNode }) {
	return <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{children}</div>;
}

function CampaignConversionCardConversionType() {
	const { conversion } = useCampaignConversionCard();
	const config = CONVERSION_TYPE_CONFIG[conversion.tipoConversao ?? ""];
	const label = config?.label ?? conversion.tipoConversao ?? "Desconhecido";
	const Icon = config?.icon;

	return (
		<Chip.Root size="md" shape="md" className={cn("border-transparent text-white", config?.bgClass ?? "bg-gray-400")}>
			{Icon ? (
				<Chip.Icon>
					<Icon />
				</Chip.Icon>
			) : null}
			<Chip.Label caps weight="bold">
				{label}
			</Chip.Label>
		</Chip.Root>
	);
}

function CampaignConversionCardClientChip() {
	const { conversion } = useCampaignConversionCard();
	const client = conversion.cliente;
	const chip = (
		<Chip.Root variant="secondary" size="md" shape="xl" className={cn(client?.id && "cursor-pointer")}>
			<Chip.Icon>
				<UserRound />
			</Chip.Icon>
			<Chip.Label caps>{client?.nome ?? "Não informado"}</Chip.Label>
		</Chip.Root>
	);

	return client?.id ? <ClientHoverCard clientId={client.id}>{chip}</ClientHoverCard> : chip;
}

function CampaignConversionCardConversionDate() {
	const { conversion } = useCampaignConversionCard();
	if (!conversion.dataConversao) return null;

	return (
		<span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
			<Calendar className="size-3 min-h-3 min-w-3" />
			{formatDateAsLocale(conversion.dataConversao)}
		</span>
	);
}

export function formatConversionElapsedTime(minutes: number): string {
	const safeMinutes = Math.max(0, Math.round(minutes));
	if (safeMinutes === 0) return "menos de 1 min";
	if (safeMinutes < 60) return `${safeMinutes} min`;

	const totalHours = Math.floor(safeMinutes / 60);
	const remainingMinutes = safeMinutes % 60;
	if (totalHours < 24) return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}min` : `${totalHours}h`;

	const days = Math.floor(totalHours / 24);
	const remainingHours = totalHours % 24;
	const daysLabel = `${days} ${days === 1 ? "dia" : "dias"}`;
	return remainingHours > 0 ? `${daysLabel} e ${remainingHours}h` : daysLabel;
}

function CampaignConversionCardTimeToConversion() {
	const { conversion } = useCampaignConversionCard();
	if (conversion.tempoParaConversaoMinutos == null) return null;

	return (
		<span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
			<Clock className="size-3 min-h-3 min-w-3" />
			{formatConversionElapsedTime(conversion.tempoParaConversaoMinutos)} após envio
		</span>
	);
}

function CampaignConversionCardMetrics({ children }: { children: ReactNode }) {
	return <div className="flex flex-wrap items-end gap-4">{children}</div>;
}

function CampaignConversionCardMetric({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-[0.6rem] font-medium text-muted-foreground uppercase">{label}</span>
			<span className="text-sm font-bold">{children}</span>
		</div>
	);
}

function CampaignConversionCardMetricDivider() {
	return <div className="bg-border h-7 w-px self-center" />;
}

function CampaignConversionCardSaleValue() {
	const { conversion } = useCampaignConversionCard();
	return <CampaignConversionCardMetric label="Valor da venda">{formatToMoney(conversion.vendaValor ?? 0)}</CampaignConversionCardMetric>;
}

function CampaignConversionCardAttributedRevenue() {
	const { conversion } = useCampaignConversionCard();
	return <CampaignConversionCardMetric label="Receita atribuída">{formatToMoney(conversion.atribuicaoReceita ?? 0)}</CampaignConversionCardMetric>;
}

function CampaignConversionCardImpacts({ children }: { children: ReactNode }) {
	return <div className="border-border flex flex-col gap-1 border-t pt-1.5 empty:hidden">{children}</div>;
}

function Impact({ children, positive, icon: Icon }: { children: ReactNode; positive: boolean; icon: typeof TrendingUp }) {
	return (
		<span
			className={cn(
				"flex items-center gap-1.5 text-[0.7rem] font-semibold",
				positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
			)}
		>
			<Icon className="size-3.5 min-h-3.5 min-w-3.5 shrink-0" />
			{children}
		</span>
	);
}

function CampaignConversionCardFrequencyImpact() {
	const { conversion } = useCampaignConversionCard();
	const type = conversion.tipoConversao;

	if (type === "AQUISICAO")
		return (
			<Impact positive icon={UserPlus}>
				Novo cliente conquistado pela campanha
			</Impact>
		);
	if (type === "REATIVACAO" && conversion.diasDesdeUltimaCompra != null) {
		return (
			<Impact positive icon={RefreshCw}>
				Reativou após {conversion.diasDesdeUltimaCompra} dias sem comprar
			</Impact>
		);
	}
	if (conversion.deltaFrequencia == null || conversion.deltaFrequencia === 0) return null;
	if (conversion.deltaFrequencia > 0) {
		return (
			<Impact positive icon={TrendingUp}>
				Voltou {conversion.deltaFrequencia} dias antes do previsto
			</Impact>
		);
	}
	return (
		<Impact positive={false} icon={Clock}>
			Voltou {Math.abs(conversion.deltaFrequencia)} dias depois do previsto
		</Impact>
	);
}

function CampaignConversionCardTicketImpact() {
	const { conversion } = useCampaignConversionCard();
	const absoluteDelta = conversion.deltaMonetarioAbsoluto;
	if (absoluteDelta == null || Math.abs(absoluteDelta) < 0.5) return null;

	const percentageDelta = conversion.deltaMonetarioPercentual;
	const percentage = percentageDelta != null ? ` (${percentageDelta > 0 ? "+" : ""}${formatDecimalPlaces(percentageDelta)}%)` : "";

	if (absoluteDelta > 0) {
		return (
			<Impact positive icon={TrendingUp}>
				Gastou {formatToMoney(absoluteDelta)} a mais que o habitual{percentage}
			</Impact>
		);
	}
	return (
		<Impact positive={false} icon={TrendingDown}>
			Gastou {formatToMoney(Math.abs(absoluteDelta))} a menos que o habitual{percentage}
		</Impact>
	);
}

export const CampaignConversionCard = {
	Provider: CampaignConversionCardProvider,
	Frame: CampaignConversionCardFrame,
	CampaignLink: CampaignConversionCardCampaignLink,
	Header: CampaignConversionCardHeader,
	Leading: CampaignConversionCardLeading,
	Metadata: CampaignConversionCardMetadata,
	ConversionType: CampaignConversionCardConversionType,
	ClientChip: CampaignConversionCardClientChip,
	ConversionDate: CampaignConversionCardConversionDate,
	TimeToConversion: CampaignConversionCardTimeToConversion,
	Metrics: CampaignConversionCardMetrics,
	Metric: CampaignConversionCardMetric,
	MetricDivider: CampaignConversionCardMetricDivider,
	SaleValue: CampaignConversionCardSaleValue,
	AttributedRevenue: CampaignConversionCardAttributedRevenue,
	Impacts: CampaignConversionCardImpacts,
	FrequencyImpact: CampaignConversionCardFrequencyImpact,
	TicketImpact: CampaignConversionCardTicketImpact,
};

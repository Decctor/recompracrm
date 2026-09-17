"use client";

import type { TGetCampaignInteractionsOutputItems } from "@/app/api/campaigns/interactions/route";
import ClientHoverCard from "@/components/Clients/ClientHoverCard";
import TemplatePreview from "@/components/MessageTemplates/TemplatePreview";
import { WhatsappIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { HoverOrPopover } from "@/components/ui/hover-or-popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale } from "@/lib/formatting";
import { buildInteractionMessageVariables } from "@/lib/interactions/message-preview";
import { retryCampaignInteraction } from "@/lib/mutations/campaigns";
import type { TInteractionContextMetadados } from "@/lib/message-templates";
import { cn } from "@/lib/utils";
import { InteractionMetadataSchema, type TInteractionDeliveryChannelEnum, type TInteractionMetadata } from "@/schemas/interactions";
import { InteractionsSentStatusOptions } from "@/utils/select-options";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, CalendarCheck, Code, Eye, Mail, RefreshCw, UserRound } from "lucide-react";
import { cloneElement, createContext, isValidElement, use, useMemo, type ReactNode } from "react";
import { BsCalendarPlus } from "react-icons/bs";
import { toast } from "sonner";

export type TInteractionCardInteraction = TGetCampaignInteractionsOutputItems[number];

type InteractionCardContextValue = {
	interaction: TInteractionCardInteraction;
};

const InteractionCardContext = createContext<InteractionCardContextValue | null>(null);

function useInteractionCard() {
	const context = use(InteractionCardContext);
	if (!context) {
		throw new Error("InteractionCard compound components must be used within InteractionCard.Provider.");
	}
	return context;
}

function InteractionCardProvider({ interaction, children }: { interaction: TInteractionCardInteraction; children: ReactNode }) {
	return <InteractionCardContext value={{ interaction }}>{children}</InteractionCardContext>;
}

function InteractionCardFrame({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cn("bg-card border-border flex w-full min-w-0 flex-col gap-2 overflow-hidden rounded-xl border px-3 py-4 shadow-2xs", className)}>
			{children}
		</div>
	);
}

function InteractionCardHeader({ children }: { children: ReactNode }) {
	return <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">{children}</div>;
}

function InteractionCardLeading({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3", className)}>{children}</div>;
}

function InteractionCardActions({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("flex shrink-0 items-center gap-1 self-end sm:gap-3 sm:self-auto", className)}>{children}</div>;
}

function InteractionCardBody({ children }: { children: ReactNode }) {
	return <div className="w-full flex flex-col gap-0.5">{children}</div>;
}

function InteractionCardDescription() {
	const { interaction } = useInteractionCard();
	if (!interaction.descricao) return null;
	return <p className="text-xs leading-relaxed font-medium tracking-tight text-muted-foreground">{interaction.descricao}</p>;
}

function InteractionCardFooter({ children }: { children: ReactNode }) {
	return <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2">{children}</div>;
}

function InteractionCardCampaignTitle({ className }: { className?: string }) {
	const { interaction } = useInteractionCard();
	return (
		<h1 className={cn("min-w-0 text-xs font-bold tracking-tight break-words lg:text-sm", className)}>
			{interaction.campanha?.titulo ?? "CAMPANHA NÃO ENCONTRADA"}
		</h1>
	);
}

function InteractionCardClientSubtitle() {
	const { interaction } = useInteractionCard();
	const clientName = interaction.cliente.nome ?? "Não informado";

	return (
		<ClientHoverCard clientId={interaction.cliente.id}>
			<span className="text-primary flex min-w-0 cursor-pointer items-center gap-1.5 text-left text-sm font-medium tracking-tight">
				<UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
				<span className="truncate">{clientName}</span>
			</span>
		</ClientHoverCard>
	);
}

function InteractionCardMetaPanel() {
	const { interaction } = useInteractionCard();
	const createdAtText = formatDateAsLocale(interaction.dataInsercao, true);
	const sentAtText =
		(interaction.dataEnvio ?? interaction.dataExecucao) ? formatDateAsLocale(interaction.dataEnvio ?? interaction.dataExecucao, true) : null;

	return (
		<dl className="border-border/70 grid grid-cols-[minmax(0,auto)_1fr] gap-x-4 gap-y-2 border-t pt-2.5 text-xs">
			<dt className="font-medium text-muted-foreground">Registrado</dt>
			<dd className="text-right font-medium tabular-nums">{createdAtText}</dd>
			{sentAtText ? (
				<>
					<dt className="font-medium text-green-600 dark:text-green-500">Enviado</dt>
					<dd className="text-right font-medium text-green-600 tabular-nums dark:text-green-500">{sentAtText}</dd>
				</>
			) : null}
		</dl>
	);
}

function InteractionCardActionBar() {
	return (
		<div
			className="border-border bg-muted/30 -mx-3 -mb-4 mt-0.5 flex items-center justify-end gap-0.5 border-t px-1 py-0.5 sm:hidden [&_button]:size-10"
			role="toolbar"
			aria-label="Ações da interação"
		>
			<InteractionCardMessagePreview />
			<InteractionCardDataForNerds />
			<InteractionCardRetryButton layout="toolbar" />
		</div>
	);
}

function InteractionCardListItem() {
	return (
		<InteractionCard.Frame className="gap-0 sm:gap-2">
			<div className="flex min-w-0 flex-col gap-2.5 sm:hidden">
				<div className="flex items-start justify-between gap-3">
					<InteractionCardCampaignTitle className="line-clamp-3 text-sm leading-snug" />
					<div className="shrink-0 pt-0.5">
						<InteractionCardSentStatus />
					</div>
				</div>
				<InteractionCardClientSubtitle />
				<InteractionCardDescription />
				<InteractionCardMetaPanel />
				<InteractionCardActionBar />
			</div>

			<div className="hidden w-full min-w-0 flex-col gap-2 sm:flex">
				<InteractionCardBody>
					<InteractionCardHeader>
						<InteractionCardLeading>
							<InteractionCardCampaignTitle />
							<InteractionCardClientChip />
						</InteractionCardLeading>
						<InteractionCardActions>
							<InteractionCardMessagePreview />
							<InteractionCardDataForNerds />
							<InteractionCardRetryButton layout="inline" />
							<InteractionCardSentStatus />
						</InteractionCardActions>
					</InteractionCardHeader>
					<InteractionCardDescription />
				</InteractionCardBody>
				<InteractionCardFooter>
					<InteractionCardCreatedAt />
					<InteractionCardScheduleStatus />
				</InteractionCardFooter>
			</div>
		</InteractionCard.Frame>
	);
}

function InteractionCardClientChip() {
	const { interaction } = useInteractionCard();
	return (
		<ClientHoverCard clientId={interaction.cliente.id}>
			<Chip.Root variant="secondary" size="md" shape="xl" className="max-w-full min-w-0 shrink cursor-pointer">
				<Chip.Icon>
					<UserRound className="w-4 h-4 min-w-4 min-h-4" />
				</Chip.Icon>
				<Chip.Label caps>{interaction.cliente.nome ?? "NÃO INFORMADO"}</Chip.Label>
			</Chip.Root>
		</ClientHoverCard>
	);
}

type NerdsField = {
	label: string;
	value: string;
};

type NerdsChannelBlock = {
	key: TInteractionDeliveryChannelEnum;
	label: string;
	icon: ReactNode;
	headerClassName: string;
	iconWrapperClassName: string;
	status: string | null;
	fields: NerdsField[];
	error?: string;
};

function parseInteractionMetadata(metadados: unknown): TInteractionMetadata | null {
	const parsed = InteractionMetadataSchema.safeParse(metadados);
	return parsed.success ? parsed.data : null;
}

function channelWasTouched(metadata: TInteractionMetadata | null, channel: TInteractionDeliveryChannelEnum): boolean {
	if (!metadata) return false;
	return (
		metadata.channelsAttempted?.includes(channel) === true ||
		metadata.channelsSent?.includes(channel) === true ||
		metadata.channelsSkipped?.includes(channel) === true ||
		!!metadata.channelErrors?.[channel]
	);
}

function getChannelStatusTone(status: string | null) {
	if (!status) return "muted" as const;
	const normalized = status.toUpperCase();
	if (normalized === "FALHOU") return "destructive" as const;
	if (normalized === "ENVIADO" || normalized === "ENTREGUE" || normalized === "LIDO") return "success" as const;
	if (normalized === "PENDENTE") return "secondary" as const;
	return "outline" as const;
}

function buildWhatsappBlock(metadata: TInteractionMetadata | null): NerdsChannelBlock | null {
	if (!metadata) return null;

	const whatsappMessageId = metadata.whatsappMessageId;
	const hasWhatsappData =
		channelWasTouched(metadata, "WHATSAPP") ||
		!!whatsappMessageId ||
		!!metadata.chatMessageId ||
		!!metadata.clientMessageId ||
		!!metadata.jobId ||
		!!metadata.whatsappStatus;

	if (!hasWhatsappData) return null;

	const fields: NerdsField[] = [];
	if (whatsappMessageId) fields.push({ label: "Message ID", value: whatsappMessageId });
	if (metadata.chatMessageId) fields.push({ label: "Chat Message ID", value: String(metadata.chatMessageId) });
	if (metadata.clientMessageId) fields.push({ label: "Client Message ID", value: String(metadata.clientMessageId) });
	if (metadata.jobId) fields.push({ label: "Job ID", value: String(metadata.jobId) });

	return {
		key: "WHATSAPP",
		label: "WhatsApp",
		icon: <WhatsappIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
		headerClassName: "bg-emerald-500/10 border-emerald-500/10",
		iconWrapperClassName: "bg-emerald-500/15",
		status: metadata.whatsappStatus ?? null,
		fields,
		error: metadata.channelErrors?.WHATSAPP,
	};
}

function buildEmailBlock(metadata: TInteractionMetadata | null): NerdsChannelBlock | null {
	if (!metadata) return null;

	const hasEmailData = channelWasTouched(metadata, "EMAIL") || !!metadata.emailMessageId || !!metadata.emailStatus;

	if (!hasEmailData) return null;

	const fields: NerdsField[] = [];
	if (metadata.emailMessageId) fields.push({ label: "Message ID", value: String(metadata.emailMessageId) });

	return {
		key: "EMAIL",
		label: "E-mail",
		icon: <Mail className="h-4 w-4 text-primary" />,
		headerClassName: "bg-primary/8 border-primary/12",
		iconWrapperClassName: "bg-primary/12",
		status: metadata.emailStatus ?? null,
		fields,
		error: metadata.channelErrors?.EMAIL,
	};
}

function NerdsFieldItem({ label, value }: NerdsField) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-[0.6rem] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
			<div className="bg-secondary/60 rounded-lg px-2.5 py-2">
				<span className="text-[0.7rem] leading-snug font-medium break-all tabular-nums">{value}</span>
			</div>
		</div>
	);
}

function NerdsChannelCard({ block }: { block: NerdsChannelBlock }) {
	const statusTone = getChannelStatusTone(block.status);

	return (
		<div className="border-border/70 overflow-hidden rounded-xl border">
			<div className={cn("flex items-center justify-between gap-2 border-b px-3 py-2.5", block.headerClassName)}>
				<div className="flex min-w-0 items-center gap-2">
					<div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", block.iconWrapperClassName)}>{block.icon}</div>
					<span className="text-xs font-bold tracking-tight">{block.label}</span>
				</div>
				{block.status ? (
					<Chip.Root variant={statusTone} size="xs" shape="pill">
						<Chip.Label caps weight="bold">
							{block.status}
						</Chip.Label>
					</Chip.Root>
				) : (
					<Chip.Root variant="muted" size="xs" shape="pill">
						<Chip.Label caps weight="bold">
							Sem status
						</Chip.Label>
					</Chip.Root>
				)}
			</div>
			<div className="flex flex-col gap-2.5 p-3">
				{block.fields.length > 0 ? (
					block.fields.map((field) => <NerdsFieldItem key={field.label} {...field} />)
				) : (
					<p className="text-[0.7rem] text-muted-foreground">Nenhum identificador de envio registrado para este canal.</p>
				)}
				{block.error ? (
					<div className="bg-destructive/8 border-destructive/15 rounded-lg border px-2.5 py-2">
						<span className="text-[0.6rem] font-extrabold tracking-[0.08em] text-destructive uppercase">Erro</span>
						<p className="mt-1 text-[0.7rem] leading-snug text-destructive">{block.error}</p>
					</div>
				) : null}
			</div>
		</div>
	);
}

function InteractionCardMessagePreview({ className }: { className?: string }) {
	const { interaction } = useInteractionCard();
	const templateContent = interaction.campanha?.whatsappTemplate?.conteudo ?? null;

	const variables = useMemo(
		() =>
			buildInteractionMessageVariables({
				client: interaction.cliente,
				contextMetadados: (interaction.metadados ?? undefined) as TInteractionContextMetadados | undefined,
			}),
		[interaction.cliente, interaction.metadados],
	);

	if (!templateContent) return null;

	return (
		<HoverOrPopover
			align="end"
			side="bottom"
			hoverOpenDelay={200}
			hoverCloseDelay={100}
			className="max-h-[70vh] w-[min(360px,calc(100vw-2rem))] overflow-auto p-2 scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30"
			trigger={
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", className)}
					aria-label="Preview da mensagem"
				>
					<Eye className="h-4 w-4" />
				</Button>
			}
		>
			<TemplatePreview content={templateContent} variables={variables} compact />
		</HoverOrPopover>
	);
}

function InteractionCardDataForNerds({ className }: { className?: string }) {
	const { interaction } = useInteractionCard();
	const metadata = parseInteractionMetadata(interaction.metadados);
	const channelBlocks = [buildWhatsappBlock(metadata), buildEmailBlock(metadata)].filter((block): block is NerdsChannelBlock => block !== null);

	return (
		<HoverOrPopover
			align="end"
			side="bottom"
			hoverOpenDelay={200}
			hoverCloseDelay={100}
			className="max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-auto p-0"
			trigger={
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", className)}
					aria-label="Data for nerds"
				>
					<Code className="h-4 w-4" />
				</Button>
			}
		>
			<div className="border-border bg-secondary/40 border-b px-4 py-3">
				<div className="flex items-center gap-2">
					<div className="bg-background flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 shadow-xs">
						<Code className="h-3.5 w-3.5 text-muted-foreground" />
					</div>
					<div className="flex flex-col">
						<span className="text-[0.6rem] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Debug</span>
						<span className="text-sm leading-tight font-bold tracking-tight">Data for nerds</span>
					</div>
				</div>
			</div>

			<div className="flex flex-col gap-3 p-3">
				<NerdsFieldItem label="Interação" value={interaction.id} />

				{channelBlocks.length > 0 ? (
					channelBlocks.map((block) => <NerdsChannelCard key={block.key} block={block} />)
				) : (
					<div className="border-border/70 bg-secondary/30 rounded-xl border px-3 py-4 text-center">
						<p className="text-[0.7rem] text-muted-foreground">Nenhum dado de canal disponível para esta interação.</p>
					</div>
				)}
			</div>
		</HoverOrPopover>
	);
}

function InteractionCardSentStatus() {
	const { interaction } = useInteractionCard();
	const sentStatusConfig = useMemo(() => {
		return InteractionsSentStatusOptions.find((status) => status.value === interaction.statusEnvio);
	}, [interaction.statusEnvio]);

	if (!sentStatusConfig) return null;

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger
					render={
						<Chip.Root variant="ghost" size="sm" shape="pill" className={cn(sentStatusConfig.className, "border-none")}>
							<Chip.Icon>
								{isValidElement<{ className?: string }>(sentStatusConfig.icon)
									? cloneElement(sentStatusConfig.icon, {
											className: cn("w-4 h-4 min-w-4 min-h-4", sentStatusConfig.icon.props.className),
										})
									: sentStatusConfig.icon}
							</Chip.Icon>
							<Chip.Label caps weight="bold">
								{sentStatusConfig.label}
							</Chip.Label>
						</Chip.Root>
					}
				/>
				<TooltipContent>
					<p className="text-xs block py-0.5 text-center italic font-medium leading-tight">
						{sentStatusConfig.message(interaction.erroEnvio || undefined)}
					</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

function InteractionCardRetryButton({ layout = "inline" }: { layout?: "inline" | "toolbar" }) {
	const { interaction } = useInteractionCard();
	const queryClient = useQueryClient();
	const { mutate: handleRetryInteraction, isPending: retryIsPending } = useMutation({
		mutationKey: ["retry-campaign-interaction", interaction.id],
		mutationFn: async () => await retryCampaignInteraction({ interactionId: interaction.id }),
		onSuccess: async (response) => {
			// O endpoint responde 200 mesmo quando o reenvio não foi executado (reenviada: false)
			if (response.data.reenviada) toast.success(response.message);
			else toast.error(response.message);
			await queryClient.invalidateQueries({ queryKey: ["campaign-interactions-logs"] });
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	if (interaction.statusEnvio !== "FALHOU") return null;

	return (
		<Button
			type="button"
			size={layout === "toolbar" ? "icon" : "sm"}
			variant="ghost"
			onClick={() => handleRetryInteraction()}
			disabled={retryIsPending}
			aria-label={retryIsPending ? "Reenviando interação" : "Reenviar interação"}
			className={cn("text-muted-foreground hover:text-foreground", layout === "toolbar" ? "size-10 shrink-0" : "h-7 gap-1.5 px-2.5 text-xs font-bold")}
		>
			<RefreshCw
				className={cn("size-4 shrink-0", {
					"animate-spin": retryIsPending,
				})}
			/>
			{layout === "inline" ? <span className="hidden sm:inline">{retryIsPending ? "REENVIANDO..." : "REENVIAR"}</span> : null}
		</Button>
	);
}

function InteractionCardCreatedAt() {
	const { interaction } = useInteractionCard();
	return (
		<div className="flex min-w-0 items-center gap-2">
			<div className="flex min-w-0 items-center gap-1.5">
				<BsCalendarPlus className="h-4 w-4 min-h-4 min-w-4 shrink-0" />
				<h2 className="min-w-0 py-0.5 text-left text-[0.65rem] font-medium break-words italic">
					DATA DE CRIAÇÃO: {formatDateAsLocale(interaction.dataInsercao, true)}
				</h2>
			</div>
		</div>
	);
}

function InteractionCardScheduleStatus() {
	const { interaction } = useInteractionCard();
	const sentAt = interaction.dataEnvio ?? interaction.dataExecucao;
	const executionDateText = sentAt ? formatDateAsLocale(sentAt, true) : "Não enviada";

	if (sentAt) {
		return (
			<Chip.Root variant="success" size="sm" shape="pill" className="max-w-full min-w-0 shrink whitespace-normal sm:whitespace-nowrap">
				<Chip.Icon>
					<CalendarCheck className="w-4 h-4 min-w-4 min-h-4" />
				</Chip.Icon>
				<Chip.Label className="block py-0.5 text-left text-xs leading-tight font-medium italic sm:text-center">{executionDateText}</Chip.Label>
			</Chip.Root>
		);
	}

	return (
		<Chip.Root
			variant="secondary"
			size="sm"
			shape="pill"
			className="max-w-full min-w-0 shrink px-2 py-1 whitespace-normal sm:px-3 sm:py-1.5 sm:whitespace-nowrap"
		>
			<Chip.Icon>
				<Calendar className="w-4 h-4 min-w-4 min-h-4" />
			</Chip.Icon>
			<Chip.Label className="block py-0.5 text-left text-xs leading-tight font-medium italic sm:text-center">{executionDateText}</Chip.Label>
		</Chip.Root>
	);
}

export const InteractionCard = {
	Provider: InteractionCardProvider,
	Frame: InteractionCardFrame,
	Body: InteractionCardBody,
	Header: InteractionCardHeader,
	Leading: InteractionCardLeading,
	Actions: InteractionCardActions,
	Description: InteractionCardDescription,
	Footer: InteractionCardFooter,
	CampaignTitle: InteractionCardCampaignTitle,
	ClientChip: InteractionCardClientChip,
	ClientSubtitle: InteractionCardClientSubtitle,
	MetaPanel: InteractionCardMetaPanel,
	ActionBar: InteractionCardActionBar,
	ListItem: InteractionCardListItem,
	MessagePreview: InteractionCardMessagePreview,
	DataForNerds: InteractionCardDataForNerds,
	SentStatus: InteractionCardSentStatus,
	RetryButton: InteractionCardRetryButton,
	CreatedAt: InteractionCardCreatedAt,
	ScheduleStatus: InteractionCardScheduleStatus,
};

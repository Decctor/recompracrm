"use client";

import type { TGetCampaignsOutputById } from "@/app/api/campaigns/route";
import { getCategoryById, getCategoryFromTrigger } from "@/app/dashboard/growth/campaigns/_module/builder/helpers/categories";
import { getTriggerMeta } from "@/app/dashboard/growth/campaigns/_module/builder/helpers/triggers";
import { CampaignTemplateSwitcher } from "@/app/dashboard/growth/campaigns/_module/detail/components/campaign-template-switcher";
import {
	DayWindowStrip,
	NextDispatchCard,
	ReceiveTimeline,
	formatHourWindow,
} from "@/app/dashboard/growth/campaigns/_module/detail/components/send-timing";
import { getTriggerConfigSummary } from "@/app/dashboard/growth/campaigns/_module/detail/helpers/trigger-config-summary";
import ControlCampaign from "@/app/dashboard/growth/campaigns/_module/shared/form/ControlCampaign";
import { buildOrganizationTemplateTheme } from "@/components/MessageTemplates/message-template-utils";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatToMoney } from "@/lib/formatting";
import { getSurveyButtons } from "@/lib/message-templates/surveys";
import { cn } from "@/lib/utils";
import type { TAttributionModelEnum } from "@/schemas/enums";
import { getRFMConfigByLabel } from "@/utils/rfm";
import {
	ArrowRightLeft,
	CalendarClock,
	Clock,
	Coins,
	Filter,
	Lock,
	Pencil,
	Repeat,
	SendHorizonal,
	Settings2,
	SlidersHorizontal,
	TextIcon,
	Ticket,
	Users,
	Zap,
} from "lucide-react";
import { type ComponentType, type ReactNode, useState } from "react";

type CampaignConfigViewProps = {
	campaign: TGetCampaignsOutputById;
	sessionUser: TAuthUserSession["user"];
	sessionUserOrg: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	onEditCallbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

type OpenSection = "general" | "send" | "audience" | "effects" | "settings" | null;

const ATTRIBUTION_MODEL_LABELS: Record<TAttributionModelEnum, string> = {
	LAST_TOUCH: "Último toque",
	FIRST_TOUCH: "Primeiro toque",
	LINEAR: "Linear",
};

const SCHEDULED_TRIGGERS = new Set(["RECORRENTE", "USO-UNICO", "PROMOCAO-PRODUTOS", "PESQUISA"]);

function formatInterval(value: number | null | undefined, unit: string | null | undefined) {
	if (value === null || value === undefined) return "Não definido";
	return `${value} ${(unit ?? "DIAS").toLowerCase()}`;
}

function SegmentationPill({ label }: { label: string }) {
	const rfmConfig = getRFMConfigByLabel(label);

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-lg border border-transparent px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase",
				rfmConfig.backgroundCollor,
				rfmConfig.textCollor,
			)}
		>
			{label}
		</span>
	);
}

/** Um campo da configuração: ícone em caixa, rótulo pequeno e o valor. */
function ConfigItem({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: ReactNode }) {
	return (
		<div className="flex min-w-0 items-start gap-2.5">
			<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
				<Icon className="size-4 min-h-4 min-w-4" />
			</span>
			<div className="flex min-w-0 flex-col">
				<span className="text-label text-muted-foreground">{label}</span>
				<span className="text-sm font-semibold break-words">{value}</span>
			</div>
		</div>
	);
}

function ConfigGrid({ children }: { children: ReactNode }) {
	return <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

// Pergunta → respostas como o cliente vê: cada botão do template e a opção que ele grava no campo.
function SurveyAnswersMapping({
	content,
	field,
}: {
	content: NonNullable<TGetCampaignsOutputById["whatsappTemplate"]>["conteudo"];
	field: TGetCampaignsOutputById["pesquisaCampo"];
}) {
	const surveyButtons = getSurveyButtons(content);
	if (surveyButtons.length === 0) return null;
	const titlesByValue = new Map((field?.opcoes ?? []).map((option) => [option.valor, option.titulo]));
	return (
		<div className="flex w-full flex-col gap-1">
			<span className="text-label text-muted-foreground">Respostas</span>
			<ul className="flex flex-col gap-1">
				{surveyButtons.map((button) => (
					<li
						key={button.opcaoValor}
						className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
					>
						<span className="font-medium">{button.texto}</span>
						<span className="text-muted-foreground">
							grava <strong className="text-foreground">{titlesByValue.get(button.opcaoValor) ?? button.opcaoValor}</strong>
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function EditAction({ onClick }: { onClick: () => void }) {
	return (
		<Button variant="ghost" size="xs" onClick={onClick} className="flex items-center gap-1">
			<Pencil className="size-3.5 min-h-3.5 min-w-3.5" />
			EDITAR
		</Button>
	);
}

export default function CampaignConfigView({ campaign, sessionUser, sessionUserOrg, onEditCallbacks }: CampaignConfigViewProps) {
	const [openSection, setOpenSection] = useState<OpenSection>(null);

	const category = getCategoryById(getCategoryFromTrigger(campaign.gatilhoTipo));
	const trigger = getTriggerMeta(campaign.gatilhoTipo);
	const TriggerIcon = trigger?.icon ?? Zap;
	const isScheduled = SCHEDULED_TRIGGERS.has(campaign.gatilhoTipo);

	const activeSegmentations = campaign.segmentacoes ?? [];
	const filterCount = campaign.filtros && Array.isArray(campaign.filtros.itens) ? campaign.filtros.itens.length : 0;
	const templateContent = campaign.whatsappTemplate?.conteudo ?? null;
	const organizationTheme = buildOrganizationTemplateTheme({
		name: sessionUserOrg.nome,
		logoUrl: sessionUserOrg.logoUrl,
		primaryColor: sessionUserOrg.corPrimaria,
		primaryForeground: sessionUserOrg.corPrimariaForeground,
		secondaryColor: sessionUserOrg.corSecundaria,
		secondaryForeground: sessionUserOrg.corSecundariaForeground,
	});
	const senderPhone = campaign.whatsappConexaoTelefone
		? `(${campaign.whatsappConexaoTelefone.numero}) ${campaign.whatsappConexaoTelefone.nome}`
		: null;
	const triggerSummary = getTriggerConfigSummary(campaign);
	const labeledTriggerItems = triggerSummary.filter((item) => item.label);
	const triggerNotes = triggerSummary.filter((item) => !item.label);

	function closeModal() {
		setOpenSection(null);
	}

	return (
		<div className="flex w-full flex-col gap-3">
			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<TextIcon />
					</Section.Icon>
					<Section.Title>Informações gerais</Section.Title>
					<Section.Actions>
						<EditAction onClick={() => setOpenSection("general")} />
					</Section.Actions>
				</Section.Header>
				<Section.Body>
					<div className="flex flex-col gap-4">
						<ConfigItem icon={TextIcon} label="Título" value={campaign.titulo} />
						<ConfigItem icon={TextIcon} label="Descrição" value={campaign.descricao || "Nenhuma descrição definida."} />
					</div>
				</Section.Body>
			</Section.Root>

			<div className="grid w-full grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
				<Section.Root>
					<Section.Header>
						<Section.Icon>
							<TriggerIcon />
						</Section.Icon>
						<Section.Title>Gatilho</Section.Title>
						<Section.Actions>
							<span className="flex items-center gap-1 text-[0.7rem] font-bold text-muted-foreground uppercase">
								<Lock className="size-3.5" />
								Fixo
							</span>
						</Section.Actions>
					</Section.Header>
					<Section.Body>
						<ConfigGrid>
							<ConfigItem icon={Zap} label="Categoria" value={category?.label ?? "Não definida"} />
							<ConfigItem icon={TriggerIcon} label="Gatilho" value={trigger?.label ?? campaign.gatilhoTipo} />
							{labeledTriggerItems.map((item) => (
								<ConfigItem key={item.label} icon={SlidersHorizontal} label={item.label ?? ""} value={item.value} />
							))}
						</ConfigGrid>
						{triggerNotes.map((item) => (
							<p key={item.value} className="text-sm font-medium">
								{item.value}
							</p>
						))}
						{trigger?.description ? <p className="text-xs leading-snug text-muted-foreground">{trigger.description}</p> : null}
						{campaign.gatilhoTipo === "PESQUISA" && templateContent ? (
							<SurveyAnswersMapping content={templateContent} field={campaign.pesquisaCampo ?? null} />
						) : null}
						<div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
							<Lock className="mt-0.5 size-3.5 min-h-3.5 min-w-3.5 text-muted-foreground" />
							<p className="text-xs leading-snug text-muted-foreground">
								O gatilho não pode ser alterado após a criação. Para usar outro gatilho, crie uma nova campanha.
							</p>
						</div>
					</Section.Body>
				</Section.Root>
				<Section.Root>
					<Section.Header>
						<Section.Icon>
							<Filter />
						</Section.Icon>
						<Section.Title>Público</Section.Title>
						<Section.Actions>
							<EditAction onClick={() => setOpenSection("audience")} />
						</Section.Actions>
					</Section.Header>
					<Section.Body>
						<ConfigGrid>
							<ConfigItem
								icon={Users}
								label="Segmentações"
								value={activeSegmentations.length > 0 ? `${activeSegmentations.length} ativa(s)` : "Todos os clientes"}
							/>
							<ConfigItem icon={Filter} label="Filtros adicionais" value={filterCount > 0 ? `${filterCount} no grupo principal` : "Nenhum filtro"} />
						</ConfigGrid>
						{activeSegmentations.length > 0 ? (
							<div className="flex flex-wrap gap-1.5">
								{activeSegmentations.map((segmentation) => (
									<SegmentationPill key={segmentation.id ?? segmentation.segmentacao} label={segmentation.segmentacao} />
								))}
							</div>
						) : null}
					</Section.Body>
				</Section.Root>
			</div>

			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<SendHorizonal />
					</Section.Icon>
					<Section.Title>Mensagem & envio</Section.Title>
					<Section.Actions>
						<EditAction onClick={() => setOpenSection("send")} />
					</Section.Actions>
				</Section.Header>
				<Section.Body>
					<div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
						<div className="flex flex-col gap-5">
							<ConfigGrid>
								<ConfigItem icon={SendHorizonal} label="Template" value={campaign.whatsappTemplate?.nome ?? "Template não selecionado"} />
								<ConfigItem icon={Users} label="Remetente WhatsApp" value={senderPhone ?? "Sem remetente definido"} />
								<ConfigItem icon={Clock} label="Janela de envio" value={formatHourWindow(campaign.execucaoAgendadaBloco)} />
								{!isScheduled ? (
									<ConfigItem
										icon={Clock}
										label="Intervalo de execução"
										value={
											(campaign.execucaoAgendadaValor ?? 0) > 0
												? `${formatInterval(campaign.execucaoAgendadaValor, campaign.execucaoAgendadaMedida)} ${campaign.execucaoAgendadaDirecao === "ANTES" ? "antes" : "depois"} do evento`
												: "Imediato, logo após o evento"
										}
									/>
								) : null}
							</ConfigGrid>
							<div className="flex flex-col gap-4 border-t border-border pt-4">
								<DayWindowStrip block={campaign.execucaoAgendadaBloco} appliesOnlyToDelayed={!isScheduled} />
								<ReceiveTimeline campaign={campaign} />
								<NextDispatchCard campaign={campaign} />
							</div>
						</div>
						<div className="lg:border-l lg:border-border lg:pl-6">
							<CampaignTemplateSwitcher
								campaign={campaign}
								organization={{ id: sessionUserOrg.id, nome: sessionUserOrg.nome, logoUrl: sessionUserOrg.logoUrl }}
								organizationTheme={organizationTheme}
							/>
						</div>
					</div>
				</Section.Body>
			</Section.Root>

			<div className="grid w-full grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
				<Section.Root>
					<Section.Header>
						<Section.Icon>
							<Coins />
						</Section.Icon>
						<Section.Title>Efeitos / cashback</Section.Title>
						<Section.Actions>
							<EditAction onClick={() => setOpenSection("effects")} />
						</Section.Actions>
					</Section.Header>
					<Section.Body>
						<ConfigGrid>
							<ConfigItem
								icon={Coins}
								label="Geração de cashback"
								value={
									campaign.cashbackGeracaoAtivo
										? campaign.cashbackGeracaoTipo === "PERCENTUAL"
											? `${campaign.cashbackGeracaoValor ?? 0}% do valor da venda`
											: `${formatToMoney(campaign.cashbackGeracaoValor ?? 0)} fixo`
										: "Não gera cashback"
								}
							/>
							<ConfigItem
								icon={Clock}
								label="Expiração do cashback"
								value={
									campaign.cashbackGeracaoAtivo
										? campaign.cashbackGeracaoExpiracaoValor
											? formatInterval(campaign.cashbackGeracaoExpiracaoValor, campaign.cashbackGeracaoExpiracaoMedida)
											: "Padrão (30 dias)"
										: "—"
								}
							/>
							<ConfigItem
								icon={Ticket}
								label="Atribuição de cupom"
								value={campaign.cupomGeracaoAtivo ? "Atribui cupom individual ao disparar" : "Não atribui cupom"}
							/>
							{campaign.cupomGeracaoAtivo ? (
								<ConfigItem
									icon={Clock}
									label="Expiração da atribuição"
									value={
										campaign.cupomGeracaoExpiracaoValor
											? formatInterval(campaign.cupomGeracaoExpiracaoValor, campaign.cupomGeracaoExpiracaoMedida)
											: "Vigência do cupom"
									}
								/>
							) : null}
						</ConfigGrid>
					</Section.Body>
				</Section.Root>
				<Section.Root>
					<Section.Header>
						<Section.Icon>
							<Settings2 />
						</Section.Icon>
						<Section.Title>Conversão & ajustes</Section.Title>
						<Section.Actions>
							<EditAction onClick={() => setOpenSection("settings")} />
						</Section.Actions>
					</Section.Header>
					<Section.Body>
						<ConfigGrid>
							<ConfigItem
								icon={ArrowRightLeft}
								label="Modelo de atribuição"
								value={ATTRIBUTION_MODEL_LABELS[campaign.atribuicaoModelo] ?? campaign.atribuicaoModelo}
							/>
							<ConfigItem icon={CalendarClock} label="Janela de atribuição" value={`${campaign.atribuicaoJanelaDias ?? 0} dias`} />
							<ConfigItem
								icon={Repeat}
								label="Recorrência por cliente"
								value={
									campaign.permitirRecorrencia
										? `A cada ${formatInterval(campaign.frequenciaIntervaloValor, campaign.frequenciaIntervaloMedida)}`
										: "Não permite repetição"
								}
							/>
							<ConfigItem
								icon={SendHorizonal}
								label="Limite semanal de envios"
								value={campaign.limiteEnviosSemanais ? `${campaign.limiteEnviosSemanais} por semana` : "Sem limite"}
							/>
						</ConfigGrid>
					</Section.Body>
				</Section.Root>
			</div>

			{openSection ? (
				<ControlCampaign
					sessionUser={sessionUser}
					sessionUserOrg={sessionUserOrg}
					campaignId={campaign.id}
					closeModal={closeModal}
					section={openSection}
					callbacks={onEditCallbacks}
				/>
			) : null}
		</div>
	);
}

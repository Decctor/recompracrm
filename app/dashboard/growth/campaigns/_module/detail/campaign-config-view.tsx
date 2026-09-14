"use client";

import type { TGetCampaignsOutputById } from "@/app/api/campaigns/route";
import { getTriggerConfigSummary } from "@/app/dashboard/growth/campaigns/_module/detail/helpers/trigger-config-summary";
import { getCategoryById, getCategoryFromTrigger } from "@/app/dashboard/growth/campaigns/_module/builder/helpers/categories";
import { getTriggerMeta } from "@/app/dashboard/growth/campaigns/_module/builder/helpers/triggers";
import ControlCampaign from "@/app/dashboard/growth/campaigns/_module/shared/form/ControlCampaign";
import TemplatePreview from "@/components/MessageTemplates/TemplatePreview";
import { buildOrganizationTemplateTheme } from "@/components/MessageTemplates/message-template-utils";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { DataList } from "@/components/ui/data-list";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatToMoney } from "@/lib/formatting";
import type { TAttributionModelEnum } from "@/schemas/enums";
import { cn } from "@/lib/utils";
import { getRFMConfigByLabel } from "@/utils/rfm";
import { ArrowRightLeft, Clock, Coins, Eye, Filter, Lock, Pencil, SendHorizonal, Settings2, TextIcon, Ticket, Users, Zap } from "lucide-react";
import { useState } from "react";

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

function formatInterval(value: number | null | undefined, unit: string | null | undefined) {
	if (value === null || value === undefined) return "Não definido";
	return `${value} ${(unit ?? "DIAS").toLowerCase()}`;
}

function SegmentationPill({ label }: { label: string }) {
	const rfmConfig = getRFMConfigByLabel(label);

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-lg border border-transparent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
				rfmConfig.backgroundCollor,
				rfmConfig.textCollor,
			)}
		>
			{label}
		</span>
	);
}

function EditAction({ onClick }: { onClick: () => void }) {
	return (
		<Button variant="ghost" size="xs" onClick={onClick} className="flex items-center gap-1">
			<Pencil className="h-4 w-4 min-h-4 min-w-4" />
			EDITAR
		</Button>
	);
}

export default function CampaignConfigView({ campaign, sessionUser, sessionUserOrg, onEditCallbacks }: CampaignConfigViewProps) {
	const [openSection, setOpenSection] = useState<OpenSection>(null);

	const category = getCategoryById(getCategoryFromTrigger(campaign.gatilhoTipo));
	const trigger = getTriggerMeta(campaign.gatilhoTipo);
	const TriggerIcon = trigger?.icon ?? Zap;

	const activeSegmentations = campaign.segmentacoes ?? [];
	const isRecurrentLike =
		campaign.gatilhoTipo === "RECORRENTE" || campaign.gatilhoTipo === "USO-UNICO" || campaign.gatilhoTipo === "PROMOCAO-PRODUTOS";

	const templateName = campaign.whatsappTemplate?.nome ?? null;
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

	function closeModal() {
		setOpenSection(null);
	}

	return (
		<div className="flex w-full flex-col gap-3">
			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<TextIcon className="h-4 w-4 min-h-4 min-w-4" />
					</Section.Icon>
					<Section.Title>INFORMAÇÕES GERAIS</Section.Title>
					<Section.Actions>
						<EditAction onClick={() => setOpenSection("general")} />
					</Section.Actions>
				</Section.Header>
				<Section.Body>
					<div className="flex w-full flex-col gap-2">
						<DataList.Line icon={<TextIcon className="h-4 w-4 min-h-4 min-w-4" />} label="TÍTULO" value={campaign.titulo} />
						<div className="flex w-full flex-col gap-0.5">
							<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">DESCRIÇÃO</h3>
							<p className="text-sm font-medium tracking-tight text-foreground">{campaign.descricao || "Nenhuma descrição definida..."}</p>
						</div>
					</div>
				</Section.Body>
			</Section.Root>

			<div className="w-full flex flex-col lg:flex-row gap-3">
				<div className="w-full lg:w-1/2">
					<Section.Root>
						<Section.Header>
							<Section.Icon>
								<TriggerIcon className="h-4 w-4 min-h-4 min-w-4" />
							</Section.Icon>
							<Section.Title>GATILHO</Section.Title>
						</Section.Header>
						<Section.Body>
							<div className="flex w-full flex-col gap-2">
								<DataList.Line icon={<Zap className="h-4 w-4 min-h-4 min-w-4" />} label="CATEGORIA" value={category?.label ?? "Não definida"} />
								<DataList.Line icon={<TriggerIcon className="h-4 w-4 min-h-4 min-w-4" />} label="GATILHO" value={trigger?.label ?? campaign.gatilhoTipo} />
								{triggerSummary.length > 0 ? (
									<div className="flex w-full flex-col gap-1">
										<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">CONFIGURAÇÃO</h3>
										{triggerSummary.map((line) => (
											<p key={line} className="text-sm font-medium tracking-tight text-foreground">
												{line}
											</p>
										))}
									</div>
								) : null}
								{trigger?.description ? <p className="text-xs leading-snug text-muted-foreground">{trigger.description}</p> : null}
							</div>
							<div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
								<Lock className="mt-0.5 h-3.5 w-3.5 min-h-3.5 min-w-3.5 text-muted-foreground" />
								<p className="text-xs leading-snug text-muted-foreground">
									O gatilho não pode ser alterado após a criação. Para usar outro gatilho, crie uma nova campanha.
								</p>
							</div>
						</Section.Body>
					</Section.Root>
				</div>
				<div className="w-full lg:w-1/2">
					<Section.Root>
						<Section.Header>
							<Section.Icon>
								<Filter className="h-4 w-4 min-h-4 min-w-4" />
							</Section.Icon>
							<Section.Title>PÚBLICO</Section.Title>
							<Section.Actions>
								<EditAction onClick={() => setOpenSection("audience")} />
							</Section.Actions>
						</Section.Header>
						<Section.Body>
							<div className="flex w-full flex-col gap-2">
								<DataList.Line
									icon={<Users className="h-4 w-4 min-h-4 min-w-4" />}
									label="SEGMENTAÇÕES"
									value={activeSegmentations.length > 0 ? `${activeSegmentations.length} ativa(s)` : "Todos os clientes"}
								/>
								{activeSegmentations.length > 0 ? (
									<div className="flex flex-wrap gap-1.5">
										{activeSegmentations.map((segmentation) => (
											<SegmentationPill key={segmentation.id ?? segmentation.segmentacao} label={segmentation.segmentacao} />
										))}
									</div>
								) : null}
								<DataList.Line
									icon={<Filter className="h-4 w-4 min-h-4 min-w-4" />}
									label="FILTROS ADICIONAIS"
									value={
										campaign.filtros && Array.isArray(campaign.filtros.itens) && campaign.filtros.itens.length > 0
											? `${campaign.filtros.itens.length} no grupo principal`
											: "Nenhum filtro"
									}
								/>
							</div>
						</Section.Body>
					</Section.Root>
				</div>
			</div>
			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<SendHorizonal className="h-4 w-4 min-h-4 min-w-4" />
					</Section.Icon>
					<Section.Title>MENSAGEM & ENVIO</Section.Title>
					<Section.Actions>
						<EditAction onClick={() => setOpenSection("send")} />
					</Section.Actions>
				</Section.Header>
				<Section.Body>
					<div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start">
						<div className="flex w-full flex-col gap-2 lg:w-3/5">
							<DataList.Line
								icon={<SendHorizonal className="h-4 w-4 min-h-4 min-w-4" />}
								label="TEMPLATE"
								value={templateName ?? "Template não selecionado"}
							/>
							<DataList.Line
								icon={<Users className="h-4 w-4 min-h-4 min-w-4" />}
								label="REMETENTE WHATSAPP"
								value={senderPhone ?? "Sem remetente definido"}
							/>
							<DataList.Line icon={<Clock className="h-4 w-4 min-h-4 min-w-4" />} label="FAIXA DE HORÁRIO" value={campaign.execucaoAgendadaBloco} />
							{!isRecurrentLike ? (
								<DataList.Line
									icon={<Clock className="h-4 w-4 min-h-4 min-w-4" />}
									label="INTERVALO DE EXECUÇÃO"
									value={`${formatInterval(campaign.execucaoAgendadaValor, campaign.execucaoAgendadaMedida)} ${campaign.execucaoAgendadaDirecao === "ANTES" ? "antes" : "depois"} do evento`}
								/>
							) : null}
						</div>
						{templateContent ? (
							<div className="flex w-full flex-col gap-2 lg:w-2/5 lg:shrink-0">
								<div className="flex items-center gap-2">
									<Eye className="h-4 w-4 min-h-4 min-w-4 text-muted-foreground" />
									<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">PREVIEW DO TEMPLATE</h3>
								</div>
								<TemplatePreview content={templateContent} organizationTheme={organizationTheme} compact />
							</div>
						) : null}
					</div>
				</Section.Body>
			</Section.Root>
			<div className="w-full flex flex-col lg:flex-row gap-3">
				<div className="w-full lg:w-1/2">
					<Section.Root>
						<Section.Header>
							<Section.Icon>
								<Coins className="h-4 w-4 min-h-4 min-w-4" />
							</Section.Icon>
							<Section.Title>EFEITOS / CASHBACK</Section.Title>
							<Section.Actions>
								<EditAction onClick={() => setOpenSection("effects")} />
							</Section.Actions>
						</Section.Header>
						<Section.Body>
							<div className="flex w-full flex-col gap-2">
								{campaign.cashbackGeracaoAtivo ? (
									<>
										<DataList.Line
											icon={<Coins className="h-4 w-4 min-h-4 min-w-4" />}
											label="GERAÇÃO DE CASHBACK"
											value={
												campaign.cashbackGeracaoTipo === "PERCENTUAL"
													? `${campaign.cashbackGeracaoValor ?? 0}% do valor da venda`
													: `${formatToMoney(campaign.cashbackGeracaoValor ?? 0)} fixo`
											}
										/>
										<DataList.Line
											icon={<Clock className="h-4 w-4 min-h-4 min-w-4" />}
											label="EXPIRAÇÃO"
											value={
												campaign.cashbackGeracaoExpiracaoValor
													? formatInterval(campaign.cashbackGeracaoExpiracaoValor, campaign.cashbackGeracaoExpiracaoMedida)
													: "Padrão (30 dias)"
											}
										/>
									</>
								) : (
									<DataList.Line icon={<Coins className="h-4 w-4 min-h-4 min-w-4" />} label="GERAÇÃO DE CASHBACK" value="Não gera cashback" />
								)}
								{campaign.cupomGeracaoAtivo ? (
									<>
										<DataList.Line
											icon={<Ticket className="h-4 w-4 min-h-4 min-w-4" />}
											label="ATRIBUIÇÃO DE CUPOM"
											value="Atribui cupom individual ao disparar"
										/>
										<DataList.Line
											icon={<Clock className="h-4 w-4 min-h-4 min-w-4" />}
											label="EXPIRAÇÃO DA ATRIBUIÇÃO"
											value={
												campaign.cupomGeracaoExpiracaoValor
													? formatInterval(campaign.cupomGeracaoExpiracaoValor, campaign.cupomGeracaoExpiracaoMedida)
													: "Vigência do cupom"
											}
										/>
									</>
								) : (
									<DataList.Line icon={<Ticket className="h-4 w-4 min-h-4 min-w-4" />} label="ATRIBUIÇÃO DE CUPOM" value="Não atribui cupom" />
								)}
							</div>
						</Section.Body>
					</Section.Root>
				</div>
				<div className="w-full lg:w-1/2">
					<Section.Root>
						<Section.Header>
							<Section.Icon>
								<Settings2 className="h-4 w-4 min-h-4 min-w-4" />
							</Section.Icon>
							<Section.Title>CONVERSÃO & AJUSTES</Section.Title>
							<Section.Actions>
								<EditAction onClick={() => setOpenSection("settings")} />
							</Section.Actions>
						</Section.Header>
						<Section.Body>
							<div className="flex w-full flex-col gap-2">
								<DataList.Line
									icon={<ArrowRightLeft className="h-4 w-4 min-h-4 min-w-4" />}
									label="MODELO DE ATRIBUIÇÃO"
									value={ATTRIBUTION_MODEL_LABELS[campaign.atribuicaoModelo] ?? campaign.atribuicaoModelo}
								/>
								<DataList.Line
									icon={<Clock className="h-4 w-4 min-h-4 min-w-4" />}
									label="JANELA DE ATRIBUIÇÃO"
									value={`${campaign.atribuicaoJanelaDias ?? 0} dias`}
								/>
								<DataList.Line
									icon={<Settings2 className="h-4 w-4 min-h-4 min-w-4" />}
									label="RECORRÊNCIA POR CLIENTE"
									value={
										campaign.permitirRecorrencia
											? `A cada ${formatInterval(campaign.frequenciaIntervaloValor, campaign.frequenciaIntervaloMedida)}`
											: "Não permite repetição"
									}
								/>
								<DataList.Line
									icon={<SendHorizonal className="h-4 w-4 min-h-4 min-w-4" />}
									label="LIMITE SEMANAL DE ENVIOS"
									value={campaign.limiteEnviosSemanais ? `${campaign.limiteEnviosSemanais} por semana` : "Sem limite"}
								/>
							</div>
						</Section.Body>
					</Section.Root>
				</div>
			</div>

			{openSection === "general" ? (
				<ControlCampaign
					sessionUser={sessionUser}
					sessionUserOrg={sessionUserOrg}
					campaignId={campaign.id}
					closeModal={closeModal}
					section="general"
					callbacks={onEditCallbacks}
				/>
			) : null}
			{openSection === "send" ? (
				<ControlCampaign
					sessionUser={sessionUser}
					sessionUserOrg={sessionUserOrg}
					campaignId={campaign.id}
					closeModal={closeModal}
					callbacks={onEditCallbacks}
					section="send"
				/>
			) : null}
			{openSection === "audience" ? (
				<ControlCampaign
					sessionUser={sessionUser}
					sessionUserOrg={sessionUserOrg}
					campaignId={campaign.id}
					closeModal={closeModal}
					section="audience"
					callbacks={onEditCallbacks}
				/>
			) : null}
			{openSection === "effects" ? (
				<ControlCampaign
					sessionUser={sessionUser}
					sessionUserOrg={sessionUserOrg}
					campaignId={campaign.id}
					closeModal={closeModal}
					section="effects"
					callbacks={onEditCallbacks}
				/>
			) : null}
			{openSection === "settings" ? (
				<ControlCampaign
					sessionUser={sessionUser}
					sessionUserOrg={sessionUserOrg}
					campaignId={campaign.id}
					closeModal={closeModal}
					section="settings"
					callbacks={onEditCallbacks}
				/>
			) : null}
		</div>
	);
}

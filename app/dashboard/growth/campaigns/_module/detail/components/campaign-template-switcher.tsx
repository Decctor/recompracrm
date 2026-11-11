"use client";

import type { TGetCampaignsOutputById } from "@/app/api/campaigns/route";
import TemplateCard from "@/app/dashboard/growth/campaigns/_module/builder/components/message/template-card";
import TemplateStatusBadge from "@/app/dashboard/growth/campaigns/_module/builder/components/message/template-status-badge";
import { buildCampaignStateFromEntity, buildCampaignUpdatePayload } from "@/app/dashboard/growth/campaigns/_module/shared/form/utils";
import TemplatePreview from "@/components/MessageTemplates/TemplatePreview";
import ControlMessageTemplate from "@/components/Modals/MessageTemplates/ControlMessageTemplate";
import NewMessageTemplate from "@/components/Modals/MessageTemplates/NewMessageTemplate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { validateTemplateForTrigger } from "@/lib/message-templates";
import { updateCampaign } from "@/lib/mutations/campaigns";
import { useMessageTemplates } from "@/lib/queries/message-templates";
import type { TOrganizationTemplateTheme } from "@/components/MessageTemplates/message-template-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Eye, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type CampaignTemplateSwitcherProps = {
	campaign: TGetCampaignsOutputById;
	organization: { id: string; nome: string; logoUrl: string | null };
	organizationTheme: TOrganizationTemplateTheme;
};

/**
 * Preview do template da campanha com a troca no próprio lugar. Só lista templates cujas variáveis
 * o gatilho consegue preencher, e o status de cada um é o do remetente da campanha.
 */
export function CampaignTemplateSwitcher({ campaign, organization, organizationTheme }: CampaignTemplateSwitcherProps) {
	const queryClient = useQueryClient();
	const [pickerOpen, setPickerOpen] = useState(false);
	const [showNewTemplate, setShowNewTemplate] = useState(false);
	const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
	const senderPhoneId = campaign.whatsappConexaoTelefoneId ?? "";

	const {
		data: templatesResult,
		queryKey,
		params,
		updateParams,
	} = useMessageTemplates({ initialParams: { page: 1, search: "", pageSize: 50 }, searchDebounceMs: 400 });
	const allTemplates = useMemo(() => templatesResult?.messageTemplates ?? [], [templatesResult]);
	const compatibleTemplates = useMemo(
		() =>
			allTemplates.filter(
				(template) =>
					validateTemplateForTrigger(
						template.conteudo.corpo.parametros.map((parametro) => ({ identificador: parametro.identificadorInterno })),
						campaign.gatilhoTipo,
					).valid,
			),
		[allTemplates, campaign.gatilhoTipo],
	);
	const currentTemplate = allTemplates.find((template) => template.id === campaign.whatsappTemplateId) ?? null;

	const { mutate: switchTemplate, isPending } = useMutation({
		mutationKey: ["switch-campaign-template", campaign.id],
		mutationFn: (templateId: string) => {
			const state = buildCampaignStateFromEntity(campaign);
			return updateCampaign(buildCampaignUpdatePayload(campaign.id, { ...state, campaign: { ...state.campaign, whatsappTemplateId: templateId } }));
		},
		onSuccess: async (data) => {
			toast.success(data.message);
			setPickerOpen(false);
			await queryClient.invalidateQueries({ queryKey: ["campaign-by-id", campaign.id] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const refreshTemplates = async () => await queryClient.invalidateQueries({ queryKey });

	return (
		<div className="flex w-full flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<Eye className="size-4 min-h-4 min-w-4 text-muted-foreground" />
				<h3 className="text-sm font-semibold tracking-tighter text-foreground/80">PREVIEW DO TEMPLATE</h3>
				<div className="ml-auto flex items-center gap-1.5">
					<Button size="xs" variant="outline" onClick={() => setPickerOpen((value) => !value)} className="flex items-center gap-1">
						{pickerOpen ? <X className="size-3.5" /> : <ArrowLeftRight className="size-3.5" />}
						{pickerOpen ? "FECHAR" : "TROCAR TEMPLATE"}
					</Button>
					<Button size="xs" onClick={() => setShowNewTemplate(true)} className="flex items-center gap-1">
						<Plus className="size-3.5" />
						NOVO TEMPLATE
					</Button>
				</div>
			</div>

			{pickerOpen ? (
				<div className="flex flex-col gap-2">
					<div className="relative">
						<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={params.search ?? ""}
							onChange={(event) => updateParams({ search: event.target.value })}
							placeholder="Buscar template..."
							className="rounded-xl pl-9"
						/>
					</div>
					<div className="grid max-h-[520px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2" role="radiogroup" aria-label="Templates">
						{compatibleTemplates.map((template) => (
							<TemplateCard
								key={template.id}
								template={template}
								selectedPhoneId={senderPhoneId}
								isSelected={template.id === campaign.whatsappTemplateId}
								onSelect={() => {
									if (isPending || template.id === campaign.whatsappTemplateId) return;
									switchTemplate(template.id);
								}}
								onEdit={() => setEditTemplateId(template.id)}
							/>
						))}
						{compatibleTemplates.length === 0 ? (
							<p className="col-span-full py-6 text-center text-sm text-muted-foreground">Nenhum template compatível com este gatilho.</p>
						) : null}
					</div>
					<p className="text-[0.7rem] text-muted-foreground">Status relativo ao remetente da campanha. Escolher um template salva a campanha.</p>
				</div>
			) : campaign.whatsappTemplate ? (
				<div className="flex flex-col overflow-hidden rounded-xl border border-border">
					<div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
						<div className="flex min-w-0 flex-col">
							<span className="truncate text-sm font-semibold">{campaign.whatsappTemplate.nome}</span>
							{currentTemplate ? (
								<span className="text-[0.7rem] text-muted-foreground">
									{currentTemplate.categoria} · {currentTemplate.linguagem}
								</span>
							) : null}
						</div>
						{currentTemplate ? <TemplateStatusBadge metadata={currentTemplate.metadados} selectedPhoneId={senderPhoneId} /> : null}
					</div>
					<div className="p-2">
						<TemplatePreview content={campaign.whatsappTemplate.conteudo} organizationTheme={organizationTheme} compact />
					</div>
				</div>
			) : (
				<p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Nenhum template selecionado.</p>
			)}

			{showNewTemplate ? (
				<NewMessageTemplate
					organizationId={organization.id}
					organizationName={organization.nome}
					organizationLogoUrl={organization.logoUrl}
					closeModal={() => setShowNewTemplate(false)}
					callbacks={{
						onSuccess: () => {
							void refreshTemplates();
							setShowNewTemplate(false);
							setPickerOpen(true);
						},
					}}
				/>
			) : null}
			{editTemplateId ? (
				<ControlMessageTemplate
					messageTemplateId={editTemplateId}
					organizationId={organization.id}
					organizationName={organization.nome}
					organizationLogoUrl={organization.logoUrl}
					closeModal={() => setEditTemplateId(null)}
					callbacks={{ onSettled: () => void refreshTemplates() }}
				/>
			) : null}
		</div>
	);
}

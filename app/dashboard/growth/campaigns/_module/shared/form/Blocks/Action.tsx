import SelectInput from "@/components/Inputs/SelectInput";
import { useCommunicationPermissions } from "@/components/MessageTemplates/communication-permissions";
import ControlMessageTemplate from "@/components/Modals/MessageTemplates/ControlMessageTemplate";
import NewMessageTemplate from "@/components/Modals/MessageTemplates/NewMessageTemplate";
import TemplatePreview from "@/components/MessageTemplates/TemplatePreview";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMessageTemplates } from "@/lib/queries/message-templates";
import { useWhatsappConnections } from "@/lib/queries/whatsapp-connections";
import { cn } from "@/lib/utils";
import { validateTemplateForTrigger } from "@/lib/message-templates";
import type { TUseCampaignState } from "@/state-hooks/use-campaign-state";
import { getMessageTemplatePhoneStatusUIDetails } from "@/utils/select-options";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, Info, Pencil, Plus, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type CampaignsActionBlockProps = {
	organizationId: string;
	organizationName: string;
	organizationLogoUrl: string | null;
	campaign: TUseCampaignState["state"]["campaign"];
	updateCampaign: TUseCampaignState["updateCampaign"];
};

function getTemplateTriggerValidationParameters(template: NonNullable<ReturnType<typeof useMessageTemplates>["data"]>["messageTemplates"][number]) {
	return template.conteudo.corpo.parametros.map((parametro) => ({
		nome: parametro.identificadorInterno,
		exemplo: parametro.exemplo,
		identificador: parametro.identificadorInterno,
	}));
}

export default function CampaignsActionBlock({
	organizationId,
	organizationName,
	organizationLogoUrl,
	campaign,
	updateCampaign,
}: CampaignsActionBlockProps) {
	const { editar: canEditTemplates } = useCommunicationPermissions();
	const [showCreateTemplate, setShowCreateTemplate] = useState(false);
	const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
	const queryClient = useQueryClient();

	const { data: whatsappConnections } = useWhatsappConnections();
	const { data: messageTemplatesResult, queryKey } = useMessageTemplates({ initialParams: { page: 1, search: "" } });

	const whatsappConnectionPhones =
		whatsappConnections
			?.flatMap((connection) => connection.telefones)
			.map((phone) => ({
				id: phone.id,
				label: `(${phone.numero}) - ${phone.nome}`,
				value: phone.id,
			})) ?? [];

	const allTemplates = messageTemplatesResult?.messageTemplates ?? [];

	const { compatibleTemplates, hiddenTemplates, hiddenCount } = useMemo(() => {
		if (!campaign.gatilhoTipo) return { compatibleTemplates: allTemplates, hiddenTemplates: [], hiddenCount: 0 };

		const compatible = [];
		const hidden = [];

		for (const template of allTemplates) {
			const validation = validateTemplateForTrigger(getTemplateTriggerValidationParameters(template), campaign.gatilhoTipo);
			if (validation.valid) {
				compatible.push(template);
				continue;
			}

			hidden.push({
				id: template.id,
				nome: template.nome,
				incompatibleVariables: validation.incompatibleVariables,
			});
		}

		return { compatibleTemplates: compatible, hiddenTemplates: hidden, hiddenCount: hidden.length };
	}, [allTemplates, campaign.gatilhoTipo]);

	useEffect(() => {
		if (!campaign.whatsappTemplateId || !campaign.gatilhoTipo || allTemplates.length === 0) return;
		const selectedTemplate = allTemplates.find((template) => template.id === campaign.whatsappTemplateId);
		if (!selectedTemplate) return;
		const validation = validateTemplateForTrigger(getTemplateTriggerValidationParameters(selectedTemplate), campaign.gatilhoTipo);
		if (!validation.valid) {
			updateCampaign({ whatsappTemplateId: "" });
			toast.warning("Template desmarcado: as variáveis dele não são compatíveis com o novo tipo de gatilho.");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [campaign.gatilhoTipo]);

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey });
	const selectedTemplate = useMemo(
		() => allTemplates.find((template) => template.id === campaign.whatsappTemplateId),
		[allTemplates, campaign.whatsappTemplateId],
	);

	return (
		<>
			{showCreateTemplate ? (
				<NewMessageTemplate
					organizationId={organizationId}
					organizationName={organizationName}
					organizationLogoUrl={organizationLogoUrl}
					closeModal={() => setShowCreateTemplate(false)}
					callbacks={{
						onMutate: handleOnMutate,
						onSuccess: () => {
							handleOnSettled();
							setShowCreateTemplate(false);
						},
						onSettled: handleOnSettled,
					}}
				/>
			) : null}

			{editTemplateId ? (
				<ControlMessageTemplate
					messageTemplateId={editTemplateId}
					organizationId={organizationId}
					organizationName={organizationName}
					organizationLogoUrl={organizationLogoUrl}
					closeModal={() => setEditTemplateId(null)}
					callbacks={{
						onMutate: handleOnMutate,
						onSuccess: () => {
							handleOnSettled();
							setEditTemplateId(null);
						},
						onSettled: handleOnSettled,
					}}
				/>
			) : null}

			<ResponsiveMenuSection title="AÇÃO" icon={<Send className="h-4 min-h-4 w-4 min-w-4" />}>
				<div className="flex w-full flex-col gap-3">
					<p className="text-muted-foreground text-center text-sm leading-snug tracking-tight">
						Quando o gatilho disparar para um cliente elegível, esta campanha tenta enviar o template pelo WhatsApp e por e-mail. O telefone abaixo define o
						remetente do WhatsApp; se o cliente não tiver telefone ou e-mail, aquele canal é ignorado.
					</p>

					<SelectInput
						label="TELEFONE DO WHATSAPP (REMETENTE)"
						value={campaign.whatsappConexaoTelefoneId}
						resetOptionLabel="SEM REMETENTE WHATSAPP"
						options={whatsappConnectionPhones}
						handleChange={(value) => updateCampaign({ whatsappConexaoTelefoneId: value })}
						onReset={() => updateCampaign({ whatsappConexaoTelefoneId: "" })}
					/>

					<p className="text-muted-foreground text-center text-xs leading-snug">
						A lista de templates é filtrada pelo tipo de gatilho da campanha: só entram modelos cujas variáveis esse gatilho consegue preencher.
					</p>

					<SelectInput
						label="TEMPLATE DE MENSAGEM"
						value={campaign.whatsappTemplateId}
						resetOptionLabel="SELECIONE O TEMPLATE"
						options={compatibleTemplates.map((template) => {
							const details = getMessageTemplatePhoneStatusUIDetails(template.statusGeral);
							return {
								startContent: details ? (
									<div className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1", details.colors.background)}>
										{details.icon}
										<span className={cn("text-[0.65rem] font-semibold uppercase", details.colors.text)}>{details.label}</span>
									</div>
								) : null,
								id: template.id,
								label: template.nome,
								value: template.id,
							};
						})}
						handleChange={(value) => updateCampaign({ whatsappTemplateId: value })}
						onReset={() => updateCampaign({ whatsappTemplateId: "" })}
					/>

					<div className="flex w-full items-center justify-end gap-3">
						{selectedTemplate ? (
							<HoverCard>
								<HoverCardTrigger
									delay={200}
									render={
										<Button type="button" size="sm" variant="ghost" className="flex items-center gap-1.5">
											<Eye className="h-3.5 w-3.5" />
											PRÉ-VISUALIZAR
										</Button>
									}
								/>
								<HoverCardContent className="max-h-[70vh] w-[360px] overflow-auto p-2" side="left" align="end">
									<TemplatePreview content={selectedTemplate.conteudo} />
								</HoverCardContent>
							</HoverCard>
						) : null}

						{selectedTemplate && canEditTemplates ? (
							<Button type="button" size="sm" variant="ghost" className="flex items-center gap-1.5" onClick={() => setEditTemplateId(selectedTemplate.id)}>
								<Pencil className="h-3.5 w-3.5" />
								EDITAR
							</Button>
						) : null}

						{canEditTemplates ? (
							<Button type="button" size="sm" variant="ghost" className="flex items-center gap-1.5" onClick={() => setShowCreateTemplate(true)}>
								<Plus className="h-3.5 w-3.5" />
								CRIAR
							</Button>
						) : null}
					</div>

					{hiddenCount > 0 ? (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger
									delay={150}
									render={
										<div className="text-muted-foreground hover:bg-muted/60 flex cursor-help items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs leading-snug transition-colors">
											<Info className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
											<span>
												{hiddenCount === 1
													? "Mais um template não aparece aqui porque usa variáveis que este tipo de gatilho não fornece."
													: `Mais ${hiddenCount} templates não aparecem aqui porque usam variáveis que este tipo de gatilho não fornece.`}{" "}
												Passe o cursor para ver o nome de cada um e quais variáveis são.
											</span>
										</div>
									}
								/>
								<TooltipContent
									side="top"
									align="start"
									className="w-[360px] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
								>
									<div className="scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30 flex max-h-72 flex-col gap-3 overflow-y-auto overscroll-y-contain pr-1">
										<p className="text-xs font-semibold uppercase tracking-wide text-foreground">Templates fora da lista</p>
										<div className="flex flex-col gap-2">
											{hiddenTemplates.map((template) => (
												<div key={template.id} className="rounded-lg border border-border/60 bg-muted/35 px-2.5 py-2">
													<p className="text-xs font-semibold text-foreground">{template.nome}</p>
													<p className="text-muted-foreground mt-1 text-xs leading-snug">
														Variáveis que este gatilho não preenche: {template.incompatibleVariables.join(", ")}.
													</p>
												</div>
											))}
										</div>
									</div>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					) : null}
				</div>
			</ResponsiveMenuSection>
		</>
	);
}

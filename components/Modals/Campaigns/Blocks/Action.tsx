import SelectInput from "@/components/Inputs/SelectInput";
import NewWhatsappTemplate from "@/components/Modals/WhatsappTemplates/NewWhatsappTemplate";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { useWhatsappConnection } from "@/lib/queries/whatsapp-connections";
import { useWhatsappTemplates } from "@/lib/queries/whatsapp-templates";
import { validateTemplateForTrigger } from "@/lib/whatsapp/template-variables";
import type { TUseCampaignState } from "@/state-hooks/use-campaign-state";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Plus, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type CampaignsActionBlockProps = {
	organizationId: string;
	campaign: TUseCampaignState["state"]["campaign"];
	updateCampaign: TUseCampaignState["updateCampaign"];
};

export default function CampaignsActionBlock({ organizationId, campaign, updateCampaign }: CampaignsActionBlockProps) {
	const [showCreateTemplate, setShowCreateTemplate] = useState(false);
	const queryClient = useQueryClient();

	const { data: whatsappConnection } = useWhatsappConnection();
	const { data: whatsappTemplatesResult, updateParams } = useWhatsappTemplates({
		initialParams: { page: 1, search: "", whatsappConnectionPhoneId: campaign.whatsappConexaoTelefoneId },
	});

	const whatsappConnectionPhones =
		whatsappConnection?.telefones.map((v) => ({
			id: v.id,
			label: `(${v.numero}) - ${v.nome}`,
			value: v.id,
		})) ?? [];

	const allTemplates = whatsappTemplatesResult?.whatsappTemplates ?? [];

	// Filter templates by trigger compatibility
	const { compatibleTemplates, hiddenCount } = useMemo(() => {
		if (!campaign.gatilhoTipo) return { compatibleTemplates: allTemplates, hiddenCount: 0 };
		const compatible = allTemplates.filter((template) => {
			const validation = validateTemplateForTrigger(template.bodyParametros, campaign.gatilhoTipo);
			return validation.valid;
		});
		return { compatibleTemplates: compatible, hiddenCount: allTemplates.length - compatible.length };
	}, [allTemplates, campaign.gatilhoTipo]);

	// Clear template when trigger type changes and selected template becomes incompatible
	useEffect(() => {
		if (!campaign.whatsappTemplateId || !campaign.gatilhoTipo || allTemplates.length === 0) return;
		const selectedTemplate = allTemplates.find((t) => t.id === campaign.whatsappTemplateId);
		if (!selectedTemplate) return;
		const validation = validateTemplateForTrigger(selectedTemplate.bodyParametros, campaign.gatilhoTipo);
		if (!validation.valid) {
			updateCampaign({ whatsappTemplateId: "" });
			toast.warning("Template removido: variáveis incompatíveis com o novo gatilho.");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [campaign.gatilhoTipo]);

	// Find the selected template for status/quality display
	const selectedTemplate = useMemo(() => allTemplates.find((t) => t.id === campaign.whatsappTemplateId), [allTemplates, campaign.whatsappTemplateId]);

	const rejectionReason = selectedTemplate?.rejeicao ?? null;
	console.log("whatsappTemplatesResult", whatsappTemplatesResult);
	return (
		<>
			{showCreateTemplate && (
				<NewWhatsappTemplate
					organizationId={organizationId}
					triggerContext={campaign.gatilhoTipo ?? undefined}
					closeMenu={() => setShowCreateTemplate(false)}
					callbacks={{
						onSuccess: ({ templateId }) => {
							if (templateId) updateCampaign({ whatsappTemplateId: templateId });
							queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
							setShowCreateTemplate(false);
						},
					}}
				/>
			)}
			<ResponsiveMenuSection title="AÇÃO" icon={<Send className="h-4 min-h-4 w-4 min-w-4" />}>
				<div className="w-full flex flex-col gap-1">
					<p className="text-center text-sm tracking-tight text-muted-foreground">Defina o template do WhatsApp que deve ser enviado.</p>
					<SelectInput
						label="TELEFONE DO WHATSAPP"
						value={campaign.whatsappConexaoTelefoneId}
						resetOptionLabel="SELECIONE O TELEFONE"
						options={whatsappConnectionPhones}
						handleChange={(value) => {
							updateCampaign({ whatsappConexaoTelefoneId: value, whatsappTemplateId: "" });
							updateParams({ whatsappConnectionPhoneId: value });
						}}
						onReset={() => {
							updateCampaign({ whatsappConexaoTelefoneId: "", whatsappTemplateId: "" });
							updateParams({ whatsappConnectionPhoneId: undefined });
						}}
						width="100%"
					/>
					<div className="flex items-end gap-2">
						<div className="flex-1 min-w-0">
							<SelectInput
								label="TEMPLATE DO WHATSAPP"
								value={campaign.whatsappTemplateId}
								editable={!!campaign.whatsappConexaoTelefoneId}
								resetOptionLabel={campaign.whatsappConexaoTelefoneId ? "SELECIONE O TEMPLATE" : "SELECIONE UM TELEFONE PRIMEIRO"}
								options={compatibleTemplates.map((template) => ({ id: template.id, label: template.nome, value: template.id }))}
								handleChange={(value) => updateCampaign({ whatsappTemplateId: value })}
								onReset={() => updateCampaign({ whatsappTemplateId: "" })}
								width="100%"
							/>
						</div>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="mb-0.5 gap-1.5 shrink-0"
							onClick={() => setShowCreateTemplate(true)}
							disabled={!campaign.whatsappConexaoTelefoneId}
						>
							<Plus className="h-3.5 w-3.5" />
							CRIAR
						</Button>
					</div>
					{hiddenCount > 0 && (
						<div className="flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
							<Info className="h-3.5 w-3.5 shrink-0" />
							<span>
								{hiddenCount} {hiddenCount === 1 ? "template foi ocultado" : "templates foram ocultados"} por uso de variáveis incompatíveis com o gatilho
								selecionado.
							</span>
						</div>
					)}
					{selectedTemplate && (
						<div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/10 bg-muted/30 px-3 py-2">
							<span className="text-xs text-muted-foreground">Status:</span>
							<StatusBadge status={selectedTemplate.statusGeral} />
							<span className="text-xs text-muted-foreground ml-1">Qualidade:</span>
							<QualityBadge quality={selectedTemplate.qualidadeGeral} />
							{selectedTemplate.statusGeral === "REJEITADO" && rejectionReason && (
								<p className="w-full text-xs text-red-600 dark:text-red-400 mt-1">Motivo da rejeição: {rejectionReason}</p>
							)}
							{selectedTemplate.statusGeral === "PENDENTE" && (
								<p className="w-full text-xs text-yellow-600 dark:text-yellow-400 mt-1">Este template está aguardando aprovação da Meta.</p>
							)}
						</div>
					)}
				</div>
			</ResponsiveMenuSection>
		</>
	);
}

function StatusBadge({ status }: { status: string }) {
	const colorMap: Record<string, string> = {
		APROVADO: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
		PENDENTE: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
		REJEITADO: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
		RASCUNHO: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
		PAUSADO: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
		DESABILITADO: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
	};
	return (
		<span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${colorMap[status] ?? "bg-gray-100 text-gray-700"}`}>{status}</span>
	);
}

function QualityBadge({ quality }: { quality: string }) {
	const colorMap: Record<string, string> = {
		ALTA: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
		MEDIA: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
		BAIXA: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
		PENDENTE: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
	};
	return (
		<span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${colorMap[quality] ?? "bg-gray-100 text-gray-700"}`}>{quality}</span>
	);
}

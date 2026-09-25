"use client";

import NumberInput from "@/components/Inputs/NumberInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Switch } from "@/components/ui/switch";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TUseOrganizationBaseState } from "@/state-hooks/use-organization-state";
import { Layers } from "lucide-react";

type AdminOrganizationResourcesBlockProps = {
	recursos: TOrganizationConfiguration["recursos"];
	updateResource: TUseOrganizationBaseState["updateConfigurationResources"];
};

type ResourceRowProps = {
	title: string;
	description: string;
	access: boolean;
	onAccessChange: (checked: boolean) => void;
	limitLabel?: string;
	limitValue?: number | null;
	onLimitChange?: (value: number) => void;
};

function ResourceRow({ title, description, access, onAccessChange, limitLabel, limitValue, onLimitChange }: ResourceRowProps) {
	return (
		<div className="flex w-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="text-sm font-medium tracking-tight">{title}</span>
					<span className="text-xs text-muted-foreground">{description}</span>
				</div>
				<Switch checked={access} onCheckedChange={onAccessChange} />
			</div>
			{limitLabel && onLimitChange && access ? (
				<NumberInput
					label={limitLabel}
					showLabel
					value={limitValue ?? null}
					placeholder="Ilimitado (deixe vazio para sem limite)"
					handleChange={onLimitChange}
				/>
			) : null}
		</div>
	);
}

export default function AdminOrganizationResourcesBlock({ recursos, updateResource }: AdminOrganizationResourcesBlockProps) {
	return (
		<ResponsiveMenuSection title="MÓDULOS E RECURSOS" icon={<Layers className="h-4 w-4 min-h-4 min-w-4" />}>
			<p className="text-xs text-muted-foreground">
				Controle quais módulos e capacidades esta organização pode utilizar na plataforma. Limites numéricos vazios equivalem a ilimitado.
			</p>

			<ResourceRow
				title="ERP"
				description="Habilita o módulo operacional completo (vendas, compras, estoque, finanças e demais rotinas internas)."
				access={recursos.erp.acesso}
				onAccessChange={(checked) => updateResource("erp", { acesso: checked })}
			/>
			<ResourceRow
				title="Analytics"
				description="Painéis e análises avançadas de desempenho comercial."
				access={recursos.analytics.acesso}
				onAccessChange={(checked) => updateResource("analytics", { acesso: checked })}
			/>
			<ResourceRow
				title="Campanhas"
				description="Criação e gestão de campanhas de relacionamento e mensagens."
				access={recursos.campanhas.acesso}
				onAccessChange={(checked) => updateResource("campanhas", { acesso: checked })}
				limitLabel="LIMITE DE CAMPANHAS ATIVAS"
				limitValue={recursos.campanhas.limiteAtivas}
				onLimitChange={(value) => updateResource("campanhas", { limiteAtivas: value })}
			/>
			<ResourceRow
				title="Programas de cashback"
				description="Gestão de programas de fidelidade com cashback."
				access={recursos.programasCashback.acesso}
				onAccessChange={(checked) => updateResource("programasCashback", { acesso: checked })}
			/>
			<ResourceRow
				title="Hub de atendimentos"
				description="Atendimentos via WhatsApp Hub com múltiplos atendentes."
				access={recursos.hubAtendimentos.acesso}
				onAccessChange={(checked) => updateResource("hubAtendimentos", { acesso: checked })}
				limitLabel="LIMITE DE ATENDENTES SIMULTÂNEOS"
				limitValue={recursos.hubAtendimentos.limiteAtendentes}
				onLimitChange={(value) => updateResource("hubAtendimentos", { limiteAtendentes: value })}
			/>
			<ResourceRow
				title="Integrações"
				description="Conexões com ERPs, marketplaces e demais integrações externas."
				access={recursos.integracoes.acesso}
				onAccessChange={(checked) => updateResource("integracoes", { acesso: checked })}
				limitLabel="LIMITE DE INTEGRAÇÕES ATIVAS"
				limitValue={recursos.integracoes.limiteAtivas}
				onLimitChange={(value) => updateResource("integracoes", { limiteAtivas: value })}
			/>
			<ResourceRow
				title="Relatórios via WhatsApp"
				description="Envio automatizado de relatórios por WhatsApp."
				access={recursos.relatoriosWhatsapp.acesso}
				onAccessChange={(checked) => updateResource("relatoriosWhatsapp", { acesso: checked })}
			/>
			<ResourceRow
				title="Atendimento com IA"
				description="Assistente de IA nos fluxos de atendimento."
				access={recursos.iaAtendimento.acesso}
				onAccessChange={(checked) => updateResource("iaAtendimento", { acesso: checked })}
				limitLabel="LIMITE MENSAL DE CRÉDITOS DE IA (US$ ESTIMADOS)"
				limitValue={recursos.iaAtendimento.limiteCreditos}
				onLimitChange={(value) => updateResource("iaAtendimento", { limiteCreditos: value })}
			/>
		</ResponsiveMenuSection>
	);
}

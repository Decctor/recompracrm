"use client";

import NumberInput from "@/components/Inputs/NumberInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TUseOrganizationBaseState } from "@/state-hooks/use-organization-state";
import { Settings2 } from "lucide-react";
import { useMemo } from "react";

type AdminOrganizationPreferencesBlockProps = {
	preferencias: TOrganizationConfiguration["preferencias"];
	hasErpAccess: boolean;
	updatePreferencias: TUseOrganizationBaseState["updateConfigurationPreferencias"];
};

const MESSAGE_LIMIT_PRESETS = [
	{ label: "SEM LIMITE", value: null as number | null },
	{ label: "500 / SEMANA", value: 500 },
	{ label: "1.500 / SEMANA", value: 1500 },
	{ label: "5.000 / SEMANA", value: 5000 },
];

export default function AdminOrganizationPreferencesBlock({
	preferencias,
	hasErpAccess,
	updatePreferencias,
}: AdminOrganizationPreferencesBlockProps) {
	const isCustomMessageSendingLimit = useMemo(() => {
		const limit = preferencias.limiteMensagensSemanaisViaCampanhas;
		return limit !== null && !MESSAGE_LIMIT_PRESETS.some((preset) => preset.value === limit);
	}, [preferencias.limiteMensagensSemanaisViaCampanhas]);

	return (
		<ResponsiveMenuSection title="PREFERÊNCIAS" icon={<Settings2 className="h-4 w-4 min-h-4 min-w-4" />}>
			<p className="text-xs text-muted-foreground">Ajustes complementares vinculados ao plano e aos recursos habilitados acima.</p>

			<div className="flex w-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
				<span className="text-sm font-medium tracking-tight">Limite de mensagens via campanhas</span>
				<span className="text-xs text-muted-foreground">Quantidade máxima de envios semanais permitidos nas campanhas da organização.</span>
				<div className="flex flex-wrap gap-2">
					{MESSAGE_LIMIT_PRESETS.map((preset) => (
						<Button
							key={preset.label}
							type="button"
							size="sm"
							variant={preferencias.limiteMensagensSemanaisViaCampanhas === preset.value && !isCustomMessageSendingLimit ? "default" : "outline"}
							onClick={() => updatePreferencias({ limiteMensagensSemanaisViaCampanhas: preset.value })}
						>
							{preset.label}
						</Button>
					))}
					<Button
						type="button"
						size="sm"
						variant={isCustomMessageSendingLimit ? "default" : "outline"}
						onClick={() => updatePreferencias({ limiteMensagensSemanaisViaCampanhas: 1500 })}
					>
						PERSONALIZADO
					</Button>
				</div>
				{isCustomMessageSendingLimit ? (
					<NumberInput
						label="LIMITE DE ENVIOS POR SEMANA"
						showLabel={false}
						value={preferencias.limiteMensagensSemanaisViaCampanhas ?? null}
						placeholder="Preencha o limite semanal de envios..."
						handleChange={(value) => updatePreferencias({ limiteMensagensSemanaisViaCampanhas: value })}
					/>
				) : null}
			</div>

			<div className="flex w-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
				<span className="text-sm font-medium tracking-tight">Limite diário de mensagens via campanhas</span>
				<span className="text-xs text-muted-foreground">Teto por dia para aquecer números novos no WhatsApp. Vazio = sem limite diário.</span>
				<NumberInput
					label="LIMITE DE ENVIOS POR DIA"
					showLabel={false}
					value={preferencias.limiteMensagensDiariasViaCampanhas ?? null}
					placeholder="Preencha o limite diário de envios (opcional)..."
					handleChange={(value) => updatePreferencias({ limiteMensagensDiariasViaCampanhas: value || null })}
				/>
			</div>

			{hasErpAccess ? (
				<div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
					<div className="flex flex-col gap-0.5">
						<span className="text-sm font-medium tracking-tight">Rastreamento de estoque</span>
						<span className="text-xs text-muted-foreground">Habilita controle e rastreamento de estoque nos produtos.</span>
					</div>
					<Switch checked={preferencias.rastreamentoEstoque} onCheckedChange={(checked) => updatePreferencias({ rastreamentoEstoque: checked })} />
				</div>
			) : null}
		</ResponsiveMenuSection>
	);
}

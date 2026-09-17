"use client";

import NumberInput from "@/components/Inputs/NumberInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatNameAsInitials } from "@/lib/formatting";
import { useUsers } from "@/lib/queries/users";
import { cn } from "@/lib/utils";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { useEffect, useState } from "react";
import MultipleSelectInput from "../Inputs/MultipleSelectInput";
import { useOrganizationSectionForm } from "./Organization/use-organization-section-form";
import { SettingsFormCard, SettingsFormSection } from "./SettingsFormCard";
import SettingsSectionActions from "./SettingsSectionActions";

type TPreferences = TOrganizationConfiguration["preferencias"];
type TOutboundDraft = Pick<TPreferences, "relatoriosDestinatariosIds" | "limiteMensagensSemanaisViaCampanhas" | "limiteMensagensDiariasViaCampanhas">;

const WEEKLY_LIMIT_PRESETS = [300, 500, 1000];
/** Valores típicos de aquecimento de um número novo no WhatsApp (a Meta limita duro nas primeiras 24h). */
const DAILY_LIMIT_PRESETS = [50, 250, 1000];
const CUSTOM_DAILY_LIMIT_SEED = 100;
/** Ponto de partida quando o usuário escolhe "personalizado", fora dos presets acima. */
const CUSTOM_WEEKLY_LIMIT_SEED = 1500;

function toOutboundDraft(preferencias: TPreferences): TOutboundDraft {
	return {
		relatoriosDestinatariosIds: preferencias.relatoriosDestinatariosIds ?? null,
		limiteMensagensSemanaisViaCampanhas: preferencias.limiteMensagensSemanaisViaCampanhas ?? null,
		limiteMensagensDiariasViaCampanhas: preferencias.limiteMensagensDiariasViaCampanhas ?? null,
	};
}

type SettingsOutboundProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

export default function SettingsOutbound({ membership }: SettingsOutboundProps) {
	const { organization, isLoading, isError, isSuccess, error, save, isSaving } = useOrganizationSectionForm();
	const { data: users } = useUsers({ initialFilters: { search: "" } });
	const [draft, setDraft] = useState<TOutboundDraft | null>(null);

	useEffect(() => {
		if (organization) setDraft(toOutboundDraft(organization.configuracao.preferencias));
	}, [organization]);

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!isSuccess || !organization || !draft) return null;

	const canEdit = membership.permissoes.empresa.editar;
	const weeklyLimit = draft.limiteMensagensSemanaisViaCampanhas;
	const isCustomWeeklyLimit = !!weeklyLimit && !WEEKLY_LIMIT_PRESETS.includes(weeklyLimit);
	const dailyLimit = draft.limiteMensagensDiariasViaCampanhas;
	const isCustomDailyLimit = !!dailyLimit && !DAILY_LIMIT_PRESETS.includes(dailyLimit);

	function updateDraft(partial: Partial<TOutboundDraft>) {
		setDraft((current) => (current ? { ...current, ...partial } : current));
	}

	return (
		<SettingsFormCard
			footer={
				canEdit ? (
					<SettingsSectionActions
						isSaving={isSaving}
						onReset={() => setDraft(toOutboundDraft(organization.configuracao.preferencias))}
						onSave={() => save({ configuracao: { preferencias: draft } })}
					/>
				) : undefined
			}
		>
			<SettingsFormSection>
				<MultipleSelectInput
					label="DESTINATÁRIOS DE RELATÓRIOS"
					selected={draft.relatoriosDestinatariosIds ?? []}
					options={
						users?.map((user) => ({
							id: user.id,
							label: user.nome,
							value: user.id,
							startContent: (
								<Avatar className="h-4 w-4 max-h-4 max-w-4">
									<AvatarImage src={user.avatarUrl ?? undefined} />
									<AvatarFallback>{formatNameAsInitials(user.nome)}</AvatarFallback>
								</Avatar>
							),
						})) ?? []
					}
					resetOptionLabel="Selecione os destinatários"
					handleChange={(value) => updateDraft({ relatoriosDestinatariosIds: value })}
					onReset={() => updateDraft({ relatoriosDestinatariosIds: null })}
					editable={canEdit}
				/>
			</SettingsFormSection>

			<SettingsFormSection>
				<div className="flex w-full flex-col gap-1">
					<h3 className="text-foreground/80 text-sm font-medium tracking-tight">LIMITE DE ENVIOS DE MENSAGEM VIA CAMPANHA (POR SEMANA)</h3>
					<div className="flex w-full flex-wrap items-center justify-start gap-x-2 gap-y-1">
						<Button
							variant={!weeklyLimit ? "default" : "ghost"}
							size="fit"
							className={cn("rounded-lg px-2 py-1 text-xs", !weeklyLimit ? "opacity-100" : "opacity-50")}
							onClick={() => canEdit && updateDraft({ limiteMensagensSemanaisViaCampanhas: null })}
							disabled={!canEdit}
						>
							SEM LIMITE
						</Button>
						{WEEKLY_LIMIT_PRESETS.map((limit) => (
							<Button
								key={limit}
								variant={weeklyLimit === limit ? "default" : "ghost"}
								size="fit"
								className={cn("rounded-lg px-2 py-1 text-xs", weeklyLimit === limit ? "opacity-100" : "opacity-50")}
								onClick={() => canEdit && updateDraft({ limiteMensagensSemanaisViaCampanhas: limit })}
								disabled={!canEdit}
							>
								{limit}
							</Button>
						))}
						<Button
							variant={isCustomWeeklyLimit ? "default" : "ghost"}
							size="fit"
							className={cn("rounded-lg px-2 py-1 text-xs", isCustomWeeklyLimit ? "opacity-100" : "opacity-50")}
							onClick={() => canEdit && updateDraft({ limiteMensagensSemanaisViaCampanhas: CUSTOM_WEEKLY_LIMIT_SEED })}
							disabled={!canEdit}
						>
							PERSONALIZADO
						</Button>
					</div>
					{isCustomWeeklyLimit ? (
						<NumberInput
							label="LIMITE DE ENVIOS POR SEMANA"
							showLabel={false}
							value={weeklyLimit}
							placeholder="Preencha aqui o valor do limite de envios por semana..."
							handleChange={(value) => updateDraft({ limiteMensagensSemanaisViaCampanhas: value })}
							editable={canEdit}
						/>
					) : null}
				</div>
				<div className="flex w-full flex-col gap-1">
					<h3 className="text-foreground/80 text-sm font-medium tracking-tight">LIMITE DE ENVIOS DE MENSAGEM VIA CAMPANHA (POR DIA)</h3>
					<p className="text-xs text-muted-foreground">
						Para números novos no WhatsApp: a Meta limita quantas conversas um número recém-conectado abre por dia até ele aquecer. Não é um segundo
						orçamento semanal — o semanal continua sendo o ritmo das campanhas.
					</p>
					<div className="flex w-full flex-wrap items-center justify-start gap-x-2 gap-y-1">
						<Button
							variant={!dailyLimit ? "default" : "ghost"}
							size="fit"
							className={cn("rounded-lg px-2 py-1 text-xs", !dailyLimit ? "opacity-100" : "opacity-50")}
							onClick={() => canEdit && updateDraft({ limiteMensagensDiariasViaCampanhas: null })}
							disabled={!canEdit}
						>
							SEM LIMITE
						</Button>
						{DAILY_LIMIT_PRESETS.map((limit) => (
							<Button
								key={limit}
								variant={dailyLimit === limit ? "default" : "ghost"}
								size="fit"
								className={cn("rounded-lg px-2 py-1 text-xs", dailyLimit === limit ? "opacity-100" : "opacity-50")}
								onClick={() => canEdit && updateDraft({ limiteMensagensDiariasViaCampanhas: limit })}
								disabled={!canEdit}
							>
								{limit}
							</Button>
						))}
						<Button
							variant={isCustomDailyLimit ? "default" : "ghost"}
							size="fit"
							className={cn("rounded-lg px-2 py-1 text-xs", isCustomDailyLimit ? "opacity-100" : "opacity-50")}
							onClick={() => canEdit && updateDraft({ limiteMensagensDiariasViaCampanhas: CUSTOM_DAILY_LIMIT_SEED })}
							disabled={!canEdit}
						>
							PERSONALIZADO
						</Button>
					</div>
					{isCustomDailyLimit ? (
						<NumberInput
							label="LIMITE DE ENVIOS POR DIA"
							showLabel={false}
							value={dailyLimit}
							placeholder="Preencha aqui o valor do limite de envios por dia..."
							handleChange={(value) => updateDraft({ limiteMensagensDiariasViaCampanhas: value })}
							editable={canEdit}
						/>
					) : null}
				</div>
			</SettingsFormSection>
		</SettingsFormCard>
	);
}

"use client";

import { Switch } from "@/components/ui/switch";
import { getAvailableCampaignPresets, type TOnboardingCampaignPresetKey } from "@/config/onboarding-campaign-presets";
import { getOnboardingTemplatePreview } from "@/config/onboarding-message-templates";
import { recommendCampaignPreset } from "@/lib/onboarding/main-pain";
import type { TOnboardingReadiness } from "@/lib/onboarding/readiness";
import type { TOnboardingMainPainEnum } from "@/schemas/enums";
import { Clock } from "lucide-react";
import { ChoiceList } from "../shared/ChoiceList";
import { ReadinessPill } from "../shared/ReadinessPill";

type CampaignsStageProps = {
	cashbackAtivo: boolean;
	selectedKeys: string[];
	toggleCampaign: (key: TOnboardingCampaignPresetKey) => void;
	enableSendingWhenReady: boolean;
	onToggleEnableSending: (value: boolean) => void;
	readiness: TOnboardingReadiness | null;
	/** O incômodo declarado na etapa da empresa: a campanha que responde a ele vem primeiro. */
	dorPrincipal?: TOnboardingMainPainEnum | null;
};

const STATE_LABEL = { PREPARADA: "Preparada", PRONTA: "Pronta", HABILITADA: "Aguardando dependências", ATIVA: "Enviando" } as const;
const STATE_TONE = { PREPARADA: "andamento", PRONTA: "ok", HABILITADA: "pendente", ATIVA: "ok" } as const;

export function CampaignsStage({
	cashbackAtivo,
	selectedKeys,
	toggleCampaign,
	enableSendingWhenReady,
	onToggleEnableSending,
	readiness,
	dorPrincipal = null,
}: CampaignsStageProps) {
	const variant = cashbackAtivo ? "COM_CASHBACK" : "SEM_CASHBACK";
	const recommended = recommendCampaignPreset({ dor: dorPrincipal, cashbackAtivo });
	const presets = getAvailableCampaignPresets(cashbackAtivo).sort((a, b) => Number(b.key === recommended) - Number(a.key === recommended));
	const existingByKey = new Map((readiness?.campanhas ?? []).map((campaign) => [campaign.chave, campaign]));

	return (
		<div className="flex w-full max-w-[640px] flex-col gap-6">
			<p className="max-w-[68ch] text-sm text-muted-foreground">
				Para começar, sugerimos estas campanhas para seu segmento e programa de cashback. As mensagens já vêm prontas
				{cashbackAtivo ? " e com a oferta de cashback incluída" : ", sem menção a cashback"}. Você ajusta tudo depois.
			</p>

			<ChoiceList<TOnboardingCampaignPresetKey>
				label="Campanhas sugeridas"
				mode="multiple"
				value={selectedKeys as TOnboardingCampaignPresetKey[]}
				onChange={toggleCampaign}
				options={presets.map((preset) => {
					const preview = getOnboardingTemplatePreview(preset.templateKey, variant);
					const existing = existingByKey.get(preset.key);
					return {
						value: preset.key,
						titulo: preset.titulo,
						descricao: preset.descricao,
						badge: preset.key === recommended ? "Para o que você contou" : null,
						extra: (
							<span className="flex flex-col gap-2 pt-1">
								<span className="flex flex-wrap items-center gap-2">
									<span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
										<Clock className="size-3" />
										{preset.gatilhoLabel}
									</span>
									{preset.requiresCashback ? <span className="text-[11px] font-semibold text-muted-foreground">Usa cashback</span> : null}
									{existing ? <ReadinessPill tone={STATE_TONE[existing.estado]}>{STATE_LABEL[existing.estado]}</ReadinessPill> : null}
								</span>
								{preview ? <span className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed text-muted-foreground">{preview}</span> : null}
							</span>
						),
					};
				})}
			/>

			<div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
				<div className="flex flex-col gap-0.5">
					<label htmlFor="enable-sending" className="cursor-pointer text-sm font-bold">
						Liberar envios assim que estiverem prontas
					</label>
					<p className="text-sm text-muted-foreground">
						Uma campanha só envia com número conectado, template aprovado e dados suficientes. Desligado, você libera uma a uma depois.
					</p>
				</div>
				<Switch id="enable-sending" checked={enableSendingWhenReady} onCheckedChange={onToggleEnableSending} />
			</div>
		</div>
	);
}

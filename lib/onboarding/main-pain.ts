import type { TOnboardingCampaignPresetKey } from "@/config/onboarding-campaign-presets";
import type { TOnboardingMainPainEnum } from "@/schemas/enums";

/**
 * A pergunta declarativa do onboarding do CRM: o que mais incomoda a loja hoje. Custa uns segundos
 * e muda o percurso — a campanha recomendada e a meta do teste partem dela (playbook: "add
 * declarative friction, cut administrative friction").
 */

export const MAIN_PAIN_OPTIONS: Array<{ value: TOnboardingMainPainEnum; titulo: string; descricao: string }> = [
	{ value: "CLIENTES_NAO_VOLTAM", titulo: "Cliente compra uma vez e não volta", descricao: "Quero trazer de volta quem comprou pela primeira vez." },
	{ value: "CLIENTES_PARARAM", titulo: "Clientes antigos pararam de vir", descricao: "Quero reativar quem já comprou bastante e sumiu." },
	{ value: "POUCA_FREQUENCIA", titulo: "Quero que comprem com mais frequência", descricao: "Quero encurtar o tempo entre uma compra e a próxima." },
];

/** Meta do teste: clientes que voltam a comprar depois de receber uma campanha. Pequena e fechável. */
export const TRIAL_GOAL_TARGET = 5;

/** Campanha sugerida que responde ao incômodo declarado; null sem resposta. */
export function recommendCampaignPreset({
	dor,
	cashbackAtivo,
}: {
	dor: TOnboardingMainPainEnum | null;
	cashbackAtivo: boolean;
}): TOnboardingCampaignPresetKey | null {
	switch (dor) {
		case "CLIENTES_NAO_VOLTAM":
			return "primeira-compra";
		case "CLIENTES_PARARAM":
			return "recuperacao";
		case "POUCA_FREQUENCIA":
			// O lembrete de cashback a expirar só existe com o programa ativo.
			return cashbackAtivo ? "cashback-expirando" : "segunda-compra";
		default:
			return null;
	}
}

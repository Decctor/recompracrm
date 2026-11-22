import type { TOnboardingAnswers } from "@/schemas/onboarding";

/**
 * De onde vêm as vendas, decidido sem I/O.
 *
 * `poiConfiguracao.vendas.registroAtivo` não serve sozinho: toda organização nasce com ele ligado
 * (app/api/organizations/route.ts), porque o Ponto de Interação depende dele para registrar. Lido
 * como "escolheu o balcão", ele punha toda organização em POI ou AMBOS, dava a etapa "De onde vêm
 * suas vendas" por concluída mesmo adiada e nunca deixava a próxima ação "fonte de dados" aparecer.
 *
 * O balcão conta quando o registro está ligado **e** a loja o escolheu no onboarding ou registrou
 * vendas nele recentemente. Integração conta quando há uma fonte de dados ativa.
 */

export const POI_RECENT_SALES_DAYS = 90;

export type TDataSourceMode = "NENHUMA" | "POI" | "INTEGRACAO" | "AMBOS";

export function resolveDataSourceMode({
	integracoesAtivas,
	poiRegistroAtivo,
	modoDeclarado,
	vendasPoiRecentes,
}: {
	integracoesAtivas: number;
	poiRegistroAtivo: boolean;
	/** Resposta da etapa "De onde vêm suas vendas" na jornada CRM; null quando não respondida. */
	modoDeclarado: TOnboardingAnswers["fonteDadosModo"];
	/** Vendas do Ponto de Interação nos últimos `POI_RECENT_SALES_DAYS` dias. */
	vendasPoiRecentes: number;
}): TDataSourceMode {
	const poi = poiRegistroAtivo && (modoDeclarado === "POI" || vendasPoiRecentes > 0);
	const integration = integracoesAtivas > 0;
	if (integration && poi) return "AMBOS";
	if (integration) return "INTEGRACAO";
	return poi ? "POI" : "NENHUMA";
}

/**
 * A loja já tem por onde as vendas entrarem? Uma fonte do CRM em uso, ou o ERP: com ele as vendas
 * nascem no próprio PDV, na comanda ou na loja digital, e nenhuma etapa deve pedir "de onde vêm".
 */
export function isSalesSourceDefined({ modo, erpAcesso }: { modo: TDataSourceMode; erpAcesso: boolean }): boolean {
	return modo !== "NENHUMA" || erpAcesso;
}

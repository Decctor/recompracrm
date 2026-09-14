import type { TCampaignState } from "@/schemas/campaigns";
import type { TCampaignTriggerTypeEnum } from "@/schemas/enums";
import dayjs from "dayjs";

type TCampaign = TCampaignState["campaign"];

/**
 * Returns the patch to apply to the campaign state when the user picks a trigger.
 * Mirrors the `handleTriggerTypeChange` logic that previously lived inside the
 * monolithic Trigger.tsx block (defaulting CASHBACK-EXPIRANDO antecedência,
 * seeding USO-UNICO date, clearing irrelevant fields, etc).
 *
 * The patch is intentionally narrow — fields not relevant to the new trigger
 * are nulled so they don't leak into the persisted record. Re-picking a trigger
 * after configuring some fields will reset only the trigger-specific section.
 */
export function getTriggerDefaultsPatch(value: TCampaignTriggerTypeEnum, current: TCampaign): Partial<TCampaign> {
	// USO-UNICO: seed today's date if not present, clear other trigger fields.
	if (value === "USO-UNICO") {
		return {
			gatilhoTipo: value,
			gatilhoUsoUnicoDataReferencia: current.gatilhoUsoUnicoDataReferencia ?? dayjs().format("YYYY-MM-DD"),
			gatilhoPromocaoDataReferencia: null,
			gatilhoPromocaoProdutos: null,
			// clear unrelated trigger fields
			gatilhoNovaCompraValorMinimo: null,
			gatilhoTempoPermanenciaMedida: null,
			gatilhoTempoPermanenciaValor: null,
			gatilhoNovoCashbackAcumuladoValorMinimo: null,
			gatilhoTotalCashbackAcumuladoValorMinimo: null,
			gatilhoCashbackExpirandoAntecedenciaValor: null,
			gatilhoCashbackExpirandoAntecedenciaMedida: null,
			gatilhoCashbackExpirandoValorMinimo: null,
			gatilhoQuantidadeTotalCompras: null,
			gatilhoValorTotalCompras: null,
			recorrenciaTipo: null,
			recorrenciaIntervalo: 1,
			recorrenciaDiasSemana: null,
			recorrenciaDiasMes: null,
		};
	}

	// PROMOCAO-PRODUTOS: seed today's date and an empty product list, clear other trigger fields.
	if (value === "PROMOCAO-PRODUTOS") {
		return {
			gatilhoTipo: value,
			gatilhoPromocaoDataReferencia: current.gatilhoPromocaoDataReferencia ?? dayjs().format("YYYY-MM-DD"),
			gatilhoPromocaoProdutos: current.gatilhoPromocaoProdutos ?? [],
			// clear unrelated trigger fields
			gatilhoUsoUnicoDataReferencia: null,
			gatilhoNovaCompraValorMinimo: null,
			gatilhoTempoPermanenciaMedida: null,
			gatilhoTempoPermanenciaValor: null,
			gatilhoNovoCashbackAcumuladoValorMinimo: null,
			gatilhoTotalCashbackAcumuladoValorMinimo: null,
			gatilhoCashbackExpirandoAntecedenciaValor: null,
			gatilhoCashbackExpirandoAntecedenciaMedida: null,
			gatilhoCashbackExpirandoValorMinimo: null,
			gatilhoQuantidadeTotalCompras: null,
			gatilhoValorTotalCompras: null,
			recorrenciaTipo: null,
			recorrenciaIntervalo: 1,
			recorrenciaDiasSemana: null,
			recorrenciaDiasMes: null,
		};
	}

	// CASHBACK-EXPIRANDO: prefill antecedência if not already set.
	if (value === "CASHBACK-EXPIRANDO") {
		const shouldPrefillValor =
			typeof current.gatilhoCashbackExpirandoAntecedenciaValor !== "number" || current.gatilhoCashbackExpirandoAntecedenciaValor <= 0;
		const shouldPrefillMedida = !current.gatilhoCashbackExpirandoAntecedenciaMedida;
		return {
			gatilhoTipo: value,
			gatilhoUsoUnicoDataReferencia: null,
			gatilhoPromocaoDataReferencia: null,
			gatilhoPromocaoProdutos: null,
			...(shouldPrefillValor ? { gatilhoCashbackExpirandoAntecedenciaValor: 3 } : {}),
			...(shouldPrefillMedida ? { gatilhoCashbackExpirandoAntecedenciaMedida: "DIAS" as const } : {}),
			// clear unrelated trigger fields
			gatilhoNovaCompraValorMinimo: null,
			gatilhoTempoPermanenciaMedida: null,
			gatilhoTempoPermanenciaValor: null,
			gatilhoNovoCashbackAcumuladoValorMinimo: null,
			gatilhoTotalCashbackAcumuladoValorMinimo: null,
			gatilhoCashbackExpirandoValorMinimo: current.gatilhoCashbackExpirandoValorMinimo || 10,
			gatilhoQuantidadeTotalCompras: null,
			gatilhoValorTotalCompras: null,
			recorrenciaTipo: null,
			recorrenciaIntervalo: 1,
			recorrenciaDiasSemana: null,
			recorrenciaDiasMes: null,
		};
	}

	// RECORRENTE: seed defaults for recurrence config, clear date.
	if (value === "RECORRENTE") {
		return {
			gatilhoTipo: value,
			gatilhoUsoUnicoDataReferencia: null,
			gatilhoPromocaoDataReferencia: null,
			gatilhoPromocaoProdutos: null,
			recorrenciaTipo: current.recorrenciaTipo ?? "SEMANAL",
			recorrenciaIntervalo: current.recorrenciaIntervalo ?? 1,
			// clear unrelated trigger fields
			gatilhoNovaCompraValorMinimo: null,
			gatilhoTempoPermanenciaMedida: null,
			gatilhoTempoPermanenciaValor: null,
			gatilhoNovoCashbackAcumuladoValorMinimo: null,
			gatilhoTotalCashbackAcumuladoValorMinimo: null,
			gatilhoCashbackExpirandoAntecedenciaValor: null,
			gatilhoCashbackExpirandoAntecedenciaMedida: null,
			gatilhoCashbackExpirandoValorMinimo: null,
			gatilhoQuantidadeTotalCompras: null,
			gatilhoValorTotalCompras: null,
		};
	}

	// Default: clear non-relevant fields, set gatilhoTipo.
	return {
		gatilhoTipo: value,
		gatilhoUsoUnicoDataReferencia: null,
		recorrenciaTipo: null,
		recorrenciaIntervalo: 1,
		recorrenciaDiasSemana: null,
		recorrenciaDiasMes: null,
		// clear specific fields tied to other triggers; keep ones that match.
		...(value !== "NOVA-COMPRA" && value !== "PRIMEIRA-COMPRA" ? { gatilhoNovaCompraValorMinimo: null } : {}),
		...(value !== "PERMANÊNCIA-SEGMENTAÇÃO" ? { gatilhoTempoPermanenciaMedida: null, gatilhoTempoPermanenciaValor: null } : {}),
		...(value !== "CASHBACK-ACUMULADO" ? { gatilhoNovoCashbackAcumuladoValorMinimo: null, gatilhoTotalCashbackAcumuladoValorMinimo: null } : {}),
		gatilhoCashbackExpirandoAntecedenciaValor: null,
		gatilhoCashbackExpirandoAntecedenciaMedida: null,
		gatilhoCashbackExpirandoValorMinimo: null,
		...(value !== "QUANTIDADE-TOTAL-COMPRAS" ? { gatilhoQuantidadeTotalCompras: null } : {}),
		...(value !== "VALOR-TOTAL-COMPRAS" ? { gatilhoValorTotalCompras: null } : {}),
	};
}

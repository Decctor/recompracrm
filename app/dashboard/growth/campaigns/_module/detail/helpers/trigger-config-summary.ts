import type { TGetCampaignsOutputById } from "@/app/api/campaigns/route";
import { formatToMoney } from "@/lib/formatting";
import { DaysOfWeekOptions, RecurrenceFrequencyOptions } from "@/utils/select-options";
import dayjs from "dayjs";

function formatDuration(value: number | null | undefined, unit: string | null | undefined) {
	if (value == null) return null;
	const normalized = (unit ?? "DIAS").toLowerCase();
	return `${value} ${normalized}`;
}

function parseDaysJson(value: string | null | undefined): number[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.map(Number) : [];
	} catch {
		return [];
	}
}

/** Um item da configuração do gatilho. Sem `label`, é uma frase que se explica sozinha. */
export type TTriggerConfigItem = { label: string | null; value: string };

function dispatchDate(value: string | null | undefined): TTriggerConfigItem {
	return { label: "Data do disparo", value: value ? dayjs(value).format("DD/MM/YYYY") : "Não definida" };
}

export function getTriggerConfigSummary(campaign: TGetCampaignsOutputById): TTriggerConfigItem[] {
	const lines: TTriggerConfigItem[] = [];

	switch (campaign.gatilhoTipo) {
		case "USO-UNICO":
			lines.push(dispatchDate(campaign.gatilhoUsoUnicoDataReferencia));
			break;
		case "PROMOCAO-PRODUTOS": {
			lines.push(dispatchDate(campaign.gatilhoPromocaoDataReferencia));
			const promotionProducts = campaign.gatilhoPromocaoProdutos ?? [];
			lines.push({ label: "Produtos", value: promotionProducts.length > 0 ? `${promotionProducts.length} na promoção` : "Nenhum selecionado" });
			const withOverride = promotionProducts.filter((promotionProduct) => promotionProduct.precoPromocional != null).length;
			if (withOverride > 0) lines.push({ label: "Preço promocional", value: `${withOverride} produto(s)` });
			break;
		}
		case "PESQUISA":
			lines.push(dispatchDate(campaign.gatilhoPesquisaDataReferencia));
			lines.push({ label: "Pergunta", value: campaign.pesquisaCampo ? campaign.pesquisaCampo.titulo : "Campo não definido" });
			break;
		case "RECORRENTE": {
			const freqLabel =
				RecurrenceFrequencyOptions.find((option) => option.value === campaign.recorrenciaTipo)?.label ?? campaign.recorrenciaTipo ?? "Não definida";
			lines.push({ label: "Frequência", value: freqLabel });
			lines.push({ label: "Intervalo", value: `A cada ${campaign.recorrenciaIntervalo ?? 1}` });
			if (campaign.recorrenciaTipo === "SEMANAL") {
				const days = parseDaysJson(campaign.recorrenciaDiasSemana);
				const labels = days.map((day) => DaysOfWeekOptions.find((option) => option.value === day)?.label ?? String(day));
				lines.push({ label: "Dias da semana", value: labels.length > 0 ? labels.join(", ") : "Nenhum selecionado" });
			}
			if (campaign.recorrenciaTipo === "MENSAL") {
				const days = parseDaysJson(campaign.recorrenciaDiasMes);
				lines.push({ label: "Dias do mês", value: days.length > 0 ? days.join(", ") : "Nenhum selecionado" });
			}
			break;
		}
		case "NOVA-COMPRA":
			lines.push({
				label: "Valor mínimo da compra",
				value: campaign.gatilhoNovaCompraValorMinimo != null ? formatToMoney(campaign.gatilhoNovaCompraValorMinimo) : "Qualquer valor",
			});
			break;
		case "PRIMEIRA-COMPRA":
			lines.push({ label: null, value: "Dispara na primeira compra do cliente." });
			break;
		case "PERMANÊNCIA-SEGMENTAÇÃO": {
			const duration = formatDuration(campaign.gatilhoTempoPermanenciaValor, campaign.gatilhoTempoPermanenciaMedida);
			lines.push({ label: "Permanência", value: duration ?? "Não definida" });
			break;
		}
		case "ENTRADA-SEGMENTAÇÃO":
			lines.push({ label: null, value: "Dispara ao entrar na segmentação selecionada." });
			break;
		case "CASHBACK-ACUMULADO": {
			if (campaign.gatilhoNovoCashbackAcumuladoValorMinimo != null) {
				lines.push({ label: "Novo cashback mínimo", value: formatToMoney(campaign.gatilhoNovoCashbackAcumuladoValorMinimo) });
			}
			if (campaign.gatilhoTotalCashbackAcumuladoValorMinimo != null) {
				lines.push({ label: "Total acumulado mínimo", value: formatToMoney(campaign.gatilhoTotalCashbackAcumuladoValorMinimo) });
			}
			if (lines.length === 0) lines.push({ label: null, value: "Dispara em qualquer novo cashback acumulado." });
			break;
		}
		case "CASHBACK-EXPIRANDO": {
			const antecedencia = formatDuration(campaign.gatilhoCashbackExpirandoAntecedenciaValor, campaign.gatilhoCashbackExpirandoAntecedenciaMedida);
			if (antecedencia) lines.push({ label: "Antecedência", value: antecedencia });
			if (campaign.gatilhoCashbackExpirandoValorMinimo != null) {
				lines.push({ label: "Valor mínimo para avisar", value: formatToMoney(campaign.gatilhoCashbackExpirandoValorMinimo) });
			}
			break;
		}
		case "QUANTIDADE-TOTAL-COMPRAS":
			lines.push({
				label: "Compras acumuladas",
				value: campaign.gatilhoQuantidadeTotalCompras ? String(campaign.gatilhoQuantidadeTotalCompras) : "Não definida",
			});
			break;
		case "VALOR-TOTAL-COMPRAS":
			lines.push({ label: "Valor total", value: campaign.gatilhoValorTotalCompras ? formatToMoney(campaign.gatilhoValorTotalCompras) : "Não definido" });
			break;
		case "PIOR-DIA-VENDAS":
			lines.push({ label: null, value: "Calculado automaticamente pelo dia mais fraco das últimas 8 semanas." });
			break;
		case "ANIVERSARIO_CLIENTE":
			lines.push({ label: null, value: "Dispara no aniversário do cliente (antes ou depois, conforme o envio)." });
			break;
		default:
			break;
	}

	return lines;
}

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

export function getTriggerConfigSummary(campaign: TGetCampaignsOutputById): string[] {
	const lines: string[] = [];

	switch (campaign.gatilhoTipo) {
		case "USO-UNICO":
			lines.push(
				campaign.gatilhoUsoUnicoDataReferencia
					? `Disparo em ${dayjs(campaign.gatilhoUsoUnicoDataReferencia).format("DD/MM/YYYY")}`
					: "Data de disparo não definida",
			);
			break;
		case "PROMOCAO-PRODUTOS": {
			lines.push(
				campaign.gatilhoPromocaoDataReferencia
					? `Disparo em ${dayjs(campaign.gatilhoPromocaoDataReferencia).format("DD/MM/YYYY")}`
					: "Data de disparo não definida",
			);
			const promotionProducts = campaign.gatilhoPromocaoProdutos ?? [];
			lines.push(promotionProducts.length > 0 ? `${promotionProducts.length} produto(s) na promoção` : "Nenhum produto selecionado");
			const withOverride = promotionProducts.filter((promotionProduct) => promotionProduct.precoPromocional != null).length;
			if (withOverride > 0) lines.push(`${withOverride} com preço promocional definido`);
			break;
		}
		case "RECORRENTE": {
			const freqLabel =
				RecurrenceFrequencyOptions.find((option) => option.value === campaign.recorrenciaTipo)?.label ?? campaign.recorrenciaTipo ?? "Não definida";
			const interval = campaign.recorrenciaIntervalo ?? 1;
			lines.push(`${freqLabel}, a cada ${interval} intervalo(s)`);
			if (campaign.recorrenciaTipo === "SEMANAL") {
				const days = parseDaysJson(campaign.recorrenciaDiasSemana);
				const labels = days.map((day) => DaysOfWeekOptions.find((option) => option.value === day)?.label ?? String(day));
				lines.push(labels.length > 0 ? `Dias: ${labels.join(", ")}` : "Nenhum dia da semana selecionado");
			}
			if (campaign.recorrenciaTipo === "MENSAL") {
				const days = parseDaysJson(campaign.recorrenciaDiasMes);
				lines.push(days.length > 0 ? `Dias do mês: ${days.join(", ")}` : "Nenhum dia do mês selecionado");
			}
			break;
		}
		case "NOVA-COMPRA":
			lines.push(
				campaign.gatilhoNovaCompraValorMinimo != null
					? `Valor mínimo: ${formatToMoney(campaign.gatilhoNovaCompraValorMinimo)}`
					: "Qualquer valor de compra",
			);
			break;
		case "PRIMEIRA-COMPRA":
			lines.push("Dispara na primeira compra do cliente");
			break;
		case "PERMANÊNCIA-SEGMENTAÇÃO": {
			const duration = formatDuration(campaign.gatilhoTempoPermanenciaValor, campaign.gatilhoTempoPermanenciaMedida);
			lines.push(duration ? `Permanência: ${duration}` : "Tempo de permanência não definido");
			break;
		}
		case "ENTRADA-SEGMENTAÇÃO":
			lines.push("Dispara ao entrar na segmentação selecionada");
			break;
		case "CASHBACK-ACUMULADO": {
			if (campaign.gatilhoNovoCashbackAcumuladoValorMinimo != null) {
				lines.push(`Novo cashback mín.: ${formatToMoney(campaign.gatilhoNovoCashbackAcumuladoValorMinimo)}`);
			}
			if (campaign.gatilhoTotalCashbackAcumuladoValorMinimo != null) {
				lines.push(`Total acumulado mín.: ${formatToMoney(campaign.gatilhoTotalCashbackAcumuladoValorMinimo)}`);
			}
			if (lines.length === 0) lines.push("Dispara em qualquer novo cashback acumulado");
			break;
		}
		case "CASHBACK-EXPIRANDO": {
			const antecedencia = formatDuration(
				campaign.gatilhoCashbackExpirandoAntecedenciaValor,
				campaign.gatilhoCashbackExpirandoAntecedenciaMedida,
			);
			if (antecedencia) lines.push(`Antecedência: ${antecedencia}`);
			if (campaign.gatilhoCashbackExpirandoValorMinimo != null) {
				lines.push(`Valor mínimo para avisar: ${formatToMoney(campaign.gatilhoCashbackExpirandoValorMinimo)}`);
			}
			break;
		}
		case "QUANTIDADE-TOTAL-COMPRAS":
			lines.push(
				campaign.gatilhoQuantidadeTotalCompras
					? `${campaign.gatilhoQuantidadeTotalCompras} compra(s) acumuladas`
					: "Quantidade não definida",
			);
			break;
		case "VALOR-TOTAL-COMPRAS":
			lines.push(
				campaign.gatilhoValorTotalCompras
					? `Valor total: ${formatToMoney(campaign.gatilhoValorTotalCompras)}`
					: "Valor não definido",
			);
			break;
		case "PIOR-DIA-VENDAS":
			lines.push("Calculado automaticamente pelo dia mais fraco das últimas 8 semanas");
			break;
		case "ANIVERSARIO_CLIENTE":
			lines.push("Dispara no aniversário do cliente (antes/depois configurado no envio)");
			break;
		default:
			break;
	}

	return lines;
}

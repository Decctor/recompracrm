import type { OverallSalesStatsResult, PartnerRankingItem, ProductRankingItem, SellerRankingItem } from "./data-fetchers";
import { formatComparisonWithEmoji, formatCurrency, formatNumber, formatPercentage, truncateText } from "./formatters";

type ReportMessageInput = {
	orgNome: string;
	periodo: string;
	stats: OverallSalesStatsResult;
	topSellers: SellerRankingItem[];
	topPartners: PartnerRankingItem[];
	topProducts: ProductRankingItem[];
};

function safeCurrency(value: number): string {
	return formatCurrency(Number.isFinite(value) ? value : 0);
}

function safeNumber(value: number): string {
	return formatNumber(Number.isFinite(value) ? value : 0);
}

function formatSellerLines(sellers: SellerRankingItem[], showMeta = false): string {
	if (sellers.length === 0) return "   _Nenhuma venda registrada_";
	return sellers
		.map((s, i) => {
			const metaInfo = showMeta && s.meta > 0 ? ` (${formatPercentage(s.percentualMeta)} da meta)` : "";
			return `   ${i + 1}. ${truncateText(s.vendedorNome, 25)} — ${formatCurrency(s.faturamento)}${metaInfo}`;
		})
		.join("\n");
}

function formatPartnerLines(partners: PartnerRankingItem[], showQty = false): string {
	if (partners.length === 0) return "   _Nenhum parceiro registrado_";
	return partners
		.map((p, i) => {
			const qtyInfo = showQty ? ` (${formatNumber(p.qtdeVendas)} vendas)` : "";
			return `   ${i + 1}. ${truncateText(p.parceiroNome, 25)} — ${formatCurrency(p.faturamento)}${qtyInfo}`;
		})
		.join("\n");
}

function formatProductLines(products: ProductRankingItem[], showQty = false): string {
	if (products.length === 0) return "   _Nenhum produto vendido_";
	return products
		.map((p, i) => {
			const qtyInfo = showQty ? ` (${formatNumber(p.quantidade)} un.)` : "";
			return `   ${i + 1}. ${truncateText(p.produtoDescricao, 25)} — ${formatCurrency(p.faturamento)}${qtyInfo}`;
		})
		.join("\n");
}

export function buildDailyReportMessage({ orgNome, periodo, stats, topSellers, topPartners, topProducts }: ReportMessageInput): string {
	const comparacao = formatComparisonWithEmoji(stats.faturamento.atual, stats.faturamento.anterior);

	return `📊 *RELATÓRIO DIÁRIO DE VENDAS*
📅 ${periodo} · ${orgNome}
${"─".repeat(30)}

💰 *Faturamento do dia:* ${formatCurrency(stats.faturamento.atual)}
${comparacao} vs. dia anterior
🎯 *Meta:* ${formatCurrency(stats.faturamentoMeta)} (${formatPercentage(stats.faturamentoMetaPorcentagem)} atingido)

📈 *Resumo do Dia*
• Vendas realizadas: *${formatNumber(stats.qtdeVendas.atual)}*
• Ticket médio: *${safeCurrency(stats.ticketMedio.atual)}*
• Itens vendidos: *${safeNumber(stats.qtdeItensVendidos.atual)}*

🏆 *Top Vendedores*
${formatSellerLines(topSellers)}

🤝 *Top Parceiros*
${formatPartnerLines(topPartners)}

📦 *Top Produtos*
${formatProductLines(topProducts)}

_Relatório automático · Recompra CRM_`;
}

export function buildWeeklyReportMessage({ orgNome, periodo, stats, topSellers, topPartners, topProducts }: ReportMessageInput): string {
	const comparacao = formatComparisonWithEmoji(stats.faturamento.atual, stats.faturamento.anterior);

	return `📊 *RELATÓRIO SEMANAL DE VENDAS*
📅 ${periodo} · ${orgNome}
${"─".repeat(30)}

💰 *Faturamento da semana:* ${formatCurrency(stats.faturamento.atual)}
${comparacao} vs. semana anterior
🎯 *Meta:* ${formatCurrency(stats.faturamentoMeta)} (${formatPercentage(stats.faturamentoMetaPorcentagem)} atingido)

📈 *Indicadores da Semana*
• Total de vendas: *${formatNumber(stats.qtdeVendas.atual)}*
• Ticket médio: *${safeCurrency(stats.ticketMedio.atual)}*
• Itens vendidos: *${safeNumber(stats.qtdeItensVendidos.atual)}*
• Média diária: *${safeCurrency(stats.valorDiarioVendido.atual)}*
• Margem bruta: *${safeCurrency(stats.margemBruta.atual)}*

🏆 *Top Vendedores*
${formatSellerLines(topSellers, true)}

🤝 *Top Parceiros*
${formatPartnerLines(topPartners, true)}

📦 *Top Produtos*
${formatProductLines(topProducts, true)}

_Relatório automático · Recompra CRM_`;
}

export function buildMonthlyReportMessage({ orgNome, periodo, stats, topSellers, topPartners, topProducts }: ReportMessageInput): string {
	const comparacao = formatComparisonWithEmoji(stats.faturamento.atual, stats.faturamento.anterior);

	return `📊 *RELATÓRIO MENSAL DE VENDAS*
📅 ${periodo} · ${orgNome}
${"─".repeat(30)}

💰 *Faturamento do mês:* ${formatCurrency(stats.faturamento.atual)}
${comparacao} vs. mês anterior
🎯 *Meta:* ${formatCurrency(stats.faturamentoMeta)} (${formatPercentage(stats.faturamentoMetaPorcentagem)} atingido)

📈 *Indicadores do Mês*
• Total de vendas: *${formatNumber(stats.qtdeVendas.atual)}*
• Ticket médio: *${safeCurrency(stats.ticketMedio.atual)}*
• Itens vendidos: *${safeNumber(stats.qtdeItensVendidos.atual)}*
• Itens por venda (média): *${safeNumber(stats.itensPorVendaMedio.atual)}*
• Média diária: *${safeCurrency(stats.valorDiarioVendido.atual)}*
• Margem bruta: *${safeCurrency(stats.margemBruta.atual)}*

🏆 *Top Vendedores*
${formatSellerLines(topSellers, true)}

🤝 *Top Parceiros*
${formatPartnerLines(topPartners, true)}

📦 *Top Produtos*
${formatProductLines(topProducts, true)}

_Relatório automático · Recompra CRM_`;
}

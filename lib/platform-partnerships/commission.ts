import {
	PLATFORM_PARTNER_ADDON_INVOICE_BPS,
	PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS,
	PLATFORM_PARTNER_MONTHLY_SUBSEQUENT_INVOICE_BPS,
	PLATFORM_PARTNER_MONTHLY_THIRD_INVOICE_BPS,
	PLATFORM_PARTNER_YEARLY_INVOICE_BPS,
} from "./constants";

/**
 * Cálculo da comissão de parceiro sobre um invoice pago. Puro: o webhook lê o invoice, conta os
 * invoices anteriores e grava; a regra mora aqui.
 *
 * Três parcelas por invoice:
 * - plano-base: a regra de bônus (100% no 1º e no 3º invoice mensal, 20% nos demais, 27% no anual);
 * - adicionais comissionáveis (Hub de Atendimentos): taxa fixa;
 * - consultoria: nada — é serviço, não software.
 */

export type TInvoiceCommissionLine = { amount: number; priceId: string | null; isYearly: boolean };

export function splitInvoiceCommissionBase({
	lines,
	consultoriaPriceIds,
	addonPriceIds,
}: {
	lines: TInvoiceCommissionLine[];
	consultoriaPriceIds: ReadonlySet<string>;
	addonPriceIds: ReadonlySet<string>;
}) {
	let valorConsultoriaCentavos = 0;
	let valorAdicionaisCentavos = 0;
	let valorBaseComissionavelCentavos = 0;
	let hasYearlyBaseLine = false;

	for (const line of lines) {
		if (line.priceId && consultoriaPriceIds.has(line.priceId)) {
			valorConsultoriaCentavos += line.amount;
			continue;
		}
		if (line.priceId && addonPriceIds.has(line.priceId)) {
			valorAdicionaisCentavos += line.amount;
			continue;
		}
		// Qualquer outra linha é plano-base — inclusive os prices dos tiers antigos e os da conta
		// SYNCRONIZA, que não estão em nenhum dos dois conjuntos.
		valorBaseComissionavelCentavos += line.amount;
		if (line.isYearly) hasYearlyBaseLine = true;
	}

	return { valorConsultoriaCentavos, valorAdicionaisCentavos, valorBaseComissionavelCentavos, hasYearlyBaseLine };
}

/**
 * `previousBaseInvoices` conta só os invoices anteriores que tinham plano-base. Um invoice sem
 * plano-base (o proporcional de um adicional contratado no meio do ciclo) não avança a numeração:
 * ele repete o número do último, e o bônus do 3º invoice continua sendo o da 3ª mensalidade.
 */
export function resolveInvoiceCommission({
	previousBaseInvoices,
	valorBaseComissionavelCentavos,
	valorAdicionaisCentavos,
	hasYearlyBaseLine,
}: {
	previousBaseInvoices: number;
	valorBaseComissionavelCentavos: number;
	valorAdicionaisCentavos: number;
	hasYearlyBaseLine: boolean;
}) {
	const hasBase = valorBaseComissionavelCentavos > 0;
	const numeroInvoiceAssinatura = hasBase ? previousBaseInvoices + 1 : Math.max(previousBaseInvoices, 1);

	let percentualComissaoBps = 0;
	if (hasBase) {
		if (hasYearlyBaseLine) percentualComissaoBps = PLATFORM_PARTNER_YEARLY_INVOICE_BPS;
		else if (numeroInvoiceAssinatura === 1) percentualComissaoBps = PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS;
		else if (numeroInvoiceAssinatura === 3) percentualComissaoBps = PLATFORM_PARTNER_MONTHLY_THIRD_INVOICE_BPS;
		else percentualComissaoBps = PLATFORM_PARTNER_MONTHLY_SUBSEQUENT_INVOICE_BPS;
	}
	const percentualComissaoAdicionaisBps = valorAdicionaisCentavos > 0 ? PLATFORM_PARTNER_ADDON_INVOICE_BPS : 0;

	const valorComissaoBaseCentavos = hasBase ? Math.round((valorBaseComissionavelCentavos * percentualComissaoBps) / 10000) : 0;
	const valorComissaoAdicionaisCentavos = Math.round((Math.max(valorAdicionaisCentavos, 0) * percentualComissaoAdicionaisBps) / 10000);

	return {
		numeroInvoiceAssinatura,
		percentualComissaoBps,
		percentualComissaoAdicionaisBps,
		valorComissaoCentavos: valorComissaoBaseCentavos + valorComissaoAdicionaisCentavos,
	};
}

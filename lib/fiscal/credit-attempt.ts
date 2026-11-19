import type { TFiscalSaleContext, TFiscalOrganization } from "./types";
import createHttpError from "http-errors";

export function snapshotFiscalCreditContext(context: TFiscalSaleContext) {
	if (!context.organizacao.fiscalConfiguracao?.operacoesRevenda?.habilitada) return undefined;
	const { spedy: _credentials, ...config } = context.organizacao.fiscalConfiguracao;
	return {
		...context,
		organizacao: { id: context.organizacao.id, fiscalProvedor: context.organizacao.fiscalProvedor, fiscalConfiguracao: config },
	};
}

export function restoreFiscalCreditContext(snapshot: string, organization: TFiscalOrganization, saleId: string): TFiscalSaleContext | null {
	const stored = JSON.parse(snapshot).contextoFiscal as TFiscalSaleContext | undefined;
	if (!stored) return null;
	if (stored.venda?.organizacaoId !== organization.id || stored.venda?.id !== saleId || stored.organizacao?.id !== organization.id)
		throw new createHttpError.Conflict("Contexto fiscal incompatível com a venda.");
	const date = new Date(stored.dataCalculo!);
	if (!Number.isFinite(date.getTime())) throw new createHttpError.Conflict("Data do contexto fiscal inválida. Revise a emissão manualmente.");
	return {
		...stored,
		dataCalculo: date,
		organizacao: {
			...organization,
			fiscalProvedor: stored.organizacao.fiscalProvedor,
			fiscalConfiguracao: stored.organizacao.fiscalConfiguracao
				? { ...stored.organizacao.fiscalConfiguracao, spedy: organization.fiscalConfiguracao?.spedy ?? stored.organizacao.fiscalConfiguracao.spedy }
				: null,
		},
	};
}

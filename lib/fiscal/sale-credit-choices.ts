import type { TFiscalSaleChoices } from "@/schemas/fiscal";
import createHttpError from "http-errors";

export function resolveSaleFiscalChoices({
	requested,
	current = {},
	canEmit,
	documents = [],
}: {
	requested: TFiscalSaleChoices;
	current?: TFiscalSaleChoices;
	canEmit: boolean;
	documents?: { statusInterno: string | null }[];
}): TFiscalSaleChoices {
	const result = {
		fiscalDestinacao: requested.fiscalDestinacao === undefined ? (current.fiscalDestinacao ?? null) : requested.fiscalDestinacao,
		fiscalCreditoIcms: requested.fiscalCreditoIcms === undefined ? (current.fiscalCreditoIcms ?? null) : requested.fiscalCreditoIcms,
	};
	const changed = result.fiscalDestinacao !== (current.fiscalDestinacao ?? null) || result.fiscalCreditoIcms !== (current.fiscalCreditoIcms ?? null);
	if (changed && !canEmit) throw new createHttpError.Forbidden("Você não possui permissão para alterar o tratamento fiscal desta venda.");
	if (changed && documents.some((d) => !["ERRO", "REJEITADO", "CANCELADO", "INUTILIZADO"].includes(d.statusInterno ?? "")))
		throw new createHttpError.Conflict("Esta venda possui documento fiscal ativo. O tratamento fiscal não pode ser alterado.");
	return result;
}

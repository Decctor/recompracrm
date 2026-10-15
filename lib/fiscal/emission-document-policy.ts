import type { TFiscalDocumentTypeEnum } from "@/schemas/enums";
import createHttpError from "http-errors";
import { resolveAutoDocumentType, type TAutoDocumentTypeSignals } from "./sale-fiscal-signals";

export type TSaleFiscalDocument = Extract<TFiscalDocumentTypeEnum, "NFE" | "NFCE">;

export function selectFiscalDocumentType({
	requested,
	signals,
	nfeConfigured,
}: {
	requested?: TSaleFiscalDocument | null;
	signals: TAutoDocumentTypeSignals;
	nfeConfigured: boolean;
}): TSaleFiscalDocument {
	if (requested) return requested;
	return resolveAutoDocumentType(signals) === "NFE" && nfeConfigured ? "NFE" : "NFCE";
}

// A preferência é intenção, não uma cópia do resultado automático. Nunca colapsar uma
// escolha explícita que hoje coincide com a sugestão: cliente/canal podem mudar depois.
export function resolveSaleFiscalDocumentPreference({
	requested,
	current = null,
	canEmit,
	documents = [],
}: {
	requested?: TSaleFiscalDocument | null;
	current?: TSaleFiscalDocument | null;
	canEmit: boolean;
	documents?: { statusInterno: string | null }[];
}): TSaleFiscalDocument | null {
	if (requested === undefined || requested === current) return current;
	if (!canEmit) throw new createHttpError.Forbidden("Você não tem permissão para alterar o modelo fiscal desta venda.");
	if (documents.some((document) => !["CANCELADO", "INUTILIZADO"].includes(document.statusInterno ?? ""))) {
		throw new createHttpError.Conflict("Esta venda já possui documento fiscal. Use o fluxo do documento existente.");
	}
	return requested;
}

export function getFiscalRecipientIssues({
	tipo,
	entregaModalidade,
	cpfCnpjValid,
	addressComplete,
	ufOrigem,
	ufDestino,
}: {
	tipo: TSaleFiscalDocument;
	entregaModalidade?: string | null;
	cpfCnpjValid: boolean;
	addressComplete: boolean;
	ufOrigem?: string | null;
	ufDestino?: string | null;
}) {
	const issues: string[] = [];
	if (tipo === "NFE" || entregaModalidade === "ENTREGA") {
		if (!cpfCnpjValid) issues.push("Vincule um cliente com CPF ou CNPJ válido para emitir esta nota.");
		if (!addressComplete) issues.push("Complete o endereço fiscal do cliente ou da entrega para emitir esta nota.");
	}
	if (tipo === "NFCE" && entregaModalidade === "ENTREGA" && ufOrigem && ufDestino && ufOrigem.toUpperCase() !== ufDestino.toUpperCase()) {
		issues.push("Para entrega em outro estado, selecione NF-e.");
	}
	return issues;
}

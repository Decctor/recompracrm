import type { TFiscalDocumentTypeEnum } from "@/schemas/enums";
import { getFiscalDocumentConfiguration } from "./document-preview";
import { loadFiscalOrganization } from "./settings";
import { selectFiscalDocumentType, type TSaleFiscalDocument } from "./emission-document-policy";
import createHttpError from "http-errors";
import { resolveAutoDocumentType, type TAutoDocumentTypeSignals } from "./sale-fiscal-signals";

export type { TAutoDocumentTypeSignals, TFiscalOperationProfileSignals } from "./sale-fiscal-signals";
export { resolveAutoDocumentType, resolveExpectedConsumerPresenceCandidates } from "./sale-fiscal-signals";

// Resolve o tipo considerando a configuracao da organizacao: se a NF-e for preferida mas nao houver
// operacao fiscal configurada para NF-e, cai para NFC-e (default seguro do varejo).
export async function resolveEmissionDocumentType({
	organizacaoId,
	signals,
	emissaoFiscalDocumento,
}: {
	organizacaoId: string;
	operacaoPadraoNfeId?: string | null;
	signals: TAutoDocumentTypeSignals;
	emissaoFiscalDocumento?: TSaleFiscalDocument | null;
}): Promise<Extract<TFiscalDocumentTypeEnum, "NFCE" | "NFE">> {
	// Explicit choices are authoritative and must never fall back to another model.
	if (emissaoFiscalDocumento) {
		const organization = await loadFiscalOrganization(organizacaoId);
		if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");
		const option = await getFiscalDocumentConfiguration({ organization, tipo: emissaoFiscalDocumento, signals });
		if (!option.configurado) throw new createHttpError.BadRequest(option.problemas.join(" "));
		return emissaoFiscalDocumento;
	}
	const preferred = resolveAutoDocumentType(signals);
	if (preferred === "NFCE") return "NFCE";

	const organization = await loadFiscalOrganization(organizacaoId);
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");
	const option = await getFiscalDocumentConfiguration({ organization, tipo: "NFE", signals });
	return selectFiscalDocumentType({ signals, nfeConfigured: option.configurado });
}

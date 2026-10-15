import type { TOrganizationFiscalConfig } from "@/schemas/fiscal";

/**
 * Capacidade básica por modelo: Spedy, chave da empresa e certificado; NFC-e exige CSC/token.
 * Perfis, séries e destinatário são conferidos na previsão e novamente na emissão.
 */
type TFiscalCapabilityOrganization = {
	fiscalProvedor: "MANUAL" | "SPEDY" | null | undefined;
	fiscalConfiguracao: TOrganizationFiscalConfig | null | undefined;
};

export function isOrganizationFiscalDocumentCapable(organization: TFiscalCapabilityOrganization, tipo: "NFE" | "NFCE"): boolean {
	if (organization.fiscalProvedor !== "SPEDY") return false;

	const config = organization.fiscalConfiguracao;
	if (!config) return false;
	if (tipo === "NFCE" && (!config.spedy?.nfce?.csc || !config.spedy.nfce.tokenId)) return false;
	if (!config.spedy?.certificado?.providerManaged && !config.spedy?.certificado?.storagePath) return false;
	if (!config.spedy?.companyApiKey) return false;
	if (config.spedy.certificado.validTo && new Date(config.spedy.certificado.validTo) <= new Date()) return false;

	return true;
}

export function isOrganizationAutoFiscalCapable(organization: TFiscalCapabilityOrganization): boolean {
	return isOrganizationFiscalDocumentCapable(organization, "NFE") || isOrganizationFiscalDocumentCapable(organization, "NFCE");
}

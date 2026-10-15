import assert from "node:assert/strict";
import test from "node:test";
import { getFiscalRecipientIssues, resolveSaleFiscalDocumentPreference, selectFiscalDocumentType } from "./emission-document-policy";
import { isOrganizationAutoFiscalCapable, isOrganizationFiscalDocumentCapable } from "./auto-emission-capability";
import { OrganizationFiscalConfigSchema, SaleFiscalDocumentSchema } from "@/schemas/fiscal";
import { resolveSaleFiscalEmissionOverride } from "@/lib/sales/sale-fiscal-emission-override";
import type { TAuthUserSession } from "@/lib/authentication/types";

test("automático mantém varejo em NFC-e e prefere NF-e para CNPJ, SHOP e entrega", () => {
	for (const signals of [{ destinatarioCpfCnpj: "53.825.696/0001-51" }, { canal: "SHOP" }, { entregaModalidade: "ENTREGA" }]) {
		assert.equal(selectFiscalDocumentType({ signals, nfeConfigured: true }), "NFE");
		assert.equal(selectFiscalDocumentType({ signals, nfeConfigured: false }), "NFCE");
	}
	assert.equal(
		selectFiscalDocumentType({ signals: { canal: "POS", entregaModalidade: "PRESENCIAL", destinatarioCpfCnpj: "12345678901" }, nfeConfigured: true }),
		"NFCE",
	);
});

test("escolha explícita nunca sofre fallback nem é substituída pelos sinais", () => {
	assert.equal(selectFiscalDocumentType({ requested: "NFE", signals: {}, nfeConfigured: false }), "NFE");
	assert.equal(
		selectFiscalDocumentType({ requested: "NFCE", signals: { canal: "SHOP", destinatarioCpfCnpj: "53825696000151" }, nfeConfigured: true }),
		"NFCE",
	);
});

test("campo ausente preserva; null volta ao automático; escolha coincidente continua explícita", () => {
	assert.equal(resolveSaleFiscalDocumentPreference({ current: "NFE", canEmit: false }), "NFE");
	assert.equal(resolveSaleFiscalDocumentPreference({ requested: null, current: "NFE", canEmit: true }), null);
	assert.equal(resolveSaleFiscalDocumentPreference({ requested: "NFE", canEmit: true }), "NFE");
	assert.equal(resolveSaleFiscalDocumentPreference({ requested: "NFE", current: "NFE", canEmit: false }), "NFE");
});

test("trocar para qualquer modelo ou voltar ao automático exige permissão", () => {
	for (const requested of ["NFE", "NFCE", null] as const) {
		const current = requested === "NFE" ? "NFCE" : "NFE";
		assert.throws(() => resolveSaleFiscalDocumentPreference({ requested, current, canEmit: false }), { statusCode: 403 });
	}
});

test("documentos vivos ou rejeitados mantêm o modelo na retentativa", () => {
	for (const statusInterno of ["RASCUNHO", "PRONTO_PARA_ENVIO", "EM_PROCESSAMENTO", "AUTORIZADO", "ERRO", "REJEITADO", null]) {
		assert.throws(() => resolveSaleFiscalDocumentPreference({ requested: "NFE", canEmit: true, documents: [{ statusInterno }] }), { statusCode: 409 });
	}
	for (const statusInterno of ["CANCELADO", "INUTILIZADO"]) {
		assert.equal(resolveSaleFiscalDocumentPreference({ requested: "NFE", canEmit: true, documents: [{ statusInterno }] }), "NFE");
	}
});

test("NF-e exige identificação e endereço mesmo em venda presencial; NFC-e presencial pode ser anônima", () => {
	assert.equal(getFiscalRecipientIssues({ tipo: "NFE", entregaModalidade: "PRESENCIAL", cpfCnpjValid: false, addressComplete: false }).length, 2);
	assert.equal(getFiscalRecipientIssues({ tipo: "NFCE", entregaModalidade: "PRESENCIAL", cpfCnpjValid: false, addressComplete: false }).length, 0);
	assert.equal(getFiscalRecipientIssues({ tipo: "NFCE", entregaModalidade: "ENTREGA", cpfCnpjValid: false, addressComplete: false }).length, 2);
	assert.equal(getFiscalRecipientIssues({ tipo: "NFE", cpfCnpjValid: true, addressComplete: true }).length, 0);
});

test("entrega interestadual não pode ser forçada como NFC-e", () => {
	const recipient = { entregaModalidade: "ENTREGA", cpfCnpjValid: true, addressComplete: true, ufOrigem: "MG", ufDestino: "SP" };
	assert.equal(getFiscalRecipientIssues({ ...recipient, tipo: "NFCE" }).length, 1);
	assert.equal(getFiscalRecipientIssues({ ...recipient, tipo: "NFE" }).length, 0);
	assert.equal(getFiscalRecipientIssues({ ...recipient, tipo: "NFCE", ufDestino: "MG" }).length, 0);
});

test("capacidade NF-e independe de CSC de NFC-e e rejeita certificado vencido", () => {
	const config = OrganizationFiscalConfigSchema.parse({
		regimeTributario: 1,
		cpfCnpj: "53825696000151",
		nomeRazaoSocial: "Empresa",
		endereco: { logradouro: "Rua", numero: "1", bairro: "Centro", cidade: "Ituiutaba", codigoMunicipio: "3134202", cep: "38300140", uf: "MG" },
		spedy: { companyApiKey: "test-secret", certificado: { providerManaged: true, validTo: "2099-01-01T00:00:00.000Z" }, nfce: {} },
	});
	const org = { fiscalProvedor: "SPEDY" as const, fiscalConfiguracao: config };
	assert.equal(isOrganizationFiscalDocumentCapable(org, "NFE"), true);
	assert.equal(isOrganizationFiscalDocumentCapable(org, "NFCE"), false);
	assert.equal(isOrganizationAutoFiscalCapable(org), true);
	config.spedy.certificado.validTo = "2020-01-01T00:00:00.000Z";
	assert.equal(isOrganizationAutoFiscalCapable(org), false);
});

test("contrato aceita apenas automático, NF-e e NFC-e", () => {
	for (const value of [null, "NFE", "NFCE"]) assert.equal(SaleFiscalDocumentSchema.safeParse(value).success, true);
	for (const value of ["NFSE", "AUTOMATICO", false, ""]) assert.equal(SaleFiscalDocumentSchema.safeParse(value).success, false);
});

test("ligar explicitamente permanece explícito para superar exceções de pagamento", () => {
	const session = { membership: { permissoes: { fiscal: { emitir: true } } } } as TAuthUserSession;
	assert.equal(resolveSaleFiscalEmissionOverride({ requested: true, organizationDefault: true, session }), true);
	assert.equal(resolveSaleFiscalEmissionOverride({ requested: false, organizationDefault: false, session }), false);
	assert.equal(resolveSaleFiscalEmissionOverride({ requested: null, organizationDefault: true, session }), null);
});

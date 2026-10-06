import assert from "node:assert/strict";
import test from "node:test";
import { PaymentAttemptEvidenceSchema } from "@/schemas/payment-attempts";
import { fingerprintPaymentAttemptEvidence, isValidMaskedPan, sanitizePaymentAttemptEvidence, validateApprovedEvidence } from "./evidence";

const approved = PaymentAttemptEvidenceSchema.parse({
	tipo: "APROVADA",
	provedorStatus: "APPROVED",
	itk: "itk-1",
	atk: "atk-1",
	codigoAutorizacao: "187607",
	codigoResposta: "0",
	bandeira: "MASTERCARD",
	panMascarado: "627303****2166",
	modoEntrada: "ICC",
	valorAutorizado: 129.9,
	totalParcelas: 1,
	dataAutorizacao: "2026-08-12T17:30:00.000Z",
});

test("o schema descarta chaves fora da allowlist antes de qualquer persistência", () => {
	const parsed = PaymentAttemptEvidenceSchema.parse({ tipo: "APROVADA", itk: "x", cardholder_name: "MARIA", pan: "6273030000002166", rawUri: "payment-app://..." });
	assert.deepEqual(Object.keys(parsed).filter((key) => (parsed as Record<string, unknown>)[key] !== undefined).sort(), ["itk", "tipo"]);
});

test("PAN só é persistido mascarado", () => {
	assert.equal(isValidMaskedPan("627303****2166"), true);
	assert.equal(isValidMaskedPan("************2166"), true);
	assert.equal(isValidMaskedPan("6273030000002166"), false);
	assert.equal(isValidMaskedPan("627303**2166"), false);
	const sanitized = sanitizePaymentAttemptEvidence({ ...approved, panMascarado: "6273030000002166" });
	assert.equal(sanitized.panMascarado, null);
	assert.equal(sanitizePaymentAttemptEvidence(approved).panMascarado, "627303****2166");
});

test("identificadores com payload bruto são descartados e textos perdem caracteres de controle", () => {
	const sanitized = sanitizePaymentAttemptEvidence({ ...approved, tipo: "RECUSADA", itk: "payment-app://pay?x=1", mensagem: "Transação\u0000 negada\n pelo emissor" });
	assert.equal(sanitized.itk, null);
	assert.equal(sanitized.mensagem, "Transação negada pelo emissor");
	assert.equal(sanitized.versao, 1);
});

test("fingerprint ignora ordem das chaves e nulos, mas muda com o conteúdo", () => {
	const a = fingerprintPaymentAttemptEvidence(sanitizePaymentAttemptEvidence(approved));
	const b = fingerprintPaymentAttemptEvidence(sanitizePaymentAttemptEvidence({ ...approved, mensagem: null }));
	const c = fingerprintPaymentAttemptEvidence(sanitizePaymentAttemptEvidence({ ...approved, valorAutorizado: 130 }));
	assert.equal(a, b);
	assert.notEqual(a, c);
});

test("aprovação exige referência, valor igual, parcelas iguais e order_id correlato", () => {
	const attempt = { valor: 129.9, totalParcelas: 1, ordemProvedorId: 817263001 };
	const ok = sanitizePaymentAttemptEvidence(approved);
	assert.deepEqual(validateApprovedEvidence({ attempt, evidence: ok }), { ok: true });
	assert.equal(validateApprovedEvidence({ attempt, evidence: { ...ok, itk: null, atk: null } }).ok, false);
	assert.equal(validateApprovedEvidence({ attempt, evidence: { ...ok, valorAutorizado: 130 } }).ok, false);
	assert.equal(validateApprovedEvidence({ attempt, evidence: { ...ok, valorAutorizado: null } }).ok, false);
	assert.equal(validateApprovedEvidence({ attempt, evidence: { ...ok, totalParcelas: 3 } }).ok, false);
	assert.equal(validateApprovedEvidence({ attempt, evidence: { ...ok, codigoResposta: "51" } }).ok, false);
	assert.equal(validateApprovedEvidence({ attempt, evidence: { ...ok, ordemProvedorId: "999" } }).ok, false);
	assert.equal(validateApprovedEvidence({ attempt, evidence: { ...ok, ordemProvedorId: "817263001" } }).ok, true);
	// Parcelamento omitido pelo adapter não invalida; tolerância de arredondamento é de meio centavo.
	assert.equal(validateApprovedEvidence({ attempt, evidence: { ...ok, totalParcelas: null, valorAutorizado: 129.904 } }).ok, true);
});

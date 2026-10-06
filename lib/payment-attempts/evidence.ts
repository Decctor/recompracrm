import { hashAccessSecret } from "@/lib/access/tokens";
import type { TPaymentAttemptEvidence } from "@/schemas/payment-attempts";
import type { TPaymentAttemptSanitizedResult } from "@/services/drizzle/schema";

// Sanitização da evidência do terminal (recompracrm-pos-android/docs/07). O Zod já descartou chaves
// fora da allowlist; aqui garantimos que o que sobra é seguro de persistir: PAN só mascarado,
// texto sem controle, tamanho limitado, versão explícita para evolução do jsonb.

// 0–6 dígitos iniciais, ao menos 4 caracteres de máscara, 0–4 dígitos finais (ex.: 627303****2166).
const MASKED_PAN_PATTERN = /^\d{0,6}[*xX#]{4,}\d{0,4}$/;

export function isValidMaskedPan(value: string) {
	if (!MASKED_PAN_PATTERN.test(value)) return false;
	const digits = value.replace(/\D/g, "").length;
	return digits <= 10;
}

function cleanText(value: string | null | undefined, max: number) {
	if (!value) return null;
	// Caracteres de controle (0x00–0x1f, 0x7f) viram espaço; espaços se colapsam.
	const withoutControl = Array.from(value, (char) => {
		const code = char.charCodeAt(0);
		return code < 32 || code === 127 ? " " : char;
	}).join("");
	const cleaned = withoutControl.replace(/\s+/g, " ").trim();
	return cleaned ? cleaned.slice(0, max) : null;
}

// Identificadores da adquirente: alfanuméricos e separadores comuns. Qualquer outra coisa (URI,
// JSON, espaços) indica payload bruto e é descartada em vez de persistida.
function cleanIdentifier(value: string | null | undefined, max: number) {
	const cleaned = cleanText(value, max);
	if (!cleaned) return null;
	return /^[A-Za-z0-9_.:-]+$/.test(cleaned) ? cleaned : null;
}

export function sanitizePaymentAttemptEvidence(evidence: TPaymentAttemptEvidence): TPaymentAttemptSanitizedResult {
	const panMascarado = cleanText(evidence.panMascarado, 32);
	return {
		versao: 1,
		tipo: evidence.tipo,
		provedorStatus: cleanIdentifier(evidence.provedorStatus, 64),
		itk: cleanIdentifier(evidence.itk, 128),
		atk: cleanIdentifier(evidence.atk, 128),
		codigoAutorizacao: cleanIdentifier(evidence.codigoAutorizacao, 64),
		codigoResposta: cleanIdentifier(evidence.codigoResposta, 32),
		bandeira: cleanText(evidence.bandeira, 64),
		// PAN inválido (ou completo) nunca é persistido — é descartado, não corrigido.
		panMascarado: panMascarado && isValidMaskedPan(panMascarado) ? panMascarado : null,
		modoEntrada: cleanIdentifier(evidence.modoEntrada, 32),
		valorAutorizado: typeof evidence.valorAutorizado === "number" && Number.isFinite(evidence.valorAutorizado) ? evidence.valorAutorizado : null,
		totalParcelas: typeof evidence.totalParcelas === "number" ? evidence.totalParcelas : null,
		dataAutorizacao: evidence.dataAutorizacao ?? null,
		ordemProvedorId: cleanIdentifier(evidence.ordemProvedorId, 32),
		mensagem: cleanText(evidence.mensagem, 500),
	};
}

// Fingerprint canônico (chaves ordenadas, nulos removidos) da evidência SANITIZADA: a mesma
// chave de idempotência com fingerprint diferente é reuso indevido (409), não replay.
export function fingerprintPaymentAttemptEvidence(sanitized: TPaymentAttemptSanitizedResult) {
	const entries = Object.entries(sanitized)
		.filter(([, value]) => value !== null && value !== undefined)
		.sort(([a], [b]) => a.localeCompare(b));
	return hashAccessSecret(JSON.stringify(entries));
}

export type TApprovedEvidenceValidation = { ok: true } | { ok: false; reason: string };

const AMOUNT_TOLERANCE = 0.005;

// Aprovação exige evidência suficiente, referência externa e valor autorizado igual ao esperado
// (invariante 7 de docs/03). Valor, método e parcelas vêm da tentativa, nunca do callback.
export function validateApprovedEvidence({
	attempt,
	evidence,
}: {
	attempt: { valor: number; totalParcelas: number | null; ordemProvedorId: number | null };
	evidence: TPaymentAttemptSanitizedResult;
}): TApprovedEvidenceValidation {
	if (!evidence.itk && !evidence.atk) return { ok: false, reason: "Aprovação sem referência da adquirente (ITK/ATK)." };
	if (evidence.codigoResposta && !/^0+$/.test(evidence.codigoResposta)) {
		return { ok: false, reason: `Código de resposta ${evidence.codigoResposta} não indica aprovação.` };
	}
	if (evidence.valorAutorizado === null || evidence.valorAutorizado === undefined) {
		return { ok: false, reason: "Aprovação sem valor autorizado." };
	}
	if (Math.abs(evidence.valorAutorizado - attempt.valor) > AMOUNT_TOLERANCE) {
		return { ok: false, reason: `Valor autorizado (${evidence.valorAutorizado.toFixed(2)}) diverge do valor da cobrança (${attempt.valor.toFixed(2)}).` };
	}
	const expectedInstallments = attempt.totalParcelas ?? 1;
	if (evidence.totalParcelas !== null && evidence.totalParcelas !== undefined && evidence.totalParcelas !== expectedInstallments) {
		return { ok: false, reason: `Parcelamento autorizado (${evidence.totalParcelas}) diverge do solicitado (${expectedInstallments}).` };
	}
	if (evidence.ordemProvedorId && attempt.ordemProvedorId !== null && evidence.ordemProvedorId !== String(attempt.ordemProvedorId)) {
		return { ok: false, reason: "O order_id devolvido pela adquirente não corresponde a esta cobrança." };
	}
	return { ok: true };
}

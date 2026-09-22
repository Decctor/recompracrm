import { formatStringAsOnlyDigits, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { isValidCNPJ, isValidCPF } from "@/lib/validation";

export type TClientSearchIntent = { kind: "name"; nome: string } | { kind: "phone"; telefone: string } | { kind: "cpf_cnpj"; cpfCnpj: string };

export function parseClientSearchIntent(search: string): TClientSearchIntent {
	const normalizedSearch = search.trim();

	if (/\p{L}/u.test(normalizedSearch)) {
		return { kind: "name", nome: normalizedSearch };
	}

	const digits = formatStringAsOnlyDigits(normalizedSearch);

	if (digits.length === 14 || isValidCNPJ(digits)) {
		return { kind: "cpf_cnpj", cpfCnpj: formatToCPForCNPJ(digits) };
	}

	if (digits.length === 11 && isValidCPF(digits)) {
		return { kind: "cpf_cnpj", cpfCnpj: formatToCPForCNPJ(digits) };
	}

	if (digits.length > 0) {
		return { kind: "phone", telefone: formatToPhone(digits) };
	}

	return { kind: "name", nome: normalizedSearch };
}

/**
 * Se a busca já é um identificador COMPLETO — o que decide se "nenhum resultado" significa
 * "cliente não existe" (pode abrir o cadastro automaticamente) ou apenas "ainda digitando".
 * Nome: sempre completo (não há como saber). Telefone: 10 ou 11 dígitos. CPF/CNPJ: válido.
 * Sem esta régua, nove dígitos de um celular cadastrado viravam modo de criação no meio da
 * digitação, e o operador perdia o campo.
 */
export function isClientSearchIntentComplete(search: string): boolean {
	const intent = parseClientSearchIntent(search);
	if (intent.kind === "name") return true;
	if (intent.kind === "cpf_cnpj") return true;
	const digits = formatStringAsOnlyDigits(search);
	return digits.length === 10 || digits.length === 11;
}

export function getClientSearchIntentLabel(kind: TClientSearchIntent["kind"]): string {
	switch (kind) {
		case "name":
			return "Nenhum cliente com esse nome. Crie um novo cadastro:";
		case "phone":
			return "Nenhum cliente com esse telefone. Crie um novo cadastro:";
		case "cpf_cnpj":
			return "Nenhum cliente com esse CPF/CNPJ. Crie um novo cadastro:";
	}
}

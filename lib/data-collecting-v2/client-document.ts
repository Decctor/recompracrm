import { isValidCpfCnpj } from "@/lib/validation";

/**
 * CPF/CNPJ como chave de identidade na importação: só dígitos, e só quando o documento é válido.
 * O cadastro do CRM guarda formatado ("107.596.296-09") e as fontes mandam de qualquer jeito; um
 * documento inválido (zeros, dígito errado) não identifica ninguém e não pode separar ninguém.
 */
export function normalizeClientDocument(value?: string | null): string | null {
	const digits = (value ?? "").replace(/\D/g, "");
	if (!digits) return null;
	return isValidCpfCnpj(digits) ? digits : null;
}

/**
 * O telefone casou, mas os dois lados têm documento do mesmo tipo e eles diferem: são pessoas
 * diferentes que compartilham o número (família, o fixo da loja usado como preenchimento, o celular
 * digitado no cadastro errado). CPF contra CNPJ não conflita — é a pessoa e o MEI dela.
 */
export function clientDocumentsConflict(left: string | null, right: string | null): boolean {
	if (!left || !right) return false;
	return left.length === right.length && left !== right;
}

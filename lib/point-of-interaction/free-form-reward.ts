// Recompensa avulsa do ponto de interação: um prêmio sem item de catálogo. O operador descreve o
// que o cliente leva e digita quanto debitar (moeda do programa). Vive só no ledger: sem venda,
// sem acúmulo, sem limite de resgate (o limite é do desconto em dinheiro). Client-safe (sem banco):
// usada pelo servidor, pelo kiosk e pela fila de aprovação. Ver docs/cashback-free-form-reward-design.md.

export const FREE_FORM_REWARD_DESCRIPTION_MAX_LENGTH = 120;

export type TPoiFreeFormRewardInput = {
	descricao: string;
	// Ausente quando o pedido vem do celular do cliente: o operador informa na aprovação.
	valor?: number | null;
};

type TPoiProgramFreeFormFlags = {
	modalidadeRecompensasPermitida: boolean;
	modalidadeRecompensaAvulsaPermitida: boolean;
};

/** Sub-modalidade da troca por recompensas: só vale com ela ligada. */
export function isFreeFormRewardAllowed(program: TPoiProgramFreeFormFlags) {
	return program.modalidadeRecompensasPermitida && program.modalidadeRecompensaAvulsaPermitida;
}

export function normalizeFreeFormRewardDescription(descricao: string) {
	return descricao.replace(/\s+/g, " ").trim();
}

/**
 * Motivo que impede o resgate avulso, ou `null`. `valor` é o valor efetivo (o do operador na
 * aprovação, ou o do payload no totem); `availableBalance`, quando conhecido, recusa o que o saldo
 * não cobre antes de chegar no débito FIFO.
 */
export function getFreeFormRewardBlockReason({
	descricao,
	valor,
	availableBalance,
}: {
	descricao: string;
	valor: number | null | undefined;
	availableBalance?: number | null;
}): string | null {
	const normalizedDescription = normalizeFreeFormRewardDescription(descricao);
	if (!normalizedDescription) return "Descreva a recompensa.";
	if (normalizedDescription.length > FREE_FORM_REWARD_DESCRIPTION_MAX_LENGTH) {
		return `A descrição da recompensa passa de ${FREE_FORM_REWARD_DESCRIPTION_MAX_LENGTH} caracteres.`;
	}
	if (valor == null || !Number.isFinite(valor) || valor <= 0) return "Informe quanto debitar do saldo.";
	if (availableBalance != null && valor > availableBalance + 0.0001) return "Saldo insuficiente.";
	return null;
}

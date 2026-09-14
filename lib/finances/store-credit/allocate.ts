import { STORE_CREDIT_TOLERANCE } from "./constants";

/**
 * Um título de fiado em aberto. `saldo` é o `valor` da própria transação pendente: como a baixa
 * parcial faz split da linha, o valor da transação e o saldo devedor são sempre a mesma coisa —
 * não existe "valor original menos recebido" para calcular aqui.
 */
export type TStoreCreditOpenTitle = {
	transacaoId: string;
	saldo: number;
	dataPrevisao: Date | string;
	dataVenda?: Date | string | null;
};

export type TStoreCreditAllocation = {
	transacaoId: string;
	valor: number;
};

function toCents(value: number) {
	return Math.round((value + Number.EPSILON) * 100);
}

function fromCents(cents: number) {
	return cents / 100;
}

function getTime(value: Date | string | null | undefined) {
	if (!value) return Number.POSITIVE_INFINITY;
	return new Date(value).getTime();
}

/**
 * Ordem de cobrança: vence primeiro, paga primeiro. Desempata pela data da venda e depois pelo id,
 * para que a mesma entrada produza sempre a mesma alocação — o operador confere o resultado na
 * tela antes de confirmar, e uma ordem instável faria a sugestão mudar entre dois cliques.
 */
export function sortStoreCreditTitlesByPriority<T extends TStoreCreditOpenTitle>(titles: T[]): T[] {
	return [...titles].sort((a, b) => {
		const byDueDate = getTime(a.dataPrevisao) - getTime(b.dataPrevisao);
		if (byDueDate !== 0) return byDueDate;
		const bySaleDate = getTime(a.dataVenda) - getTime(b.dataVenda);
		if (bySaleDate !== 0) return bySaleDate;
		return a.transacaoId.localeCompare(b.transacaoId);
	});
}

/**
 * Distribui um valor recebido entre os títulos em aberto, do mais antigo para o mais novo.
 *
 * Roda em centavos inteiros: somar floats de duas casas acumula erro, e o resultado desta função
 * vira o valor gravado no banco. `sobra` é o que passou do total devido — a UI mostra antes de
 * habilitar o botão, e a rota recusa.
 */
export function allocateStoreCreditReceipt({ titles, valorRecebido }: { titles: TStoreCreditOpenTitle[]; valorRecebido: number }): {
	allocations: TStoreCreditAllocation[];
	sobra: number;
} {
	let remainingCents = Math.max(0, toCents(valorRecebido));
	const allocations: TStoreCreditAllocation[] = [];

	for (const title of sortStoreCreditTitlesByPriority(titles)) {
		if (remainingCents <= 0) break;
		const saldoCents = Math.max(0, toCents(title.saldo));
		if (saldoCents <= 0) continue;
		const allocatedCents = Math.min(saldoCents, remainingCents);
		remainingCents -= allocatedCents;
		allocations.push({ transacaoId: title.transacaoId, valor: fromCents(allocatedCents) });
	}

	return { allocations, sobra: fromCents(remainingCents) };
}

/**
 * Valida uma alocação vinda do cliente. O menu deixa o operador redistribuir manualmente, então a
 * alocação que chega na rota não é necessariamente a que o FIFO sugeriu — precisa ser conferida
 * contra os saldos reais, nunca contra os que a tela tinha em mãos.
 *
 * Retorna a mensagem de erro em português (a rota a devolve como 400) ou `null` quando está válida.
 */
export function getStoreCreditAllocationError({
	titles,
	valorRecebido,
	allocations,
}: {
	titles: TStoreCreditOpenTitle[];
	valorRecebido: number;
	allocations: TStoreCreditAllocation[];
}): string | null {
	if (!Number.isFinite(valorRecebido) || valorRecebido <= 0) return "O valor recebido precisa ser maior que zero.";
	if (allocations.length === 0) return "Selecione ao menos uma venda para abater.";

	const titleById = new Map(titles.map((title) => [title.transacaoId, title]));
	const seen = new Set<string>();
	let allocatedCents = 0;

	for (const allocation of allocations) {
		if (seen.has(allocation.transacaoId)) return "A mesma venda foi informada duas vezes no abatimento.";
		seen.add(allocation.transacaoId);

		const title = titleById.get(allocation.transacaoId);
		if (!title) return "Uma das vendas informadas não está em aberto para este cliente.";
		if (!Number.isFinite(allocation.valor) || allocation.valor <= 0) return "O valor abatido de cada venda precisa ser maior que zero.";
		if (toCents(allocation.valor) > toCents(title.saldo)) return "O valor abatido não pode passar do saldo da venda.";

		allocatedCents += toCents(allocation.valor);
	}

	if (Math.abs(fromCents(allocatedCents) - valorRecebido) > STORE_CREDIT_TOLERANCE) {
		return "A soma dos abatimentos precisa fechar com o valor recebido.";
	}

	return null;
}

/** Saldo total em aberto de um conjunto de títulos, em reais com duas casas. */
export function getStoreCreditTitlesTotal(titles: Pick<TStoreCreditOpenTitle, "saldo">[]) {
	return fromCents(titles.reduce((acc, title) => acc + toCents(title.saldo), 0));
}

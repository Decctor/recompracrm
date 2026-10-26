// Formatação dos números das ferramentas, sempre em pt-BR.

export function formatBRL(value: number) {
	return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Preço por mensagem, com três ou quatro casas (R$ 0,035 · R$ 0,3217). */
export function formatUnitPrice(value: number) {
	return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: value < 0.1 ? 3 : 4, maximumFractionDigits: 4 })}`;
}

export function formatUSD(value: number) {
	return `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

/** Fração como percentual (0,075 → "7,5%"). */
export function formatFraction(value: number, digits = 1) {
	return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;
}

export function formatInteger(value: number) {
	return value.toLocaleString("pt-BR");
}

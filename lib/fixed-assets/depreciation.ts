import { CIAP_INSTALLMENTS } from "@/schemas/fixed-assets";

/**
 * Depreciação linear e cronograma do CIAP como funções puras do bem e da data (ADR-0002, decisão 8).
 * Nada aqui é guardado mês a mês: o lançamento PATRIMONIO do mês registra o resultado e a
 * `chaveIdempotencia` impede duplicar. Tudo em centavos inteiros; o último mês absorve o resto.
 *
 * Convenção de meses: o mês de início de uso é o mês 1; o mês da baixa já não deprecia nem apropria.
 */

export type TDepreciableAsset = {
	valorAquisicao: number;
	valorResidual: number;
	depreciacaoAcumuladaInicial: number;
	vidaUtilMeses: number;
	dataInicioUso: Date;
	dataBaixa?: Date | null;
	creditoIcmsCiap?: number | null;
};

export type TMonthKey = `${number}-${string}`;

export function toCents(value: number) {
	return Math.round(value * 100);
}
export function fromCents(cents: number) {
	return Math.round(cents) / 100;
}

/** "2026-03" para a data; meses são contados em UTC para não depender do fuso do servidor. */
export function getMonthKey(date: Date): TMonthKey {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` as TMonthKey;
}

export function parseMonthKey(key: string): { year: number; month: number } {
	const match = /^(\d{4})-(\d{2})$/.exec(key);
	if (!match) throw new Error(`Mês inválido: ${key}. Use AAAA-MM.`);
	const year = Number(match[1]);
	const month = Number(match[2]);
	if (month < 1 || month > 12) throw new Error(`Mês inválido: ${key}.`);
	return { year, month };
}

/** Primeiro instante (UTC) do mês. */
export function getMonthStart(key: string) {
	const { year, month } = parseMonthKey(key);
	return new Date(Date.UTC(year, month - 1, 1));
}

/** Último instante (UTC) do mês — a data de competência do lançamento mensal. */
export function getMonthEnd(key: string) {
	const { year, month } = parseMonthKey(key);
	return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

export function getPreviousMonthKey(key: string): TMonthKey {
	const { year, month } = parseMonthKey(key);
	return month === 1 ? (`${year - 1}-12` as TMonthKey) : (`${year}-${String(month - 1).padStart(2, "0")}` as TMonthKey);
}

function monthIndex(key: string) {
	const { year, month } = parseMonthKey(key);
	return year * 12 + (month - 1);
}

/**
 * Quantos meses de uso o bem completou até o fim do mês `key` (inclusive). O mês de início conta
 * como 1; a baixa encerra a contagem no mês anterior ao dela.
 */
export function getMonthsInUse(asset: Pick<TDepreciableAsset, "dataInicioUso" | "dataBaixa">, key: string) {
	const startIndex = monthIndex(getMonthKey(asset.dataInicioUso));
	let endIndex = monthIndex(key);
	if (asset.dataBaixa) endIndex = Math.min(endIndex, monthIndex(getMonthKey(asset.dataBaixa)) - 1);
	return Math.max(0, endIndex - startIndex + 1);
}

/** Quanto do valor ainda há para depreciar quando o bem entra no sistema, em centavos. */
export function getDepreciableCents(asset: Pick<TDepreciableAsset, "valorAquisicao" | "valorResidual">) {
	return Math.max(0, toCents(asset.valorAquisicao) - toCents(asset.valorResidual));
}

/**
 * Depreciação acumulada ao fim do mês `key`, em centavos: inicial + parcelas lineares dos meses em
 * uso, limitada ao valor depreciável. A parcela é (depreciável − inicial) / meses restantes, para
 * que um bem cadastrado já em uso termine de depreciar no fim da vida útil original.
 */
export function getAccumulatedDepreciationCents(asset: TDepreciableAsset, key: string) {
	const depreciable = getDepreciableCents(asset);
	const initial = Math.min(toCents(asset.depreciacaoAcumuladaInicial), depreciable);
	const months = getMonthsInUse(asset, key);
	if (months <= 0 || asset.vidaUtilMeses <= 0) return initial;
	// Meses já consumidos antes do sistema, estimados pela proporção do que já estava depreciado.
	const consumedBefore = depreciable > 0 ? Math.round((initial / depreciable) * asset.vidaUtilMeses) : 0;
	const remainingMonths = Math.max(1, asset.vidaUtilMeses - consumedBefore);
	const remainingCents = depreciable - initial;
	if (months >= remainingMonths) return depreciable;
	const monthly = Math.floor(remainingCents / remainingMonths);
	return initial + monthly * months;
}

/** Depreciação do mês `key` isolada: acumulada do mês menos a acumulada do mês anterior. */
export function getMonthlyDepreciationCents(asset: TDepreciableAsset, key: string) {
	return getAccumulatedDepreciationCents(asset, key) - getAccumulatedDepreciationCents(asset, getPreviousMonthKey(key));
}

/** Valor contábil (custo − depreciação acumulada) ao fim do mês, em centavos. */
export function getBookValueCents(asset: TDepreciableAsset, key: string) {
	return toCents(asset.valorAquisicao) - getAccumulatedDepreciationCents(asset, key);
}

/**
 * Parcela do CIAP do mês `key`, em centavos: 1/48 do crédito, só nos primeiros 48 meses de uso e
 * só enquanto o bem não foi baixado; a última parcela absorve o resto da divisão. O coeficiente de
 * saídas tributadas do mês multiplica a parcela (LC 87/96, art. 20, §5º, III) — a parte não
 * apropriada é perdida, não adiada.
 */
export function getCiapInstallmentCents(asset: TDepreciableAsset, key: string, coeficiente = 1) {
	const total = toCents(asset.creditoIcmsCiap ?? 0);
	if (total <= 0) return 0;
	const months = getMonthsInUse(asset, key);
	const previous = getMonthsInUse(asset, getPreviousMonthKey(key));
	// O mês conta só se ele mesmo entrou na janela de uso (não foi cortado pela baixa).
	if (months <= previous || months > CIAP_INSTALLMENTS) return 0;
	const base = Math.floor(total / CIAP_INSTALLMENTS);
	const installment = months === CIAP_INSTALLMENTS ? total - base * (CIAP_INSTALLMENTS - 1) : base;
	const factor = Math.min(1, Math.max(0, coeficiente));
	return Math.round(installment * factor);
}

export type TSplittableAsset = TDepreciableAsset & { quantidade: number; valorBaixa?: number | null };

/**
 * Divide um registro em dois: o original fica com `quantidade − parte` e o novo com `parte`, cada
 * um com valores proporcionais (o original absorve o resto dos centavos). Datas e vida útil são as
 * mesmas, então cada metade continua uma função pura dos próprios campos. Serve para baixa parcial
 * e para dar plaqueta própria a uma unidade do grupo.
 */
export function splitAssetValues<T extends TSplittableAsset>(asset: T, parte: number): { restante: T; separado: T } {
	if (!Number.isInteger(parte) || parte <= 0) throw new Error("A quantidade a separar deve ser um inteiro maior que zero.");
	if (parte >= asset.quantidade) throw new Error("A quantidade a separar deve ser menor que a quantidade do bem.");
	const share = (value: number) => Math.round((toCents(value) * parte) / asset.quantidade);
	const splitValues = {
		valorAquisicao: share(asset.valorAquisicao),
		valorResidual: share(asset.valorResidual),
		depreciacaoAcumuladaInicial: share(asset.depreciacaoAcumuladaInicial),
		creditoIcmsCiap: asset.creditoIcmsCiap != null ? share(asset.creditoIcmsCiap) : null,
	};
	const separado: T = {
		...asset,
		quantidade: parte,
		valorAquisicao: fromCents(splitValues.valorAquisicao),
		valorResidual: fromCents(splitValues.valorResidual),
		depreciacaoAcumuladaInicial: fromCents(splitValues.depreciacaoAcumuladaInicial),
		creditoIcmsCiap: splitValues.creditoIcmsCiap != null ? fromCents(splitValues.creditoIcmsCiap) : null,
	};
	const restante: T = {
		...asset,
		quantidade: asset.quantidade - parte,
		valorAquisicao: fromCents(toCents(asset.valorAquisicao) - splitValues.valorAquisicao),
		valorResidual: fromCents(toCents(asset.valorResidual) - splitValues.valorResidual),
		depreciacaoAcumuladaInicial: fromCents(toCents(asset.depreciacaoAcumuladaInicial) - splitValues.depreciacaoAcumuladaInicial),
		creditoIcmsCiap: asset.creditoIcmsCiap != null && splitValues.creditoIcmsCiap != null ? fromCents(toCents(asset.creditoIcmsCiap) - splitValues.creditoIcmsCiap) : asset.creditoIcmsCiap ?? null,
	};
	return { restante, separado };
}

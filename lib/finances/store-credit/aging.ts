import dayjs from "dayjs";

/**
 * Faixas de atraso do fiado. Diferentes das de `lib/finances/analytics/aging.ts` de propósito:
 * aquelas recortam o futuro (a-vencer 0-30, 31-60, +60), porque medem previsibilidade de caixa.
 * Aqui a pergunta é outra — há quanto tempo o cliente está devendo —, então o futuro inteiro cabe
 * num balde só e a granularidade toda mora no atraso.
 */
export const STORE_CREDIT_AGING_BUCKETS = [
	{ chave: "A_VENCER", rotulo: "A vencer", minDiasAtraso: Number.NEGATIVE_INFINITY, maxDiasAtraso: 0 },
	{ chave: "VENCIDO_1_15", rotulo: "Vencido 1-15 dias", minDiasAtraso: 1, maxDiasAtraso: 15 },
	{ chave: "VENCIDO_16_30", rotulo: "Vencido 16-30 dias", minDiasAtraso: 16, maxDiasAtraso: 30 },
	{ chave: "VENCIDO_30_MAIS", rotulo: "Vencido +30 dias", minDiasAtraso: 31, maxDiasAtraso: Number.POSITIVE_INFINITY },
] as const;

export type TStoreCreditAgingBucket = (typeof STORE_CREDIT_AGING_BUCKETS)[number]["chave"];

export const STORE_CREDIT_AGING_BUCKET_KEYS = STORE_CREDIT_AGING_BUCKETS.map((bucket) => bucket.chave) as TStoreCreditAgingBucket[];

/** Dias inteiros de atraso: positivo é vencido, zero ou negativo ainda está no prazo. */
export function getStoreCreditDaysOverdue(dataPrevisao: Date | string | null | undefined, referenceDate: Date = new Date()) {
	if (!dataPrevisao) return 0;
	return dayjs(referenceDate).startOf("day").diff(dayjs(dataPrevisao).startOf("day"), "day");
}

export function resolveStoreCreditAgingBucket(
	dataPrevisao: Date | string | null | undefined,
	referenceDate: Date = new Date(),
): TStoreCreditAgingBucket {
	const diasAtraso = getStoreCreditDaysOverdue(dataPrevisao, referenceDate);
	const bucket = STORE_CREDIT_AGING_BUCKETS.find((item) => diasAtraso >= item.minDiasAtraso && diasAtraso <= item.maxDiasAtraso);
	return bucket?.chave ?? "A_VENCER";
}

type TAgeableTitle = { valor: number; dataPrevisao: Date | string | null };

/**
 * Distribui títulos em aberto nas faixas de atraso, acumulando valor e contagem. Mantém a ordem
 * declarada dos baldes — a UI lê o retorno na ordem em que pinta as linhas.
 */
export function bucketStoreCreditByAging(titles: TAgeableTitle[], referenceDate: Date = new Date()) {
	const faixas = STORE_CREDIT_AGING_BUCKETS.map((bucket) => ({ chave: bucket.chave, rotulo: bucket.rotulo, valor: 0, titulos: 0 }));

	for (const title of titles) {
		const chave = resolveStoreCreditAgingBucket(title.dataPrevisao, referenceDate);
		const faixa = faixas.find((item) => item.chave === chave);
		if (!faixa) continue;
		faixa.valor += title.valor;
		faixa.titulos += 1;
	}

	return faixas;
}

/**
 * Converte uma faixa de atraso na janela de `dataPrevisao` que a produz, para o filtro poder rodar
 * em SQL sem reimplementar a aritmética de dias. `null` num extremo significa "sem limite".
 *
 * Deriva dos mesmos `minDiasAtraso`/`maxDiasAtraso` de `STORE_CREDIT_AGING_BUCKETS`: como
 * `diasAtraso = hoje − previsao`, a previsão mais recente da faixa é `hoje − minDiasAtraso` e a
 * mais antiga é `hoje − maxDiasAtraso`. É o que mantém filtro e rótulo falando da mesma coisa.
 */
export function getStoreCreditAgingDueDateRange(
	bucket: TStoreCreditAgingBucket,
	referenceDate: Date = new Date(),
): { from: Date | null; to: Date | null } {
	const config = STORE_CREDIT_AGING_BUCKETS.find((item) => item.chave === bucket);
	if (!config) return { from: null, to: null };
	const today = dayjs(referenceDate).startOf("day");
	return {
		from: Number.isFinite(config.maxDiasAtraso) ? today.subtract(config.maxDiasAtraso, "day").startOf("day").toDate() : null,
		to: Number.isFinite(config.minDiasAtraso) ? today.subtract(config.minDiasAtraso, "day").endOf("day").toDate() : null,
	};
}

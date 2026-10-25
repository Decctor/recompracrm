/**
 * Diferencial de alíquota na entrada (ADR-0002): devido pelo destinatário contribuinte em compra
 * interestadual para uso e consumo ou ativo imobilizado. Tudo em centavos inteiros.
 *
 * BASE_UNICA:  difal = base × (interna − inter)
 * BASE_DUPLA:  baseInterna = base × (1 − inter) / (1 − interna); difal = baseInterna × interna − base × inter
 * FCP, quando a UF tem, incide sobre a base interna (na base única, sobre a base da nota).
 */

export type TDifalInput = {
	baseCentavos: number;
	aliquotaInterestadual: number; // %
	aliquotaInterna: number; // %
	aliquotaFcp?: number; // %
	metodo: "BASE_UNICA" | "BASE_DUPLA";
};

export type TDifalResult = {
	difalCentavos: number;
	fcpCentavos: number;
	baseInternaCentavos: number;
	memoria: { base: number; aliquota: number; aliquotaInterestadual: number; metodo: string };
};

function round(cents: number) {
	return Math.round(cents + Number.EPSILON);
}

export function calculateDifal(input: TDifalInput): TDifalResult {
	const inter = input.aliquotaInterestadual / 100;
	const interna = input.aliquotaInterna / 100;
	const fcp = (input.aliquotaFcp ?? 0) / 100;
	if (input.baseCentavos <= 0 || interna <= inter) {
		return { difalCentavos: 0, fcpCentavos: 0, baseInternaCentavos: input.baseCentavos, memoria: memory(input) };
	}
	if (input.metodo === "BASE_DUPLA") {
		const baseInterna = round((input.baseCentavos * (1 - inter)) / (1 - interna));
		const difal = round(baseInterna * interna) - round(input.baseCentavos * inter);
		return { difalCentavos: Math.max(0, difal), fcpCentavos: round(baseInterna * fcp), baseInternaCentavos: baseInterna, memoria: memory(input) };
	}
	return {
		difalCentavos: round(input.baseCentavos * (interna - inter)),
		fcpCentavos: round(input.baseCentavos * fcp),
		baseInternaCentavos: input.baseCentavos,
		memoria: memory(input),
	};
}

function memory(input: TDifalInput) {
	return { base: input.baseCentavos / 100, aliquota: input.aliquotaInterna, aliquotaInterestadual: input.aliquotaInterestadual, metodo: input.metodo };
}

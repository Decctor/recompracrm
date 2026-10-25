/**
 * Parâmetros de ICMS por UF para a entrada de compras (ADR-0002, decisão 7): dado de referência
 * pequeno e versionado, por isso código e não tabela. Cada linha tem vigência; ao mudar uma
 * alíquota, adicione uma linha nova em vez de editar a antiga.
 *
 * `aliquotaInterna` é a alíquota modal (geral) da UF; exceções por NCM ficam fora desta fase.
 * `metodoDifal` segue o que cada UF adotou para contribuintes (base única × base dupla).
 * CONFIRMAR COM A CONTABILIDADE antes de confiar nos valores para uma UF específica.
 */

export type TUfIcmsParameters = {
	uf: string;
	vigenciaInicio: string; // AAAA-MM-DD
	vigenciaFim: string | null;
	aliquotaInterna: number; // %
	aliquotaFcp: number; // % adicional do Fundo de Combate à Pobreza sobre a alíquota interna
	metodoDifal: "BASE_UNICA" | "BASE_DUPLA";
	// Dias após a competência para o vencimento sugerido da guia (prazo por apuração varia; é sugestão).
	prazoVencimentoDias: number;
};

const SOUTH_SOUTHEAST = new Set(["SP", "RJ", "MG", "PR", "SC", "RS"]);

/** Alíquota interestadual pela origem e destino (Res. SF 22/89 e 13/12): 4% importado, 7% S/SE→N/NE/CO/ES, senão 12%. */
export function resolveInterstateIcmsRate({
	ufOrigem,
	ufDestino,
	origemMercadoria,
}: {
	ufOrigem: string;
	ufDestino: string;
	origemMercadoria?: string | null;
}) {
	if (origemMercadoria && ["1", "2", "3", "8"].includes(origemMercadoria)) return 4;
	if (SOUTH_SOUTHEAST.has(ufOrigem) && !SOUTH_SOUTHEAST.has(ufDestino)) return 7;
	return 12;
}

const BASE: Omit<TUfIcmsParameters, "uf" | "aliquotaInterna" | "aliquotaFcp" | "metodoDifal"> = {
	vigenciaInicio: "2024-01-01",
	vigenciaFim: null,
	prazoVencimentoDias: 30,
};

function uf(code: string, aliquotaInterna: number, metodoDifal: TUfIcmsParameters["metodoDifal"], aliquotaFcp = 0): TUfIcmsParameters {
	return { ...BASE, uf: code, aliquotaInterna, aliquotaFcp, metodoDifal };
}

// Alíquotas modais vigentes (2024/2025) e método de DIFAL por UF, conforme legislações estaduais.
export const UF_ICMS_PARAMETERS: TUfIcmsParameters[] = [
	uf("AC", 19, "BASE_UNICA"),
	uf("AL", 19, "BASE_DUPLA", 1),
	uf("AM", 20, "BASE_UNICA"),
	uf("AP", 18, "BASE_UNICA"),
	uf("BA", 20.5, "BASE_DUPLA", 2),
	uf("CE", 20, "BASE_UNICA", 2),
	uf("DF", 20, "BASE_UNICA"),
	uf("ES", 17, "BASE_UNICA"),
	uf("GO", 19, "BASE_DUPLA"),
	uf("MA", 23, "BASE_UNICA", 2),
	uf("MG", 18, "BASE_DUPLA", 2),
	uf("MS", 17, "BASE_UNICA"),
	uf("MT", 17, "BASE_DUPLA"),
	uf("PA", 19, "BASE_DUPLA"),
	uf("PB", 20, "BASE_DUPLA"),
	uf("PE", 20.5, "BASE_DUPLA", 2),
	uf("PI", 22.5, "BASE_UNICA"),
	uf("PR", 19.5, "BASE_DUPLA", 2),
	uf("RJ", 22, "BASE_UNICA", 2),
	uf("RN", 20, "BASE_UNICA", 2),
	uf("RO", 19.5, "BASE_UNICA"),
	uf("RR", 20, "BASE_UNICA"),
	uf("RS", 17, "BASE_DUPLA", 2),
	uf("SC", 17, "BASE_UNICA"),
	uf("SE", 20, "BASE_DUPLA", 2),
	uf("SP", 18, "BASE_UNICA"),
	uf("TO", 20, "BASE_UNICA"),
];

export function getUfIcmsParameters(code: string, at: Date = new Date()): TUfIcmsParameters | null {
	const iso = at.toISOString().slice(0, 10);
	const candidates = UF_ICMS_PARAMETERS.filter(
		(row) => row.uf === code.toUpperCase() && row.vigenciaInicio <= iso && (!row.vigenciaFim || row.vigenciaFim >= iso),
	);
	return candidates.sort((left, right) => right.vigenciaInicio.localeCompare(left.vigenciaInicio))[0] ?? null;
}

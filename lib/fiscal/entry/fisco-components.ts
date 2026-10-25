import type { TAcquisitionNatureEnum, TPurchaseEntryTaxRegimeEnum } from "@/schemas/enums";
import { calculateDifal } from "./difal";
import { getUfIcmsParameters, resolveInterstateIcmsRate, type TUfIcmsParameters } from "./uf-parameters";

/**
 * Componentes devidos ao fisco por uma linha de compra (contrapartida FISCO, origem CALCULO).
 * Puro e isomórfico: o import calcula no servidor e o builder recalcula quando a destinação muda.
 * O que já veio com contrapartida FISCO e origem MANUAL fica; o que é CALCULO é refeito.
 */

export type TEntryLineTaxFacts = {
	/** Base do ICMS (vBC) ou, na falta, o valor da linha. Em reais. */
	baseIcms: number | null;
	/** pICMS da nota: a alíquota interestadual efetiva. Null = deduzida pela origem/destino. */
	aliquotaIcms: number | null;
	origemMercadoria: string | null;
	/** CST 60 / CSOSN 500 ou ST retido: a cadeia já foi tributada; não há DIFAL nem antecipação. */
	stRetido: boolean;
	/** ICMS-ST destacado na própria nota: idem. */
	stDestacado: boolean;
	/** O emitente já calculou DIFAL (vICMSUFDest — destinatário não contribuinte). */
	difalDestacado: boolean;
};

export type TEntryFiscoContext = {
	ufOrganizacao: string | null;
	ufEmitente: string | null;
	contribuinteIcms: boolean;
	regime: TPurchaseEntryTaxRegimeEnum | null;
	antecipacaoParcial: boolean;
	// Permite injetar parâmetros (testes) ou os da data da nota.
	parametrosUf?: TUfIcmsParameters | null;
};

export type TFiscoComponent = {
	chave: "IMPOSTOS_DIFAL" | "IMPOSTOS_FCP_DIFAL" | "IMPOSTOS_ANTECIPACAO";
	valorCentavos: number;
	efeito: "ACRESCIMO";
	tratamento: "CUSTO_ESTOQUE";
	contrapartida: "FISCO";
	origem: "CALCULO";
	descricao: string;
	memoriaCalculo: { base: number; aliquota: number; aliquotaInterestadual: number; metodo: string; uf: string };
};

export function isInterstateEntry(context: Pick<TEntryFiscoContext, "ufOrganizacao" | "ufEmitente">) {
	return !!context.ufOrganizacao && !!context.ufEmitente && context.ufOrganizacao.toUpperCase() !== context.ufEmitente.toUpperCase();
}

export function computeFiscoComponents({
	destinacao,
	valorLinha,
	facts,
	context,
}: {
	destinacao: TAcquisitionNatureEnum;
	valorLinha: number;
	facts: TEntryLineTaxFacts | null | undefined;
	context: TEntryFiscoContext;
}): TFiscoComponent[] {
	if (!facts || !context.contribuinteIcms || !isInterstateEntry(context)) return [];
	if (facts.stRetido || facts.stDestacado || facts.difalDestacado) return [];
	const ufDestino = context.ufOrganizacao!.toUpperCase();
	const params = context.parametrosUf ?? getUfIcmsParameters(ufDestino);
	if (!params) return [];

	const baseCentavos = Math.round(((facts.baseIcms ?? valorLinha) + Number.EPSILON) * 100);
	const aliquotaInterestadual =
		facts.aliquotaIcms ?? resolveInterstateIcmsRate({ ufOrigem: context.ufEmitente!, ufDestino, origemMercadoria: facts.origemMercadoria });
	const difal = calculateDifal({
		baseCentavos,
		aliquotaInterestadual,
		aliquotaInterna: params.aliquotaInterna,
		aliquotaFcp: params.aliquotaFcp,
		metodo: params.metodoDifal,
	});
	const memoria = { ...difal.memoria, uf: ufDestino };
	const components: TFiscoComponent[] = [];

	// Uso e consumo e ativo: DIFAL (ADC 49 — vale também para o Simples). Revenda/insumo: só a
	// antecipação parcial, quando a organização a habilitou para a sua UF.
	const isDifalDestination = destinacao === "USO_CONSUMO" || destinacao === "ATIVO_IMOBILIZADO";
	const isAntecipacao = !isDifalDestination && context.antecipacaoParcial;
	if (!isDifalDestination && !isAntecipacao) return [];

	if (isDifalDestination) {
		if (difal.difalCentavos > 0)
			components.push({
				chave: "IMPOSTOS_DIFAL",
				valorCentavos: difal.difalCentavos,
				efeito: "ACRESCIMO",
				tratamento: "CUSTO_ESTOQUE",
				contrapartida: "FISCO",
				origem: "CALCULO",
				descricao: `DIFAL ${ufDestino}: ${params.aliquotaInterna}% interna − ${aliquotaInterestadual}% interestadual (${params.metodoDifal === "BASE_DUPLA" ? "base dupla" : "base única"})`,
				memoriaCalculo: memoria,
			});
		if (difal.fcpCentavos > 0)
			components.push({
				chave: "IMPOSTOS_FCP_DIFAL",
				valorCentavos: difal.fcpCentavos,
				efeito: "ACRESCIMO",
				tratamento: "CUSTO_ESTOQUE",
				contrapartida: "FISCO",
				origem: "CALCULO",
				descricao: `FCP ${ufDestino}: ${params.aliquotaFcp}% sobre a base interna`,
				memoriaCalculo: { ...memoria, aliquota: params.aliquotaFcp },
			});
		return components;
	}

	// Antecipação parcial: diferença de alíquotas sobre a base da nota, sem FCP (regra geral).
	const antecipacao = calculateDifal({
		baseCentavos,
		aliquotaInterestadual,
		aliquotaInterna: params.aliquotaInterna,
		aliquotaFcp: 0,
		metodo: "BASE_UNICA",
	});
	if (antecipacao.difalCentavos > 0)
		components.push({
			chave: "IMPOSTOS_ANTECIPACAO",
			valorCentavos: antecipacao.difalCentavos,
			efeito: "ACRESCIMO",
			tratamento: "CUSTO_ESTOQUE",
			contrapartida: "FISCO",
			origem: "CALCULO",
			descricao: `Antecipação parcial ${ufDestino}: ${params.aliquotaInterna}% − ${aliquotaInterestadual}% sobre a base da nota`,
			memoriaCalculo: { ...antecipacao.memoria, uf: ufDestino },
		});
	return components;
}

/** Substitui os componentes CALCULO ao fisco de uma linha, preservando o que foi informado à mão. */
export function replaceCalculatedFiscoComponents<T extends { contrapartida?: string | null; origem?: string | null }>(
	modifiers: T[],
	computed: TFiscoComponent[],
): (T | TFiscoComponent)[] {
	const kept = modifiers.filter((modifier) => !(modifier.contrapartida === "FISCO" && modifier.origem === "CALCULO"));
	return [...kept, ...computed];
}

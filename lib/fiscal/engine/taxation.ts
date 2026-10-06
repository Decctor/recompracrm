import type { TFiscalPisCofinsCstEnum, TFiscalProductOriginEnum } from "@/schemas/enums";
import { resolveCfop } from "./cfop";
import { aliquotaInterestadual } from "./data/aliquotas-interestaduais";
import { isOrigemImportada, mapOrigemToCodigo } from "./data/uf";
import { resolveEffectiveTaxConfig, resolveRuleCfopOverride } from "./rules";
import type {
	TDocumentTaxTotals,
	TEffectiveTaxConfig,
	TFiscalItemInput,
	TFiscalTaxGroupWithRules,
	TFiscalTaxScenario,
	TFiscalValidationError,
	TIcmsTaxResult,
	TItemTaxResult,
} from "./types";

function round2(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

// CSTs de PIS/COFINS tributados ad valorem (aliquota sobre a base). CST 03 e por quantidade
// (nao suportado); 04-09 sao nao tributados; 49/99 sao "outras operacoes" sem debito
// (no Simples Nacional o padrao e CST 49 com valor zero, recolhimento no DAS).
const CST_CONTRIBUICAO_AD_VALOREM = new Set<TFiscalPisCofinsCstEnum>(["01", "02"]);

function computeContribuicao({
	tributo,
	cst,
	aliquota,
	base,
	produtoId,
	erros,
}: {
	tributo: "PIS" | "COFINS";
	cst: TFiscalPisCofinsCstEnum;
	aliquota: number;
	base: number;
	produtoId: string;
	erros: TFiscalValidationError[];
}) {
	if (cst === "03") {
		erros.push({
			codigo: `${tributo}_CST_QUANTIDADE_NAO_SUPORTADO`,
			severidade: "ERRO",
			mensagem: `CST 03 de ${tributo} (tributacao por quantidade) nao e suportado pelo motor fiscal. Ajuste o CST no grupo tributario.`,
			produtoId,
		});
		return { cst, vBC: 0, pAliq: 0, valor: 0 };
	}
	if (CST_CONTRIBUICAO_AD_VALOREM.has(cst)) {
		if (aliquota <= 0) return { cst, vBC: 0, pAliq: 0, valor: 0 };
		return { cst, vBC: round2(base), pAliq: aliquota, valor: round2((base * aliquota) / 100) };
	}
	// CSTs sem debito: zera os valores para manter itens e totais coerentes (o item sai como
	// nao tributado no XML; um valor apenas nos totais causaria rejeicao de somatorio).
	if (aliquota > 0) {
		erros.push({
			codigo: `${tributo}_ALIQUOTA_IGNORADA`,
			severidade: "AVISO",
			mensagem: `Aliquota de ${tributo} (${aliquota}%) configurada com CST ${cst}, que nao gera debito; o valor sera zerado. Revise o grupo tributario.`,
			produtoId,
		});
	}
	return { cst, vBC: 0, pAliq: 0, valor: 0 };
}

function computeIcms({
	config,
	scenario,
	baseLiquida,
	origemCodigo,
	origemMercadoria,
	produtoId,
	cest,
	erros,
}: {
	config: TEffectiveTaxConfig;
	scenario: TFiscalTaxScenario;
	baseLiquida: number;
	origemCodigo: number;
	origemMercadoria: TFiscalProductOriginEnum;
	produtoId: string;
	cest: string | null;
	erros: TFiscalValidationError[];
}): TIcmsTaxResult {
	let vBC = 0;
	let pICMS = 0;
	let vICMS = 0;
	let vFCP = 0;

	const aplicaDebitoIcms = config.aliquotaIcms > 0;
	if (aplicaDebitoIcms) {
		vBC = round2(baseLiquida * (1 - config.percentualReducaoBc / 100));
		pICMS = config.aliquotaIcms;
		vICMS = round2((vBC * pICMS) / 100);
		if (config.aliquotaFcp > 0) vFCP = round2((vBC * config.aliquotaFcp) / 100);
	}

	let pCredSN: number | null = null;
	let vCredICMSSN: number | null = null;
	const csosnPermiteCredito = config.csosn === "101" || config.csosn === "201";
	if (csosnPermiteCredito) {
		if (config.percentualCreditoSn != null) {
			pCredSN = config.percentualCreditoSn;
			vCredICMSSN = round2((baseLiquida * pCredSN) / 100);
		} else {
			erros.push({
				codigo: "CREDITO_SN_AUSENTE",
				severidade: "ERRO",
				mensagem: `CSOSN ${config.csosn} permite credito de ICMS, mas o percentual de credito do Simples Nacional nao foi informado.`,
				produtoId,
			});
		}
	}

	// Coerencia entre CSOSN de substituicao tributaria e a flag de ST do grupo.
	const csosnIndicaSt = config.csosn === "201" || config.csosn === "202" || config.csosn === "203" || config.csosn === "500";
	if (csosnIndicaSt && !config.temSubstituicaoTributaria) {
		erros.push({
			codigo: "CSOSN_ST_INCOERENTE",
			severidade: "AVISO",
			mensagem: `CSOSN ${config.csosn} pressupoe substituicao tributaria, mas o grupo nao esta marcado com ST.`,
			produtoId,
		});
	}

	// CEST presente (indicativo de ST) mas CSOSN nao e de ST: provavel enquadramento errado.
	// Ex.: sorvetes (CEST 23.xxx) revendidos no varejo costumam sair com CSOSN 500, nao 102.
	if (cest && cest.replace(/\D/g, "").length > 0 && !csosnIndicaSt) {
		erros.push({
			codigo: "CEST_SEM_CSOSN_ST",
			severidade: "AVISO",
			mensagem: `Produto possui CEST (${cest}), indicativo de substituicao tributaria, mas o CSOSN ${config.csosn} nao e de ST. Confirme o enquadramento com o contador (no varejo de revenda costuma-se usar CSOSN 500).`,
			produtoId,
		});
	}

	// CSOSN 500 = ICMS ja cobrado anteriormente por ST (revenda). Nao se recalcula o ST para frente;
	// emite-se sem ICMS proprio. O calculo de ST adiante (MVA) e exclusivo do substituto (201/202/203).
	const csosnIcmsJaRetido = config.csosn === "500";

	let st: TIcmsTaxResult["st"] = null;
	if (config.temSubstituicaoTributaria && !csosnIcmsJaRetido) {
		if (config.mvaSt != null && config.aliquotaInternaDestino != null) {
			const reducaoSt = config.percentualReducaoBcSt ?? 0;
			const vBCST = round2(baseLiquida * (1 + config.mvaSt / 100) * (1 - reducaoSt / 100));
			const pICMSST = config.aliquotaIcmsSt ?? config.aliquotaInternaDestino;
			// Deducao do ICMS da operacao propria (Convenio ICMS 142/18, clausula 13a). Quando o
			// emitente do Simples nao destaca ICMS proprio (vICMS = 0), deduz-se o valor presumido:
			// aliquota interestadual (operacao interestadual) ou interna sobre a operacao propria.
			const aliquotaOperacaoPropria =
				scenario.escopo === "INTERESTADUAL"
					? aliquotaInterestadual({ ufOrigem: scenario.ufOrigem, ufDestino: scenario.ufDestino, importada: isOrigemImportada(origemMercadoria) })
					: pICMSST;
			const deducaoOperacaoPropria = vICMS > 0 ? vICMS : round2((baseLiquida * aliquotaOperacaoPropria) / 100);
			const vICMSST = round2(Math.max((vBCST * pICMSST) / 100 - deducaoOperacaoPropria, 0));
			const vFCPST = config.aliquotaFcpSt > 0 ? round2((vBCST * config.aliquotaFcpSt) / 100) : 0;
			st = { vBCST, pMVAST: config.mvaSt, pICMSST, vICMSST, vFCPST };
		} else {
			erros.push({
				codigo: "ST_CONFIG_INCOMPLETA",
				severidade: "ERRO",
				mensagem: "Grupo tributario marcado com substituicao tributaria, mas faltam MVA e/ou aliquota interna de destino.",
				produtoId,
			});
		}
	}

	return {
		csosn: config.csosn,
		origem: origemCodigo,
		vBC,
		pICMS,
		vICMS,
		vFCP,
		pCredSN,
		vCredICMSSN,
		st,
	};
}

export type TComputeItemTaxationInput = {
	scenario: TFiscalTaxScenario;
	item: TFiscalItemInput;
	group: TFiscalTaxGroupWithRules;
	// Valor aproximado dos tributos (Lei 12.741). Resolvido externamente (tabela IBPT / provedor).
	vTotTrib?: number;
};

export function computeItemTaxation({ scenario, item, group, vTotTrib }: TComputeItemTaxationInput): TItemTaxResult {
	const erros: TFiscalValidationError[] = [];
	// Frete e outras despesas (vOutro) cobrados do destinatario compoem a base tributavel do item.
	// O rateio e feito antes desta etapa para manter bases, itens e totais do documento coerentes.
	const baseLiquida = round2(item.valorBruto - item.valorDesconto + (item.valorFrete ?? 0) + (item.valorOutros ?? 0));
	const origemCodigo = mapOrigemToCodigo(item.origemMercadoria);

	const config = resolveEffectiveTaxConfig(group, scenario);

	const cfopBase = resolveRuleCfopOverride(group, scenario) ?? item.cfopBase;
	const cfop = resolveCfop({ cfopBase, ufOrigem: scenario.ufOrigem, ufDestino: scenario.ufDestino });
	if (!cfop) {
		erros.push({
			codigo: "CFOP_AUSENTE",
			severidade: "ERRO",
			mensagem: "CFOP nao pode ser resolvido para o item (sem CFOP no produto, regra ou operacao).",
			produtoId: item.produtoId,
		});
	}

	const icms = computeIcms({
		config,
		scenario,
		baseLiquida,
		origemCodigo,
		origemMercadoria: item.origemMercadoria,
		produtoId: item.produtoId,
		cest: item.cest ?? null,
		erros,
	});
	const pis = computeContribuicao({
		tributo: "PIS",
		cst: config.cstPis,
		aliquota: config.aliquotaPis,
		base: baseLiquida,
		produtoId: item.produtoId,
		erros,
	});
	const cofins = computeContribuicao({
		tributo: "COFINS",
		cst: config.cstCofins,
		aliquota: config.aliquotaCofins,
		base: baseLiquida,
		produtoId: item.produtoId,
		erros,
	});

	return {
		produtoId: item.produtoId,
		cfop,
		icms,
		pis: { cst: pis.cst, vBC: pis.vBC, pPIS: pis.pAliq, vPIS: pis.valor },
		cofins: { cst: cofins.cst, vBC: cofins.vBC, pCOFINS: cofins.pAliq, vCOFINS: cofins.valor },
		vTotTrib: round2(vTotTrib ?? 0),
		erros,
	};
}

export function computeDocumentTotals(
	items: { result: TItemTaxResult; valorBruto: number; valorDesconto: number }[],
	extras?: { vFrete?: number; vOutro?: number },
): TDocumentTaxTotals {
	const totals: TDocumentTaxTotals = {
		vBC: 0,
		vICMS: 0,
		vFCP: 0,
		vBCST: 0,
		vST: 0,
		vFCPST: 0,
		vProd: 0,
		vDesc: 0,
		vPIS: 0,
		vCOFINS: 0,
		vTotTrib: 0,
		vFrete: 0,
		vOutro: 0,
		vNF: 0,
	};

	for (const { result, valorBruto, valorDesconto } of items) {
		totals.vBC += result.icms.vBC;
		totals.vICMS += result.icms.vICMS;
		totals.vFCP += result.icms.vFCP;
		totals.vBCST += result.icms.st?.vBCST ?? 0;
		totals.vST += result.icms.st?.vICMSST ?? 0;
		totals.vFCPST += result.icms.st?.vFCPST ?? 0;
		totals.vProd += valorBruto;
		totals.vDesc += valorDesconto;
		totals.vPIS += result.pis.vPIS;
		totals.vCOFINS += result.cofins.vCOFINS;
		totals.vTotTrib += result.vTotTrib;
	}

	totals.vBC = round2(totals.vBC);
	totals.vICMS = round2(totals.vICMS);
	totals.vFCP = round2(totals.vFCP);
	totals.vBCST = round2(totals.vBCST);
	totals.vST = round2(totals.vST);
	totals.vFCPST = round2(totals.vFCPST);
	totals.vProd = round2(totals.vProd);
	totals.vDesc = round2(totals.vDesc);
	totals.vPIS = round2(totals.vPIS);
	totals.vCOFINS = round2(totals.vCOFINS);
	totals.vTotTrib = round2(totals.vTotTrib);
	totals.vFrete = round2(extras?.vFrete ?? 0);
	totals.vOutro = round2(extras?.vOutro ?? 0);
	// vNF = produtos - desconto + frete + outros + ST + FCP-ST (regra W16 / NT 2016.002; seguro fora de escopo)
	totals.vNF = round2(totals.vProd - totals.vDesc + totals.vFrete + totals.vOutro + totals.vST + totals.vFCPST);

	return totals;
}

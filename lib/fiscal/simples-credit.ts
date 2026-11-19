import type { TFiscalSaleChoices } from "@/schemas/fiscal";
import type { TEffectiveTaxConfig, TFiscalTaxScenario, TFiscalValidationError } from "./engine/types";

export function getFiscalCreditCompetence(date = new Date()) {
	return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(date);
}

export function getFiscalCreditChoiceProblems({
	enabled,
	tipo,
	choices,
	regimeTributario,
	cpfCnpj,
	indicador,
}: {
	enabled: boolean;
	tipo: string;
	choices: TFiscalSaleChoices;
	regimeTributario: number;
	cpfCnpj?: string | null;
	indicador?: string | null;
}) {
	if (!enabled || tipo !== "NFE") return [];
	const problems: string[] = [];
	if (!choices.fiscalDestinacao) problems.push("Confirme a destinação da compra antes de emitir a NF-e.");
	if (!choices.fiscalCreditoIcms || choices.fiscalCreditoIcms === "NAO_CONFIRMADO")
		problems.push("Confirme se esta operação deve informar crédito de ICMS do Simples Nacional.");
	if (choices.fiscalCreditoIcms === "COM_CREDITO") {
		if (choices.fiscalDestinacao !== "REVENDA_INDUSTRIALIZACAO") problems.push("Crédito de ICMS exige destinação para revenda ou industrialização.");
		if (regimeTributario !== 1) problems.push("Este fluxo de crédito exige emitente no Simples Nacional (CRT 1).");
		if (cpfCnpj?.replace(/\D/g, "").length !== 14 || !["CONTRIBUINTE_ICMS", "CONTRIBUINTE_ISENTO"].includes(indicador ?? ""))
			problems.push("Crédito de ICMS exige destinatário pessoa jurídica contribuinte de ICMS.");
	}
	return problems;
}

export function resolveSimplesCreditConfig({
	config,
	scenario,
	decision,
	group,
	rate,
	produtoId,
	errors,
}: {
	config: TEffectiveTaxConfig;
	scenario: TFiscalTaxScenario;
	decision: TFiscalSaleChoices["fiscalCreditoIcms"];
	group: { csosnComCredito?: string | null; csosnSemCredito?: string | null };
	rate?: { percentual: number } | null;
	produtoId: string;
	errors: TFiscalValidationError[];
}): TEffectiveTaxConfig {
	const error = (codigo: string, mensagem: string) => errors.push({ codigo, mensagem, produtoId, severidade: "ERRO" });
	const base = config.csosn;
	// Operações isentas, imunes ou com imposto já retido preservam seu tratamento.
	if (["103", "203", "300", "400", "500"].includes(base)) return { ...config, percentualCreditoSn: null };
	if (base === "900") {
		error("CREDITO_SN_TRATAMENTO_NAO_SUPORTADO", "Revise com a contabilidade o grupo com CSOSN 900 antes de usar o fluxo de crédito por operação.");
		return { ...config, percentualCreditoSn: null };
	}
	const withCredit = decision === "COM_CREDITO";
	const target = withCredit ? group.csosnComCredito : group.csosnSemCredito;
	const family = ["101", "102"].includes(base) ? ["101", "102"] : ["201", "202"];
	const allowed = withCredit ? ["101", "201"] : ["102", "202"];
	if (!target || !family.includes(target) || !allowed.includes(target)) {
		error("CREDITO_SN_ENQUADRAMENTO_AUSENTE", `Configure o CSOSN ${withCredit ? "com" : "sem"} crédito do grupo, compatível com o tratamento do item.`);
		return { ...config, percentualCreditoSn: null };
	}
	if (withCredit && (!rate || !Number.isFinite(rate.percentual) || rate.percentual <= 0 || rate.percentual > 100))
		error("CREDITO_SN_COMPETENCIA_AUSENTE", "Cadastre o percentual de crédito do grupo para a competência da emissão.");
	if (withCredit && scenario.consumidorFinal) error("CREDITO_SN_CONSUMIDOR_FINAL", "Operação com crédito não pode ser destinada a consumo final.");
	return { ...config, csosn: target as TEffectiveTaxConfig["csosn"], percentualCreditoSn: withCredit ? (rate?.percentual ?? null) : null };
}

export function buildSimplesCreditSummary(
	items: { produtoId: string; icms: { csosn: string; pCredSN: number | null; vCredICMSSN: number | null } }[],
) {
	const totals = new Map<number, number>();
	for (const { icms } of items) {
		if (!["101", "201"].includes(icms.csosn) || icms.pCredSN == null || icms.vCredICMSSN == null) continue;
		totals.set(icms.pCredSN, (totals.get(icms.pCredSN) ?? 0) + icms.vCredICMSSN);
	}
	const parcelas = [...totals]
		.sort(([a], [b]) => a - b)
		.map(([percentual, valor]) => ({ percentual, valor: Math.round((valor + Number.EPSILON) * 100) / 100 }));
	const format = (n: number, digits: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: digits });
	return {
		parcelas,
		valorTotal: Math.round(parcelas.reduce((sum, p) => sum + p.valor, 0) * 100) / 100,
		mensagem: parcelas
			.map(
				(p) =>
					`PERMITE O APROVEITAMENTO DO CRÉDITO DE ICMS NO VALOR DE R$ ${format(p.valor, 2)}; CORRESPONDENTE À ALÍQUOTA DE ${format(p.percentual, 4)}%, NOS TERMOS DO ART. 23 DA LEI COMPLEMENTAR Nº 123, DE 2006.`,
			)
			.join(" "),
	};
}

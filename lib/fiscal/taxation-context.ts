import { resolveFiscalProductProfile } from "./product-profile";
import { resolveEffectiveTaxConfig } from "./engine/rules";
import { buildSimplesCreditSummary, getFiscalCreditChoiceProblems, getFiscalCreditCompetence, resolveSimplesCreditConfig } from "./simples-credit";
import type { TFiscalClientTaxIndicatorEnum } from "@/schemas/enums";
import {
	aggregateItemErrors,
	computeDocumentTotals,
	computeItemTaxation,
	computeVTotTrib,
	selectIbptRate,
	type TDocumentTaxTotals,
	type TFiscalTaxGroupWithRules,
	type TFiscalTaxScenario,
	type TFiscalValidationError,
	type TItemTaxResult,
} from "./engine";
import { allocateFiscalFreight } from "./freight-allocation";
import { allocateFiscalHeaderDiscount, resolveFiscalHeaderDiscount } from "./header-discount";
import { resolveFiscalOtherCharges } from "./other-charges";
import { getManagedChannelIntegrationMetadata } from "@/lib/sales/fulfillment-channels/policy";
import { resolveFiscalShopDeliveryFee } from "@/lib/shop/config";
import type { TFiscalSaleContext } from "./types";

export type TFiscalTaxationItem = Pick<
	TFiscalSaleContext["venda"]["itens"][number],
	| "id"
	| "produtoVarianteId"
	| "valorVendaTotalLiquido"
	| "produtoId"
	| "quantidade"
	| "valorVendaUnitario"
	| "valorVendaTotalBruto"
	| "valorTotalDesconto"
	| "metadados"
>;
export type TFiscalTaxationContext = Omit<TFiscalSaleContext, "venda" | "serie" | "pagamentos"> & {
	venda: Pick<
		TFiscalSaleContext["venda"],
		| "integracaoMetadados"
		| "rascunhoMetadados"
		| "entregaModalidade"
		| "acrescimosTotal"
		| "valorTotal"
		| "descontosTotal"
		| "fiscalDestinacao"
		| "fiscalCreditoIcms"
	> & { itens: TFiscalTaxationItem[] };
};

function readDestinatarioUf(context: TFiscalTaxationContext): string | null {
	const snapshot = context.destinatarioSnapshot as { endereco?: { estado?: string | null } } | null;
	const uf = snapshot?.endereco?.estado;
	return uf ? String(uf).toUpperCase() : null;
}

function readDestinatarioIndicador(context: TFiscalTaxationContext): TFiscalClientTaxIndicatorEnum {
	const snapshot = context.destinatarioSnapshot as { indicadorInscricaoEstadual?: TFiscalClientTaxIndicatorEnum | null } | null;
	return snapshot?.indicadorInscricaoEstadual ?? "NAO_CONTRIBUINTE";
}

// Monta o cenario fiscal (mesmo para todos os itens do documento) a partir do contexto da venda.
export function buildSaleScenario(context: TFiscalTaxationContext): TFiscalTaxScenario {
	const fiscalConfig = context.organizacao.fiscalConfiguracao;
	const ufOrigem = (fiscalConfig?.endereco.uf ?? "").toUpperCase();
	// NFC-e (mod 65) e sempre operacao interna (idDest = 1, CFOP 5xxx): o endereco do cliente
	// nao pode dirigir o cenario para regras/CFOP interestaduais.
	const isNfce = context.operacao.tipoDocumento === "NFCE";
	const ufDestino = isNfce ? ufOrigem : (readDestinatarioUf(context) ?? ufOrigem);
	const escopo = ufOrigem && ufDestino && ufOrigem !== ufDestino ? "INTERESTADUAL" : "INTRAESTADUAL";

	return {
		regimeTributario: fiscalConfig?.regimeTributario ?? 1,
		ufOrigem,
		ufDestino,
		escopo,
		consumidorFinal:
			context.organizacao.fiscalConfiguracao?.operacoesRevenda?.habilitada &&
			context.operacao.tipoDocumento === "NFE" &&
			context.operacao.finalidade === "NORMAL" &&
			context.venda.fiscalDestinacao
				? context.venda.fiscalDestinacao === "CONSUMO_FINAL"
				: context.operacao.consumidorFinal,
		finalidade: context.operacao.finalidade,
		indicadorDestinatario: readDestinatarioIndicador(context),
	};
}

// Grupo sintetico usado quando o produto nao tem grupo tributario vinculado.
// Mantem a emissao renderizavel; a validacao registra o erro bloqueante separadamente.
function buildFallbackGroup(organizacaoId: string): TFiscalTaxGroupWithRules {
	return {
		id: "__fallback__",
		organizacaoId,
		nome: "FALLBACK",
		descricao: null,
		csosn: "102",
		aliquotaIcms: 0,
		percentualReducaoBc: 0,
		modalidadeBc: 3,
		percentualCreditoSn: null,
		temSubstituicaoTributaria: false,
		mvaSt: null,
		aliquotaIcmsSt: null,
		aliquotaInternaDestino: null,
		percentualReducaoBcSt: null,
		aliquotaFcp: 0,
		aliquotaFcpSt: 0,
		cstPis: "49",
		aliquotaPis: 0,
		cstCofins: "49",
		aliquotaCofins: 0,
		ativo: true,
		dataInsercao: new Date(),
		regras: [],
	};
}

export type TSaleItemTaxation = {
	item: TFiscalTaxationItem;
	result: TItemTaxResult;
	valorFrete: number;
	// Parcela do acrescimo nao-frete (vOutro) rateada no item.
	valorOutros: number;
	// Desconto fiscal efetivo do item: o desconto do proprio item + a fatia rateada do desconto
	// de cabecalho da venda. E este valor (nao item.valorTotalDesconto) que os mappers devem emitir.
	valorDesconto: number;
};

export type TSaleTaxation = {
	scenario: TFiscalTaxScenario;
	itens: TSaleItemTaxation[];
	totais: TDocumentTaxTotals;
	erros: TFiscalValidationError[];
	credito: ReturnType<typeof buildSimplesCreditSummary> & { competencia: string };
};

// Calcula a tributacao de toda a venda. Fonte unica usada tanto pela validacao quanto pelos mappers.
export function computeSaleTaxation(context: TFiscalTaxationContext): TSaleTaxation {
	const scenario = buildSaleScenario(context);
	const extraErrors: TFiscalValidationError[] = [];
	const enabled =
		!!context.organizacao.fiscalConfiguracao?.operacoesRevenda?.habilitada &&
		context.operacao.tipoDocumento === "NFE" &&
		context.operacao.finalidade === "NORMAL";
	const competencia = getFiscalCreditCompetence(context.dataCalculo);
	if (enabled)
		for (const mensagem of getFiscalCreditChoiceProblems({
			enabled,
			tipo: context.operacao.tipoDocumento,
			choices: context.venda,
			regimeTributario: scenario.regimeTributario,
			cpfCnpj: context.destinatarioSnapshot?.cpfCnpj as string | undefined,
			indicador: scenario.indicadorDestinatario,
		}))
			extraErrors.push({ codigo: "CREDITO_SN_DECISAO_INVALIDA", severidade: "ERRO", mensagem });
	// Frete de canal gerenciado: entrega propria (LOJA) e receita da loja e compoe a NF; entrega
	// feita pelo canal fica fora. A taxa da loja digital tambem e sempre receita da loja.
	const integracaoMetadados = getManagedChannelIntegrationMetadata(context.venda.integracaoMetadados);
	const vFreteCanal = integracaoMetadados?.entrega.realizadaPor === "LOJA" ? Math.max(integracaoMetadados.entrega.valorFrete, 0) : 0;
	const vFreteLoja = resolveFiscalShopDeliveryFee({
		rascunhoMetadados: context.venda.rascunhoMetadados,
		modalidade: context.venda.entregaModalidade,
		acrescimosTotal: context.venda.acrescimosTotal,
	});
	const vFrete = vFreteCanal + vFreteLoja;
	const freightByItem = allocateFiscalFreight({
		valorFrete: vFrete,
		itens: context.venda.itens.map((item) => ({
			valorBruto: item.valorVendaTotalBruto,
			valorDesconto: item.valorTotalDesconto,
		})),
	});

	// Desconto de cabecalho (desconto geral, cupom, cashback) rateado nos itens para compor o
	// vDesc: sem isso a nota sai pelo bruto e os pagamentos (liquidos) nao fecham — rejeicao 865.
	// Canal gerenciado fica fora: descontos de canal ja chegam nos itens e os pagamentos fiscais
	// sao reconstruidos para somar o vNF (buildFiscalPaymentsForManagedSale).
	const discountableItems = context.venda.itens.map((item) => ({
		valorBruto: item.valorVendaTotalBruto,
		valorDesconto: item.valorTotalDesconto,
	}));
	const headerDiscount = integracaoMetadados
		? 0
		: resolveFiscalHeaderDiscount({
				itens: discountableItems,
				valorTotal: context.venda.valorTotal,
				acrescimosTotal: context.venda.acrescimosTotal,
				descontosTotal: context.venda.descontosTotal,
			});
	const headerDiscountByItem = allocateFiscalHeaderDiscount({ valorDesconto: headerDiscount, itens: discountableItems });

	// Acrescimo geral (nao frete) como vOutro, rateado como o frete: sem isso a nota sai pelos itens
	// e os pagamentos (com o acrescimo) passam do vNF — rejeicao 866. Canal gerenciado fica fora
	// pelo mesmo motivo do desconto de cabecalho.
	const vOutro = integracaoMetadados
		? 0
		: resolveFiscalOtherCharges({
				itens: discountableItems,
				valorTotal: context.venda.valorTotal,
				acrescimosTotal: context.venda.acrescimosTotal,
				valorFrete: vFreteLoja,
				valorDescontoCabecalho: headerDiscount,
			});
	const otherChargesByItem = allocateFiscalFreight({ valorFrete: vOutro, itens: discountableItems });

	const itens = context.venda.itens.map((item, index) => {
		const valorDesconto = item.valorTotalDesconto + headerDiscountByItem[index];
		const perfil = resolveFiscalProductProfile(context.perfisProdutos, item);
		const grupo = perfil?.grupoTributarioId ? context.gruposTributarios.find((g) => g.id === perfil.grupoTributarioId) : undefined;

		if (!perfil) {
			extraErrors.push({
				codigo: "PERFIL_FISCAL_AUSENTE",
				severidade: "ERRO",
				mensagem: "Produto sem perfil fiscal cadastrado.",
				produtoId: item.produtoId,
			});
		} else if (!perfil.grupoTributarioId || !grupo) {
			extraErrors.push({
				codigo: "GRUPO_TRIBUTARIO_AUSENTE",
				severidade: "ERRO",
				mensagem: "Produto sem grupo tributario vinculado.",
				produtoId: item.produtoId,
			});
		}

		const grupoEfetivo = grupo ?? buildFallbackGroup(context.organizacao.id);
		const origemMercadoria = perfil?.origemMercadoria ?? "NACIONAL";

		// vTotTrib (Lei 12.741) a partir da tabela IBPT carregada no contexto (por NCM + UF de origem).
		const ibptRate = selectIbptRate(context.ibptRates, { ncm: perfil?.ncm ?? "", uf: scenario.ufOrigem, exTipi: perfil?.exTipi ?? null });
		const vTotTrib = computeVTotTrib({
			rate: ibptRate,
			origem: origemMercadoria,
			baseValue: item.valorVendaTotalBruto - valorDesconto + freightByItem[index] + otherChargesByItem[index],
		});

		const rate = context.percentuaisCredito?.find((r) => r.grupoTributarioId === grupoEfetivo.id && r.competencia === competencia);
		const configOverride = enabled
			? resolveSimplesCreditConfig({
					config: resolveEffectiveTaxConfig(grupoEfetivo, scenario),
					scenario,
					decision: context.venda.fiscalCreditoIcms,
					group: grupoEfetivo,
					rate,
					produtoId: item.produtoId,
					errors: extraErrors,
				})
			: undefined;
		const result = computeItemTaxation({
			configOverride,
			scenario,
			group: grupoEfetivo,
			item: {
				produtoId: item.produtoId,
				origemMercadoria,
				cfopBase: perfil?.cfopPadrao ?? context.operacao.cfopPadrao,
				cest: perfil?.cest ?? null,
				quantidade: item.quantidade,
				valorBruto: item.valorVendaTotalBruto,
				valorDesconto,
				valorFrete: freightByItem[index],
				valorOutros: otherChargesByItem[index],
			},
			vTotTrib,
		});
		// No fluxo por operação o percentual vem da competência e a falta dele já foi reportada como
		// CREDITO_SN_COMPETENCIA_AUSENTE; o erro do percentual fixo do grupo seria uma duplicata.
		if (configOverride) result.erros = result.erros.filter((error) => error.codigo !== "CREDITO_SN_AUSENTE");

		return { item, result, valorFrete: freightByItem[index], valorOutros: otherChargesByItem[index], valorDesconto };
	});

	const totais = computeDocumentTotals(
		itens.map(({ result, item, valorDesconto }) => ({ result, valorBruto: item.valorVendaTotalBruto, valorDesconto })),
		{ vFrete, vOutro },
	);
	const erros = [...extraErrors, ...aggregateItemErrors(itens.map(({ result }) => result))];

	const credito = buildSimplesCreditSummary(itens.map(({ result }) => result));
	if (credito.mensagem.length > 4800)
		erros.push({
			codigo: "CREDITO_SN_TEXTO_EXCEDIDO",
			severidade: "ERRO",
			mensagem: "A discriminação do crédito excede o limite das informações complementares. Revise a configuração dos grupos tributários.",
		});
	if (enabled && context.venda.fiscalCreditoIcms === "COM_CREDITO" && credito.parcelas.length === 0 && erros.length === 0)
		erros.push({
			codigo: "CREDITO_SN_SEM_ITENS",
			severidade: "ERRO",
			mensagem: "Nenhum item desta nota permite crédito. Revise o tratamento fiscal ou selecione sem crédito.",
		});
	return { scenario, itens, totais, erros, credito: { ...credito, competencia } };
}

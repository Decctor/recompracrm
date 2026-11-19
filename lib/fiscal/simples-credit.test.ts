import assert from "node:assert/strict";
import test from "node:test";
import { computeSaleTaxation } from "./taxation-context";
import { buildSimplesCreditSummary, getFiscalCreditCompetence } from "./simples-credit";
import { resolveSaleFiscalChoices } from "./sale-credit-choices";
import { mapSaleContextToSpedyInvoicePayload } from "./providers/spedy/mappers/invoice";
import type { TFiscalSaleContext } from "./types";
import type { TFiscalDocument } from "@/services/drizzle/schema";
import { restoreFiscalCreditContext, snapshotFiscalCreditContext } from "./credit-attempt";
import { FiscalCreditRateInputSchema } from "@/schemas/fiscal";
import { extractPayloadItems } from "./document-details-view";
import { buildValidationProblems } from "./problems";

function context(): TFiscalSaleContext {
	return {
		dataCalculo: new Date("2026-11-19T15:42:18Z"),
		venda: {
			id: "sale",
			organizacaoId: "org",
			fiscalDestinacao: "REVENDA_INDUSTRIALIZACAO",
			fiscalCreditoIcms: "COM_CREDITO",
			valorTotal: 230,
			descontosTotal: 0,
			acrescimosTotal: 0,
			entregaModalidade: "RETIRADA",
			integracaoMetadados: null,
			rascunhoMetadados: null,
			itens: [
				{
					id: "item",
					produtoId: "p",
					produtoVarianteId: null,
					quantidade: 20,
					valorVendaUnitario: 11.5,
					valorVendaTotalBruto: 230,
					valorVendaTotalLiquido: 230,
					valorTotalDesconto: 0,
					metadados: { nome: "Congelado" },
				},
			],
		},
		organizacao: {
			id: "org",
			fiscalConfiguracao: { regimeTributario: 1, ambiente: "HOMOLOGACAO", endereco: { uf: "MG" }, operacoesRevenda: { habilitada: true } },
		},
		serie: { serie: "1", proximoNumero: 6 },
		operacao: {
			tipoDocumento: "NFE",
			finalidade: "NORMAL",
			consumidorFinal: true,
			cfopPadrao: "5101",
			naturezaOperacao: "Venda de produção",
			presencaConsumidor: "OPERACAO_PRESENCIAL",
		},
		perfisProdutos: [
			{
				produtoId: "p",
				produtoVarianteId: null,
				grupoTributarioId: "group",
				ncm: "19059020",
				cest: null,
				cfopPadrao: "5101",
				origemMercadoria: "NACIONAL",
				unidadeComercial: "UN",
			},
		],
		gruposTributarios: [
			{
				id: "group",
				organizacaoId: "org",
				csosn: "102",
				csosnComCredito: "101",
				csosnSemCredito: "102",
				aliquotaIcms: 0,
				percentualReducaoBc: 0,
				modalidadeBc: 3,
				percentualCreditoSn: 9,
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
				regras: [],
			},
		],
		percentuaisCredito: [{ id: "rate", organizacaoId: "org", grupoTributarioId: "group", competencia: "2026-11", percentual: 2 }],
		ibptRates: [],
		destinatarioSnapshot: {
			nome: "Supermercado",
			cpfCnpj: "24870244000193",
			indicadorInscricaoEstadual: "CONTRIBUINTE_ICMS",
			endereco: { estado: "MG" },
		},
		pagamentos: [{ metodo: "DINHEIRO", valor: 230 }],
	} as unknown as TFiscalSaleContext;
}

test("operação convencional preserva tributação e consumidor final, mesmo com escolhas antigas", () => {
	const ctx = context();
	ctx.organizacao.fiscalConfiguracao!.operacoesRevenda = { habilitada: false };
	const result = computeSaleTaxation(ctx);
	assert.equal(result.scenario.consumidorFinal, true);
	assert.equal(result.itens[0].result.icms.csosn, "102");
	assert.equal(result.credito.valorTotal, 0);
	assert.deepEqual(result.erros, []);
});

test("crédito utiliza competência, altera indFinal e mantém texto e campos próprios coerentes", () => {
	const ctx = context();
	const result = computeSaleTaxation(ctx);
	assert.deepEqual(result.erros, []);
	assert.equal(result.scenario.consumidorFinal, false);
	assert.equal(result.itens[0].result.icms.pCredSN, 2);
	assert.equal(result.itens[0].result.icms.vCredICMSSN, 4.6);
	assert.equal(result.credito.valorTotal, 4.6);
	const payload = mapSaleContextToSpedyInvoicePayload(ctx, { tipo: "NFE", referencia: "sale", tentativasEnvio: 1 } as TFiscalDocument);
	assert.equal(payload.isFinalCustomer, false);
	assert.equal(typeof payload.additionalInformation, "string");
	assert.match(payload.additionalInformation as string, /R\$ 4,60/);
	assert.match(payload.additionalInformation as string, /2,00%/);
	assert.equal((payload.items as { taxes: { icms: { snCreditRate: number; snCreditAmount: number } } }[])[0].taxes.icms.snCreditAmount, 4.6);
});

test("revenda sem crédito não depende de percentual e não vira consumidor final", () => {
	const ctx = context();
	ctx.venda.fiscalCreditoIcms = "SEM_CREDITO";
	ctx.percentuaisCredito = [];
	const result = computeSaleTaxation(ctx);
	assert.deepEqual(result.erros, []);
	assert.equal(result.itens[0].result.icms.csosn, "102");
	assert.equal(result.itens[0].result.icms.pCredSN, null);
	assert.equal(result.scenario.consumidorFinal, false);
});

test("mês anterior e percentual fixo legado não substituem percentual vigente", () => {
	const ctx = context();
	ctx.percentuaisCredito![0].competencia = "2026-10";
	const result = computeSaleTaxation(ctx);
	assert.ok(result.erros.some((e) => e.codigo === "CREDITO_SN_COMPETENCIA_AUSENTE"));
	assert.equal(result.itens[0].result.icms.pCredSN, null);
});

test("sem percentual da competência há um único erro de configuração, sem o erro do percentual fixo", () => {
	const ctx = context();
	ctx.percentuaisCredito = [];
	const result = computeSaleTaxation(ctx);
	assert.deepEqual(
		result.erros.map((e) => e.codigo),
		["CREDITO_SN_COMPETENCIA_AUSENTE"],
	);
	assert.deepEqual(
		buildValidationProblems(result.erros).map((p) => p.codigo),
		["CREDITO_SN_CONFIGURACAO"],
	);
});

test("recurso desligado: falta do percentual fixo do grupo não aponta para os percentuais por competência", () => {
	const ctx = context();
	ctx.organizacao.fiscalConfiguracao!.operacoesRevenda = { habilitada: false };
	ctx.gruposTributarios[0].csosn = "101";
	ctx.gruposTributarios[0].percentualCreditoSn = null;
	const result = computeSaleTaxation(ctx);
	assert.ok(result.erros.some((e) => e.codigo === "CREDITO_SN_AUSENTE"));
	const problems = buildValidationProblems(result.erros).map((p) => p.codigo);
	assert.ok(!problems.includes("CREDITO_SN_CONFIGURACAO"));
	assert.ok(!problems.includes("CREDITO_SN_REVISAO"));
});

test("decisão não confirmada, consumo final e destinatário incompatível bloqueiam o crédito", () => {
	for (const patch of [{ fiscalCreditoIcms: "NAO_CONFIRMADO" }, { fiscalDestinacao: "CONSUMO_FINAL" }] as const) {
		const ctx = context();
		Object.assign(ctx.venda, patch);
		assert.ok(computeSaleTaxation(ctx).erros.some((e) => e.codigo === "CREDITO_SN_DECISAO_INVALIDA"));
	}
	const ctx = context();
	ctx.destinatarioSnapshot!.indicadorInscricaoEstadual = "NAO_CONTRIBUINTE";
	assert.ok(computeSaleTaxation(ctx).erros.some((e) => e.codigo === "CREDITO_SN_DECISAO_INVALIDA"));
});

test("NFC-e e devolução não passam pelo fluxo de concessão de crédito por operação", () => {
	for (const mode of ["NFCE", "DEVOLUCAO"]) {
		const ctx = context();
		ctx.venda.fiscalCreditoIcms = null;
		if (mode === "NFCE") ctx.operacao.tipoDocumento = "NFCE";
		else ctx.operacao.finalidade = "DEVOLUCAO";
		assert.equal(
			computeSaleTaxation(ctx).erros.some((e) => e.codigo.startsWith("CREDITO_SN_")),
			false,
		);
	}
});

test("itens com ICMS já retido mantêm CSOSN 500 sem contaminar o crédito dos demais", () => {
	const ctx = context();
	ctx.venda.itens.push({ ...ctx.venda.itens[0], id: "st", produtoId: "st" });
	ctx.perfisProdutos.push({ ...ctx.perfisProdutos[0], produtoId: "st", grupoTributarioId: "st" });
	ctx.gruposTributarios.push({ ...ctx.gruposTributarios[0], id: "st", csosn: "500", temSubstituicaoTributaria: true });
	const result = computeSaleTaxation(ctx);
	assert.deepEqual(result.erros, []);
	assert.equal(result.itens[1].result.icms.csosn, "500");
	assert.equal(result.itens[1].result.icms.vCredICMSSN, null);
	assert.equal(result.credito.valorTotal, 4.6);
});

test("não converte entre família normal e ST sem enquadramento compatível", () => {
	const ctx = context();
	ctx.gruposTributarios[0].csosnComCredito = "201";
	assert.ok(computeSaleTaxation(ctx).erros.some((e) => e.codigo === "CREDITO_SN_ENQUADRAMENTO_AUSENTE"));
});

test("soma os créditos arredondados por item e discrimina alíquotas diferentes", () => {
	const summary = buildSimplesCreditSummary([
		{ produtoId: "1", icms: { csosn: "101", pCredSN: 2, vCredICMSSN: 0.01 } },
		{ produtoId: "2", icms: { csosn: "101", pCredSN: 2, vCredICMSSN: 0.01 } },
		{ produtoId: "3", icms: { csosn: "201", pCredSN: 3.125, vCredICMSSN: 1 } },
	]);
	assert.equal(summary.valorTotal, 1.02);
	assert.deepEqual(summary.parcelas, [
		{ percentual: 2, valor: 0.02 },
		{ percentual: 3.125, valor: 1 },
	]);
	assert.match(summary.mensagem, /3,125%/);
});

test("competência respeita a virada do mês no fuso brasileiro", () => {
	assert.equal(getFiscalCreditCompetence(new Date("2026-12-01T02:59:59Z")), "2026-11");
	assert.equal(getFiscalCreditCompetence(new Date("2026-12-01T03:00:00Z")), "2026-12");
});

test("escolhas fiscais exigem permissão e documento ativo impede alteração", () => {
	assert.throws(() => resolveSaleFiscalChoices({ requested: { fiscalCreditoIcms: "COM_CREDITO" }, canEmit: false }), /permissão/);
	assert.throws(
		() => resolveSaleFiscalChoices({ requested: { fiscalCreditoIcms: "COM_CREDITO" }, canEmit: true, documents: [{ statusInterno: "AUTORIZADO" }] }),
		/ativo/,
	);
	assert.equal(
		resolveSaleFiscalChoices({ requested: {}, current: { fiscalCreditoIcms: "SEM_CREDITO" }, canEmit: false }).fiscalCreditoIcms,
		"SEM_CREDITO",
	);
});

test("retentativa técnica preserva competência e percentual sem armazenar credenciais", () => {
	const ctx = context();
	ctx.organizacao.fiscalConfiguracao!.spedy = { companyApiKey: "credential-must-not-be-stored" } as NonNullable<
		typeof ctx.organizacao.fiscalConfiguracao
	>["spedy"];
	ctx.organizacao.integracaoConfiguracao = { segredo: "integration-secret" } as unknown as typeof ctx.organizacao.integracaoConfiguracao;
	const serialized = JSON.stringify({ contextoFiscal: snapshotFiscalCreditContext(ctx) });
	assert.equal(serialized.includes("credential-must-not-be-stored"), false);
	assert.equal(serialized.includes("integration-secret"), false);
	const live = structuredClone(ctx.organizacao);
	live.fiscalConfiguracao!.spedy.companyApiKey = "current-credential";
	const restored = restoreFiscalCreditContext(serialized, live, "sale")!;
	assert.equal(restored.organizacao.fiscalConfiguracao!.spedy.companyApiKey, "current-credential");
	assert.equal(restored.dataCalculo!.toISOString(), "2026-11-19T15:42:18.000Z");
	ctx.percentuaisCredito![0].percentual = 5;
	assert.equal(computeSaleTaxation(restored).credito.valorTotal, 4.6);
	assert.throws(() => restoreFiscalCreditContext(serialized, { ...live, id: "another-org" }, "sale"), /incompatível/);
	assert.throws(() => restoreFiscalCreditContext(serialized, live, "another-sale"), /incompatível/);
});

test("nota sem itens elegíveis exige revisão em vez de emitir texto com crédito zero", () => {
	const ctx = context();
	ctx.gruposTributarios[0].csosn = "500";
	ctx.gruposTributarios[0].temSubstituicaoTributaria = true;
	assert.ok(computeSaleTaxation(ctx).erros.some((e) => e.codigo === "CREDITO_SN_SEM_ITENS"));
});

test("reenvio técnico mantém integração e conteúdo mesmo quando o contador de tentativas avança", () => {
	const ctx = context();
	const document = { tipo: "NFE", referencia: "sale", tentativasEnvio: 2 } as TFiscalDocument;
	const payload = mapSaleContextToSpedyInvoicePayload(ctx, document);
	ctx.payloadCongelado = JSON.parse(JSON.stringify(payload));
	ctx.dataCalculo = new Date("2026-12-01T12:00:00Z");
	ctx.percentuaisCredito![0].percentual = 5;
	const retry = mapSaleContextToSpedyInvoicePayload(ctx, { ...document, tentativasEnvio: 3 });
	assert.deepEqual(retry, JSON.parse(JSON.stringify(payload)));
});

test("percentual não aceita precisão que divergiria da alíquota impressa", () => {
	assert.equal(FiscalCreditRateInputSchema.safeParse({ competencia: "2026-11", percentual: 2.1234 }).success, true);
	assert.equal(FiscalCreditRateInputSchema.safeParse({ competencia: "2026-11", percentual: 2.12345 }).success, false);
});

test("detalhes por item leem os créditos enviados à Spedy e os campos de XML", () => {
	const spedy = extractPayloadItems({ items: [{ taxes: { icms: { csosn: 101, snCreditRate: 2, snCreditAmount: 4.6 } } }] });
	const xml = extractPayloadItems({
		infNFe: { det: [{ imposto: { ICMS: { ICMSSN101: { CSOSN: "101", pCredSN: "2.0000", vCredICMSSN: "4.60" } } } }] },
	});
	for (const items of [spedy, xml]) {
		assert.equal(items[0].percentualCredito, 2);
		assert.equal(items[0].valorCredito, 4.6);
	}
});

test("a variante usa seu grupo fiscal, inclusive quando não permite crédito", () => {
	const ctx = context();
	ctx.venda.itens[0].produtoVarianteId = "variant";
	ctx.perfisProdutos.unshift({ ...ctx.perfisProdutos[0], produtoVarianteId: "unrelated", grupoTributarioId: "group" });
	ctx.perfisProdutos.push({ ...ctx.perfisProdutos[1], produtoVarianteId: "variant", grupoTributarioId: "st" });
	ctx.gruposTributarios.push({ ...ctx.gruposTributarios[0], id: "st", csosn: "500", temSubstituicaoTributaria: true });
	assert.equal(computeSaleTaxation(ctx).itens[0].result.icms.csosn, "500");
	ctx.venda.fiscalCreditoIcms = "SEM_CREDITO";
	assert.deepEqual(computeSaleTaxation(ctx).erros, []);
});

test("isento de inscrição continua sendo contribuinte e exige a declaração de crédito", () => {
	const ctx = context();
	ctx.destinatarioSnapshot!.indicadorInscricaoEstadual = "CONTRIBUINTE_ISENTO";
	assert.deepEqual(computeSaleTaxation(ctx).erros, []);
	const payload = mapSaleContextToSpedyInvoicePayload(ctx, { tipo: "NFE", referencia: "sale" } as TFiscalDocument);
	assert.equal((payload.receiver as { stateTaxNumber: string }).stateTaxNumber, "ISENTO");
	ctx.venda.fiscalCreditoIcms = "NAO_CONFIRMADO";
	assert.ok(computeSaleTaxation(ctx).erros.some((e) => e.codigo === "CREDITO_SN_DECISAO_INVALIDA"));
});

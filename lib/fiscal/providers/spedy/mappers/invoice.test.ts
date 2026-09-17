import assert from "node:assert/strict";
import test from "node:test";
import type { TFiscalSaleContext } from "@/lib/fiscal/types";
import type { TFiscalDocument } from "@/services/drizzle/schema";
import { mapSaleContextToSpedyInvoicePayload } from "./invoice";

test("envia o frete da loja nos itens e mantem pagamentos iguais ao total da NFC-e", () => {
	const context = {
		venda: {
			integracaoMetadados: null,
			rascunhoMetadados: { shop: { entrega: { taxa: 7 } } },
			entregaModalidade: "ENTREGA",
			acrescimosTotal: 7,
			itens: [
				{
					produtoId: "gelato",
					quantidade: 1,
					valorVendaUnitario: 28,
					valorVendaTotalBruto: 28,
					valorTotalDesconto: 0,
					metadados: { nome: "Gelato" },
				},
				{
					produtoId: "recompensa",
					quantidade: 1,
					valorVendaUnitario: 17,
					valorVendaTotalBruto: 17,
					valorTotalDesconto: 17,
					metadados: { nome: "Recompensa" },
				},
			],
		},
		organizacao: {
			id: "org",
			fiscalConfiguracao: {
				ambiente: "PRODUCAO",
				regimeTributario: 1,
				endereco: { uf: "MG" },
			},
		},
		serie: { serie: "3", proximoNumero: 97 },
		operacao: {
			tipoDocumento: "NFCE",
			finalidade: "NORMAL",
			presencaConsumidor: "OPERACAO_PRESENCIAL",
			consumidorFinal: true,
			cfopPadrao: "5102",
			naturezaOperacao: "Venda de mercadorias",
		},
		perfisProdutos: [
			{
				produtoId: "gelato",
				grupoTributarioId: "grupo",
				origemMercadoria: "NACIONAL",
				ncm: "21050010",
				cest: null,
				cfopPadrao: "5102",
				unidadeComercial: "UN",
			},
			{
				produtoId: "recompensa",
				grupoTributarioId: "grupo",
				origemMercadoria: "NACIONAL",
				ncm: "19053100",
				cest: null,
				cfopPadrao: "5102",
				unidadeComercial: "UN",
			},
		],
		gruposTributarios: [
			{
				id: "grupo",
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
				regras: [],
			},
		],
		ibptRates: [],
		destinatarioSnapshot: { nome: "Leonardo 🧸", cpfCnpj: "12345678909" },
		pagamentos: [{ metodo: "CARTAO_CREDITO", valor: 35 }],
	} as unknown as TFiscalSaleContext;
	const document = {
		tipo: "NFCE",
		referencia: "VENDA:test",
		numero: "96",
		tentativasEnvio: 1,
		chaveAcessoReferencia: null,
	} as unknown as TFiscalDocument;

	const payload = mapSaleContextToSpedyInvoicePayload(context, document) as {
		receiver: { name?: string };
		items: { freightAmount?: number }[];
		total: { invoiceAmount: number; freightAmount: number };
		payments: { amount: number }[];
	};

	assert.equal(payload.receiver.name, "Leonardo");
	assert.deepEqual(
		payload.items.map((item) => item.freightAmount ?? 0),
		[7, 0],
	);
	assert.equal(payload.total.freightAmount, 7);
	assert.equal(payload.total.invoiceAmount, 35);
	assert.equal(
		payload.payments.reduce((sum, payment) => sum + payment.amount, 0),
		35,
	);
});

test("desconto geral da venda entra como vDesc e a nota fecha com os pagamentos (rejeicao 865)", () => {
	// Regressao da venda 9f785668 (Congelatte): item de R$ 33, desconto geral de R$ 20 no
	// cabecalho, pagamento liquido de R$ 13. Sem o rateio do desconto, a nota saia por R$ 33
	// com pagamentos de R$ 13 — rejeicao SEFAZ 865.
	const context = {
		venda: {
			integracaoMetadados: null,
			rascunhoMetadados: { descontoGeral: 20, troco: 20 },
			entregaModalidade: "PRESENCIAL",
			valorTotal: 13,
			descontosTotal: 20,
			acrescimosTotal: 0,
			itens: [
				{
					produtoId: "petit-gateau",
					quantidade: 1,
					valorVendaUnitario: 33,
					valorVendaTotalBruto: 33,
					valorTotalDesconto: 0,
					metadados: { nome: "Petit Gateau" },
				},
			],
		},
		organizacao: {
			id: "org",
			fiscalConfiguracao: {
				ambiente: "PRODUCAO",
				regimeTributario: 1,
				endereco: { uf: "MG" },
			},
		},
		serie: { serie: "3", proximoNumero: 1187 },
		operacao: {
			tipoDocumento: "NFCE",
			finalidade: "NORMAL",
			presencaConsumidor: "OPERACAO_PRESENCIAL",
			consumidorFinal: true,
			cfopPadrao: "5102",
			naturezaOperacao: "Venda de mercadorias",
		},
		perfisProdutos: [
			{
				produtoId: "petit-gateau",
				grupoTributarioId: "grupo",
				origemMercadoria: "NACIONAL",
				ncm: "21050010",
				cest: null,
				cfopPadrao: "5102",
				unidadeComercial: "UN",
			},
		],
		gruposTributarios: [
			{
				id: "grupo",
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
				regras: [],
			},
		],
		ibptRates: [],
		destinatarioSnapshot: { nome: "Cliente", cpfCnpj: "12345678909" },
		pagamentos: [{ metodo: "CARTAO_CREDITO", valor: 13 }],
	} as unknown as TFiscalSaleContext;
	const document = {
		tipo: "NFCE",
		referencia: "VENDA:desconto-geral",
		numero: "1187",
		tentativasEnvio: 1,
		chaveAcessoReferencia: null,
	} as unknown as TFiscalDocument;

	const payload = mapSaleContextToSpedyInvoicePayload(context, document) as {
		items: { totalAmount: number; discountAmount?: number }[];
		total: { invoiceAmount: number; productAmount: number; discountAmount: number };
		payments: { amount: number }[];
	};

	assert.deepEqual(
		payload.items.map((item) => item.discountAmount ?? 0),
		[20],
	);
	assert.equal(payload.total.productAmount, 33);
	assert.equal(payload.total.discountAmount, 20);
	assert.equal(payload.total.invoiceAmount, 13);
	assert.equal(
		payload.payments.reduce((sum, payment) => sum + payment.amount, 0),
		13,
	);
});

// Contexto minimo de NFC-e da Congelatte, parametrizado pela presenca e pelo destinatario.
function buildDeliveryContext({
	presencaConsumidor,
	destinatarioSnapshot,
}: {
	presencaConsumidor: string;
	destinatarioSnapshot: Record<string, unknown>;
}) {
	return {
		venda: {
			integracaoMetadados: null,
			rascunhoMetadados: { shop: { entrega: { taxa: 7 } } },
			entregaModalidade: "ENTREGA",
			valorTotal: 35,
			acrescimosTotal: 7,
			itens: [
				{
					produtoId: "gelato",
					quantidade: 1,
					valorVendaUnitario: 28,
					valorVendaTotalBruto: 28,
					valorTotalDesconto: 0,
					metadados: { nome: "Gelato" },
				},
			],
		},
		organizacao: {
			id: "org",
			fiscalConfiguracao: {
				ambiente: "PRODUCAO",
				regimeTributario: 1,
				cpfCnpj: "53.825.696/0001-51",
				nomeRazaoSocial: "CONGELATTE GELATERIA LTDA",
				inscricaoEstadual: "ISENTO",
				emailFiscal: "fiscal@congelatte.com.br",
				telefoneFiscal: "(34) 99999-0000",
				endereco: {
					logradouro: "Avenida Treze  ",
					numero: "500",
					complemento: null,
					bairro: "Centro ",
					cidade: "ITUIUTABA",
					uf: "MG",
					cep: "38300-000",
				},
			},
		},
		serie: { serie: "3", proximoNumero: 1611 },
		operacao: {
			tipoDocumento: "NFCE",
			finalidade: "NORMAL",
			presencaConsumidor,
			consumidorFinal: true,
			cfopPadrao: "5102",
			naturezaOperacao: "Venda de mercadorias",
		},
		perfisProdutos: [
			{
				produtoId: "gelato",
				grupoTributarioId: "grupo",
				origemMercadoria: "NACIONAL",
				ncm: "21050010",
				cest: null,
				cfopPadrao: "5102",
				unidadeComercial: "UN",
			},
		],
		gruposTributarios: [
			{
				id: "grupo",
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
				regras: [],
			},
		],
		ibptRates: [],
		destinatarioSnapshot,
		pagamentos: [{ metodo: "CARTAO_CREDITO", valor: 35 }],
	} as unknown as TFiscalSaleContext;
}

const DELIVERY_DOCUMENT = {
	tipo: "NFCE",
	referencia: "VENDA:entrega",
	numero: "1611",
	tentativasEnvio: 1,
	chaveAcessoReferencia: null,
} as unknown as TFiscalDocument;

test("NFC-e de entrega a domicilio leva o transportador da propria loja (rejeicao 786)", () => {
	const context = buildDeliveryContext({
		presencaConsumidor: "ENTREGA_DOMICILIO",
		destinatarioSnapshot: { nome: "Gustavo", cpfCnpj: "09908909614" },
	});

	const payload = mapSaleContextToSpedyInvoicePayload(context, DELIVERY_DOCUMENT) as {
		presenceType: string;
		transport?: {
			freightModality: string;
			carrier: { name?: string; federalTaxNumber?: string; stateTaxNumber?: string; address?: { city?: { state?: string } } };
		};
	};

	assert.equal(payload.presenceType, "delivery");
	// modFrete 9 ("sem ocorrencia de transporte"): entrega propria, sem frete contratado — declarar
	// modalidade contratada aqui devolve a rejeicao 753.
	assert.equal(payload.transport?.freightModality, "free");
	assert.equal(payload.transport?.carrier.name, "CONGELATTE GELATERIA LTDA");
	assert.equal(payload.transport?.carrier.federalTaxNumber, "53825696000151");
	assert.equal(payload.transport?.carrier.stateTaxNumber, "ISENTO");
	assert.equal(payload.transport?.carrier.address?.city?.state, "mg");
});

test("NFC-e presencial nao leva transportador (rejeicao 754)", () => {
	const context = buildDeliveryContext({
		presencaConsumidor: "OPERACAO_PRESENCIAL",
		destinatarioSnapshot: { nome: "Gustavo", cpfCnpj: "09908909614" },
	});

	const payload = mapSaleContextToSpedyInvoicePayload(context, DELIVERY_DOCUMENT) as {
		presenceType: string;
		transport?: unknown;
	};

	assert.equal(payload.presenceType, "presence");
	assert.equal(payload.transport, undefined);
});

test("endereco do destinatario sai sem espaco sobrando (falha de schema em xBairro/xCpl)", () => {
	const context = buildDeliveryContext({
		presencaConsumidor: "ENTREGA_DOMICILIO",
		destinatarioSnapshot: {
			nome: "Gustavo",
			cpfCnpj: "09908909614",
			endereco: {
				cep: "38300-072",
				estado: "MG",
				cidade: "ITUIUTABA",
				bairro: "Alvorada ",
				logradouro: "Rua Dezoito ",
				numero: "1534",
				complemento: "Esquina com rua 19 de marco ",
			},
		},
	});

	const payload = mapSaleContextToSpedyInvoicePayload(context, DELIVERY_DOCUMENT) as {
		receiver: { address?: { street?: string; district?: string; additionalInformation?: string; postalCode?: string } };
	};

	assert.equal(payload.receiver.address?.street, "Rua Dezoito");
	assert.equal(payload.receiver.address?.district, "Alvorada");
	assert.equal(payload.receiver.address?.additionalInformation, "Esquina com rua 19 de marco");
	assert.equal(payload.receiver.address?.postalCode, "38300072");
});

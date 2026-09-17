import { buildFiscalPaymentsForManagedSale } from "@/lib/fiscal/managed-sale-payments";
import { computeSaleTaxation } from "@/lib/fiscal/taxation-context";
import type { TFiscalSaleContext } from "@/lib/fiscal/types";
import type { TFiscalDocument } from "@/services/drizzle/schema";
import { mapFiscalEnvironmentToSpedy } from "../status";
import type { TSpedyCreateInvoicePayload } from "../types";
import { buildSpedyItemTaxes } from "./imposto";
import { mapSalePaymentsToSpedy } from "./pagamento";
import { buildSpedyTransport } from "./transporte";
import {
	buildSpedyIntegrationId,
	formatCest,
	formatNcm,
	mapDestinationType,
	mapPresenceType,
	mapPurposeType,
	mapTaxRegistration,
	nonEmptyString,
	onlyDigits,
	resolveFiscalItemName,
	sanitizeNfeText,
} from "./utils";

/**
 * Razao social obrigatoria do destinatario em homologacao (NT 2013.005). A SEFAZ recusa qualquer
 * documento de teste cujo `xNome` nao seja exatamente esta string — o nome real do cliente so pode
 * trafegar em producao. Sem acentos e em caixa alta, como o leiaute exige.
 */
const NOME_DESTINATARIO_HOMOLOGACAO = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

function mapReceiver(snapshot: TFiscalSaleContext["destinatarioSnapshot"], isHomologacao: boolean) {
	if (!snapshot) return undefined;
	const address = snapshot.endereco as
		| {
				cep?: string | null;
				estado?: string | null;
				cidade?: string | null;
				bairro?: string | null;
				logradouro?: string | null;
				numero?: string | null;
				complemento?: string | null;
		  }
		| undefined;
	const nomeReal = sanitizeNfeText(typeof snapshot.nome === "string" ? snapshot.nome : undefined, 60);

	return {
		name: isHomologacao ? NOME_DESTINATARIO_HOMOLOGACAO : nomeReal,
		federalTaxNumber: onlyDigits(String(snapshot.cpfCnpj ?? "")),
		stateTaxNumber: mapTaxRegistration(typeof snapshot.inscricaoEstadual === "string" ? snapshot.inscricaoEstadual : null),
		email: nonEmptyString(typeof snapshot.email === "string" ? snapshot.email : null),
		// O XSD da NF-e recusa espaco no inicio ou no fim de campo String (rejeicao de schema em
		// xLgr/xBairro/xCpl). Endereco digitado pelo cliente chega com espaco sobrando e com
		// caractere fora do Latin-1, entao passa pelo mesmo saneamento do nome.
		address: address
			? {
					street: sanitizeNfeText(address.logradouro, 60),
					district: sanitizeNfeText(address.bairro, 60),
					postalCode: onlyDigits(address.cep ?? undefined),
					number: sanitizeNfeText(address.numero, 60),
					additionalInformation: sanitizeNfeText(address.complemento, 60),
					city: {
						name: sanitizeNfeText(address.cidade, 60),
						state: address.estado?.toLowerCase(),
					},
					country: "BRA",
				}
			: undefined,
	};
}

export function mapSaleContextToSpedyInvoicePayload(context: TFiscalSaleContext, documento: TFiscalDocument): TSpedyCreateInvoicePayload {
	const taxation = computeSaleTaxation(context);
	const isNfce = documento.tipo === "NFCE";
	const isReturn = context.operacao.finalidade === "DEVOLUCAO";
	// Canal gerenciado (fase 5/C2): pagamentos fiscais reconstruídos para somar exatamente o vNF
	// (transações cruas somam o valor cheio do pedido → vTroco artificial na NFC-e).
	const integracaoMetadados = context.venda.integracaoMetadados;
	const fiscalPayments = integracaoMetadados
		? buildFiscalPaymentsForManagedSale({ payments: context.pagamentos, integracaoMetadados, fiscalTotal: taxation.totais.vNF })
		: context.pagamentos;

	// A Spedy usa `effectiveDate` como a data de emissao do documento (dhEmi) — o retorno dela
	// ecoa esse valor em `issuedOn`, nao o `issuedOn` que enviamos. Preenche-lo com a data da
	// venda datava a NF-e no passado e a SEFAZ nao autoriza dhEmi retroativa: emitir hoje uma
	// venda de 21 dias atras voltava sem autorizacao. Uma nota e emitida no instante em que e
	// transmitida; a data do fato gerador e informacao de negocio, nao dhEmi.
	const emissaoAgora = new Date().toISOString();
	const ambienteSpedy = mapFiscalEnvironmentToSpedy(context.organizacao.fiscalConfiguracao?.ambiente);
	const presenceType = mapPresenceType(context.operacao.presencaConsumidor);

	return {
		// Escopo de idempotencia na Spedy: (referencia, numero, tentativa). Criar com um integrationId
		// ja usado devolve a nota existente em vez de criar uma nova — e uma nota ja rejeitada nunca
		// mais e transmitida, entao cada tentativa deliberada precisa de um id proprio. A tentativa so
		// avanca em prepareFiscalDocumentForSend, logo reenvios da MESMA tentativa (falha de rede)
		// continuam deduplicados e nao arriscam transmitir a mesma numeracao duas vezes.
		integrationId: buildSpedyIntegrationId(`${documento.referencia}:n:${documento.numero ?? "0"}:a:${documento.tentativasEnvio ?? 0}`),
		issuedOn: emissaoAgora,
		effectiveDate: emissaoAgora,
		number: documento.numero ? Number(documento.numero) : context.serie.proximoNumero,
		status: "created",
		sendEmailToCustomer: false,
		series: context.serie.serie,
		printingType: isNfce ? "consumerInvoice" : "portrait",
		operationType: isReturn ? "incoming" : "outgoing",
		purposeType: mapPurposeType(context.operacao.finalidade),
		issueType: "normal",
		operationNature: context.operacao.naturezaOperacao,
		operationDate: emissaoAgora,
		destination: isNfce ? "internal" : mapDestinationType(taxation.scenario.escopo),
		presenceType,
		isFinalCustomer: context.operacao.consumidorFinal,
		environmentType: ambienteSpedy,
		receiver: mapReceiver(context.destinatarioSnapshot, ambienteSpedy === "development"),
		transport: buildSpedyTransport({ presenceType, fiscalConfiguracao: context.organizacao.fiscalConfiguracao }),
		items: taxation.itens.map(({ item, result, valorFrete, valorDesconto }, index) => {
			const perfil = context.perfisProdutos.find((profile) => profile.produtoId === item.produtoId);
			return {
				code: item.produtoId,
				gtinCode: "SEM GTIN",
				description: resolveFiscalItemName(item.metadados, `ITEM ${index + 1}`),
				ncm: formatNcm(perfil?.ncm),
				cest: formatCest(perfil?.cest),
				cfop: Number(result.cfop ?? perfil?.cfopPadrao ?? context.operacao.cfopPadrao),
				unit: perfil?.unidadeComercial ?? "UN",
				quantity: item.quantidade,
				unitAmount: item.valorVendaUnitario,
				totalAmount: item.valorVendaTotalBruto,
				unitTax: perfil?.unidadeComercial ?? "UN",
				quantityTax: item.quantidade,
				unitTaxAmount: item.valorVendaUnitario,
				// Desconto efetivo (item + rateio do desconto de cabecalho): tem que casar com o vDesc
				// dos totais, senao a soma dos itens nao fecha com o total da nota.
				discountAmount: valorDesconto > 0 ? valorDesconto : undefined,
				freightAmount: valorFrete > 0 ? valorFrete : undefined,
				makeupTotal: true,
				taxBenefitCode: perfil?.codigoBeneficioFiscal ?? undefined,
				taxes: buildSpedyItemTaxes(result),
			};
		}),
		total: {
			invoiceAmount: taxation.totais.vNF,
			productAmount: taxation.totais.vProd,
			discountAmount: taxation.totais.vDesc,
			pisAmount: taxation.totais.vPIS,
			cofinsAmount: taxation.totais.vCOFINS,
			totalTax: taxation.totais.vTotTrib,
			icmsBaseTax: taxation.totais.vBC,
			icmsAmount: taxation.totais.vICMS,
			icmsStBaseTax: taxation.totais.vBCST,
			icmsStAmount: taxation.totais.vST,
			fcpAmount: taxation.totais.vFCP,
			fcpStAmount: taxation.totais.vFCPST,
			freightAmount: taxation.totais.vFrete,
			insuranceAmount: 0,
			othersAmount: 0,
			ipiAmount: 0,
			importTaxAmount: 0,
			icmsExemptAmount: 0,
		},
		payments: mapSalePaymentsToSpedy({
			payments: fiscalPayments,
			saleTotal: taxation.totais.vNF,
			isReturn,
		}),
		referencedDocuments: documento.chaveAcessoReferencia ? [{ accessKey: documento.chaveAcessoReferencia }] : undefined,
	};
}

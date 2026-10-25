import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { TPurchaseFreightModalityEnum } from "@/schemas/enums";
import { ExtractedCompositionSchema, type TExtractedComposition, type TExtractedCostModifier } from "./import";

const UNSAFE_XML_DECLARATION = /<!\s*(?:DOCTYPE|ENTITY)\b/i;

const FREIGHT_MODALITY_BY_CODE: Record<string, TPurchaseFreightModalityEnum> = {
	"0": "REMETENTE",
	"1": "DESTINATARIO",
	"2": "TERCEIROS",
	"3": "PROPRIO_REMETENTE",
	"4": "PROPRIO_DESTINATARIO",
	"9": "SEM_FRETE",
};

type TXmlNode = Record<string, unknown>;

function node(value: unknown): TXmlNode {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as TXmlNode) : {};
}

function nodes(value: unknown): TXmlNode[] {
	return Array.isArray(value) ? value.map(node) : value == null ? [] : [node(value)];
}

function text(value: unknown): string | null {
	if (value == null) return null;
	const normalized = String(value).trim();
	return normalized.length > 0 ? normalized : null;
}

function decimal(value: unknown): number | null {
	const raw = text(value);
	if (raw == null) return null;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : null;
}

function cents(value: unknown): number | null {
	const parsed = decimal(value);
	return parsed == null ? null : Math.round((parsed + Number.EPSILON) * 100);
}

function firstTaxGroup(value: unknown): TXmlNode {
	const container = node(value);
	for (const candidate of Object.values(container)) {
		const parsed = node(candidate);
		if (Object.keys(parsed).length > 0) return parsed;
	}
	return {};
}

function addModifier(modifiers: TExtractedCostModifier[], input: Omit<TExtractedCostModifier, "valorCentavos"> & { valorCentavos: number | null }) {
	if (input.valorCentavos == null || input.valorCentavos <= 0) return;
	modifiers.push({ ...input, valorCentavos: input.valorCentavos });
}

function integer(value: unknown): number | null {
	const parsed = decimal(value);
	return parsed == null || !Number.isInteger(parsed) ? null : parsed;
}

function digits(value: unknown): string | null {
	const raw = text(value)?.replace(/\D/g, "");
	return raw ? raw : null;
}

function dateOnly(value: unknown): string | null {
	return text(value)?.slice(0, 10) ?? null;
}

function parseNfeDocument(xml: string) {
	if (UNSAFE_XML_DECLARATION.test(xml)) throw new Error("XML com declaração DTD ou ENTITY não é aceito.");
	const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
	if (validation !== true) throw new Error(`XML inválido: ${validation.err.msg}`);

	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
		removeNSPrefix: true,
		parseTagValue: false,
		trimValues: true,
		processEntities: false,
	});
	const parsed = node(parser.parse(xml));
	const proc = node(parsed.nfeProc);
	const nfe = node(proc.NFe ?? parsed.NFe);
	const info = node(nfe.infNFe);
	if (Object.keys(info).length === 0) throw new Error("O XML não contém uma NF-e reconhecível.");
	return { info, protocol: node(node(proc.protNFe).infProt) };
}

/**
 * Fatos que o emitente declarou sobre um item: CFOP, CST/CSOSN, bases, alíquotas e rastreabilidade.
 * O item de compra não copia nada disso — guarda só o ponteiro (`documentoRef` + `documentoItem`) e
 * quem precisar lê daqui, pelo mesmo código que o import usou (ADR-0002, decisão 2).
 */
export type TNfeItemFacts = ReturnType<typeof readNfeItemFactsFromDet>;

function readNfeItemFactsFromDet(det: TXmlNode) {
	const product = node(det.prod);
	const taxes = node(det.imposto);
	const icms = firstTaxGroup(taxes.ICMS);
	const ipi = firstTaxGroup(node(taxes.IPI));
	const pis = firstTaxGroup(taxes.PIS);
	const cofins = firstTaxGroup(taxes.COFINS);
	const importTax = node(taxes.II);
	const ibsCbs = node(taxes.IBSCBS);
	const ibsCbsGroup = node(ibsCbs.gIBSCBS);
	const traces = nodes(product.rastro).map((trace) => ({
		numeroLote: text(trace.nLote),
		quantidadeLote: decimal(trace.qLote),
		dataFabricacao: dateOnly(trace.dFab),
		dataValidade: dateOnly(trace.dVal),
	}));

	return {
		numeroItem: integer(det["@_nItem"]),
		cfop: text(product.CFOP),
		ncm: text(product.NCM),
		cest: text(product.CEST),
		codigoBeneficioFiscal: text(product.cBenef),
		origemMercadoria: text(icms.orig),
		icms: {
			cst: text(icms.CST),
			csosn: text(icms.CSOSN),
			modalidadeBc: text(icms.modBC),
			baseCalculo: decimal(icms.vBC),
			percentualReducaoBc: decimal(icms.pRedBC),
			aliquota: decimal(icms.pICMS),
			valor: decimal(icms.vICMS),
			valorDesonerado: decimal(icms.vICMSDeson),
			aliquotaCreditoSn: decimal(icms.pCredSN),
			valorCreditoSn: decimal(icms.vCredICMSSN),
		},
		icmsSt: {
			baseCalculo: decimal(icms.vBCST),
			mva: decimal(icms.pMVAST),
			aliquota: decimal(icms.pICMSST),
			valor: decimal(icms.vICMSST),
			valorFcp: decimal(icms.vFCPST),
			// ST já retido em etapa anterior (CST 60 / CSOSN 500): alimenta a NF-e de saída.
			baseCalculoRetido: decimal(icms.vBCSTRet),
			aliquotaRetido: decimal(icms.pST),
			valorRetido: decimal(icms.vICMSSTRet),
			valorFcpRetido: decimal(icms.vFCPSTRet),
		},
		ipi: { cst: text(ipi.CST), baseCalculo: decimal(ipi.vBC), aliquota: decimal(ipi.pIPI), valor: decimal(ipi.vIPI) },
		pis: { cst: text(pis.CST), baseCalculo: decimal(pis.vBC), aliquota: decimal(pis.pPIS), valor: decimal(pis.vPIS) },
		cofins: { cst: text(cofins.CST), baseCalculo: decimal(cofins.vBC), aliquota: decimal(cofins.pCOFINS), valor: decimal(cofins.vCOFINS) },
		ii: importTax.vII != null ? { baseCalculo: decimal(importTax.vBC), valor: decimal(importTax.vII) } : null,
		ibsCbs:
			Object.keys(ibsCbs).length > 0
				? {
						cst: text(ibsCbs.CST),
						classificacaoTributaria: text(ibsCbs.cClassTrib),
						baseCalculo: decimal(ibsCbsGroup.vBC),
						valorIbsUf: decimal(node(ibsCbsGroup.gIBSUF).vIBSUF),
						valorIbsMunicipio: decimal(node(ibsCbsGroup.gIBSMun).vIBSMun),
						valorCbs: decimal(node(ibsCbsGroup.gCBS).vCBS),
					}
				: null,
		rastro: traces.length > 0 ? traces : null,
	};
}

/** Lê os fatos declarados de um item pelo seu `det/@nItem`. Lança se o XML não tiver o item. */
export function readNfeItemFacts({ xml, numeroItem }: { xml: string; numeroItem: number }): TNfeItemFacts {
	const { info } = parseNfeDocument(xml);
	const det = nodes(info.det).find((candidate) => integer(candidate["@_nItem"]) === numeroItem);
	if (!det) throw new Error(`O XML não contém o item ${numeroItem}.`);
	return readNfeItemFactsFromDet(det);
}

/** Validade do item para o lote: a menor `dVal` entre os `rastro` declarados. */
function earliestExpiry(facts: TNfeItemFacts): string | null {
	const dates = (facts.rastro ?? []).map((trace) => trace.dataValidade).filter((value): value is string => !!value);
	return dates.length > 0 ? dates.sort()[0] : null;
}

function parseItem(det: TXmlNode) {
	const product = node(det.prod);
	const taxes = node(det.imposto);
	const icms = firstTaxGroup(taxes.ICMS);
	const ipi = firstTaxGroup(taxes.IPI);
	const facts = readNfeItemFactsFromDet(det);
	const modifiers: TExtractedCostModifier[] = [];

	addModifier(modifiers, {
		chave: "DESCONTO",
		valorCentavos: cents(product.vDesc),
		efeito: "REDUCAO",
		tratamento: "CUSTO_ESTOQUE",
		descricao: "Desconto destacado no item da NF-e",
	});
	addModifier(modifiers, {
		chave: "FRETE",
		valorCentavos: cents(product.vFrete),
		efeito: "ACRESCIMO",
		tratamento: "CUSTO_ESTOQUE",
		descricao: "Frete destacado no item da NF-e",
	});
	addModifier(modifiers, {
		chave: "SEGURO",
		valorCentavos: cents(product.vSeg),
		efeito: "ACRESCIMO",
		tratamento: "CUSTO_ESTOQUE",
		descricao: "Seguro destacado no item da NF-e",
	});
	addModifier(modifiers, {
		chave: "DESPESA_ACESSORIA",
		valorCentavos: cents(product.vOutro),
		efeito: "ACRESCIMO",
		tratamento: "CUSTO_ESTOQUE",
		descricao: "Outras despesas destacadas no item da NF-e",
	});
	addModifier(modifiers, {
		chave: "IMPOSTOS_IPI",
		valorCentavos: cents(ipi.vIPI),
		efeito: "ACRESCIMO",
		tratamento: null,
		descricao: "IPI destacado no item da NF-e; tratamento tributário pendente de revisão",
	});
	addModifier(modifiers, {
		chave: "IMPOSTOS_ICMS_ST",
		valorCentavos: cents(icms.vICMSST),
		efeito: "ACRESCIMO",
		tratamento: null,
		descricao: "ICMS-ST destacado no item da NF-e; tratamento tributário pendente de revisão",
	});
	addModifier(modifiers, {
		chave: "IMPOSTOS_FCP_ST",
		valorCentavos: cents(icms.vFCPST),
		efeito: "ACRESCIMO",
		tratamento: null,
		descricao: "FCP-ST destacado no item da NF-e; tratamento tributário pendente de revisão",
	});

	return {
		descricao: text(product.xProd) ?? "Item sem descrição",
		codigoFornecedor: text(product.cProd),
		ean: text(product.cEAN) && text(product.cEAN) !== "SEM GTIN" ? text(product.cEAN) : null,
		ncm: text(product.NCM),
		unidade: text(product.uCom),
		quantidade: decimal(product.qCom) ?? 0,
		valorUnitario: decimal(product.vUnCom) ?? 0,
		valorTotal: decimal(product.vProd) ?? 0,
		desconto: decimal(product.vDesc),
		modificadoresCusto: modifiers,
		documentoItem: facts.numeroItem,
		cfop: facts.cfop,
		dataValidade: earliestExpiry(facts),
	};
}

function allocateDocumentResidual(
	items: ReturnType<typeof parseItem>[],
	modifier: Omit<TExtractedCostModifier, "valorCentavos">,
	documentTotalCents: number | null,
) {
	if (documentTotalCents == null || documentTotalCents <= 0 || items.length === 0) return;
	const itemTotal = items.reduce(
		(total, item) =>
			total +
			(item.modificadoresCusto ?? []).filter((current) => current.chave === modifier.chave).reduce((sum, current) => sum + current.valorCentavos, 0),
		0,
	);
	const residual = documentTotalCents - itemTotal;
	if (residual <= 0) return;
	const weights = items.map((item) => Math.max(0, Math.round(item.valorTotal * 100)));
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	if (totalWeight <= 0) return;
	const shares = weights.map((weight, index) => {
		const exact = (residual * weight) / totalWeight;
		return { index, value: Math.floor(exact), remainder: exact - Math.floor(exact) };
	});
	let remaining = residual - shares.reduce((sum, share) => sum + share.value, 0);
	const order = [...shares].sort((left, right) => right.remainder - left.remainder || left.index - right.index);
	for (let index = 0; index < remaining; index += 1) order[index % order.length].value += 1;
	for (const share of shares) {
		if (share.value <= 0) continue;
		items[share.index].modificadoresCusto.push({ ...modifier, valorCentavos: share.value });
	}
}

/** Parses NF-e/NFC-e XML locally and deterministically. No document data is sent to an AI model. */
export function extractCompositionFromNfeXml(xml: string): TExtractedComposition {
	const { info, protocol } = parseNfeDocument(xml);

	const identification = node(info.ide);
	const issuer = node(info.emit);
	const totals = node(node(info.total).ICMSTot);
	const accessKey = text(info["@_Id"])?.replace(/^NFe/i, "") ?? null;
	const issueDate = text(identification.dhEmi ?? identification.dEmi);
	const items = nodes(info.det).map(parseItem);
	allocateDocumentResidual(
		items,
		{ chave: "DESCONTO", efeito: "REDUCAO", tratamento: "CUSTO_ESTOQUE", descricao: "Desconto da NF-e rateado por valor" },
		cents(totals.vDesc),
	);
	allocateDocumentResidual(
		items,
		{ chave: "FRETE", efeito: "ACRESCIMO", tratamento: "CUSTO_ESTOQUE", descricao: "Frete da NF-e rateado por valor" },
		cents(totals.vFrete),
	);
	allocateDocumentResidual(
		items,
		{ chave: "SEGURO", efeito: "ACRESCIMO", tratamento: "CUSTO_ESTOQUE", descricao: "Seguro da NF-e rateado por valor" },
		cents(totals.vSeg),
	);
	allocateDocumentResidual(
		items,
		{ chave: "DESPESA_ACESSORIA", efeito: "ACRESCIMO", tratamento: "CUSTO_ESTOQUE", descricao: "Outras despesas da NF-e rateadas por valor" },
		cents(totals.vOutro),
	);
	allocateDocumentResidual(
		items,
		{ chave: "IMPOSTOS_IPI", efeito: "ACRESCIMO", tratamento: null, descricao: "IPI da NF-e rateado por valor; tratamento pendente" },
		cents(totals.vIPI),
	);
	allocateDocumentResidual(
		items,
		{ chave: "IMPOSTOS_ICMS_ST", efeito: "ACRESCIMO", tratamento: null, descricao: "ICMS-ST da NF-e rateado por valor; tratamento pendente" },
		cents(totals.vST),
	);
	allocateDocumentResidual(
		items,
		{ chave: "IMPOSTOS_FCP_ST", efeito: "ACRESCIMO", tratamento: null, descricao: "FCP-ST da NF-e rateado por valor; tratamento pendente" },
		cents(totals.vFCPST),
	);

	const issuerAddress = node(issuer.enderEmit);
	const recipient = node(info.dest);
	const recipientAddress = node(recipient.enderDest);
	const transport = node(info.transp);
	const carrier = node(transport.transporta);
	const carrierName = text(carrier.xNome);
	const carrierDocument = text(carrier.CNPJ ?? carrier.CPF)?.replace(/\D/g, "") || null;
	const installments = nodes(node(info.cobr).dup)
		.map((installment) => ({
			numero: text(installment.nDup),
			dataVencimento: text(installment.dVenc)?.slice(0, 10) ?? null,
			valor: decimal(installment.vDup) ?? 0,
		}))
		.filter((installment) => installment.valor > 0);

	return ExtractedCompositionSchema.parse({
		origem: "XML",
		fornecedor: {
			nome: text(issuer.xNome),
			cnpj: text(issuer.CNPJ ?? issuer.CPF)?.replace(/\D/g, "") ?? null,
			inscricaoEstadual: text(issuer.IE)?.replace(/\D/g, "") || null,
			telefone: text(issuerAddress.fone),
			// O emitente da NF-e não declara email.
			email: null,
			cidade: text(issuerAddress.xMun),
		},
		duplicatas: installments.length > 0 ? installments : null,
		documentoFiscal: {
			modelo: text(identification.mod),
			finalidade: integer(identification.finNFe),
			naturezaOperacao: text(identification.natOp),
			emitente: { cnpj: digits(issuer.CNPJ ?? issuer.CPF), inscricaoEstadual: digits(issuer.IE), uf: text(issuerAddress.UF), crt: integer(issuer.CRT) },
			destinatario: { cnpj: digits(recipient.CNPJ ?? recipient.CPF), inscricaoEstadual: digits(recipient.IE), uf: text(recipientAddress.UF) },
			documentosReferenciados: nodes(identification.NFref)
				.map((reference) => digits(reference.refNFe))
				.filter((reference): reference is string => !!reference),
			protocolo:
				text(protocol.nProt) || text(protocol.cStat)
					? { codigoStatus: text(protocol.cStat), numero: text(protocol.nProt), dataRecebimento: text(protocol.dhRecbto) }
					: null,
		},
		modalidadeFrete: FREIGHT_MODALITY_BY_CODE[text(transport.modFrete) ?? ""] ?? null,
		transportadora: carrierName || carrierDocument ? { nome: carrierName, cnpj: carrierDocument } : null,
		numeroDocumento: text(identification.nNF),
		serieDocumento: text(identification.serie),
		chaveAcesso: accessKey,
		dataEmissao: issueDate?.slice(0, 10) ?? null,
		valorTotalDocumento: decimal(totals.vNF),
		valorFrete: decimal(totals.vFrete),
		valorDesconto: decimal(totals.vDesc),
		totaisOriginais: {
			produtosCentavos: cents(totals.vProd),
			descontoCentavos: cents(totals.vDesc),
			freteCentavos: cents(totals.vFrete),
			seguroCentavos: cents(totals.vSeg),
			despesasAcessoriasCentavos: cents(totals.vOutro),
			ipiCentavos: cents(totals.vIPI),
			icmsStCentavos: cents(totals.vST),
			fcpStCentavos: cents(totals.vFCPST),
			documentoCentavos: cents(totals.vNF),
		},
		itens: items,
	});
}

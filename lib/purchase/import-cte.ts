import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * Leitura do CT-e (modelo 57) que cobra o frete de uma compra — ADR-0002, fluxo E. O CT-e não tem
 * itens: o que interessa é quem é o tomador (quem paga), quanto custa a prestação, o ICMS destacado
 * e as chaves das NF-e transportadas, que são o elo com a compra. Mesma barreira de XML inseguro do
 * parser de NF-e.
 */

const UNSAFE_XML_DECLARATION = /<!\s*(?:DOCTYPE|ENTITY)\b/i;

type TXmlNode = Record<string, unknown>;

function node(value: unknown): TXmlNode {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as TXmlNode) : {};
}
function nodes(value: unknown): TXmlNode[] {
	if (Array.isArray(value)) return value.map(node);
	return value && typeof value === "object" ? [node(value)] : [];
}
function text(value: unknown): string | null {
	if (value == null) return null;
	const stringValue = typeof value === "object" ? text((value as TXmlNode)["#text"]) : String(value);
	const trimmed = stringValue?.trim();
	return trimmed ? trimmed : null;
}
function cents(value: unknown): number | null {
	const raw = text(value);
	if (raw == null) return null;
	const parsed = Number(raw.replace(",", "."));
	return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}
function decimal(value: unknown): number | null {
	const raw = text(value);
	if (raw == null) return null;
	const parsed = Number(raw.replace(",", "."));
	return Number.isFinite(parsed) ? parsed : null;
}
function digits(value: unknown): string | null {
	return text(value)?.replace(/\D/g, "") || null;
}
function integer(value: unknown): number | null {
	const raw = text(value);
	if (raw == null) return null;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Quem paga o frete, pelo código `toma` do CT-e. */
export const CTE_TAKER_LABELS: Record<number, string> = {
	0: "remetente",
	1: "expedidor",
	2: "recebedor",
	3: "destinatário",
	4: "outros",
};

export type TCteParty = { cnpj: string | null; nome: string | null; uf: string | null };

export type TExtractedCte = {
	chaveAcesso: string;
	numero: string | null;
	serie: string | null;
	dataEmissao: string | null;
	/** `tpCTe`: 0 normal, 1 complemento, 2 anulação, 3 substituto. Só o normal vira frete de compra. */
	tipo: number | null;
	cfop: string | null;
	naturezaOperacao: string | null;
	emitente: TCteParty & { inscricaoEstadual: string | null; crt: number | null };
	remetente: TCteParty;
	destinatario: TCteParty;
	tomador: { codigo: number | null; cnpj: string | null; nome: string | null };
	/** `vTPrest`: valor total da prestação — a dívida com a transportadora. */
	valorPrestacaoCentavos: number;
	/** `vRec`: valor a receber, quando difere do total (frete pago parcialmente por terceiros). */
	valorReceberCentavos: number | null;
	componentes: { nome: string; valorCentavos: number }[];
	icms: {
		cst: string | null;
		simplesNacional: boolean;
		baseCentavos: number | null;
		aliquota: number | null;
		valorCentavos: number;
	};
	/** Chaves das NF-e transportadas (`infDoc/infNFe/chave`): o elo com a compra. */
	chavesNfe: string[];
	protocolo: { codigoStatus: string | null; numero: string | null; dataRecebimento: string | null } | null;
};

function parseCteDocument(xml: string) {
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
	const proc = node(parsed.cteProc);
	const cte = node(proc.CTe ?? parsed.CTe);
	const info = node(cte.infCte);
	if (Object.keys(info).length === 0) throw new Error("O XML não contém um CT-e reconhecível.");
	return { info, protocol: node(node(proc.protCTe).infProt) };
}

/** Raiz de CT-e: para o import de NF-e redirecionar o usuário em vez de dizer "XML sem NF-e". */
export function looksLikeCteXml(head: string) {
	return /<(?:\w+:)?(?:cteProc|CTe)\b/i.test(head);
}

function party(value: unknown, address: unknown): TCteParty {
	const partyNode = node(value);
	return { cnpj: digits(partyNode.CNPJ ?? partyNode.CPF), nome: text(partyNode.xNome), uf: text(node(partyNode[address as string]).UF) };
}

function readIcms(imposto: TXmlNode) {
	const icmsGroup = node(imposto.ICMS);
	const groupKey = Object.keys(icmsGroup).find((key) => key.startsWith("ICMS"));
	const group = groupKey ? node(icmsGroup[groupKey]) : {};
	return {
		cst: text(group.CST),
		simplesNacional: groupKey === "ICMSSN",
		baseCentavos: cents(group.vBC),
		aliquota: decimal(group.pICMS),
		valorCentavos: cents(group.vICMS) ?? 0,
	};
}

export function extractCteFromXml(xml: string): TExtractedCte {
	const { info, protocol } = parseCteDocument(xml);
	const identification = node(info.ide);
	const model = text(identification.mod);
	if (model && model !== "57") throw new Error(`O XML é do modelo ${model}, não um CT-e (modelo 57).`);
	const accessKey = digits(info["@_Id"])?.slice(-44) ?? null;
	if (!accessKey || accessKey.length !== 44) throw new Error("O CT-e não traz a chave de acesso (atributo Id de infCte).");

	const issuer = node(info.emit);
	const sender = party(info.rem, "enderReme");
	const recipient = party(info.dest, "enderDest");
	const dispatcher = party(info.exped, "enderExped");
	const receiver = party(info.receb, "enderReceb");

	// toma3: o tomador é uma das partes já descritas; toma4: um terceiro, com CNPJ próprio no grupo.
	const taker3 = node(identification.toma3);
	const taker4 = node(identification.toma4);
	const takerCode = integer(taker4.toma ?? taker3.toma);
	const takerByCode: Record<number, { cnpj: string | null; nome: string | null }> = {
		0: sender,
		1: dispatcher,
		2: receiver,
		3: recipient,
		4: { cnpj: digits(taker4.CNPJ ?? taker4.CPF), nome: text(taker4.xNome) },
	};
	const takerParty = takerCode != null ? takerByCode[takerCode] : null;
	const taker = { cnpj: takerParty?.cnpj ?? null, nome: takerParty?.nome ?? null };

	const service = node(info.vPrest);
	const valorPrestacaoCentavos = cents(service.vTPrest);
	if (valorPrestacaoCentavos == null || valorPrestacaoCentavos < 0) throw new Error("O CT-e não informa o valor total da prestação (vTPrest).");

	const normal = node(info.infCTeNorm);
	const chavesNfe = nodes(node(normal.infDoc).infNFe)
		.map((invoice) => digits(invoice.chave))
		.filter((key): key is string => !!key && key.length === 44);

	return {
		chaveAcesso: accessKey,
		numero: text(identification.nCT),
		serie: text(identification.serie),
		dataEmissao: text(identification.dhEmi)?.slice(0, 10) ?? null,
		tipo: integer(identification.tpCTe),
		cfop: text(identification.CFOP),
		naturezaOperacao: text(identification.natOp),
		emitente: {
			cnpj: digits(issuer.CNPJ ?? issuer.CPF),
			nome: text(issuer.xNome),
			uf: text(node(issuer.enderEmit).UF),
			inscricaoEstadual: digits(issuer.IE),
			crt: integer(issuer.CRT),
		},
		remetente: sender,
		destinatario: recipient,
		tomador: { codigo: takerCode, ...taker },
		valorPrestacaoCentavos,
		valorReceberCentavos: cents(service.vRec),
		componentes: nodes(service.Comp)
			.map((component) => ({ nome: text(component.xNome) ?? "Componente", valorCentavos: cents(component.vComp) ?? 0 }))
			.filter((component) => component.valorCentavos > 0),
		icms: readIcms(node(info.imp)),
		chavesNfe: [...new Set(chavesNfe)],
		protocolo:
			text(protocol.nProt) || text(protocol.cStat)
				? { codigoStatus: text(protocol.cStat), numero: text(protocol.nProt), dataRecebimento: text(protocol.dhRecbto) }
				: null,
	};
}

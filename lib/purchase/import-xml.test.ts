import assert from "node:assert/strict";
import test from "node:test";
import { extractCompositionFromNfeXml, readNfeItemFacts } from "./import-xml";

const NFE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35123456789012345678901234567890123456789012" versao="4.00">
      <ide><mod>55</mod><serie>3</serie><nNF>987</nNF><dhEmi>2026-08-10T10:30:00-03:00</dhEmi><natOp>VENDA DE MERCADORIA</natOp><finNFe>1</finNFe><NFref><refNFe>35000000000000000000000000000000000000000001</refNFe></NFref></ide>
      <emit><CNPJ>12345678000190</CNPJ><xNome>Fornecedor Exemplo</xNome><enderEmit><xMun>Belem</xMun><UF>PA</UF><fone>9132224410</fone></enderEmit><IE>123.456.789</IE><CRT>3</CRT></emit>
      <dest><CNPJ>11222333000181</CNPJ><xNome>Comprador</xNome><enderDest><UF>MG</UF></enderDest><IE>0012345678</IE></dest>
      <det nItem="1">
        <prod>
          <cProd>ABC-1</cProd><cEAN>7891234567890</cEAN><xProd>Produto A</xProd><NCM>21069090</NCM><CEST>1706300</CEST><CFOP>6102</CFOP><uCom>UN</uCom>
          <qCom>2.0000</qCom><vUnCom>10.000000</vUnCom><vProd>20.00</vProd>
          <vFrete>2.00</vFrete><vSeg>0.50</vSeg><vDesc>1.00</vDesc><vOutro>0.25</vOutro>
          <rastro><nLote>L2</nLote><qLote>1</qLote><dFab>2026-07-01</dFab><dVal>2027-02-01</dVal></rastro>
          <rastro><nLote>L1</nLote><qLote>1</qLote><dFab>2026-06-01</dFab><dVal>2027-01-15</dVal></rastro>
        </prod>
        <imposto>
          <ICMS><ICMS10><orig>0</orig><CST>10</CST><modBC>3</modBC><vBC>20.00</vBC><pICMS>12.00</pICMS><vICMS>2.40</vICMS><vBCST>30.00</vBCST><pMVAST>50.00</pMVAST><pICMSST>18.00</pICMSST><vICMSST>3.00</vICMSST><vFCPST>0.40</vFCPST></ICMS10></ICMS>
          <IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>20.00</vBC><pIPI>7.50</pIPI><vIPI>1.50</vIPI></IPITrib></IPI>
          <PIS><PISAliq><CST>01</CST><vBC>20.00</vBC><pPIS>1.65</pPIS><vPIS>0.33</vPIS></PISAliq></PIS>
          <COFINS><COFINSAliq><CST>01</CST><vBC>20.00</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>1.52</vCOFINS></COFINSAliq></COFINS>
        </imposto>
      </det>
      <det nItem="2">
        <prod><cProd>ABC-2</cProd><cEAN>SEM GTIN</cEAN><xProd>Produto B</xProd><CFOP>6910</CFOP><uCom>CX</uCom><qCom>1</qCom><vUnCom>30</vUnCom><vProd>30</vProd></prod>
        <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vICMS>5.40</vICMS></ICMS00></ICMS></imposto>
      </det>
      <total><ICMSTot><vProd>50.00</vProd><vFrete>2.00</vFrete><vSeg>0.50</vSeg><vDesc>1.00</vDesc><vOutro>0.25</vOutro><vIPI>1.50</vIPI><vST>3.00</vST><vFCPST>0.40</vFCPST><vNF>56.65</vNF></ICMSTot></total>
      <transp><modFrete>0</modFrete><transporta><CNPJ>98765432000110</CNPJ><xNome>Transportes Norte</xNome></transporta></transp>
      <cobr><dup><nDup>001</nDup><dVenc>2026-09-10</dVenc><vDup>28.33</vDup></dup><dup><nDup>002</nDup><dVenc>2026-10-10</dVenc><vDup>28.32</vDup></dup></cobr>
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>35123456789012345678901234567890123456789012</chNFe><dhRecbto>2026-08-10T10:31:00-03:00</dhRecbto><nProt>135260000000001</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;

test("parses namespaced NF-e metadata, items and exact cost modifiers", () => {
	const result = extractCompositionFromNfeXml(NFE_XML);
	assert.equal(result.origem, "XML");
	assert.equal(result.chaveAcesso, "35123456789012345678901234567890123456789012");
	assert.equal(result.numeroDocumento, "987");
	assert.equal(result.serieDocumento, "3");
	assert.equal(result.fornecedor?.cnpj, "12345678000190");
	assert.equal(result.itens.length, 2);
	assert.equal(result.itens[0].ncm, "21069090");
	assert.equal(result.itens[1].ean, null);
	assert.equal(result.itens[1].ncm, null);
	assert.deepEqual(
		result.itens[0].modificadoresCusto?.map(({ chave, valorCentavos, tratamento }) => ({ chave, valorCentavos, tratamento })),
		[
			{ chave: "DESCONTO", valorCentavos: 100, tratamento: "CUSTO_ESTOQUE" },
			{ chave: "FRETE", valorCentavos: 200, tratamento: "CUSTO_ESTOQUE" },
			{ chave: "SEGURO", valorCentavos: 50, tratamento: "CUSTO_ESTOQUE" },
			{ chave: "DESPESA_ACESSORIA", valorCentavos: 25, tratamento: "CUSTO_ESTOQUE" },
			{ chave: "IMPOSTOS_IPI", valorCentavos: 150, tratamento: null },
			{ chave: "IMPOSTOS_ICMS_ST", valorCentavos: 300, tratamento: null },
			{ chave: "IMPOSTOS_FCP_ST", valorCentavos: 40, tratamento: null },
		],
	);
	assert.equal(result.totaisOriginais?.documentoCentavos, 5665);
});

test("parses supplier contact, installments and transport", () => {
	const result = extractCompositionFromNfeXml(NFE_XML);
	assert.equal(result.fornecedor?.inscricaoEstadual, "123456789");
	assert.equal(result.fornecedor?.telefone, "9132224410");
	assert.equal(result.fornecedor?.cidade, "Belem");
	assert.deepEqual(result.duplicatas, [
		{ numero: "001", dataVencimento: "2026-09-10", valor: 28.33 },
		{ numero: "002", dataVencimento: "2026-10-10", valor: 28.32 },
	]);
	assert.equal(result.modalidadeFrete, "REMETENTE");
	assert.deepEqual(result.transportadora, { nome: "Transportes Norte", cnpj: "98765432000110" });
});

test("leaves installments and transport empty when the NF-e has none", () => {
	const xml = NFE_XML.replace(/<transp>[\s\S]*?<\/transp>/, "").replace(/<cobr>[\s\S]*?<\/cobr>/, "");
	const result = extractCompositionFromNfeXml(xml);
	assert.equal(result.duplicatas, null);
	assert.equal(result.modalidadeFrete, null);
	assert.equal(result.transportadora, null);
});

test("parses an NFe root without nfeProc", () => {
	const xml = NFE_XML.replace(/^[\s\S]*?<NFe>/, "<NFe>").replace(/<\/NFe>[\s\S]*$/, "</NFe>");
	assert.equal(extractCompositionFromNfeXml(xml).itens.length, 2);
});

test("allocates a document-level modifier by item value with exact cents", () => {
	const withoutItemFreight = NFE_XML.replace("<vFrete>2.00</vFrete><vSeg>", "<vSeg>");
	const result = extractCompositionFromNfeXml(withoutItemFreight);
	const freight = result.itens.map((item) => item.modificadoresCusto?.find((modifier) => modifier.chave === "FRETE")?.valorCentavos ?? 0);
	assert.deepEqual(freight, [80, 120]);
	assert.equal(
		freight.reduce((sum, value) => sum + value, 0),
		200,
	);
});

test("rejects DTD and entity declarations before parsing", () => {
	assert.throws(
		() => extractCompositionFromNfeXml(`<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><NFe>&xxe;</NFe>`),
		/DTD ou ENTITY/,
	);
});

test("exposes the fiscal header: issuer, recipient, finality, references and protocol", () => {
	const result = extractCompositionFromNfeXml(NFE_XML);
	assert.deepEqual(result.documentoFiscal, {
		modelo: "55",
		finalidade: 1,
		naturezaOperacao: "VENDA DE MERCADORIA",
		emitente: { cnpj: "12345678000190", inscricaoEstadual: "123456789", uf: "PA", crt: 3 },
		destinatario: { cnpj: "11222333000181", inscricaoEstadual: "0012345678", uf: "MG" },
		documentosReferenciados: ["35000000000000000000000000000000000000000001"],
		protocolo: { codigoStatus: "100", numero: "135260000000001", dataRecebimento: "2026-08-10T10:31:00-03:00" },
	});
});

test("leaves the protocol null when the XML was not authorized", () => {
	const xml = NFE_XML.replace(/<protNFe[\s\S]*?<\/protNFe>/, "");
	assert.equal(extractCompositionFromNfeXml(xml).documentoFiscal?.protocolo, null);
});

test("items carry the det pointer, CFOP and the earliest rastro expiry", () => {
	const [first, second] = extractCompositionFromNfeXml(NFE_XML).itens;
	assert.equal(first.documentoItem, 1);
	assert.equal(first.cfop, "6102");
	assert.equal(first.dataValidade, "2027-01-15");
	assert.equal(second.documentoItem, 2);
	assert.equal(second.cfop, "6910");
	assert.equal(second.dataValidade, null);
});

test("readNfeItemFacts reads the declared taxes of one det without copying them anywhere", () => {
	const facts = readNfeItemFacts({ xml: NFE_XML, numeroItem: 1 });
	assert.equal(facts.cfop, "6102");
	assert.equal(facts.cest, "1706300");
	assert.equal(facts.origemMercadoria, "0");
	assert.equal(facts.icms.cst, "10");
	assert.equal(facts.icms.csosn, null);
	assert.equal(facts.icms.aliquota, 12);
	assert.equal(facts.icms.valor, 2.4);
	assert.equal(facts.icmsSt.mva, 50);
	assert.equal(facts.icmsSt.valor, 3);
	assert.equal(facts.icmsSt.valorRetido, null);
	assert.equal(facts.ipi.cst, "50");
	assert.equal(facts.pis.valor, 0.33);
	assert.equal(facts.cofins.aliquota, 7.6);
	assert.equal(facts.ii, null);
	assert.equal(facts.ibsCbs, null);
	assert.deepEqual(facts.rastro, [
		{ numeroLote: "L2", quantidadeLote: 1, dataFabricacao: "2026-07-01", dataValidade: "2027-02-01" },
		{ numeroLote: "L1", quantidadeLote: 1, dataFabricacao: "2026-06-01", dataValidade: "2027-01-15" },
	]);
	assert.throws(() => readNfeItemFacts({ xml: NFE_XML, numeroItem: 9 }), /não contém o item 9/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { extractCompositionFromNfeXml } from "./import-xml";

const NFE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35123456789012345678901234567890123456789012" versao="4.00">
      <ide><serie>3</serie><nNF>987</nNF><dhEmi>2026-08-10T10:30:00-03:00</dhEmi></ide>
      <emit><CNPJ>12345678000190</CNPJ><xNome>Fornecedor Exemplo</xNome><enderEmit><xMun>Belem</xMun><fone>9132224410</fone></enderEmit><IE>123.456.789</IE></emit>
      <det nItem="1">
        <prod>
          <cProd>ABC-1</cProd><cEAN>7891234567890</cEAN><xProd>Produto A</xProd><NCM>21069090</NCM><uCom>UN</uCom>
          <qCom>2.0000</qCom><vUnCom>10.000000</vUnCom><vProd>20.00</vProd>
          <vFrete>2.00</vFrete><vSeg>0.50</vSeg><vDesc>1.00</vDesc><vOutro>0.25</vOutro>
        </prod>
        <imposto>
          <ICMS><ICMS10><vICMSST>3.00</vICMSST><vFCPST>0.40</vFCPST></ICMS10></ICMS>
          <IPI><cEnq>999</cEnq><IPITrib><vIPI>1.50</vIPI></IPITrib></IPI>
        </imposto>
      </det>
      <det nItem="2">
        <prod><cProd>ABC-2</cProd><cEAN>SEM GTIN</cEAN><xProd>Produto B</xProd><uCom>CX</uCom><qCom>1</qCom><vUnCom>30</vUnCom><vProd>30</vProd></prod>
        <imposto><ICMS><ICMS00><vICMS>5.40</vICMS></ICMS00></ICMS></imposto>
      </det>
      <total><ICMSTot><vProd>50.00</vProd><vFrete>2.00</vFrete><vSeg>0.50</vSeg><vDesc>1.00</vDesc><vOutro>0.25</vOutro><vIPI>1.50</vIPI><vST>3.00</vST><vFCPST>0.40</vFCPST><vNF>56.65</vNF></ICMSTot></total>
      <transp><modFrete>0</modFrete><transporta><CNPJ>98765432000110</CNPJ><xNome>Transportes Norte</xNome></transporta></transp>
      <cobr><dup><nDup>001</nDup><dVenc>2026-09-10</dVenc><vDup>28.33</vDup></dup><dup><nDup>002</nDup><dVenc>2026-10-10</dVenc><vDup>28.32</vDup></dup></cobr>
    </infNFe>
  </NFe>
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
	const xml = NFE_XML.replace(/^[\s\S]*?<NFe>/, "<NFe>").replace(/<\/NFe>\s*<\/nfeProc>$/, "</NFe>");
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

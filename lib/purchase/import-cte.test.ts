import assert from "node:assert/strict";
import test from "node:test";
import { extractCteFromXml, looksLikeCteXml } from "./import-cte";

const CTE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00">
  <CTe>
    <infCte Id="CTe31123456789012345678901234567890123456789057" versao="4.00">
      <ide><cUF>31</cUF><CFOP>6353</CFOP><natOp>PRESTACAO DE SERVICO DE TRANSPORTE</natOp><mod>57</mod><serie>1</serie><nCT>4521</nCT><dhEmi>2026-08-12T09:00:00-03:00</dhEmi><tpCTe>0</tpCTe><modal>01</modal><tpServ>0</tpServ><toma3><toma>3</toma></toma3></ide>
      <emit><CNPJ>98765432000110</CNPJ><IE>1234567890</IE><xNome>Transportes Norte</xNome><enderEmit><UF>PA</UF></enderEmit><CRT>3</CRT></emit>
      <rem><CNPJ>12345678000190</CNPJ><xNome>Fornecedor Exemplo</xNome><enderReme><UF>PA</UF></enderReme></rem>
      <dest><CNPJ>11222333000181</CNPJ><xNome>Comprador</xNome><enderDest><UF>MG</UF></enderDest></dest>
      <vPrest><vTPrest>250.00</vTPrest><vRec>250.00</vRec><Comp><xNome>FRETE PESO</xNome><vComp>200.00</vComp></Comp><Comp><xNome>PEDAGIO</xNome><vComp>50.00</vComp></Comp></vPrest>
      <imp><ICMS><ICMS00><CST>00</CST><vBC>250.00</vBC><pICMS>12.00</pICMS><vICMS>30.00</vICMS></ICMS00></ICMS></imp>
      <infCTeNorm><infDoc><infNFe><chave>35123456789012345678901234567890123456789012</chave></infNFe><infNFe><chave>35123456789012345678901234567890123456789012</chave></infNFe></infDoc></infCTeNorm>
    </infCte>
  </CTe>
  <protCTe versao="4.00"><infProt><cStat>100</cStat><nProt>131260000000777</nProt><dhRecbto>2026-08-12T09:01:00-03:00</dhRecbto></infProt></protCTe>
</cteProc>`;

test("reads taker, service value, ICMS and transported NF-e keys from a CT-e", () => {
	const cte = extractCteFromXml(CTE_XML);
	assert.equal(cte.chaveAcesso, "31123456789012345678901234567890123456789057");
	assert.equal(cte.numero, "4521");
	assert.equal(cte.tipo, 0);
	assert.equal(cte.emitente.cnpj, "98765432000110");
	assert.equal(cte.emitente.nome, "Transportes Norte");
	// toma 3 = destinatário: quem paga é o comprador.
	assert.deepEqual(cte.tomador, { codigo: 3, cnpj: "11222333000181", nome: "Comprador" });
	assert.equal(cte.valorPrestacaoCentavos, 25000);
	assert.deepEqual(cte.componentes, [
		{ nome: "FRETE PESO", valorCentavos: 20000 },
		{ nome: "PEDAGIO", valorCentavos: 5000 },
	]);
	assert.deepEqual(cte.icms, { cst: "00", simplesNacional: false, baseCentavos: 25000, aliquota: 12, valorCentavos: 3000 });
	// Chave repetida conta uma vez.
	assert.deepEqual(cte.chavesNfe, ["35123456789012345678901234567890123456789012"]);
	assert.equal(cte.protocolo?.codigoStatus, "100");
});

test("toma4 names a third-party taker with its own CNPJ", () => {
	const xml = CTE_XML.replace(
		"<toma3><toma>3</toma></toma3>",
		"<toma4><toma>4</toma><CNPJ>55666777000188</CNPJ><xNome>Pagador Terceiro</xNome></toma4>",
	);
	const cte = extractCteFromXml(xml);
	assert.deepEqual(cte.tomador, { codigo: 4, cnpj: "55666777000188", nome: "Pagador Terceiro" });
});

test("refuses other models, missing totals and unsafe declarations", () => {
	assert.throws(() => extractCteFromXml(CTE_XML.replace("<mod>57</mod>", "<mod>55</mod>")), /modelo 55/);
	assert.throws(() => extractCteFromXml(CTE_XML.replace("<vTPrest>250.00</vTPrest>", "")), /vTPrest/);
	assert.throws(() => extractCteFromXml(`<!DOCTYPE x>${CTE_XML}`), /DTD/);
	assert.throws(() => extractCteFromXml("<nfeProc><NFe/></nfeProc>"), /CT-e reconhecível/);
});

test("looksLikeCteXml spots the CT-e root with or without namespace prefix", () => {
	assert.equal(looksLikeCteXml('<?xml version="1.0"?><cteProc xmlns="x">'), true);
	assert.equal(looksLikeCteXml("<cte:CTe>"), true);
	assert.equal(looksLikeCteXml("<nfeProc>"), false);
});

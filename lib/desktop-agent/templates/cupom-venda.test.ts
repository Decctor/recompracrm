import assert from "node:assert/strict";
import test from "node:test";
import { renderCupomVendaHtml, type TCupomVendaDados } from "./cupom-venda";

function buildData(pagamentos: TCupomVendaDados["venda"]["pagamentos"]): TCupomVendaDados {
	return {
		organizacao: { nome: "Loja Teste" },
		venda: {
			data: new Date("2026-08-31T13:30:00Z"),
			subtotal: 27,
			valorFinal: 27,
			pagamentos,
		},
		cliente: null,
		cupom: null,
		recompensa: null,
		cashback: null,
	};
}

test("destaca pagamento online do iFood no cupom", () => {
	const html = renderCupomVendaHtml(buildData([{ metodo: "PIX", valor: 27, parcelas: null, pago: true, descricao: null, situacao: "PAGO_CANAL" }]));
	assert.match(html, /PIX \(PAGO PELO IFOOD\)/);
});

test("destaca pagamento que deve ser cobrado na entrega", () => {
	const html = renderCupomVendaHtml(
		buildData([{ metodo: "DINHEIRO", valor: 27, parcelas: null, pago: false, descricao: "CASH", situacao: "COBRAR" }]),
	);
	assert.match(html, /Dinheiro · CASH \(COBRAR NA ENTREGA\)/);
	assert.match(html, /class="pagamento-destaque">VALOR A COBRAR: R\$ 27,00<\/div>/);
});

test("soma apenas os pagamentos a cobrar, sem incluir patrocínio do iFood ou taxa no total da venda", () => {
	const html = renderCupomVendaHtml(buildData([
		{ metodo: "CARTAO_CREDITO", valor: 45.43, pago: false, descricao: "MASTERCARD", situacao: "COBRAR" },
		{ metodo: "VALE", valor: 5.56, pago: true, descricao: "Patrocínio IFOOD", situacao: "PAGO_CANAL" },
	]));
	assert.match(html, /VALOR A COBRAR: R\$ 45,43/);
	assert.doesNotMatch(html, /VALOR A COBRAR: R\$ 50,99/);
	assert.doesNotMatch(html, /JÁ PAGO · NADA A COBRAR/);
});

test("destaca que não há cobrança quando todos os pagamentos foram feitos pelo canal", () => {
	const html = renderCupomVendaHtml(buildData([{ metodo: "PIX", valor: 27, pago: true, situacao: "PAGO_CANAL" }]));
	assert.doesNotMatch(html, /VALOR A COBRAR/);
	assert.match(html, /class="pagamento-destaque">JÁ PAGO · NADA A COBRAR<\/div>/);
});

test("não marca como já pago quando não há pagamentos do canal", () => {
	const html = renderCupomVendaHtml(buildData([{ metodo: "DINHEIRO", valor: 27, pago: true, situacao: "PAGO" }]));
	assert.doesNotMatch(html, /JÁ PAGO · NADA A COBRAR/);
});

test("reforça a legibilidade dos textos operacionais na impressão térmica", () => {
	const html = renderCupomVendaHtml(buildData([]));
	assert.match(html, /\.fraco \{ color: #000; \}/);
	assert.match(html, /\.mini \{ font-size: 7\.5pt; font-weight: 700; \}/);
	assert.match(html, /\.bloco \{ font-weight: 700; \}/);
	assert.match(html, /\.itens \{[^}]*font-weight: 700; \}/);
	assert.match(html, /\.rodape \{[^}]*font-weight: 700; \}/);
});

test("destaca contato temporário do iFood no bloco de entrega", () => {
	const dados = buildData([]);
	dados.venda.modalidade = "ENTREGA";
	dados.venda.enderecoEntrega = ["R. Jorge André Andraus, 109", "Baduy - ITUIUTABA/MG"];
	dados.venda.contatoTemporario = {
		telefone: "0800 705 1020",
		localizador: "78772546",
		expiraEm: new Date("2026-09-01T21:57:01.255Z"),
	};

	const html = renderCupomVendaHtml(dados);
	assert.match(html, /CONTATO IFOOD/);
	assert.match(html, /0800 705 1020/);
	assert.match(html, /LOCALIZADOR 78772546/);
	assert.match(html, /Válido até/);
	assert.match(html, /class="contato-ifood"/);
});

test("não imprime contato temporário fora de uma entrega", () => {
	const dados = buildData([]);
	dados.venda.modalidade = "RETIRADA";
	dados.venda.contatoTemporario = { telefone: "0800 705 1020", localizador: "78772546", expiraEm: null };

	assert.doesNotMatch(renderCupomVendaHtml(dados), /CONTATO IFOOD/);
});

test("imprime a data da venda no fuso da operação", () => {
	// 13:30 UTC é 10:30 em São Paulo. O cupom é renderizado no servidor (UTC no Vercel), então
	// formatar no fuso do processo adiantava o papel em três horas.
	const html = renderCupomVendaHtml(buildData([]));
	assert.match(html, /31\/08\/2026 10:30/);
	assert.doesNotMatch(html, /31\/08\/2026 13:30/);
});

test("imprime o troco depois das formas de pagamento", () => {
	const base = buildData([{ metodo: "DINHEIRO", valor: 50, parcelas: null, pago: true, descricao: null, situacao: "PAGO" }]);
	const html = renderCupomVendaHtml({ ...base, venda: { ...base.venda, troco: 13 } });
	assert.match(html, /Dinheiro \(PAGO\)/);
	assert.match(html, /TROCO/);
});

test("nao imprime linha de troco quando nao houve troco", () => {
	const html = renderCupomVendaHtml(buildData([{ metodo: "DINHEIRO", valor: 27, parcelas: null, pago: true, descricao: null, situacao: "PAGO" }]));
	assert.doesNotMatch(html, /TROCO/);
});

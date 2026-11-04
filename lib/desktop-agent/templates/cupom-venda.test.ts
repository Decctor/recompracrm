import assert from "node:assert/strict";
import test from "node:test";
import { renderCupomVendaHtml, splitCupomItemValues, type TCupomVendaDados } from "./cupom-venda";

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
		recompensas: [],
		cashback: null,
	};
}

test("imprime uma linha por recompensa resgatada, com a quantidade quando repetida", () => {
	const dados = buildData([]);
	dados.recompensas = [
		{ nome: "Café", quantidade: 2, valorDesconto: 16 },
		{ nome: "Bolo", quantidade: 1, valorDesconto: 15 },
	];
	const html = renderCupomVendaHtml(dados);
	assert.match(html, /Recompensa: Café x2/);
	assert.match(html, /Recompensa: Bolo</);
	assert.doesNotMatch(html, /Bolo x1/);
});

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

test("agrupa os adicionais sob o nome do grupo e imprime a observação do item", () => {
	const dados = buildData([]);
	dados.venda.itens = [
		{
			descricao: "Açaí - 500ml",
			quantidade: 1,
			valorTotal: 42,
			observacoes: "Quero leite ninho além dos selecionados",
			adicionais: [
				{ grupo: "Escolha até 3 adicionais", nome: "Nutella", quantidade: 1, valorTotal: 0 },
				{ grupo: "Escolha seu gelato", nome: "Pistache Supremo", quantidade: 1, valorTotal: 0 },
				{ grupo: "Escolha até 3 adicionais", nome: "Morango", quantidade: 2, valorTotal: 4 },
				{ grupo: null, nome: "Colher extra", quantidade: 1, valorTotal: 0 },
			],
		},
	];
	const html = renderCupomVendaHtml(dados);
	const texto = toPlainText(html);
	assert.match(texto, /Escolha até 3 adicionais \+ Nutella \+ 2x Morango R\$ 4,00 Escolha seu gelato \+ Pistache Supremo \+ Colher extra Obs\./);
	assert.match(html, /<span class="grupo-adicionais">Escolha até 3 adicionais<\/span>/);
	assert.match(html, /<span class="adicional agrupado">\+ Nutella<\/span>/);
	// Sem grupo: sem cabeçalho, sem recuo extra, e sempre depois dos agrupados.
	assert.match(html, /<span class="adicional">\+ Colher extra<\/span>/);
	assert.match(html, /Obs\.: Quero leite ninho além dos selecionados/);
});

// Texto corrido do cupom, sem tags: as asserções de layout leem o que a térmica imprime.
function toPlainText(html: string) {
	return html
		.replace(/<style>[\s\S]*?<\/style>/, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function buildItemData(item: NonNullable<TCupomVendaDados["venda"]["itens"]>[number]) {
	const dados = buildData([]);
	dados.venda.itens = [item];
	return dados;
}

test("imprime o preço do produto separado do preço dos adicionais", () => {
	const html = renderCupomVendaHtml(
		buildItemData({
			descricao: "Cookie Tradicional de Chocolate",
			quantidade: 1,
			valorUnitario: 31,
			valorTotal: 31,
			adicionais: [{ grupo: "Que tal um cookie ou brownie?", nome: "Cookie de Ovomaltine", quantidade: 1, valorTotal: 14 }],
		}),
	);
	const texto = toPlainText(html);
	assert.match(texto, /1x Cookie Tradicional de Chocolate R\$ 17,00 Que tal um cookie ou brownie\? \+ Cookie de Ovomaltine R\$ 14,00/);
	assert.doesNotMatch(texto, /R\$ 31,00 Que tal/);
	assert.doesNotMatch(texto, /\(R\$ 14,00\)/);
});

test("multiplica base e adicionais pela quantidade do item, com o unitário de cada um", () => {
	const texto = toPlainText(
		renderCupomVendaHtml(
			buildItemData({
				descricao: "Cookie Tradicional de Chocolate",
				quantidade: 2,
				valorUnitario: 31,
				valorTotal: 62,
				adicionais: [{ grupo: null, nome: "Cookie de Ovomaltine", quantidade: 1, valorTotal: 14 }],
			}),
		),
	);
	assert.match(texto, /2x Cookie Tradicional de Chocolate \(R\$ 17,00 un\.\) R\$ 34,00 \+ Cookie de Ovomaltine \(R\$ 14,00 un\.\) R\$ 28,00/);
});

test("produto que vale só pelos adicionais não imprime R$ 0,00", () => {
	const texto = toPlainText(
		renderCupomVendaHtml(
			buildItemData({
				descricao: "Monte seu açaí",
				quantidade: 1,
				valorTotal: 20,
				adicionais: [{ grupo: "Tamanho", nome: "500ml", quantidade: 1, valorTotal: 20 }],
			}),
		),
	);
	assert.match(texto, /1x Monte seu açaí Tamanho \+ 500ml R\$ 20,00/);
	assert.doesNotMatch(texto, /R\$ 0,00/);
});

test("mantém o total na linha do item quando os adicionais não fecham com o total", () => {
	// Importação que gravou o adicional já multiplicado pela quantidade do item: a base
	// derivada ficaria negativa, então o cupom não inventa um preço de produto.
	const texto = toPlainText(
		renderCupomVendaHtml(
			buildItemData({
				descricao: "Pizza",
				quantidade: 3,
				valorTotal: 30,
				adicionais: [{ grupo: null, nome: "Borda recheada", quantidade: 3, valorTotal: 15 }],
			}),
		),
	);
	assert.match(texto, /3x Pizza R\$ 30,00 \+ 3x Borda recheada \(R\$ 15,00\)/);
});

test("splitCupomItemValues não separa item sem adicional cobrado", () => {
	assert.equal(splitCupomItemValues({ quantidade: 1, valorTotal: 10, adicionais: [] }), null);
	assert.equal(splitCupomItemValues({ quantidade: 1, valorTotal: 10, adicionais: [{ nome: "Gelo", valorTotal: 0 }] }), null);
	assert.deepEqual(splitCupomItemValues({ quantidade: 1, valorTotal: 31, adicionais: [{ nome: "Ovomaltine", valorTotal: 14 }] }), { valorBase: 17 });
});

test("destaca o troco a levar abaixo do pagamento em dinheiro na entrega", () => {
	const html = renderCupomVendaHtml(
		buildData([{ metodo: "DINHEIRO", valor: 86, pago: false, descricao: null, situacao: "COBRAR", trocoPara: 100 }]),
	);
	assert.match(html, /Dinheiro \(COBRAR NA ENTREGA\)/);
	assert.match(html, /LEVAR TROCO \(paga com R\$ 100,00\)<\/span><span>R\$ 14,00/);
});

test("não imprime troco quando o pagamento não tem nota maior que o valor", () => {
	const html = renderCupomVendaHtml(buildData([{ metodo: "DINHEIRO", valor: 86, pago: false, situacao: "COBRAR", trocoPara: null }]));
	assert.doesNotMatch(html, /LEVAR TROCO/);
});

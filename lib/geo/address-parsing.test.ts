import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBrazilianAddress, splitStreetType } from "./address-parsing";

const PONTA_GROSSA = { localizacaoEstado: "PR", localizacaoCidade: "PONTA GROSSA" };

test("lê o formato do Google Maps", () => {
	const { address, confident } = parseBrazilianAddress("R. Quinze de Novembro, 512 - Centro, Ponta Grossa - PR, 84010-020, Brasil");
	assert.deepEqual(address, {
		localizacaoCep: "84010-020",
		localizacaoEstado: "PR",
		localizacaoCidade: "PONTA GROSSA",
		localizacaoBairro: "Centro",
		localizacaoLogradouro: "Rua Quinze de Novembro",
		localizacaoNumero: "512",
		localizacaoComplemento: null,
	});
	assert.equal(confident, true);
});

test("lê cidade/UF colados e complemento depois do número", () => {
	const { address, confident } = parseBrazilianAddress("Av Paulista 1000 apto 52, Bela Vista, São Paulo/SP");
	assert.equal(address.localizacaoLogradouro, "Avenida Paulista");
	assert.equal(address.localizacaoNumero, "1000");
	assert.equal(address.localizacaoComplemento, "apto 52");
	assert.equal(address.localizacaoBairro, "Bela Vista");
	assert.equal(address.localizacaoCidade, "SÃO PAULO");
	assert.equal(address.localizacaoEstado, "SP");
	assert.equal(confident, true);
});

test("não confunde o número do nome da rua com o número da casa", () => {
	const numbered = parseBrazilianAddress("Rua 15 de Novembro, 512");
	assert.equal(numbered.address.localizacaoLogradouro, "Rua 15 de Novembro");
	assert.equal(numbered.address.localizacaoNumero, "512");

	const inline = parseBrazilianAddress("Rua 7 de Setembro 45");
	assert.equal(inline.address.localizacaoLogradouro, "Rua 7 de Setembro");
	assert.equal(inline.address.localizacaoNumero, "45");

	const withoutNumber = parseBrazilianAddress("Avenida 7 de Setembro");
	assert.equal(withoutNumber.address.localizacaoLogradouro, "Avenida 7 de Setembro");
	assert.equal(withoutNumber.address.localizacaoNumero, null);
});

test("reconhece a cidade pela região padrão sem completar o que não foi escrito", () => {
	const withCity = parseBrazilianAddress("Rua Balduíno Taques, 45, Estrela, Ponta Grossa", { defaultRegion: PONTA_GROSSA });
	assert.equal(withCity.address.localizacaoCidade, "PONTA GROSSA");
	assert.equal(withCity.address.localizacaoEstado, "PR");
	assert.equal(withCity.address.localizacaoBairro, "Estrela");
	assert.equal(withCity.confident, true);

	const withoutCity = parseBrazilianAddress("Rua Balduíno Taques, 45, Centro", { defaultRegion: PONTA_GROSSA });
	assert.equal(withoutCity.address.localizacaoCidade, null);
	assert.equal(withoutCity.address.localizacaoEstado, null);
	assert.equal(withoutCity.address.localizacaoBairro, "Centro");
});

test("bairro homônimo de município: o último trecho é a cidade", () => {
	// "Castro" é município do PR; aqui é bairro, e a cidade vem depois.
	const { address } = parseBrazilianAddress("Rua X, 10, Castro, Ponta Grossa - PR");
	assert.equal(address.localizacaoBairro, "Castro");
	assert.equal(address.localizacaoCidade, "PONTA GROSSA");
});

test("lê o formato com etiquetas, em várias linhas", () => {
	const { address, confident } = parseBrazilianAddress(
		"Rua: das Flores\nNúmero: 45\nBairro: Jardim Carvalho\nCidade: Ponta Grossa\nEstado: PR\nCEP: 84015000\nReferência: casa azul",
	);
	assert.equal(address.localizacaoLogradouro, "Rua das Flores");
	assert.equal(address.localizacaoNumero, "45");
	assert.equal(address.localizacaoBairro, "Jardim Carvalho");
	assert.equal(address.localizacaoCidade, "PONTA GROSSA");
	assert.equal(address.localizacaoEstado, "PR");
	assert.equal(address.localizacaoCep, "84015-000");
	assert.equal(address.localizacaoComplemento, "casa azul");
	assert.equal(confident, true);
});

test("aceita s/n", () => {
	const { address } = parseBrazilianAddress("Estrada do Guaragi, s/n, Guaragi");
	assert.equal(address.localizacaoLogradouro, "Estrada do Guaragi");
	assert.equal(address.localizacaoNumero, "S/N");
	assert.equal(address.localizacaoBairro, "Guaragi");
});

test("texto corrido sem separadores não é confiável", () => {
	const { address, confident } = parseBrazilianAddress("rua balduino taques 45 centro ponta grossa", { defaultRegion: PONTA_GROSSA });
	assert.equal(address.localizacaoLogradouro, "Rua balduino taques");
	assert.equal(address.localizacaoNumero, "45");
	assert.equal(confident, false);
});

test("logradouro sem tipo não é confiável", () => {
	const { address, confident } = parseBrazilianAddress("Balduíno Taques 45, Centro", { defaultRegion: PONTA_GROSSA });
	assert.equal(address.localizacaoLogradouro, "Balduíno Taques");
	assert.equal(address.localizacaoNumero, "45");
	assert.equal(address.localizacaoBairro, "Centro");
	assert.equal(confident, false);
});

test("mensagem de WhatsApp com referência vai para o complemento", () => {
	const { address } = parseBrazilianAddress("Rua Balduíno Taques 45 fundos, perto do mercado", { defaultRegion: PONTA_GROSSA });
	assert.equal(address.localizacaoLogradouro, "Rua Balduíno Taques");
	assert.equal(address.localizacaoNumero, "45");
	assert.equal(address.localizacaoComplemento, "fundos, perto do mercado");
});

test("sem UF nem região, só aceita cidade de nome único", () => {
	const unique = parseBrazilianAddress("Rua XV de Novembro, 100, Centro, Curitiba");
	assert.equal(unique.address.localizacaoCidade, "CURITIBA");
	assert.equal(unique.address.localizacaoEstado, "PR");

	// "Bonito" existe em várias UFs.
	const ambiguous = parseBrazilianAddress("Rua A, 1, Centro, Bonito");
	assert.equal(ambiguous.address.localizacaoCidade, null);
	assert.equal(ambiguous.confident, false);
});

test("telefone não vira CEP", () => {
	const { address } = parseBrazilianAddress("Rua A, 10 - Centro (42) 99988-7766");
	assert.equal(address.localizacaoCep, null);
});

test("splitStreetType expande abreviações", () => {
	assert.deepEqual(splitStreetType("R. Quinze de Novembro"), { type: "Rua", name: "Quinze de Novembro" });
	assert.deepEqual(splitStreetType("Pça. da Sé"), { type: "Praça", name: "da Sé" });
	assert.deepEqual(splitStreetType("Rodovia BR-376"), { type: "Rodovia", name: "BR-376" });
	assert.deepEqual(splitStreetType("Quinze de Novembro"), { type: null, name: "Quinze de Novembro" });
});

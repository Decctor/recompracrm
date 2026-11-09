import assert from "node:assert/strict";
import test from "node:test";
import { SALE_SIGNATURE_VERSION, computeSaleImportSignature } from "./sale-signature";

function buildInput() {
	return {
		saleValues: {
			organizacaoId: "org-1",
			idExterno: "12345",
			clienteId: "client-1",
			valorTotal: 150.5,
			descontosTotal: 10,
			vendedorId: "seller-1",
			parceiroId: null,
			natureza: "SN01",
			situacao: "Atendido",
			statusVenda: "CONCLUIDA",
			statusAtendimento: "NAO_INICIADO",
			dataVenda: new Date("2026-08-01T12:30:00.000Z"),
			integracaoMetadados: { taxas: [{ tipo: "COMISSAO", valor: 5 }] },
		},
		resolvedItems: [
			{
				produtoId: "prod-1",
				produtoVarianteId: null,
				quantidade: 2,
				valorVendaUnitario: 50,
				valorVendaTotalLiquido: 100,
				modificadores: [
					{ opcaoId: "opt-1", nome: "Borda", quantidade: 1, valorUnitario: 5, valorTotal: 5 },
					{ opcaoId: "opt-2", nome: "Extra", quantidade: 1, valorUnitario: 3, valorTotal: 3 },
				],
			},
			{
				produtoId: "prod-2",
				produtoVarianteId: "var-2",
				quantidade: 1,
				valorVendaUnitario: 50.5,
				valorVendaTotalLiquido: 50.5,
				modificadores: [],
			},
		],
		saleItemRewritePolicy: "REPLACE_ON_EVERY_SYNC",
	};
}

test("assinatura tem o prefixo de versão e é estável para o mesmo input", () => {
	const first = computeSaleImportSignature(buildInput());
	const second = computeSaleImportSignature(buildInput());
	assert.ok(first.startsWith(`${SALE_SIGNATURE_VERSION}:`));
	assert.equal(first, second);
});

test("ordem das chaves não altera a assinatura", () => {
	const base = computeSaleImportSignature(buildInput());
	const input = buildInput();
	// Reconstrói saleValues com as chaves em ordem invertida.
	input.saleValues = Object.fromEntries(Object.entries(input.saleValues).reverse()) as typeof input.saleValues;
	assert.equal(computeSaleImportSignature(input), base);
});

test("ordem dos itens e dos modificadores não altera a assinatura", () => {
	const base = computeSaleImportSignature(buildInput());
	const input = buildInput();
	input.resolvedItems.reverse();
	input.resolvedItems[1]?.modificadores.reverse();
	assert.equal(computeSaleImportSignature(input), base);
});

test("instâncias distintas de Date com o mesmo instante produzem a mesma assinatura", () => {
	const base = computeSaleImportSignature(buildInput());
	const input = buildInput();
	input.saleValues.dataVenda = new Date(input.saleValues.dataVenda.getTime());
	assert.equal(computeSaleImportSignature(input), base);
});

test("regressão: Date não colapsa em objeto vazio — instantes distintos diferem", () => {
	const base = computeSaleImportSignature(buildInput());
	const input = buildInput();
	input.saleValues.dataVenda = new Date("2026-08-01T12:31:00.000Z");
	assert.notEqual(computeSaleImportSignature(input), base);
});

test("campos undefined equivalem a campos ausentes", () => {
	const base = computeSaleImportSignature(buildInput());
	const input = buildInput();
	(input.saleValues as Record<string, unknown>).canal = undefined;
	assert.equal(computeSaleImportSignature(input), base);
});

test("null é preservado e difere de ausente", () => {
	const base = computeSaleImportSignature(buildInput());
	const input = buildInput();
	(input.saleValues as Record<string, unknown>).canal = null;
	assert.notEqual(computeSaleImportSignature(input), base);
});

test("mudança de status altera a assinatura", () => {
	const base = computeSaleImportSignature(buildInput());
	const input = buildInput();
	input.saleValues.situacao = "Cancelado";
	assert.notEqual(computeSaleImportSignature(input), base);
});

test("mudança de valor altera a assinatura", () => {
	const base = computeSaleImportSignature(buildInput());
	const input = buildInput();
	input.saleValues.valorTotal = 151;
	assert.notEqual(computeSaleImportSignature(input), base);
});

test("mudança de quantidade de um item altera a assinatura", () => {
	const base = computeSaleImportSignature(buildInput());
	const input = buildInput();
	if (input.resolvedItems[0]) input.resolvedItems[0].quantidade = 3;
	assert.notEqual(computeSaleImportSignature(input), base);
});

test("resolução tardia de produto altera a assinatura (item antes irresolvível)", () => {
	// Item irresolvível não entra na projeção; quando o produto passa a resolver, a linha
	// aparece e a assinatura muda — é o que dispara o re-sync.
	const withoutItem = buildInput();
	withoutItem.resolvedItems.pop();
	const base = computeSaleImportSignature(withoutItem);
	assert.notEqual(computeSaleImportSignature(buildInput()), base);
});

test("mudança de ID resolvido (produto/variante/modificador) altera a assinatura", () => {
	const base = computeSaleImportSignature(buildInput());

	const changedProduct = buildInput();
	if (changedProduct.resolvedItems[0]) changedProduct.resolvedItems[0].produtoId = "prod-99";
	assert.notEqual(computeSaleImportSignature(changedProduct), base);

	const changedVariant = buildInput();
	if (changedVariant.resolvedItems[1]) changedVariant.resolvedItems[1].produtoVarianteId = "var-99";
	assert.notEqual(computeSaleImportSignature(changedVariant), base);

	const changedModifier = buildInput();
	const modifier = changedModifier.resolvedItems[0]?.modificadores[0];
	if (modifier) modifier.opcaoId = "opt-99";
	assert.notEqual(computeSaleImportSignature(changedModifier), base);
});

test("mudança de política de rewrite de itens altera a assinatura", () => {
	const base = computeSaleImportSignature(buildInput());
	const input = buildInput();
	input.saleItemRewritePolicy = "INSERT_ONLY";
	assert.notEqual(computeSaleImportSignature(input), base);
});

test("mudança do ID resolvido do cliente altera a assinatura", () => {
	const base = computeSaleImportSignature(buildInput());
	const input = buildInput();
	input.saleValues.clienteId = "client-2";
	assert.notEqual(computeSaleImportSignature(input), base);
});

test("pagamentos ausentes ou null preservam a assinatura de conectores sem pagamentos", () => {
	const input = buildInput();
	const baseline = computeSaleImportSignature(input);
	assert.equal(computeSaleImportSignature({ ...input, payments: null }), baseline);
	assert.equal(computeSaleImportSignature({ ...input, payments: undefined }), baseline);
});

test("mudança de forma ou quitação de pagamento altera a assinatura; a ordem de chegada não", () => {
	const input = buildInput();
	const cash = { metodo: "DINHEIRO", valor: 100.5, pagoOnline: false };
	const card = { metodo: "CARTAO_CREDITO", valor: 50, pagoOnline: false };
	const signature = computeSaleImportSignature({ ...input, payments: [cash, card] });

	assert.notEqual(signature, computeSaleImportSignature(input));
	assert.equal(computeSaleImportSignature({ ...input, payments: [card, cash] }), signature);
	assert.notEqual(computeSaleImportSignature({ ...input, payments: [cash, { ...card, metodo: "OUTRO" }] }), signature);
	assert.notEqual(
		computeSaleImportSignature({ ...input, payments: [cash, { ...card, quitadoEm: new Date("2026-08-10T00:00:00.000Z") }] }),
		signature,
	);
});

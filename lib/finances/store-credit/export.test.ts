import assert from "node:assert/strict";
import test from "node:test";
import type { TStoreCreditExportTitle } from "@/app/api/finances/store-credit/export/route";
import { buildStoreCreditExportSheets } from "./export";

const referenceDate = new Date("2026-10-03T15:00:00");

function title(overrides: Partial<TStoreCreditExportTitle>): TStoreCreditExportTitle {
	return {
		transacaoId: "t",
		titulo: "Fiado",
		valor: 10,
		metodo: "FIADO_NOTA",
		dataPrevisao: new Date("2026-10-10T12:00:00"),
		dataEfetivacao: null,
		dataOrigem: new Date("2026-09-01T12:00:00"),
		origem: null,
		contaFinanceiraNome: null,
		clienteId: "c1",
		clienteNome: "Ana",
		clienteTelefone: null,
		clienteCpfCnpj: null,
		vendaId: "v1",
		vendaDataVenda: new Date("2026-09-01T12:00:00"),
		vendaValorTotal: 10,
		vendedorNome: "Bia",
		emAberto: true,
		...overrides,
	} as TStoreCreditExportTitle;
}

const titles = [
	title({ transacaoId: "a", valor: 10.1 }),
	title({ transacaoId: "b", valor: 20.2, dataPrevisao: new Date("2026-09-20T12:00:00"), origem: "SALDO_FIADO" }),
	title({ transacaoId: "c", valor: 5, dataEfetivacao: new Date("2026-09-25T12:00:00"), emAberto: false, metodo: "PIX" }),
	title({ transacaoId: "d", valor: 7, clienteId: "sem-cliente", clienteNome: "Sem cliente vinculado" }),
];

test("aba Clientes agrega a aba Fiados", () => {
	const [clientes, fiados] = buildStoreCreditExportSheets(titles, { includeSettled: true, referenceDate });
	assert.equal(clientes.name, "Clientes");
	assert.equal(fiados.rows.length, 4);
	const ana = clientes.rows[0] as Record<string, unknown>;
	assert.equal(ana["SALDO EM ABERTO"], 30.3);
	assert.equal(ana["TÍTULOS EM ABERTO"], 2);
	assert.equal(ana["VALOR VENCIDO"], 20.2);
	assert.equal(ana["DIAS EM ATRASO"], 13);
	assert.equal(ana["TOTAL RECEBIDO"], 5);
	assert.equal(ana["TÍTULOS QUITADOS"], 1);
	assert.equal(clientes.rows.length, 2);
});

test("sem os quitados, a aba Clientes não inventa total recebido", () => {
	const [clientes] = buildStoreCreditExportSheets(titles.filter((t) => t.emAberto), { includeSettled: false, referenceDate });
	assert.equal("TOTAL RECEBIDO" in (clientes.rows[0] as object), false);
});

test("linha de título: situação, atraso e forma de recebimento", () => {
	const [, fiados] = buildStoreCreditExportSheets(titles, { includeSettled: true, referenceDate });
	const [emDia, vencido, quitado] = fiados.rows as Record<string, unknown>[];
	assert.equal(emDia["SITUAÇÃO"], "EM ABERTO");
	assert.equal(emDia["DIAS EM ATRASO"], null);
	assert.equal(vencido["SITUAÇÃO"], "VENCIDO");
	assert.equal(vencido["DIAS EM ATRASO"], 13);
	assert.equal(vencido["ORIGEM DO TÍTULO"], "Saldo de baixa parcial");
	assert.equal(quitado["SITUAÇÃO"], "QUITADO");
	assert.equal(quitado["FORMA DE RECEBIMENTO"], "Pix");
	assert.equal(quitado["FAIXA DE ATRASO"], "");
});

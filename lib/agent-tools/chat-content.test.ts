import assert from "node:assert/strict";
import test from "node:test";
import {
	buildMatchSnippet,
	decodeKeysetCursor,
	decodeOffsetCursor,
	durationStatsToMinutes,
	encodeKeysetCursor,
	encodeOffsetCursor,
	previousPeriod,
	ratioToPercent,
	resolveLastDirection,
	textContainsTerm,
	truncateText,
} from "./chat-content";

test("truncateText some com texto vazio em vez de devolver string vazia", () => {
	assert.equal(truncateText(null, 10), null);
	assert.equal(truncateText("   ", 10), null);
	assert.deepEqual(truncateText("oi", 10), { texto: "oi", truncado: false });
});

test("truncateText corta por caractere, sem partir emoji", () => {
	const result = truncateText("ab😀cd", 3);
	assert.deepEqual(result, { texto: "ab😀…", truncado: true });
});

test("truncateText colapsa espaços só quando pedido", () => {
	assert.equal(truncateText("a\n\nb", 10, { collapseWhitespace: true })?.texto, "a b");
	assert.equal(truncateText("a\n\nb", 10)?.texto, "a\n\nb");
});

test("buildMatchSnippet encontra o termo ignorando acento e caixa", () => {
	const text = `${"x".repeat(300)} Não recebi o pedido ainda ${"y".repeat(300)}`;
	const snippet = buildMatchSnippet(text, "nao recebi", 10);
	assert.ok(snippet.includes("Não recebi"), snippet);
	assert.ok(snippet.startsWith("…") && snippet.endsWith("…"));
});

test("textContainsTerm ignora acento e caixa nos dois lados", () => {
	assert.equal(textContainsTerm("Não RECEBI", "nao recebi"), true);
	assert.equal(textContainsTerm("recebi", "não"), false);
});

test("buildMatchSnippet devolve o começo quando o termo casou em outro campo", () => {
	assert.equal(buildMatchSnippet("mensagem curta", "inexistente"), "mensagem curta");
});

test("cursor por chave faz ida e volta e recusa lixo", () => {
	const position = { value: new Date("2026-11-01T12:00:00.000Z"), id: "abc_123" };
	assert.deepEqual(decodeKeysetCursor(encodeKeysetCursor(position)), position);
	assert.equal(decodeKeysetCursor("nao-e-um-cursor"), null);
	assert.equal(decodeKeysetCursor(null), null);
});

test("cursor por deslocamento faz ida e volta e cai em zero quando inválido", () => {
	assert.equal(decodeOffsetCursor(encodeOffsetCursor(40)), 40);
	assert.equal(decodeOffsetCursor(encodeKeysetCursor({ value: new Date(), id: "x" })), 0);
	assert.equal(decodeOffsetCursor(undefined), 0);
});

test("resolveLastDirection compara os carimbos de entrada e saída", () => {
	const earlier = new Date("2026-11-01T10:00:00Z");
	const later = new Date("2026-11-01T11:00:00Z");
	assert.equal(resolveLastDirection({ entrada: null, saida: null }), "INDEFINIDA");
	assert.equal(resolveLastDirection({ entrada: later, saida: null }), "ENTRADA");
	assert.equal(resolveLastDirection({ entrada: null, saida: later }), "SAIDA");
	assert.equal(resolveLastDirection({ entrada: later, saida: earlier }), "ENTRADA");
	assert.equal(resolveLastDirection({ entrada: earlier, saida: later }), "SAIDA");
});

test("durationStatsToMinutes omite o p90 de amostra pequena", () => {
	assert.deepEqual(durationStatsToMinutes({ media: 600, mediana: 300, p90: 3600, amostra: 3 }), {
		mediaMinutos: 10,
		medianaMinutos: 5,
		p90Minutos: undefined,
		amostra: 3,
	});
	assert.equal(durationStatsToMinutes({ media: 600, mediana: 300, p90: 3600, amostra: 50 }).p90Minutos, 60);
	assert.equal(durationStatsToMinutes({ media: null, mediana: null, p90: null, amostra: 0 }).medianaMinutos, undefined);
});

test("ratioToPercent não inventa percentual sem denominador", () => {
	assert.equal(ratioToPercent(3, 0), undefined);
	assert.equal(ratioToPercent(1, 3), 33.3);
});

test("previousPeriod tem a mesma duração e termina antes do início", () => {
	const after = new Date("2026-11-01T03:00:00.000Z");
	const before = new Date("2026-11-08T02:59:59.999Z");
	const previous = previousPeriod({ after, before });
	assert.equal(previous.before.getTime(), after.getTime() - 1);
	assert.equal(previous.before.getTime() - previous.after.getTime(), before.getTime() - after.getTime());
});

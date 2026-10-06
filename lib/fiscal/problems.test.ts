import assert from "node:assert/strict";
import { test } from "node:test";
import { FiscalReadinessError } from "./errors";
import {
	buildFiscalProblem,
	buildSefazProblem,
	classifyFiscalErrorMessage,
	resolveFiscalDocumentProblems,
	toFiscalProblemsFromError,
} from "./problems";

test("mensagem legada de validacao vira um problema por produto, com alvo", () => {
	const problems = classifyFiscalErrorMessage(
		"Validacao fiscal falhou: [ERRO] PERFIL_FISCAL_AUSENTE: Produto sem perfil fiscal cadastrado. (produto prod-1); [ERRO] GRUPO_TRIBUTARIO_AUSENTE: Produto sem grupo tributario vinculado. (produto prod-2); [AVISO] IBPT_AUSENTE: sem taxa (produto prod-3)",
		(id) => (id === "prod-1" ? "Coca-Cola" : null),
	);
	assert.equal(problems.length, 2);
	assert.equal(problems[0].codigo, "PERFIL_FISCAL_AUSENTE");
	assert.deepEqual(problems[0].alvo, { tipo: "PRODUTO", id: "prod-1", rotulo: "Coca-Cola" });
	assert.match(problems[0].mensagem, /^Coca-Cola:/);
	assert.equal(problems[1].codigo, "GRUPO_TRIBUTARIO_AUSENTE");
	assert.equal(problems[1].alvo.tipo, "GRUPO_TRIBUTARIO");
	assert.equal(problems[1].alvo.id, "prod-2");
});

test("mensagens de prontidao sao classificadas por padrao", () => {
	assert.equal(classifyFiscalErrorMessage("Serie fiscal ativa nao encontrada para esta emissao.")[0].alvo.tipo, "SERIE");
	assert.equal(
		classifyFiscalErrorMessage("Perfil fiscal NFCE com presença OPERACAO_PRESENCIAL não configurado para modalidade PRESENCIAL.")[0].codigo,
		"PERFIL_OPERACAO_AUSENTE",
	);
	assert.equal(
		classifyFiscalErrorMessage("Configure um perfil de operacao fiscal de devolucao (NF-e com finalidade DEVOLUCAO).")[0].codigo,
		"PERFIL_OPERACAO_DEVOLUCAO_AUSENTE",
	);
	assert.equal(classifyFiscalErrorMessage("Empresa fiscal nao sincronizada com a Spedy.")[0].alvo.tipo, "EMPRESA_PROVEDOR");
	assert.equal(classifyFiscalErrorMessage("CSC da NFC-e nao configurado.")[0].alvo.tipo, "CONFIGURACAO_FISCAL");
	assert.equal(classifyFiscalErrorMessage("A soma dos pagamentos e menor que o valor total da venda.")[0].alvo.tipo, "PAGAMENTOS");
	assert.equal(
		classifyFiscalErrorMessage("A soma dos pagamentos e maior que o total do documento fiscal (vNF). A SEFAZ rejeitaria a nota (866).")[0].codigo,
		"PAGAMENTOS_EXCEDENTES",
	);
	const infra = classifyFiscalErrorMessage("Falha ao emitir. Servico da Spedy indisponivel no momento.")[0];
	assert.equal(infra.codigo, "PROVEDOR_INDISPONIVEL");
	assert.equal(infra.resolvidoAutomaticamente, true);
	assert.equal(classifyFiscalErrorMessage("algo totalmente inesperado")[0].codigo, "ERRO_DESCONHECIDO");
});

test("erro de prontidao carrega os problemas estruturados", () => {
	const error = new FiscalReadinessError("CSC da NFC-e nao configurado.", [
		buildFiscalProblem("NFCE_CREDENCIAIS_AUSENTES", { mensagem: "CSC da NFC-e nao configurado." }),
	]);
	const problems = toFiscalProblemsFromError(error, error.message);
	assert.equal(problems.length, 1);
	assert.equal(problems[0].codigo, "NFCE_CREDENCIAIS_AUSENTES");
	assert.equal(error.expose, true);
	assert.equal(error.status, 400);
});

test("rejeicao SEFAZ usa o catalogo e o alvo do codigo", () => {
	const ncm = buildSefazProblem("778", "Rejeicao: NCM inexistente");
	assert.equal(ncm.codigo, "SEFAZ_778");
	assert.equal(ncm.alvo.tipo, "PRODUTO");
	assert.equal(ncm.reenviavel, true);
	const dup = buildSefazProblem("204");
	assert.equal(dup.alvo.tipo, "SERIE");
	assert.equal(dup.reenviavel, false);
	assert.equal(buildSefazProblem("999").categoria, "OUTRO");
});

test("resolveFiscalDocumentProblems: persistido vence o legado; sem falha devolve vazio", () => {
	const stored = JSON.stringify([buildFiscalProblem("SERIE_AUSENTE")]);
	assert.equal(resolveFiscalDocumentProblems({ statusInterno: "ERRO", problemas: stored, mensagens: ["outra coisa"] })[0].codigo, "SERIE_AUSENTE");
	assert.equal(
		resolveFiscalDocumentProblems({ statusInterno: "REJEITADO", codigoRejeicao: "280", mensagens: ["Certificado invalido"] })[0].alvo.tipo,
		"CERTIFICADO",
	);
	assert.deepEqual(resolveFiscalDocumentProblems({ statusInterno: "AUTORIZADO", mensagens: ["x"] }), []);
	assert.equal(resolveFiscalDocumentProblems({ statusInterno: "ERRO", mensagens: [] })[0].codigo, "ERRO_DESCONHECIDO");
});

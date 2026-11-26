import assert from "node:assert/strict";
import { test } from "node:test";
import { compareNamesForSameDocument } from "./person-names";

const compatible = (a: string, b: string) => compareNamesForSameDocument(a, b).compatible;

test("same document: identical names, notes and accents don't matter", () => {
	assert.equal(compatible("JOSÉ AUGUSTO DA SILVA", "JOSE AUGUSTO DA SILVA (C/ADVG)"), true);
	assert.equal(compatible("Cledina Ap de Carvalho Oliveira (C/ADVOG", "CLEDINA AP CARVALHO OLIVEIRA"), true);
});

test("same document: one-letter typos are tolerated", () => {
	assert.equal(compatible("NEUSA HELENA SEVERINO SILVA", "NEUZA HELENA SEVERINO SILVA"), true);
	assert.equal(compatible("JAME GOMES DA COSTA", "JAIME GOMES DA COSTA"), true);
	assert.equal(compatible("WASHINGTON CARLOS SILVA", "WASHNGTON CARLOS SILVA"), true);
	assert.equal(compatible("FERNANDA CRISTINA FERREIRA ALVES", "FERNANDA CRSITINA ALVES"), true);
	assert.equal(compatible("JULIANA REZENDE DO NASACIMENTO", "JULIANA REZENDE DO NASCIMENTO"), true);
});

test("same document: abbreviations of up to two letters, never in the first name", () => {
	assert.equal(compatible("CLEDINA AP DE CARVALHO OLIVEIRA (C/ADVOG", "CLEDINA APARECIDA DE CARVALHO OLIVEIRA"), true);
	assert.equal(compatible("MARIA DO CARMO DA SILVA", "MARIA DO CARMO DA S. SANTOS"), true);
	assert.equal(compatible("M SILVA", "MARIA SILVA"), false);
});

test("same document: a shorter name contained in the longer one", () => {
	assert.equal(compatible("EUNICE MARIA LOURDES DOS SANTOS", "EUNICE MARIA LOURDES"), true);
	assert.equal(compatible("EMERSON ALVES DE OLIVEIRA", "EMERSON ALVES DE OLIVEIRA GAIAO"), true);
});

test("same document: different people are sent to review", () => {
	assert.equal(compatible("MARIA EUGENIA DA SILVA", "MARIA EUNICE DA SILVA"), false);
	assert.equal(compatible("GEISEBEL SILVANIA DA SILVA", "GENEZI SILVEIRA DA SILVA"), false);
	assert.equal(compatible("GLEIDSON JUNIOR BARBOSA", "CLEIDSON JUNIOR BARBOSA"), true); // G/C typo, same surname
	assert.equal(compatible("ANA", "ANA PAULA SOUZA"), false);
	assert.equal(compatible("JOAO PEDRO", "JOSE PEDRO"), false);
});

test("same document: a placeholder name never blocks", () => {
	assert.equal(compareNamesForSameDocument(".............", "DAYANNE JENNIFER ALMEIDA SANTOS").basis, "SEM_NOME");
});

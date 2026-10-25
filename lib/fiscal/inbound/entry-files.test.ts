import assert from "node:assert/strict";
import test from "node:test";
import { inspectFiscalEntryDocument, looksLikeFiscalXml } from "./entry-files";

test("recognizes NF-e and CT-e roots, with or without the XML declaration and namespace prefix", () => {
	assert.equal(looksLikeFiscalXml(`<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="x">`), true);
	assert.equal(looksLikeFiscalXml(`<NFe xmlns="http://www.portalfiscal.inf.br/nfe">`), true);
	assert.equal(looksLikeFiscalXml(`<ns:cteProc>`), true);
	assert.equal(looksLikeFiscalXml(`<html>`), false);
	assert.equal(looksLikeFiscalXml(`{"nfeProc": 1}`), false);
});

test("inspects an XML by its root and refuses DTD and ENTITY declarations", async () => {
	const inspected = await inspectFiscalEntryDocument(Buffer.from(`<?xml version="1.0"?><NFe><infNFe/></NFe>`));
	assert.equal(inspected.mimeType, "application/xml");
	assert.equal(inspected.metadados, null);
	await assert.rejects(
		() => inspectFiscalEntryDocument(Buffer.from(`<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY x "y">]><NFe>&x;</NFe>`)),
		/DTD ou ENTITY/,
	);
});

test("inspects a PDF by signature and rejects anything else", async () => {
	const pdf = await inspectFiscalEntryDocument(Buffer.from("%PDF-1.4\n%fake"));
	assert.equal(pdf.mimeType, "application/pdf");
	await assert.rejects(() => inspectFiscalEntryDocument(Buffer.from("just text")), /Envie o XML/);
	await assert.rejects(() => inspectFiscalEntryDocument(Buffer.alloc(0)), /vazio/);
});

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * The local database is built from the Drizzle schema plus `db-objects.sql`. A migration that adds
 * a function, trigger, extension, view or policy changes production in a way the local database
 * would silently miss — this test makes that loud.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, "../../drizzle");
const curated = readFileSync(path.join(__dirname, "db-objects.sql"), "utf8");

/**
 * Objects a migration creates that the local database deliberately does not carry.
 * Add an entry only with the reason.
 */
const IGNORED: Record<string, string> = {};

const OBJECT_PATTERNS: { kind: string; pattern: RegExp }[] = [
	{ kind: "extension", pattern: /CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi },
	{ kind: "function", pattern: /CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+"?([a-z_][a-z0-9_.]*)"?/gi },
	{ kind: "trigger", pattern: /CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+"?([a-z_][a-z0-9_]*)"?/gi },
	{ kind: "view", pattern: /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_.]*)"?/gi },
	{ kind: "policy", pattern: /CREATE\s+POLICY\s+"?([a-z_][a-z0-9_ ]*?)"?\s+ON/gi },
];

function stripSqlComments(sql: string) {
	return sql.replace(/--.*$/gm, "");
}

function collectObjects(sql: string) {
	const found: { kind: string; name: string }[] = [];
	for (const { kind, pattern } of OBJECT_PATTERNS) {
		for (const match of stripSqlComments(sql).matchAll(pattern)) found.push({ kind, name: match[1].toLowerCase() });
	}
	return found;
}

test("db-objects.sql knows every function, trigger, extension, view and policy the migrations create", () => {
	const known = new Set(collectObjects(curated).map((object) => `${object.kind}:${object.name}`));
	const unknown: string[] = [];
	for (const file of readdirSync(MIGRATIONS_DIR)
		.filter((name) => name.endsWith(".sql"))
		.sort()) {
		for (const object of collectObjects(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"))) {
			const key = `${object.kind}:${object.name}`;
			if (!known.has(key) && !(key in IGNORED)) unknown.push(`${key} (drizzle/${file})`);
		}
	}
	assert.deepEqual(
		unknown,
		[],
		"A migration creates database objects that scripts/local/db-objects.sql does not recreate. Copy their latest definition into that file (or list them in IGNORED with the reason).",
	);
});

test("db-objects.sql keeps its two sections", () => {
	assert.match(curated, /^-- @section before-schema$/m);
	assert.match(curated, /^-- @section after-schema$/m);
	assert.ok(curated.indexOf("-- @section before-schema") < curated.indexOf("-- @section after-schema"));
});

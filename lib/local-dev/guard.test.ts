import assert from "node:assert/strict";
import { test } from "node:test";
import { assertLocalDatabase, isLoopbackHost } from "./guard";

test("accepts loopback databases whose name ends in _dev or _template", () => {
	assert.deepEqual(assertLocalDatabase("postgres://postgres:postgres@127.0.0.1:5432/recompracrm_dev"), {
		host: "127.0.0.1",
		port: 5432,
		database: "recompracrm_dev",
	});
	assert.equal(assertLocalDatabase("postgres://u:p@localhost/recompracrm_my_branch_dev").database, "recompracrm_my_branch_dev");
	assert.equal(assertLocalDatabase("postgres://u:p@localhost:5433/recompracrm_template").database, "recompracrm_template");
});

test("refuses any host that is not this machine", () => {
	assert.throws(() => assertLocalDatabase("postgres://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres_dev"), /not this machine/);
	assert.throws(() => assertLocalDatabase("postgres://u:p@192.168.0.10:5432/recompracrm_dev"), /not this machine/);
	assert.throws(() => assertLocalDatabase("postgres://u:p@localhost.evil.example/recompracrm_dev"), /not this machine/);
});

test("refuses a local database with any other name", () => {
	assert.throws(() => assertLocalDatabase("postgres://u:p@127.0.0.1:5432/postgres"), /does not end in _dev/);
	assert.throws(() => assertLocalDatabase("postgres://u:p@127.0.0.1:5432/recompracrm_dev_backup"), /does not end in _dev/);
});

test("refuses a missing or malformed url and never echoes credentials", () => {
	assert.throws(() => assertLocalDatabase(""), /not defined/);
	assert.throws(() => assertLocalDatabase("not a url"), /not a valid URL/);
	assert.throws(
		() => assertLocalDatabase("postgres://user:hunter2@db.example.com:5432/postgres"),
		(error: Error) => !error.message.includes("hunter2"),
	);
});

test("loopback detection", () => {
	assert.ok(isLoopbackHost("localhost") && isLoopbackHost("127.0.0.1") && isLoopbackHost("127.1.2.3") && isLoopbackHost("[::1]"));
	assert.ok(!isLoopbackHost("10.0.0.1") && !isLoopbackHost("example.com") && !isLoopbackHost("127.0.0.1.example.com"));
});

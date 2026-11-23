import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { test } from "node:test";
import { installLocalNetworkGuard } from "./network-guard";

installLocalNetworkGuard();

test("fetch to a non-loopback host is refused before any connection", async () => {
	await assert.rejects(fetch("https://api.stripe.com/v1/customers"), (error: Error) => {
		const cause = (error as { cause?: Error }).cause ?? error;
		return /blocked: local mode only talks to this machine/.test(cause.message);
	});
});

test("node:http to a non-loopback address is refused", async () => {
	const error = await new Promise<Error>((resolve) => {
		http.get("http://93.184.216.34/", () => resolve(new Error("connected"))).on("error", resolve);
	});
	assert.match(error.message, /blocked/);
});

test("raw sockets to a non-loopback host are refused", async () => {
	const error = await new Promise<Error>((resolve) => {
		net.connect(5432, "db.example.com").on("error", resolve);
	});
	assert.match(error.message, /Outbound connection to "db\.example\.com" blocked/);
});

test("loopback connections still go through", async () => {
	const server = http.createServer((_request, response) => response.end("ok")).listen(0, "127.0.0.1");
	await new Promise((resolve) => server.once("listening", resolve));
	const { port } = server.address() as net.AddressInfo;
	const response = await fetch(`http://127.0.0.1:${port}/`);
	assert.equal(await response.text(), "ok");
	server.close();
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { AxiosError, AxiosHeaders } from "axios";
import { isNuvemshopPastLastPageError } from "./index";

function axiosErrorWith(status: number, data: unknown) {
	const config = { headers: new AxiosHeaders() };
	return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, null, { status, statusText: "", headers: {}, config, data });
}

test("404 'Last page is 0' de uma janela sem pedidos é resultado vazio", () => {
	assert.equal(isNuvemshopPastLastPageError(axiosErrorWith(404, { code: 404, message: "Not Found", description: "Last page is 0" })), true);
});

test("404 'Last page is N' ao passar da última página é resultado vazio", () => {
	assert.equal(isNuvemshopPastLastPageError(axiosErrorWith(404, { code: 404, message: "Not Found", description: "Last page is 1" })), true);
});

test("outros 404 e outros status continuam sendo falha", () => {
	assert.equal(isNuvemshopPastLastPageError(axiosErrorWith(404, { code: 404, message: "Not Found", description: "Store not found" })), false);
	assert.equal(isNuvemshopPastLastPageError(axiosErrorWith(404, "Not Found")), false);
	assert.equal(isNuvemshopPastLastPageError(axiosErrorWith(500, { description: "Last page is 0" })), false);
	assert.equal(isNuvemshopPastLastPageError(new Error("Last page is 0")), false);
});

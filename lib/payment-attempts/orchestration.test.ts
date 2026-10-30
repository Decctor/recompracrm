import { PaymentReceiptConditionsSchema } from "@/schemas/financial";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

// Execute the real service code with isolated database boundaries; no live payments or DB writes.
function loadService(path: string, mocks: Record<string, unknown>) {
	const module = { exports: {} as any };
	const require = createRequire(import.meta.url);
	// esbuild, não o `typescript`: a partir do TypeScript 7 o pacote não expõe mais `transpileModule`.
	const source = transformSync(readFileSync(path, "utf8"), { loader: "ts", format: "cjs", target: "es2022" }).code;
	runInNewContext(source, {
		module,
		exports: module.exports,
		require: (id: string) => (id in mocks ? mocks[id] : id.startsWith("@/") ? {} : require(id)),
		crypto: globalThis.crypto,
		Date,
		Map,
		Set,
	});
	return module.exports;
}

test("tab close and partial-payment replays bypass mutable session and sale validation", async () => {
	const stored = { data: { saleId: "confirmed-sale", charges: [{ id: "charge" }] } };
	const service = loadService("lib/payment-attempts/terminal-tabs.ts", {
		"@/lib/access/tokens": { hashAccessSecret: () => "fingerprint" },
		"@/lib/point-of-interaction/idempotency": { runPoiTransactionWithIdempotency: async () => stored },
	});
	const common = { organizationId: "org", deviceId: "device", idempotencyKey: "completed" };
	assert.equal(await service.closeTerminalTab({ ...common, input: { tabId: "closed", sessaoVendaId: "closed-session", payments: [] } }), stored);
	assert.equal(
		await service.receiveTerminalTabPayment({
			...common,
			input: { tabId: "closed", sessaoVendaId: "closed-session", payment: { metodo: "DINHEIRO", valor: 10 } },
		}),
		stored,
	);
});

test("installments before a terminal payment retain their input payment association", async () => {
	let nextId = 0;
	const tx = { insert: () => ({ values: () => ({ returning: async () => [{ id: `transaction-${++nextId}` }] }) }) };
	const { LocalPaymentProvider } = loadService("lib/payments/providers/local.ts", {
		"@/lib/finances/financial-transaction-value": { normalizeFinancialTransactionValue: ({ valor }: { valor: number }) => ({ valor }) },
		"@/services/drizzle/schema": { financialTransactions: {} },
		"@/schemas/financial": { PaymentReceiptConditionsSchema },
	});
	const results = await new LocalPaymentProvider().processPayments(
		{
			pagamentos: [
				{ metodo: "CARTAO_CREDITO", valor: 60, totalParcelas: 3, efetivacaoTipo: "PENDENTE", condicoesRecebimento: { versao: 1, comportamentoParcelas: "TRANSACOES_PARCELADAS", intervaloMeses: 1 } },
				{ metodo: "CARTAO_DEBITO", valor: 40, dispositivoId: "terminal", efetivacaoTipo: "PENDENTE", condicoesRecebimento: { versao: 1, comportamentoParcelas: "TRANSACAO_UNICA", intervaloMeses: null } },
			],
		},
		tx,
	);
	assert.equal(results.length, 4);
	assert.equal(results.find((result: any) => result.indicePagamento === 1).transacaoId, "transaction-4");
	assert.equal(results.filter((result: any) => result.indicePagamento === 0).length, 3);
});

test("sale cancellation locks and cancels every card leg, and refuses any started leg", async () => {
	for (const statuses of [
		["CRIADA", "CRIADA"],
		["CRIADA", "PROCESSANDO"],
		["CRIADA", "RESULTADO_INCERTO"],
		["APROVADA_EFETIVACAO_PENDENTE", "CRIADA"],
	]) {
		const cancelled: string[] = [];
		let locked = false;
		const attempts = statuses.map((status, index) => ({ id: String(index), status }));
		const tx: any = {
			select: () => ({
				from: () => ({
					where: () => ({
						orderBy: () => ({
							for: async () => {
								locked = true;
								return attempts;
							},
						}),
					}),
				}),
			}),
			query: { couponRedemptions: { findMany: async () => [] } },
			update: () => ({ set: () => ({ where: async () => undefined }) }),
		};
		const schema = Object.fromEntries(["paymentAttempts", "couponRedemptions", "saleItems", "sales"].map((key) => [key, {}]));
		const service = loadService("lib/sales/sale-processing/process-confirmed-sale-cancellation.ts", {
			"@/services/drizzle": {
				db: {
					query: {
						sales: { findFirst: async () => ({ statusVenda: "CONFIRMADA", documentosFiscais: [], lancamentosContabeis: [], movimentacoesEstoque: [] }) },
					},
					transaction: async (execute: any) => execute(tx),
				},
			},
			"@/services/drizzle/schema": schema,
			"@/lib/sales/sale-editability": { saleFiscalDocumentsAllowCancellation: () => true },
			"@/lib/sales-sessions": { resolveCashRefundSession: async () => null },
			"@/lib/sales/sale-processing/attendance": { attendanceStatusValues: () => ({}) },
			"@/lib/payment-attempts": {
				OPEN_PAYMENT_ATTEMPT_STATUSES: ["CRIADA", "PROCESSANDO"],
				cancelPaymentAttemptFromPlatform: async ({ attemptId }: { attemptId: string }) => {
					cancelled.push(attemptId);
				},
			},
		});
		const run = () => service.processConfirmedSaleCancellation({ organizationId: "org", saleId: "sale", authorId: "user", reason: "cancel" });
		if (statuses.some((status) => status !== "CRIADA")) {
			await assert.rejects(run, { statusCode: 409 });
			assert.deepEqual(cancelled, []);
		} else {
			await run();
			assert.deepEqual(cancelled, ["0", "1"]);
		}
		assert.equal(locked, true);
	}
});

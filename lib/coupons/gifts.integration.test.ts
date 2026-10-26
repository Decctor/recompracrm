import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import * as schema from "@/services/drizzle/schema";
import * as enums from "@/services/drizzle/schema/enums";
import type { DBTransaction } from "@/services/drizzle";
import { cancelCouponRedemption } from "./redemption";
import { mapItemToCartItem } from "@/lib/sales/map-sale-to-sale-state";
import { syncDraftItems } from "@/lib/sales/drafts/sync-draft-items";
import { normalizeCouponGiftItem, roundCouponGiftCurrency } from "./gift-pricing";

// Real PostgreSQL semantics in memory. No application .env or production database is loaded.
const pg = new PGlite();
const database = drizzle(pg, { schema });
let confirmSale: typeof import("@/lib/sales/sale-processing/process-sale-confirmation").processSaleConfirmationInTransaction;
let editSale: typeof import("@/lib/sales/sale-processing/process-confirmed-sale-edit").processConfirmedSaleEditInTransaction;
let organization: schema.TOrganizationEntity;

function asTransaction(tx: unknown): DBTransaction {
	return new Proxy(tx as DBTransaction, {
		get(target, property, receiver) {
			if (property === "execute")
				return async (...args: Parameters<DBTransaction["execute"]>) => ((await target.execute(...args)) as unknown as { rows: unknown[] }).rows;
			return Reflect.get(target, property, receiver);
		},
	});
}

async function seed(table: PgTable, overrides: Record<string, unknown>) {
	const values = { ...overrides };
	for (const [name, column] of Object.entries(table)) {
		if (!column || typeof column !== "object" || !("notNull" in column) || !column.notNull || column.hasDefault || name in values) continue;
		values[name] =
			column.enumValues?.[0] ??
			(column.dataType === "number"
				? 0
				: column.dataType === "boolean"
					? false
					: column.dataType === "date"
						? new Date()
						: column.dataType === "json"
							? {}
							: "fixture");
	}
	const [row] = await database.insert(table).values(values).returning();
	return row;
}

before(async () => {
	// Constructors imported by confirmation require keys, but external services are never called.
	process.env.RESEND_API_KEY = "re_test_unused";
	process.env.STRIPE_SECRET_KEY = "sk_test_unused";
	process.env.SUPABASE_DB_URL = "postgres://unused:unused@127.0.0.1:1/unused";
	process.env.CAMPAIGN_EVENTS_ENABLED = "false";
	({ processSaleConfirmationInTransaction: confirmSale } = await import("@/lib/sales/sale-processing/process-sale-confirmation"));
	({ processConfirmedSaleEditInTransaction: editSale } = await import("@/lib/sales/sale-processing/process-confirmed-sale-edit"));
	const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson({ ...schema, ...enums }));
	for (const statement of statements) {
		if (statement.includes("trgm_ops") || statement.includes("unaccent_immutable")) continue;
		await pg.exec(statement);
	}
});

beforeEach(async () => {
	const tables = (Object.values(schema) as unknown[]).filter(
		(value): value is PgTable => !!value && typeof value === "object" && Symbol.for("drizzle:Name") in value,
	);
	await pg.exec(`TRUNCATE ${[...new Set(tables.map((table) => `"${getTableConfig(table).name}"`))].join(", ")} CASCADE`);
	await seed(schema.users, { id: "user", email: "gift@example.invalid" });
	organization = (await seed(schema.organizations, {
		id: "org",
		autorId: "user",
		pagamentoProvedor: "LOCAL",
		configuracao: { preferencias: { rastreamentoEstoque: false }, defaults: { pagamentos: {} } },
	})) as schema.TOrganizationEntity;
	await seed(schema.clients, { id: "client", organizacaoId: "org", nome: "Cliente" });
	await seed(schema.accountsCharts, { id: "debit", organizacaoId: "org", natureza: "ATIVO" });
	await seed(schema.accountsCharts, { id: "credit", organizacaoId: "org", natureza: "RECEITA" });
	await seed(schema.products, {
		id: "drink",
		organizacaoId: "org",
		autorId: "user",
		nome: "Bebida",
		precoVenda: 10,
		precoCusto: 3,
		quantidade: 10,
		rastreamentoEstoqueAtivo: true,
	});
	await seed(schema.productAddOns, { id: "extras", organizacaoId: "org", autorId: "user" });
	await seed(schema.productAddOnOptions, { id: "extra", organizacaoId: "org", produtoAddOnId: "extras", nome: "Adicional", precoDelta: 2 });
	await seed(schema.coupons, {
		id: "gift",
		organizacaoId: "org",
		codigo: "BRINDE",
		titulo: "Bebida grátis",
		ativo: true,
		beneficioTipo: "BRINDE",
		beneficioAplicacao: "ITENS_ELEGIVEIS",
		validacaoModo: "AUTOMATICA",
		escopo: "INDIVIDUAL",
	});
	await seed(schema.couponTargets, { cupomId: "gift", organizacaoId: "org", papel: "BENEFICIADO", produtoId: "drink" });
	await seed(schema.couponGrants, { id: "grant", cupomId: "gift", organizacaoId: "org", clienteId: "client", quantidadeDisponivel: 1 });
	await seed(schema.sales, {
		id: "sale",
		organizacaoId: "org",
		clienteId: "client",
		idExterno: "sale",
		valorTotal: 26,
		descontosTotal: 10,
		statusVenda: "ORCAMENTO",
		processamentoOrigem: "INTERNO",
		canal: "POS",
		entregaModalidade: "RETIRADA",
		emissaoFiscalAutomatica: false,
	});
	await seed(schema.saleItems, {
		id: "item",
		organizacaoId: "org",
		vendaId: "sale",
		produtoId: "drink",
		quantidade: 3,
		valorVendaUnitario: 12,
		valorCustoUnitario: 3,
		valorVendaTotalBruto: 36,
		valorTotalDesconto: 0,
		valorVendaTotalLiquido: 36,
		valorCustoTotal: 9,
		metadados: {
			itemChave: "cart-line",
			nome: "Bebida",
			codigo: "B",
			valorUnitarioBase: 10,
			valorModificadores: 2,
			modificadores: [{ opcaoId: "extra", nome: "Adicional", quantidade: 1, valorUnitario: 2, valorTotal: 2 }],
		},
	});
	await seed(schema.saleItemModifiers, { itemVendaId: "item", opcaoId: "extra", nome: "Adicional", quantidade: 1, valorUnitario: 2, valorTotal: 2 });
});
after(() => pg.close());

function confirm(overrides: Partial<Parameters<typeof confirmSale>[0]["input"]> = {}) {
	return database.transaction((tx) =>
		confirmSale({
			tx: asTransaction(tx),
			input: {
				organization,
				saleId: "sale",
				saleAuthorId: null,
				salePayments: [{ metodo: "DINHEIRO", valor: 26, efetivacaoTipo: "IMEDIATA" }],
				accountingEntryDebitAccountId: "debit",
				accountingEntryCreditAccountId: "credit",
				initialAttendanceStatus: "PRONTO",
				accumulateCashback: false,
				saleCouponId: "gift",
				saleCouponDeclaredDiscountValue: 10,
				saleCouponGift: { itemChave: "cart-line", quantidade: 1 },
				...overrides,
			},
		}),
	);
}

test("gift confirmation allocates one base-price unit, deducts normal stock, and consumes one grant", async () => {
	organization.configuracao.preferencias.rastreamentoEstoque = true;
	await confirm({ initialAttendanceStatus: "ENTREGUE" });
	const item = await database.query.saleItems.findFirst({ with: { adicionais: true } });
	assert.equal(item?.valorTotalDesconto, 10);
	assert.equal(item?.valorVendaTotalLiquido, 26);
	assert.equal((await database.query.products.findFirst())?.quantidade, 7);
	assert.equal((await database.query.couponGrants.findFirst())?.quantidadeDisponivel, 0);
	const redemption = await database.query.couponRedemptions.findFirst();
	assert.equal((redemption?.beneficioSnapshot as { brinde?: { itemChave: string } })?.brinde?.itemChave, "cart-line");
	assert.ok(item);
	const cart = mapItemToCartItem(item);
	assert.equal(cart.tempId, "cart-line");
	assert.equal(cart.valorDesconto, 0);
	assert.equal(cart.valorTotalLiquido, 36);
	await assert.rejects(confirm());
	assert.equal((await database.query.couponRedemptions.findMany()).length, 1);
	assert.equal((await database.query.productStockTransactions.findMany()).length, 1);
});

test("invalid gift selection rolls back stock, accounting, payments, and grant usage", async () => {
	organization.configuracao.preferencias.rastreamentoEstoque = true;
	await assert.rejects(confirm({ initialAttendanceStatus: "ENTREGUE", saleCouponGift: { itemChave: "removed", quantidade: 1 } }), /brinde/);
	assert.equal((await database.query.sales.findFirst())?.statusVenda, "ORCAMENTO");
	assert.equal((await database.query.products.findFirst())?.quantidade, 10);
	assert.equal((await database.query.couponGrants.findFirst())?.quantidadeDisponivel, 1);
	assert.equal((await database.query.accountingEntries.findMany()).length, 0);
	assert.equal((await database.query.financialTransactions.findMany()).length, 0);
	assert.equal((await database.query.couponRedemptions.findMany()).length, 0);
});

test("gift-only confirmation creates no payment and preserves zero accounting totals", async () => {
	await database.delete(schema.saleItemModifiers);
	await database.update(schema.saleItems).set({
		quantidade: 1,
		valorVendaUnitario: 10,
		valorVendaTotalBruto: 10,
		valorVendaTotalLiquido: 10,
		metadados: { itemChave: "cart-line", valorUnitarioBase: 10 },
	});
	await database.update(schema.sales).set({ valorTotal: 0 });
	await confirm({ salePayments: [] });
	assert.equal((await database.query.sales.findFirst())?.valorTotal, 0);
	assert.equal((await database.query.saleItems.findFirst())?.valorVendaTotalLiquido, 0);
	assert.equal((await database.query.financialTransactions.findMany()).length, 0);
	assert.equal((await database.query.accountingEntries.findFirst())?.valor, 0);
});

test("draft synchronization preserves gift identity across save, reorder, and reload", async () => {
	const row = await database.query.saleItems.findFirst({ with: { adicionais: true } });
	assert.ok(row);
	const cart = mapItemToCartItem(row);
	await database.transaction((tx) =>
		syncDraftItems({ tx: asTransaction(tx), orgId: "org", saleId: "sale", clienteId: "client", itens: [{ ...cart, id: row.id, chave: cart.tempId }] }),
	);
	await confirm();
	assert.equal((await database.query.saleItems.findFirst())?.valorTotalDesconto, 10);
});

test("updating a draft without its optional key preserves the existing gift identity", async () => {
	const row = await database.query.saleItems.findFirst({ with: { adicionais: true } });
	assert.ok(row);
	const cart = mapItemToCartItem(row);
	for (const chave of [undefined, null, "replacement-key"]) {
		await database.transaction((tx) =>
			syncDraftItems({ tx: asTransaction(tx), orgId: "org", saleId: "sale", clienteId: "client", itens: [{ ...cart, id: row.id, chave }] }),
		);
		const savedItem = await database.query.saleItems.findFirst();
		assert.ok(savedItem);
		assert.equal((savedItem.metadados as { itemChave: string }).itemChave, "cart-line");
	}
	await confirm();
	assert.equal((await database.query.saleItems.findFirst())?.valorTotalDesconto, 10);
});

test("sub-cent unit prices produce a zero-net gift with consistent persisted money totals", async () => {
	await database.delete(schema.saleItemModifiers);
	await database.update(schema.saleItems).set({
		quantidade: 1,
		valorVendaUnitario: 10.005,
		valorVendaTotalBruto: 10.005,
		valorVendaTotalLiquido: 10.005,
		metadados: { itemChave: "cart-line", valorUnitarioBase: 10.005, valorModificadores: 0, modificadores: [] },
	});
	await database.update(schema.sales).set({ valorTotal: 0, descontosTotal: 10.01 });
	await assert.rejects(confirm({ salePayments: [], saleCouponDeclaredDiscountValue: 10 }), /desatualizado/);
	await confirm({ salePayments: [], saleCouponDeclaredDiscountValue: 10.01 });
	const item = await database.query.saleItems.findFirst();
	assert.equal(item?.valorVendaTotalBruto, 10.01);
	assert.equal(item?.valorTotalDesconto, 10.01);
	assert.equal(item?.valorVendaTotalLiquido, 0);
	assert.equal(item?.valorVendaUnitario, 10.005);
	assert.equal((await database.query.financialTransactions.findMany()).length, 0);
});

test("sub-cent gift pricing leaves paid units and extras correct through confirmation and editing", async () => {
	await database.update(schema.saleItems).set({
		quantidade: 2,
		valorVendaUnitario: 12.005,
		valorVendaTotalBruto: 24.01,
		valorVendaTotalLiquido: 24.01,
		metadados: {
			itemChave: "cart-line",
			nome: "Bebida",
			codigo: "B",
			valorUnitarioBase: 10.005,
			valorModificadores: 2,
			modificadores: [{ opcaoId: "extra", nome: "Adicional", quantidade: 1, valorUnitario: 2, valorTotal: 2 }],
		},
	});
	await database.update(schema.sales).set({ valorTotal: 14.01, descontosTotal: 10 });
	await confirm({ salePayments: [{ metodo: "DINHEIRO", valor: 14.01, efetivacaoTipo: "IMEDIATA" }] });
	const row = await database.query.saleItems.findFirst({ with: { adicionais: true } });
	assert.ok(row);
	assert.equal(row.valorVendaTotalLiquido, 14.01);
	const cart = mapItemToCartItem(row);
	const normalized = normalizeCouponGiftItem({ ...cart, chave: cart.tempId }, { itemChave: "cart-line", quantidade: 1 });
	assert.equal(roundCouponGiftCurrency(normalized.valorTotalLiquido - 10), 14.01);
	await database.transaction((tx) =>
		editSale({
			tx: asTransaction(tx),
			input: {
				organization,
				saleId: "sale",
				saleAuthorId: "user",
				itens: [{ ...cart, id: row.id }],
				valorTotalEsperado: 14.01,
				emissaoFiscalAutomatica: false,
				pagamentos: [],
			},
		}),
	);
	assert.equal((await database.query.saleItems.findFirst())?.valorVendaTotalLiquido, 14.01);
	assert.equal((await database.query.sales.findFirst())?.valorTotal, 14.01);
});

test("confirmed-sale edits retain gift allocation; removing the coupon restores a paid item and grant", async () => {
	await confirm();
	const row = await database.query.saleItems.findFirst({ with: { adicionais: true } });
	assert.ok(row);
	const item = { ...mapItemToCartItem(row), id: row.id };
	const edit = (remove: boolean) =>
		database.transaction((tx) =>
			editSale({
				tx: asTransaction(tx),
				input: {
					organization,
					saleId: "sale",
					saleAuthorId: "user",
					itens: [item],
					valorTotalEsperado: 26,
					emissaoFiscalAutomatica: false,
					pagamentos: remove ? [{ metodo: "DINHEIRO", valor: 10, efetivacaoTipo: "PENDENTE" }] : [],
					removerCupom: remove,
				},
			}),
		);
	await edit(false);
	assert.equal((await database.query.saleItems.findFirst())?.valorTotalDesconto, 10);
	assert.equal((await database.query.sales.findFirst())?.valorTotal, 26);
	await edit(true);
	assert.equal((await database.query.saleItems.findFirst())?.valorTotalDesconto, 0);
	assert.equal((await database.query.saleItems.findFirst())?.valorVendaTotalLiquido, 36);
	assert.equal((await database.query.sales.findFirst())?.valorTotal, 36);
	assert.equal((await database.query.couponGrants.findFirst())?.quantidadeDisponivel, 1);
	assert.equal((await database.query.couponRedemptions.findFirst())?.status, "CANCELADO");
});

test("gift ledger cancellation restores an individual grant once", async () => {
	await confirm();
	const redemption = await database.query.couponRedemptions.findFirst();
	assert.ok(redemption);
	const cancel = () =>
		database.transaction((tx) => cancelCouponRedemption({ trx: asTransaction(tx), organizacaoId: "org", redemptionId: redemption.id }));
	await cancel();
	await assert.rejects(cancel());
	assert.equal((await database.query.couponGrants.findFirst())?.quantidadeDisponivel, 1);
});

test("a confirmed gift cannot silently become another allowed product at the same price", async () => {
	await confirm();
	await seed(schema.products, { id: "other", organizacaoId: "org", autorId: "user", nome: "Outra bebida", precoVenda: 10 });
	await seed(schema.couponTargets, { cupomId: "gift", organizacaoId: "org", papel: "BENEFICIADO", produtoId: "other" });
	const row = await database.query.saleItems.findFirst({ with: { adicionais: true } });
	assert.ok(row);
	await assert.rejects(
		database.transaction((tx) =>
			editSale({
				tx: asTransaction(tx),
				input: {
					organization,
					saleId: "sale",
					saleAuthorId: "user",
					itens: [{ ...mapItemToCartItem(row), id: row.id, produtoId: "other" }],
					valorTotalEsperado: 26,
					emissaoFiscalAutomatica: false,
					pagamentos: [],
				},
			}),
		),
		/produto do brinde não pode ser trocado/,
	);
	assert.equal((await database.query.saleItems.findFirst())?.produtoId, "drink");
});

test("a global gift's total limit rejects another sale without recording partial effects", async () => {
	await database.delete(schema.couponGrants);
	await database.update(schema.coupons).set({ escopo: "GLOBAL", limiteResgatesTotal: 1, limiteResgatesPorCliente: null });
	await confirm();
	await seed(schema.clients, { id: "client2", organizacaoId: "org", nome: "Outro cliente" });
	await seed(schema.sales, {
		id: "sale2",
		organizacaoId: "org",
		clienteId: "client2",
		idExterno: "sale2",
		valorTotal: 26,
		descontosTotal: 10,
		statusVenda: "ORCAMENTO",
		processamentoOrigem: "INTERNO",
	});
	await seed(schema.saleItems, {
		id: "item2",
		organizacaoId: "org",
		vendaId: "sale2",
		produtoId: "drink",
		quantidade: 3,
		valorVendaUnitario: 12,
		valorVendaTotalBruto: 36,
		valorVendaTotalLiquido: 36,
		metadados: { itemChave: "cart-line2", valorUnitarioBase: 10 },
	});
	await assert.rejects(confirm({ saleId: "sale2", saleCouponGift: { itemChave: "cart-line2", quantidade: 1 } }), /Limite total de resgates/);
	assert.equal((await database.query.couponRedemptions.findMany()).length, 1);
	assert.equal((await database.query.accountingEntries.findMany()).length, 1);
	assert.equal((await database.query.sales.findFirst({ where: eq(schema.sales.id, "sale2") }))?.statusVenda, "ORCAMENTO");
});

test("gift confirmation requires an explicit matching discount even when stored totals are correct", async () => {
	for (const declared of [undefined, null, 0, -10, Number.NaN]) {
		await assert.rejects(confirm({ saleCouponDeclaredDiscountValue: declared }), /desatualizado/);
	}
	assert.equal((await database.query.sales.findFirst())?.statusVenda, "ORCAMENTO");
	assert.equal((await database.query.saleItems.findFirst())?.valorTotalDesconto, 0);
	assert.equal((await database.query.couponGrants.findFirst())?.quantidadeDisponivel, 1);
	assert.equal((await database.query.accountingEntries.findMany()).length, 0);
	assert.equal((await database.query.financialTransactions.findMany()).length, 0);
	assert.equal((await database.query.couponRedemptions.findMany()).length, 0);
});

test("gift confirmation rejects inconsistent sale totals and discounts without committing any effects", async () => {
	organization.configuracao.preferencias.rastreamentoEstoque = true;
	for (const values of [
		{ valorTotal: 36, descontosTotal: 0 },
		{ valorTotal: 36, descontosTotal: 10 },
		{ valorTotal: 26, descontosTotal: null },
		{ valorTotal: 25.99, descontosTotal: 10 },
	]) {
		await database.update(schema.sales).set(values);
		await assert.rejects(
			confirm({ initialAttendanceStatus: "ENTREGUE", salePayments: [{ metodo: "DINHEIRO", valor: values.valorTotal, efetivacaoTipo: "IMEDIATA" }] }),
			/totais.*brinde/i,
		);
	}
	assert.equal((await database.query.sales.findFirst())?.statusVenda, "ORCAMENTO");
	assert.equal((await database.query.saleItems.findFirst())?.valorTotalDesconto, 0);
	assert.equal((await database.query.products.findFirst())?.quantidade, 10);
	assert.equal((await database.query.couponGrants.findFirst())?.quantidadeDisponivel, 1);
	for (const table of [schema.accountingEntries, schema.financialTransactions, schema.productStockTransactions, schema.couponRedemptions]) {
		assert.equal((await database.select().from(table)).length, 0);
	}
});

test("gift confirmation reconciles delivery, general discounts, and discounts on other items", async () => {
	await seed(schema.saleItems, {
		id: "paid-item",
		organizacaoId: "org",
		vendaId: "sale",
		produtoId: "drink",
		quantidade: 1,
		valorVendaUnitario: 20,
		valorVendaTotalBruto: 20,
		valorTotalDesconto: 3,
		valorVendaTotalLiquido: 17,
	});
	// 36 + 17 in item nets, minus gift 10 and general discount 2, plus delivery 5.
	await database.update(schema.sales).set({ valorTotal: 46, descontosTotal: 12, acrescimosTotal: 5 });
	await confirm({ salePayments: [{ metodo: "DINHEIRO", valor: 46, efetivacaoTipo: "IMEDIATA" }] });
	assert.equal((await database.query.sales.findFirst())?.valorTotal, 46);
	assert.equal((await database.query.accountingEntries.findFirst())?.valor, 46);
	assert.equal((await database.query.financialTransactions.findFirst())?.valor, 46);
	assert.equal((await database.query.saleItems.findFirst({ where: eq(schema.saleItems.id, "item") }))?.valorVendaTotalLiquido, 26);
	assert.equal((await database.query.saleItems.findFirst({ where: eq(schema.saleItems.id, "paid-item") }))?.valorVendaTotalLiquido, 17);
});

test("gift confirmation reconciles cashback redemption and accumulates only the paid sale total", async () => {
	await seed(schema.cashbackPrograms, { id: "program", organizacaoId: "org", acumuloTipo: "PERCENTUAL", acumuloValor: 10 });
	await seed(schema.cashbackProgramBalances, {
		id: "balance",
		organizacaoId: "org",
		clienteId: "client",
		programaId: "program",
		saldoValorDisponivel: 20,
		saldoValorAcumuladoTotal: 20,
	});
	await seed(schema.cashbackProgramTransactions, {
		id: "accumulation",
		organizacaoId: "org",
		clienteId: "client",
		programaId: "program",
		tipo: "ACÚMULO",
		status: "ATIVO",
		valor: 20,
		valorRestante: 20,
		saldoValorAnterior: 0,
		saldoValorPosterior: 20,
	});
	const input = { saleCashbackProgramId: "program", saleCashbackRedemptionValue: 5, accumulateCashback: true };
	// Omitting the cashback from stored discounts must roll its debit back too.
	await database.update(schema.sales).set({ valorTotal: 31, descontosTotal: 10, acrescimosTotal: 5 });
	await assert.rejects(confirm({ ...input, salePayments: [{ metodo: "DINHEIRO", valor: 31, efetivacaoTipo: "IMEDIATA" }] }), /totais.*brinde/i);
	assert.equal((await database.query.cashbackProgramBalances.findFirst())?.saldoValorDisponivel, 20);
	assert.equal((await database.query.cashbackProgramTransactions.findMany()).length, 1);
	await database.update(schema.sales).set({ valorTotal: 26, descontosTotal: 15 });
	await confirm(input);
	assert.equal((await database.query.accountingEntries.findFirst())?.valor, 26);
	assert.equal((await database.query.financialTransactions.findFirst())?.valor, 26);
	const transactions = await database.query.cashbackProgramTransactions.findMany();
	assert.equal(transactions.find((row) => row.tipo === "RESGATE")?.valor, -5);
	assert.equal(transactions.find((row) => row.tipo === "ACÚMULO" && row.id !== "accumulation")?.valor, 2.6);
});

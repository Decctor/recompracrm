import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import * as schema from "@/services/drizzle/schema";
import * as enums from "@/services/drizzle/schema/enums";
import type { DBTransaction } from "@/services/drizzle";
import { processSaleConfirmationInTransaction } from "@/lib/sales/sale-processing/process-sale-confirmation";
import { captureSaleCampaignEvent } from "./handlers/sale-capture";
import { processCampaignEventInTransaction } from "./process";
import { createCampaignEventSendGuard, getCampaignEventRecipientBlock } from "./send-guard";
import { publishPendingCampaignEvents } from "./queue";
import { recordCampaignEvent } from "./record";
import type { TRecordCampaignEventInput } from "@/schemas/campaign-events";
import type { TCampaignEventHandler } from "./types";
import { syncSales } from "@/lib/data-collecting-v2/sync-sales";
import { processIntegratedSaleConfirmation } from "@/lib/data-collecting-v2/process-integrated-sale-confirmation";
import { processDataCollectingV2Effects } from "@/lib/data-collecting-v2/effects";
import type { TPersistedSaleForEffects, TResolvedAuxiliaryEntities } from "@/lib/data-collecting-v2/types";
import type { TCanonicalSale, TCanonicalImportBatch } from "@/lib/data-connectors/types";
import { recordCampaignOccurrence } from "./occurrences";
import { recordPurchaseCampaignEvent } from "./purchases";
import { recordSegmentationCampaignEvents } from "@/lib/campaigns/engine/segmentation";

const snapshot = {
	compraValor: 100,
	comprasQuantidadeAnterior: 1,
	comprasQuantidadePosterior: 2,
	comprasValorAnterior: 50,
	comprasValorPosterior: 150,
	segmentacao: null,
	vendedorNome: "Vendedor",
	terminologia: "DINHEIRO" as const,
	cashbackAcumulado: 10,
	cashbackSaldoDisponivel: 10,
	cashbackTotalAcumulado: 10,
};

type TPurchaseInput = Extract<TRecordCampaignEventInput, { tipo: "COMPRA_CONFIRMADA" | "CASHBACK_ACUMULADO" }>;
function eventInput(overrides: Partial<TPurchaseInput> = {}): TPurchaseInput {
	return {
		organizacaoId: "org",
		clienteId: "client",
		fonteTipo: "VENDA",
		fonteId: "sale",
		tipo: "COMPRA_CONFIRMADA",
		versao: 1,
		chaveIdempotencia: "business-occurrence",
		dataEvento: new Date(),
		contexto: snapshot,
		...overrides,
	};
}

// Real PostgreSQL semantics, in memory. No environment file or production connection is used.
const pg = new PGlite();
const database = drizzle(pg, { schema });
const now = new Date();
const earlier = new Date(now.getTime() - 60_000);
let organization: schema.TOrganizationEntity;

// postgres.js returns rows directly from execute; PGlite wraps them in { rows }.
function asTransaction(tx: unknown): DBTransaction {
	return new Proxy(tx as DBTransaction, {
		get(target, property, receiver) {
			if (property === "execute")
				return async (...args: Parameters<DBTransaction["execute"]>) => {
					const result = (await target.execute(...args)) as unknown as { rows: unknown[] };
					return result.rows;
				};
			return Reflect.get(target, property, receiver);
		},
	});
}

async function seed(table: PgTable, overrides: Record<string, unknown>) {
	const values: Record<string, unknown> = { ...overrides };
	for (const [name, column] of Object.entries(table)) {
		if (!column || typeof column !== "object" || !("notNull" in column)) continue;
		if (!column.notNull || column.hasDefault || name in values) continue;
		values[name] =
			column.enumValues?.[0] ??
			(column.dataType === "number"
				? 0
				: column.dataType === "boolean"
					? false
					: column.dataType === "date"
						? earlier
						: column.dataType === "json"
							? {}
							: "fixture");
	}
	const [row] = await database.insert(table).values(values).returning();
	return row;
}

async function confirm(saleId = "sale", overrides: Record<string, unknown> = {}) {
	return database.transaction((tx) =>
		processSaleConfirmationInTransaction({
			tx: asTransaction(tx),
			input: {
				organization,
				saleId,
				saleAuthorId: null,
				salePayments: [{ metodo: "DINHEIRO", valor: 120, efetivacaoTipo: "IMEDIATA" }],
				accountingEntryDebitAccountId: "debit",
				accountingEntryCreditAccountId: "credit",
				...overrides,
			},
		}),
	);
}

async function campaign(id: string, overrides: Record<string, unknown> = {}) {
	await seed(schema.campaigns, {
		id,
		organizacaoId: "org",
		autorId: "user",
		whatsappTemplateId: "template",
		titulo: id,
		gatilhoTipo: "QUANTIDADE-TOTAL-COMPRAS",
		gatilhoQuantidadeTotalCompras: 2,
		permitirRecorrencia: false,
		execucaoAgendadaBloco: "14:00",
		dataInsercao: earlier,
		...overrides,
	});
}

async function processEvent(eventId?: string, at = new Date()) {
	const event = eventId ? { id: eventId } : await database.query.campaignEvents.findFirst();
	assert.ok(event);
	return database.transaction((tx) => processCampaignEventInTransaction({ tx: asTransaction(tx), eventId: event.id, now: at }));
}

before(async () => {
	const empty = generateDrizzleJson({});
	const current = generateDrizzleJson({ ...schema, ...enums });
	const statements = await generateMigration(empty, current);
	for (const statement of statements) {
		// Deployment owns these search extensions/functions; campaign/financial constraints stay real.
		if (statement.includes("trgm_ops") || statement.includes("unaccent_immutable")) continue;
		// Build the pre-change schema, then exercise the actual deployment migration.
		if (
			statement.includes('"ampmais_campaign_events"') ||
			statement.startsWith('CREATE TYPE "public"."campaign_event_') ||
			statement.includes('"idx_campaign_dispatch_recipients_campanha_evento_id"') ||
			statement.includes('"idx_campaign_dispatches_event"')
		)
			continue;
		await pg.exec(
			statement
				.split("\n")
				.filter((line) => !line.includes('"campanha_evento_id"'))
				.join("\n")
				.replace("'VENDA_INVALIDA', ", "")
				.replace("'EVENTO_EXPIRADO', ", "")
				.replace("'EVENTO_INVALIDO', ", ""),
		);
	}
	await pg.exec(await readFile("drizzle/0124_campaign_events.sql", "utf8"));
});

beforeEach(async () => {
	delete process.env.CAMPAIGN_EVENTS_ORGANIZATIONS;
	const tableNames = (Object.values(schema) as unknown[])
		.filter((value): value is PgTable => !!value && typeof value === "object" && Symbol.for("drizzle:Name") in value)
		.map((table) => `"${getTableConfig(table).name}"`);
	await pg.exec(`TRUNCATE ${[...new Set(tableNames)].join(", ")} CASCADE`);
	process.env.CAMPAIGN_EVENTS_ENABLED = "true";
	await seed(schema.users, { id: "user", email: "test@example.invalid" });
	organization = (await seed(schema.organizations, {
		id: "org",
		autorId: "user",
		configuracao: { preferencias: { rastreamentoEstoque: false }, defaults: { pagamentos: {} } },
		pagamentoProvedor: "LOCAL",
	})) as schema.TOrganizationEntity;
	await seed(schema.clients, {
		id: "client",
		organizacaoId: "org",
		nome: "Cliente",
		telefone: "5511999999999",
		analiseRFMTitulo: "PROMISSORES",
		metadataTotalCompras: 99,
		metadataValorTotalCompras: 999,
	});
	await seed(schema.accountsCharts, { id: "debit", organizacaoId: "org", natureza: "ATIVO" });
	await seed(schema.accountsCharts, { id: "credit", organizacaoId: "org", natureza: "RECEITA" });
	await seed(schema.messageTemplates, { id: "template", organizacaoId: "org", autorId: "user" });
	await seed(schema.sales, {
		id: "previous",
		organizacaoId: "org",
		clienteId: "client",
		idExterno: "previous",
		valorTotal: 50,
		statusVenda: "CONFIRMADA",
		dataVenda: earlier,
	});
	await seed(schema.sales, {
		id: "sale",
		organizacaoId: "org",
		clienteId: "client",
		idExterno: "sale",
		valorTotal: 100,
		statusVenda: "ORCAMENTO",
		processamentoOrigem: "INTERNO",
	});
	await seed(schema.cashbackPrograms, { id: "program", organizacaoId: "org", acumuloTipo: "PERCENTUAL", acumuloValor: 10 });
});

after(async () => {
	delete process.env.CAMPAIGN_EVENTS_ENABLED;
	delete process.env.CAMPAIGN_EVENTS_ORGANIZATIONS;
	await pg.close();
});

test("confirmation preserves payments, change, accounting and cashback while recording live purchase facts", async () => {
	const result = await confirm();
	assert.equal(result.troco, 20);
	assert.equal(result.cashbackAcumulo?.accumulatedValue, 10);
	const payments = await database.query.financialTransactions.findMany();
	assert.deepEqual(payments.map((p) => [p.tipo, p.valor]).sort(), [
		["ENTRADA", 120],
		["SAIDA", 20],
	]);
	const entries = await database.query.accountingEntries.findMany();
	assert.equal(entries.length, 1);
	assert.equal(entries[0].valor, 100);
	const lines = await database.query.accountingEntryLines.findMany();
	assert.deepEqual(lines.map((l) => [l.natureza, l.valor]).sort(), [
		["CREDITO", 100],
		["DEBITO", 100],
	]);
	assert.equal((await database.query.cashbackProgramTransactions.findMany()).length, 1);
	const event = await database.query.campaignEvents.findFirst();
	assert.equal(event?.contexto.comprasQuantidadeAnterior, 1);
	assert.equal(event?.contexto.comprasQuantidadePosterior, 2);
	assert.equal(event?.contexto.comprasValorPosterior, 150);
	assert.equal(event?.contexto.cashbackSaldoDisponivel, 10);
	assert.equal((await database.query.clients.findFirst())?.metadataTotalCompras, 99);
	await processEvent();
	// Internal confirmation never owned the client purchase cache (the nightly cron does); the worker must not start owning it.
	assert.equal((await database.query.clients.findFirst())?.metadataTotalCompras, 99);
});

test("outer rollback removes confirmation, accounting, payments, cashback and event together", async () => {
	await assert.rejects(
		database.transaction(async (tx) => {
			await processSaleConfirmationInTransaction({
				tx: asTransaction(tx),
				input: {
					organization,
					saleId: "sale",
					saleAuthorId: null,
					salePayments: [{ metodo: "DINHEIRO", valor: 100, efetivacaoTipo: "IMEDIATA" }],
					accountingEntryDebitAccountId: "debit",
					accountingEntryCreditAccountId: "credit",
				},
			});
			throw new Error("caller failure");
		}),
		/caller failure/,
	);
	assert.equal((await database.query.sales.findFirst({ where: eq(schema.sales.id, "sale") }))?.statusVenda, "ORCAMENTO");
	for (const table of [schema.campaignEvents, schema.accountingEntries, schema.financialTransactions, schema.cashbackProgramTransactions])
		assert.equal((await database.select().from(table)).length, 0);
	assert.equal((await database.query.clients.findFirst())?.metadataTotalCompras, 99);
});

test("duplicate confirmation and repeated worker delivery create one dispatch and no extra financial effects", async () => {
	await campaign("second");
	await confirm();
	await assert.rejects(confirm());
	await processEvent();
	await processEvent();
	assert.equal((await database.query.campaignDispatches.findMany()).length, 1);
	assert.equal((await database.query.campaignDispatchRecipients.findMany()).length, 1);
	assert.equal((await database.query.cashbackProgramTransactions.findMany()).length, 1);
	assert.equal((await database.query.interactions.findMany()).length, 0);
});

test("third purchase uses a fresh live total and a distinct threshold", async () => {
	await campaign("second");
	await campaign("third", { gatilhoQuantidadeTotalCompras: 3 });
	await confirm();
	await seed(schema.sales, {
		id: "third-sale",
		organizacaoId: "org",
		clienteId: "client",
		idExterno: "third",
		valorTotal: 100,
		statusVenda: "ORCAMENTO",
	});
	await confirm("third-sale");
	const events = await database.query.campaignEvents.findMany({ orderBy: schema.campaignEvents.dataEvento });
	assert.deepEqual(
		events.map((e) => e.contexto.comprasQuantidadePosterior),
		[2, 3],
	);
	await assert.rejects(processEvent(events[1].id), /Evento anterior pendente/);
	await processEvent(events[0].id);
	await processEvent(events[1].id);
	assert.deepEqual((await database.query.campaignDispatches.findMany()).map((d) => d.campanhaId).sort(), ["second", "third"]);
});

test("worker errors roll back dispatches and leave the durable event pending for recovery", async () => {
	await campaign("second");
	await confirm();
	const event = await database.query.campaignEvents.findFirst();
	assert.ok(event);
	await assert.rejects(
		database.transaction(async (tx) => {
			await processCampaignEventInTransaction({ tx: asTransaction(tx), eventId: event.id });
			throw new Error("worker crash");
		}),
		/worker crash/,
	);
	assert.equal((await database.query.campaignDispatches.findMany()).length, 0);
	assert.equal((await database.query.campaignEvents.findFirst())?.status, "PENDENTE");
	assert.equal((await database.query.sales.findFirst({ where: eq(schema.sales.id, "sale") }))?.statusVenda, "CONFIRMADA");
	await processEvent();
	assert.equal((await database.query.campaignDispatches.findMany()).length, 1);
});

test("delays use confirmation time and sending expires relative to the configured due time", async () => {
	await campaign("second", { execucaoAgendadaValor: 5, execucaoAgendadaMedida: "DIAS" });
	await confirm();
	await processEvent(undefined, new Date(Date.now() + 3_600_000));
	const dispatch = await database.query.campaignDispatches.findFirst();
	const recipient = await database.query.campaignDispatchRecipients.findFirst();
	assert.ok(dispatch?.dataAgendada && recipient);
	assert.ok(dispatch.dataAgendada.getTime() - Date.now() > 4 * 86_400_000);
	const args = { executor: database as unknown as DBTransaction, recipient, scheduledAt: dispatch.dataAgendada };
	assert.equal(await getCampaignEventRecipientBlock({ ...args, now: dispatch.dataAgendada }), null);
	assert.equal(
		(await getCampaignEventRecipientBlock({ ...args, now: new Date(dispatch.dataAgendada.getTime() + 86_400_001) }))?.motivo,
		"EVENTO_EXPIRADO",
	);
});

test("frozen segmentation survives a later RFM change; canceled and reassigned sales cannot send", async () => {
	await campaign("second");
	await seed(schema.campaignSegmentations, { campanhaId: "second", organizacaoId: "org", segmentacao: "PROMISSORES" });
	await confirm();
	await database.update(schema.clients).set({ analiseRFMTitulo: "PERDIDOS" });
	await processEvent();
	const recipient = await database.query.campaignDispatchRecipients.findFirst();
	assert.ok(recipient);
	await database.update(schema.sales).set({ statusVenda: "CANCELADA" }).where(eq(schema.sales.id, "sale"));
	assert.equal(
		(await getCampaignEventRecipientBlock({ executor: database as unknown as DBTransaction, recipient, scheduledAt: null }))?.motivo,
		"VENDA_INVALIDA",
	);
	await database.update(schema.sales).set({ statusVenda: "CONFIRMADA", clienteId: null }).where(eq(schema.sales.id, "sale"));
	assert.equal(
		(await getCampaignEventRecipientBlock({ executor: database as unknown as DBTransaction, recipient, scheduledAt: null }))?.motivo,
		"VENDA_INVALIDA",
	);
});

test("paused communication and inactive campaigns prevent dispatch creation", async () => {
	await campaign("inactive", { ativo: false });
	await campaign("paused");
	await confirm();
	await database.update(schema.clients).set({ comunicacaoPausadaAte: new Date(Date.now() + 86_400_000) });
	await processEvent();
	assert.equal((await database.query.campaignDispatches.findMany()).length, 0);
});

test("events older than a day are discarded rather than backfilled", async () => {
	await campaign("second");
	await confirm();
	await processEvent(undefined, new Date(Date.now() + 86_400_001));
	assert.equal((await database.query.campaignEvents.findFirst())?.status, "DESCARTADA");
	assert.equal((await database.query.campaignDispatches.findMany()).length, 0);
});

test("anonymous sales and disabled capture keep confirmation functional without events", async () => {
	await database.update(schema.sales).set({ clienteId: null }).where(eq(schema.sales.id, "sale"));
	await confirm();
	assert.equal((await database.query.campaignEvents.findMany()).length, 0);
	process.env.CAMPAIGN_EVENTS_ENABLED = "false";
	await seed(schema.sales, {
		id: "disabled",
		organizacaoId: "org",
		clienteId: "client",
		idExterno: "disabled",
		valorTotal: 100,
		statusVenda: "ORCAMENTO",
	});
	await confirm("disabled");
	assert.equal((await database.query.campaignEvents.findMany()).length, 0);
});

test("late cashback captures only a cashback event, never repeats purchase triggers or accrual", async () => {
	await campaign("purchase");
	await campaign("cashback", { gatilhoTipo: "CASHBACK-ACUMULADO", gatilhoQuantidadeTotalCompras: null });
	await confirm(undefined, { accumulateCashback: false });
	const { accumulateCashbackForClient } = await import("@/lib/cashback/accumulation");
	await database.transaction(async (tx) => {
		const program = await tx.query.cashbackPrograms.findFirst();
		assert.ok(program);
		const accumulation = await accumulateCashbackForClient({
			tx: asTransaction(tx),
			orgId: "org",
			clientId: "client",
			saleId: "sale",
			saleValue: 100,
			program,
		});
		await captureSaleCampaignEvent({
			tx: asTransaction(tx),
			organizationId: "org",
			saleId: "sale",
			clientId: "client",
			occurredAt: now,
			accumulation,
			type: "CASHBACK_ACUMULADO",
		});
		await captureSaleCampaignEvent({
			tx: asTransaction(tx),
			organizationId: "org",
			saleId: "sale",
			clientId: "client",
			occurredAt: now,
			accumulation,
			type: "CASHBACK_ACUMULADO",
		});
	});
	const event = await database.query.campaignEvents.findFirst({ where: eq(schema.campaignEvents.tipo, "CASHBACK_ACUMULADO") });
	assert.ok(event);
	const purchase = await database.query.campaignEvents.findFirst({ where: eq(schema.campaignEvents.tipo, "COMPRA_CONFIRMADA") });
	assert.ok(purchase);
	await processEvent(purchase.id);
	await database.delete(schema.campaignDispatches).where(eq(schema.campaignDispatches.campanhaId, "purchase"));
	await processEvent(event.id);
	assert.deepEqual(
		(await database.query.campaignDispatches.findMany()).map((d) => d.campanhaId),
		["cashback"],
	);
	assert.equal((await database.query.cashbackProgramTransactions.findMany()).length, 1);
});

test("queue publication failure preserves the event and a later recovery sweep publishes it", async () => {
	await confirm();
	const args = { executor: database as unknown as DBTransaction, enabled: true, now: new Date(Date.now() + 1000) };
	await publishPendingCampaignEvents({
		...args,
		publish: async () => {
			throw new Error("queue unavailable");
		},
	});
	const event = await database.query.campaignEvents.findFirst();
	assert.ok(event);
	assert.equal(event.status, "PENDENTE");
	assert.match(event.erro ?? "", /queue unavailable/);
	const published: string[] = [];
	await publishPendingCampaignEvents({
		...args,
		now: new Date(args.now.getTime() + 60_001),
		publish: async (id) => {
			published.push(id);
		},
	});
	assert.deepEqual(published, [event.id]);
});

test("cancellation and reassignment before event processing discard the event", async () => {
	await campaign("second");
	await confirm();
	await database.update(schema.sales).set({ clienteId: null }).where(eq(schema.sales.id, "sale"));
	await processEvent();
	assert.equal((await database.query.campaignEvents.findFirst())?.status, "DESCARTADA");
	assert.equal((await database.query.campaignDispatches.findMany()).length, 0);
});

test("first purchase takes priority over new purchase", async () => {
	await database.delete(schema.sales).where(eq(schema.sales.id, "previous"));
	await campaign("first", { gatilhoTipo: "PRIMEIRA-COMPRA", gatilhoQuantidadeTotalCompras: null });
	await campaign("new", { gatilhoTipo: "NOVA-COMPRA", gatilhoQuantidadeTotalCompras: null });
	await confirm();
	await processEvent();
	assert.deepEqual(
		(await database.query.campaignDispatches.findMany()).map((d) => d.campanhaId),
		["first"],
	);
});

test("stock deduction and coupon redemption are unchanged by event capture", async () => {
	organization.configuracao.preferencias.rastreamentoEstoque = true;
	await seed(schema.products, {
		id: "product",
		organizacaoId: "org",
		nome: "Gelato",
		quantidade: 10,
		precoVenda: 50,
		autorId: "user",
		rastreamentoEstoqueAtivo: true,
	});
	await seed(schema.saleItems, { id: "item", organizacaoId: "org", vendaId: "sale", produtoId: "product", quantidade: 2, valorVendaTotalBruto: 100 });
	await seed(schema.coupons, {
		id: "coupon",
		organizacaoId: "org",
		codigo: "TESTE",
		beneficioTipo: "DESCONTO_FIXO",
		beneficioValor: 10,
		validacaoModo: "MANUAL",
		condicoesTexto: "Teste",
	});
	await confirm(undefined, { initialAttendanceStatus: "ENTREGUE", saleCouponId: "coupon", saleCouponDeclaredDiscountValue: 10 });
	const stock = await database.query.productStockTransactions.findMany();
	assert.equal(stock.length, 1);
	assert.equal(stock[0].quantidade, 2);
	assert.equal((await database.query.products.findFirst())?.quantidade, 8);
	const redemptions = await database.query.couponRedemptions.findMany();
	assert.equal(redemptions.length, 1);
	assert.equal(redemptions[0].valorDesconto, 10);
	assert.equal((await database.query.campaignEvents.findMany()).length, 1);
});

test("cashback redemption and rewards preserve ledger amounts in the frozen event", async () => {
	await database.update(schema.cashbackPrograms).set({ modalidadeRecompensasPermitida: true });
	await seed(schema.cashbackProgramBalances, {
		id: "balance",
		organizacaoId: "org",
		clienteId: "client",
		programaId: "program",
		saldoValorDisponivel: 50,
		saldoValorAcumuladoTotal: 50,
	});
	await seed(schema.cashbackProgramTransactions, {
		id: "old-cashback",
		organizacaoId: "org",
		clienteId: "client",
		programaId: "program",
		status: "ATIVO",
		tipo: "ACÚMULO",
		valor: 50,
		valorRestante: 50,
		saldoValorAnterior: 0,
		saldoValorPosterior: 50,
		expiracaoData: new Date(Date.now() + 86_400_000),
	});
	await seed(schema.cashbackProgramPrizes, { id: "reward", organizacaoId: "org", programaId: "program", valor: 5 });
	await confirm(undefined, { saleRewardRedemptions: [{ recompensaId: "reward", programaId: "program", valorResgate: 5, quantidade: 2 }] });
	const transactions = await database.query.cashbackProgramTransactions.findMany({ where: eq(schema.cashbackProgramTransactions.vendaId, "sale") });
	assert.deepEqual(transactions.map((row) => [row.tipo, row.valor]).sort(), [
		["ACÚMULO", 10],
		["RESGATE", -10],
	]);
	const event = await database.query.campaignEvents.findFirst();
	assert.equal(event?.contexto.cashbackAcumulado, 10);
	assert.equal(event?.contexto.cashbackSaldoDisponivel, 50);
});

test("two deliveries racing for one event cannot duplicate its dispatch", async () => {
	await campaign("second");
	await confirm();
	const event = await database.query.campaignEvents.findFirst();
	assert.ok(event);
	await Promise.all([processEvent(event.id), processEvent(event.id)]);
	assert.equal((await database.query.campaignDispatches.findMany()).length, 1);
	assert.equal((await database.query.campaignDispatchRecipients.findMany()).length, 1);
});

test("organization rollout only captures opted-in organizations and zero-value sales produce no event", async () => {
	process.env.CAMPAIGN_EVENTS_ORGANIZATIONS = "another-org";
	await confirm();
	assert.equal((await database.query.campaignEvents.findMany()).length, 0);
	delete process.env.CAMPAIGN_EVENTS_ORGANIZATIONS;
	await seed(schema.sales, {
		id: "free-sale",
		organizacaoId: "org",
		clienteId: "client",
		idExterno: "free",
		valorTotal: 0,
		statusVenda: "CONFIRMADA",
	});
	await database.transaction((tx) =>
		captureSaleCampaignEvent({
			tx: asTransaction(tx),
			organizationId: "org",
			saleId: "free-sale",
			clientId: "client",
			occurredAt: now,
			accumulation: null,
		}),
	);
	assert.equal((await database.query.campaignEvents.findMany()).length, 0);
});

test("waiting recipients enforce non-recurring frequency and audience filters still apply", async () => {
	await campaign("second");
	await confirm();
	const event = await database.query.campaignEvents.findFirst();
	assert.ok(event);
	await processEvent();
	await database.insert(schema.campaignEvents).values({ ...event, id: "another-event", chaveIdempotencia: "another-key", status: "PENDENTE" });
	await processEvent("another-event");
	assert.equal((await database.query.campaignDispatches.findMany()).length, 1);
	await campaign("filtered", {
		gatilhoTipo: "NOVA-COMPRA",
		filtros: { tipo: "GRUPO", operador: "AND", itens: [{ tipo: "CONDICAO", condicao: { tipo: "LOCALIZAÇÃO", configuracao: { estados: ["SP"] } } }] },
	});
	await database.insert(schema.campaignEvents).values({ ...event, id: "filtered-event", chaveIdempotencia: "filtered-key", status: "PENDENTE" });
	await processEvent("filtered-event");
	assert.equal((await database.query.campaignDispatches.findMany()).length, 1);
});

test("a durable event write failure rolls back the sale instead of leaving an untracked confirmation", async () => {
	await pg.exec(`CREATE FUNCTION fail_campaign_event_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'event storage unavailable'; END $$;
		CREATE TRIGGER fail_campaign_event_test BEFORE INSERT ON ampmais_campaign_events FOR EACH ROW EXECUTE FUNCTION fail_campaign_event_test();`);
	try {
		await assert.rejects(confirm());
		assert.equal((await database.query.sales.findFirst({ where: eq(schema.sales.id, "sale") }))?.statusVenda, "ORCAMENTO");
		for (const table of [schema.campaignEvents, schema.accountingEntries, schema.financialTransactions, schema.cashbackProgramTransactions])
			assert.equal((await database.select().from(table)).length, 0);
	} finally {
		await pg.exec("DROP TRIGGER fail_campaign_event_test ON ampmais_campaign_events; DROP FUNCTION fail_campaign_event_test();");
	}
});

test("recording deduplicates by organization and event type and keeps the first snapshot", async () => {
	const record = (input: TRecordCampaignEventInput) => database.transaction((tx) => recordCampaignEvent({ tx: asTransaction(tx), input }));
	const id = await record(eventInput());
	assert.ok(id);
	assert.equal(await record(eventInput({ contexto: { ...snapshot, compraValor: 999 } })), null);
	assert.equal((await database.query.campaignEvents.findFirst())?.contexto.compraValor, 100);
	assert.ok(await record(eventInput({ tipo: "CASHBACK_ACUMULADO" })));
	await seed(schema.organizations, { id: "another-org", autorId: "user", slug: "another-org" });
	await seed(schema.clients, { id: "another-client", organizacaoId: "another-org" });
	assert.ok(await record(eventInput({ organizacaoId: "another-org", clienteId: "another-client" })));
	assert.equal((await database.query.campaignEvents.findMany()).length, 3);
});

test("recording validates envelopes and payloads and respects the caller's rollback", async () => {
	await assert.rejects(
		database.transaction(async (tx) => {
			await recordCampaignEvent({ tx: asTransaction(tx), input: eventInput() });
			throw new Error("producer failed");
		}),
		/producer failed/,
	);
	assert.equal((await database.query.campaignEvents.findMany()).length, 0);
	await assert.rejects(database.transaction((tx) => recordCampaignEvent({ tx: asTransaction(tx), input: eventInput({ chaveIdempotencia: "" }) })));
	await assert.rejects(
		database.transaction((tx) => recordCampaignEvent({ tx: asTransaction(tx), input: eventInput({ contexto: { ...snapshot, compraValor: NaN } }) })),
	);
	assert.equal((await database.query.campaignEvents.findMany()).length, 0);
});

test("the lifecycle processes a non-sale source and commits handler effects exactly once", async () => {
	const [event] = await database
		.insert(schema.campaignEvents)
		.values({
			organizacaoId: "org",
			clienteId: "client",
			fonteTipo: "CLIENTE",
			fonteId: "client",
			tipo: "CLIENTE_CADASTRADO",
			versao: 1,
			chaveIdempotencia: "registration",
			dataEvento: new Date(),
			contexto: { nome: "registered" },
		})
		.returning();
	let fail = true;
	let calls = 0;
	const handler: TCampaignEventHandler = {
		parse: (value) => value,
		process: async ({ tx, event }) => {
			calls++;
			await tx
				.update(schema.clients)
				.set({ nome: "registered" })
				.where(eq(schema.clients.id, event.clienteId ?? ""));
			if (fail) throw new Error("handler failed");
			return { dispatches: [] };
		},
		validateRecipient: async () => null,
	};
	const process = () =>
		database.transaction((tx) => processCampaignEventInTransaction({ tx: asTransaction(tx), eventId: event.id, resolveHandler: () => handler }));
	await assert.rejects(process(), /handler failed/);
	assert.notEqual((await database.query.clients.findFirst({ where: eq(schema.clients.id, "client") }))?.nome, "registered");
	assert.equal((await database.query.campaignEvents.findFirst())?.status, "PENDENTE");
	fail = false;
	await process();
	await process();
	assert.equal(calls, 2);
	assert.equal((await database.query.clients.findFirst({ where: eq(schema.clients.id, "client") }))?.nome, "registered");
	assert.equal((await database.query.campaignEvents.findFirst())?.status, "PROCESSADA");
});

test("unsupported versions and malformed payloads remain pending without creating dispatches", async () => {
	await confirm();
	const event = await database.query.campaignEvents.findFirst();
	assert.ok(event);
	await database.update(schema.campaignEvents).set({ versao: 99 }).where(eq(schema.campaignEvents.id, event.id));
	await assert.rejects(processEvent(event.id), /sem handler/);
	await database
		.update(schema.campaignEvents)
		.set({ versao: 1, contexto: { compraValor: 100 } })
		.where(eq(schema.campaignEvents.id, event.id));
	await assert.rejects(processEvent(event.id));
	assert.equal((await database.query.campaignEvents.findFirst())?.status, "PENDENTE");
	assert.equal((await database.query.campaignDispatches.findMany()).length, 0);
});

test("generic recipient validation rejects invalid events and leaves legacy recipients alone", async () => {
	const recipient = { campanhaEventoId: null, organizacaoId: "org", clienteId: "client", vendaId: null };
	assert.equal(await getCampaignEventRecipientBlock({ executor: database as never, recipient, scheduledAt: null }), null);
	assert.equal(
		(await getCampaignEventRecipientBlock({ executor: database as never, recipient: { ...recipient, campanhaEventoId: "missing" }, scheduledAt: null }))
			?.motivo,
		"EVENTO_INVALIDO",
	);
	await confirm();
	const event = await database.query.campaignEvents.findFirst();
	assert.ok(event);
	await processEvent(event.id);
	await database.update(schema.campaignEvents).set({ versao: 99 }).where(eq(schema.campaignEvents.id, event.id));
	assert.equal(
		(
			await getCampaignEventRecipientBlock({
				executor: database as never,
				recipient: { ...recipient, campanhaEventoId: event.id, vendaId: "sale" },
				scheduledAt: null,
			})
		)?.motivo,
		"EVENTO_INVALIDO",
	);
});

function importedSale(overrides: Partial<TPersistedSaleForEffects> = {}): TPersistedSaleForEffects {
	const canonical: TCanonicalSale = {
		sourceSaleId: "sale",
		totalValue: 100,
		totalCost: 0,
		totalDiscount: 0,
		totalSurcharge: 0,
		sellerName: "seller",
		channel: "integration",
		deliveryMode: "PRESENCIAL",
		partnerIdentifier: null,
		key: "sale",
		document: "sale",
		model: "DV",
		movement: "RECEITAS",
		nature: "SN01",
		series: "0",
		statusText: "00",
		type: "sale",
		occurredAt: new Date(),
		client: null,
		seller: null,
		partner: null,
		items: [],
		isValidSale: true,
		isCanceled: false,
	};
	return {
		id: "sale",
		sourceSaleId: "sale",
		clientId: "client",
		partnerClientId: null,
		sale: canonical,
		isNewSale: false,
		isNewClient: false,
		isFirstPurchase: false,
		previouslyValid: false,
		becameValid: true,
		nowCanceled: false,
		skipped: false,
		managedFiscalEmissionCandidate: false,
		previousTotalPurchaseCount: 1,
		newTotalPurchaseCount: 2,
		previousTotalPurchaseValue: 50,
		newTotalPurchaseValue: 150,
		...overrides,
	};
}
async function importEffects(sales = [importedSale()], publicationAllowed = true, processCampaigns = true) {
	return database.transaction((tx) =>
		processDataCollectingV2Effects({
			tx: asTransaction(tx),
			organizationId: "org",
			persistedSales: sales,
			options: { processCashback: true, processCampaigns, processConversionAttribution: false },
			publicationAllowed,
		}),
	);
}

test("integration capture keeps buyer and partner cashback in ingestion and deduplicates reimports", async () => {
	await campaign("quantity");
	await database.update(schema.sales).set({ statusVenda: "CONFIRMADA", processamentoOrigem: "EXTERNO" }).where(eq(schema.sales.id, "sale"));
	await database
		.update(schema.cashbackPrograms)
		.set({ ativo: true, acumuloPermitirViaIntegracao: true, acumuloValorParceiro: 3 })
		.where(eq(schema.cashbackPrograms.id, "program"));
	await seed(schema.clients, { id: "partner", organizacaoId: "org" });
	const sale = importedSale({ partnerClientId: "partner" });
	const result = await importEffects([sale]);
	assert.equal(result.campaignEventsCapturedCount, 1);
	assert.equal(result.cashbackAccumulatedValue, 13);
	assert.equal((await database.query.cashbackProgramTransactions.findMany()).length, 2);
	const before = await database.query.cashbackProgramTransactions.findMany();
	await processEvent();
	assert.equal((await database.query.campaignDispatchRecipients.findMany()).length, 1);
	assert.deepEqual(await database.query.cashbackProgramTransactions.findMany(), before);
	assert.equal((await database.query.accountingEntries.findMany()).length, 0);
	assert.equal((await importEffects([importedSale({ skipped: true, becameValid: false })])).campaignEventsCapturedCount, 0);
	assert.equal((await database.query.campaignEvents.findMany()).length, 1);
});

test("integration campaign processing can be disabled independently of cashback", async () => {
	await database
		.update(schema.cashbackPrograms)
		.set({ ativo: true, acumuloPermitirViaIntegracao: true })
		.where(eq(schema.cashbackPrograms.id, "program"));
	const result = await importEffects([importedSale()], true, false);
	assert.equal(result.cashbackAccumulatedValue, 10);
	assert.equal(result.campaignEventsCapturedCount, 0);
});

test("manual integration publication permission survives recovery and direct worker delivery", async () => {
	await campaign("quantity");
	await importEffects([importedSale()], false);
	const event = await database.query.campaignEvents.findFirst();
	assert.ok(event);
	assert.equal(event.publicacaoPermitida, false);
	// Stored already discarded: the key still blocks a later capture, but the row never enters the pending index.
	assert.equal(event.status, "DESCARTADA");
	const published: string[] = [];
	await publishPendingCampaignEvents({
		executor: asTransaction(database),
		publish: async (id) => {
			published.push(id);
		},
	});
	assert.deepEqual(published, []);
	await processEvent(event.id);
	assert.equal((await database.query.campaignDispatches.findMany()).length, 0);
	assert.equal((await database.query.campaignEvents.findFirst())?.status, "DESCARTADA");
	assert.equal(
		await database.transaction((tx) => recordCampaignEvent({ tx: asTransaction(tx), input: eventInput({ chaveIdempotencia: "compra:sale" }) })),
		null,
	);
});

test("import capture preserves per-sale threshold facts and original purchase date", async () => {
	const old = new Date(Date.now() - 7 * 86400000);
	const sale = importedSale();
	sale.sale.occurredAt = old;
	await importEffects([sale]);
	const event = await database.query.campaignEvents.findFirst();
	assert.ok(event);
	const context = event.contexto as typeof snapshot & { dataCompra: string };
	assert.equal(context.comprasQuantidadeAnterior, 1);
	assert.equal(context.comprasQuantidadePosterior, 2);
	assert.equal(context.comprasValorPosterior, 150);
	assert.equal(context.dataCompra, old.toISOString());
	assert.ok(event.dataEvento.getTime() > old.getTime());
});

for (const trigger of ["USO-UNICO", "RECORRENTE", "PROMOCAO-PRODUTOS", "PESQUISA"] as const) {
	test(`scheduled event contract expands ${trigger} exactly once`, async () => {
		await campaign("scheduled", { gatilhoTipo: trigger, ativo: true });
		const input = {
			organizacaoId: "org",
			clienteId: null,
			fonteTipo: "CAMPANHA",
			fonteId: "scheduled",
			tipo: "CAMPANHA_AGENDADA" as const,
			versao: 1 as const,
			chaveIdempotencia: "scheduled:window",
			dataEvento: new Date(),
			contexto: { campanhaId: "scheduled", gatilho: trigger, janelaReferencia: "window", dataAgendada: new Date().toISOString() },
		};
		const id = await database.transaction((tx) => recordCampaignEvent({ tx: asTransaction(tx), input }));
		assert.ok(id);
		assert.equal(await database.transaction((tx) => recordCampaignEvent({ tx: asTransaction(tx), input })), null);
		const result = await processEvent(id);
		assert.equal(result[0]?.expand, true);
		await processEvent(id);
		const dispatches = await database.query.campaignDispatches.findMany();
		assert.equal(dispatches.length, 1);
		assert.equal(dispatches[0].campanhaEventoId, id);
		assert.equal(dispatches[0].status, "RESOLVENDO");
	});
}

for (const trigger of ["ANIVERSARIO_CLIENTE", "PIOR-DIA-VENDAS"] as const) {
	test(`campaign-wide ${trigger} capture keeps its window, delay and send validity`, async () => {
		await campaign("notification", { gatilhoTipo: trigger, ativo: true });
		const current = await database.query.campaigns.findFirst({ where: eq(schema.campaigns.id, "notification") });
		assert.ok(current);
		const due = new Date(Date.now() + 5 * 86400000);
		const capture = () =>
			database.transaction((tx) =>
				recordCampaignOccurrence({
					tx: asTransaction(tx),
					organizationId: "org",
					campaign: current,
					janelaReferencia: "notification:window",
					recipients: [{ clienteId: "client" }],
					scheduledAt: due,
				}),
			);
		const { eventId } = await capture();
		assert.ok(eventId);
		assert.equal((await capture()).captured, false);
		assert.equal((await database.query.campaignEvents.findFirst())?.clienteId, null);
		await processEvent(eventId);
		const recipient = await database.query.campaignDispatchRecipients.findFirst();
		assert.ok(recipient);
		const dispatch = await database.query.campaignDispatches.findFirst();
		assert.equal(dispatch?.dataAgendada?.toISOString(), due.toISOString());
		assert.equal(await getCampaignEventRecipientBlock({ executor: asTransaction(database), recipient, scheduledAt: due, now: due }), null);
		assert.equal(
			(
				await getCampaignEventRecipientBlock({
					executor: asTransaction(database),
					recipient,
					scheduledAt: due,
					now: new Date(due.getTime() + 25 * 3600000),
				})
			)?.motivo,
			"EVENTO_EXPIRADO",
		);
	});
}

test("expiry events invalidate recipients after the referenced credit is consumed", async () => {
	await campaign("expiry", { gatilhoTipo: "CASHBACK-EXPIRANDO", ativo: true });
	const current = await database.query.campaigns.findFirst({ where: eq(schema.campaigns.id, "expiry") });
	assert.ok(current);
	await seed(schema.cashbackProgramTransactions, {
		id: "credit",
		organizacaoId: "org",
		clienteId: "client",
		programaId: "program",
		tipo: "AC\u00daMULO".replace("\u00da", "\u00da"),
		status: "ATIVO",
		valor: 50,
		valorRestante: 50,
		expiracaoData: new Date(Date.now() + 2 * 86400000),
	});
	const { eventId } = await database.transaction((tx) =>
		recordCampaignOccurrence({
			tx: asTransaction(tx),
			organizationId: "org",
			campaign: current,
			janelaReferencia: "expiry:window",
			scheduledAt: null,
			recipients: [{ clienteId: "client" }],
			validity: { expiracaoAte: new Date(Date.now() + 4 * 86400000).toISOString(), expiracaoValorMinimo: 10 },
		}),
	);
	assert.ok(eventId);
	await processEvent(eventId);
	const recipient = await database.query.campaignDispatchRecipients.findFirst();
	assert.ok(recipient);
	assert.equal(await getCampaignEventRecipientBlock({ executor: asTransaction(database), recipient, scheduledAt: null }), null);
	await database.update(schema.cashbackProgramTransactions).set({ valorRestante: 0 }).where(eq(schema.cashbackProgramTransactions.id, "credit"));
	assert.equal((await getCampaignEventRecipientBlock({ executor: asTransaction(database), recipient, scheduledAt: null }))?.motivo, "EVENTO_INVALIDO");
});

test("POI intent without a sale keeps first-purchase eligibility but does not increment quantity", async () => {
	await campaign("first", { gatilhoTipo: "PRIMEIRA-COMPRA", ativo: true });
	await campaign("quantity", { ativo: true });
	const id = await database.transaction((tx) =>
		recordPurchaseCampaignEvent({
			tx: asTransaction(tx),
			organizationId: "org",
			clientId: "client",
			sourceType: "CLIENTE",
			sourceId: "client",
			idempotencyKey: "poi:intent",
			snapshot: { ...snapshot, origem: "POI", primeiraCompra: true, contabilizarCompra: false, janelaReferencia: "poi:intent" },
		}),
	);
	assert.ok(id);
	await processEvent(id);
	const recipients = await database.query.campaignDispatchRecipients.findMany();
	assert.equal(recipients.length, 1);
	assert.equal(recipients[0].campanhaId, "first");
	assert.equal(recipients[0].vendaId, null);
});

for (const kind of ["entry", "permanence"] as const) {
	test(`RFM ${kind} producer deduplicates its occurrence and guards a later segment change`, async () => {
		const trigger = kind === "entry" ? "ENTRADA-SEGMENTA\u00c7\u00c3O" : "PERMAN\u00caNCIA-SEGMENTA\u00c7\u00c3O";
		await campaign("segment", { gatilhoTipo: trigger, ativo: true, gatilhoTempoPermanenciaMedida: "DIAS", gatilhoTempoPermanenciaValor: 1 });
		await seed(schema.campaignSegmentations, { campanhaId: "segment", organizacaoId: "org", segmentacao: "PROMISSORES" });
		const current = await database.query.campaigns.findFirst({ where: eq(schema.campaigns.id, "segment"), with: { segmentacoes: true } });
		assert.ok(current);
		const modification = new Date(Date.now() - 5 * 86400000);
		const capture = () =>
			database.transaction((tx) =>
				recordSegmentationCampaignEvents({
					tx: asTransaction(tx),
					organizationId: "org",
					client: {
						clientId: "client",
						newLabel: "PROMISSORES",
						labelChanged: kind === "entry",
						lastLabelModification: modification,
					},
					entryCampaigns: kind === "entry" ? [current] : [],
					permanenceCampaigns: kind === "permanence" ? [current] : [],
					filterAudiencesByCampaignId: new Map([["segment", new Set(["client"])]]),
					cashbackTerminology: "DINHEIRO",
					now,
				}),
			);
		const ids = await capture();
		assert.equal(ids.length, 1);
		// Freeze the source modification time for repeated permanence evaluation.
		assert.equal((await capture()).length, 0);
		await processEvent(ids[0]);
		const recipient = await database.query.campaignDispatchRecipients.findFirst();
		assert.ok(recipient);
		await database.update(schema.clients).set({ analiseRFMTitulo: "HIBERNANDO" }).where(eq(schema.clients.id, "client"));
		assert.equal(
			(await getCampaignEventRecipientBlock({ executor: asTransaction(database), recipient, scheduledAt: null }))?.motivo,
			"EVENTO_INVALIDO",
		);
	});
}

test("manual resend preserves its frequency bypass", async () => {
	await campaign("manual", { gatilhoTipo: "NOVA-COMPRA", ativo: true });
	const current = await database.query.campaigns.findFirst({ where: eq(schema.campaigns.id, "manual") });
	assert.ok(current);
	await seed(schema.interactions, { organizacaoId: "org", clienteId: "client", campanhaId: "manual", dataInsercao: new Date() });
	const { eventId } = await database.transaction((tx) =>
		recordCampaignOccurrence({
			tx: asTransaction(tx),
			organizationId: "org",
			campaign: current,
			manual: true,
			janelaReferencia: "resend:attempt",
			recipients: [{ clienteId: "client" }],
			scheduledAt: null,
		}),
	);
	assert.ok(eventId);
	await processEvent(eventId);
	const recipient = await database.query.campaignDispatchRecipients.findFirst();
	assert.equal(recipient?.status, "AGUARDANDO");
});

test("the real importer refreshes stale starting totals and freezes each purchase in a batch", async () => {
	await database.update(schema.clients).set({ metadataTotalCompras: 1, metadataValorTotalCompras: 50 }).where(eq(schema.clients.id, "client"));
	await seed(schema.integrations, { id: "integration", organizacaoId: "org", tipo: "CARDAPIO-WEB" });
	const client = {
		id: "client",
		name: "Cliente",
		basePhone: "11999999999",
		rfmTitle: "PROMISSORES",
		metadataTotalPurchases: 99,
		metadataTotalPurchaseValue: 999,
		isNew: false,
	};
	const context: TResolvedAuxiliaryEntities = {
		clientsByExternalId: new Map([["external", client]]),
		clientsByName: new Map(),
		clientsByBasePhone: new Map(),
		productsByCode: new Map(),
		productsByExternalItemId: new Map(),
		variantsByCode: new Map(),
		sellersByIdentifier: new Map(),
		partnersByIdentifier: new Map(),
		productAddOnsByExternalId: new Map(),
		productAddOnOptionsByExternalId: new Map(),
		createdClientsCount: 0,
		createdProductsCount: 0,
		createdSellersCount: 0,
		createdPartnersCount: 0,
	};
	const sale = importedSale().sale;
	const batch: TCanonicalImportBatch = {
		integrationId: "integration",
		organizationId: "org",
		source: "CARDAPIO-WEB",
		window: { startDate: earlier, endDate: now },
		policies: { saleItemRewritePolicy: "REPLACE_ON_EVERY_SYNC", clientResolutionStrategy: "EXTERNAL_ID_THEN_PHONE" },
		sales: ["import-a", "import-b"].map((id) => ({
			...sale,
			sourceSaleId: id,
			client: { externalId: "external", name: "Cliente", phone: "5511999999999", basePhone: "11999999999" },
		})),
		products: [],
		sellers: [],
		partners: [],
		productAddOns: [],
		productAddOnOptions: [],
	};
	const run = () =>
		database.transaction(async (raw) => {
			const tx = asTransaction(raw);
			const result = await syncSales({ tx, batch, context });
			await processDataCollectingV2Effects({
				tx,
				organizationId: "org",
				persistedSales: result.persistedSales,
				options: { processCampaigns: true, processCashback: false, processConversionAttribution: false },
			});
			return result;
		});
	await run();
	const events = await database.query.campaignEvents.findMany({ orderBy: schema.campaignEvents.sequencia });
	assert.deepEqual(
		events.map((event) => event.contexto.comprasQuantidadePosterior),
		[2, 3],
	);
	assert.deepEqual(
		events.map((event) => event.contexto.comprasValorPosterior),
		[150, 250],
	);
	assert.ok((await run()).persistedSales.every((sale) => sale.skipped));
	assert.equal((await database.query.campaignEvents.findMany()).length, 2);
});

test("managed confirmation captures once through the shared integration effects service", async () => {
	await database.update(schema.clients).set({ metadataTotalCompras: 1, metadataValorTotalCompras: 50 }).where(eq(schema.clients.id, "client"));
	await database
		.update(schema.sales)
		.set({ statusVenda: null, statusAtendimento: "NAO_INICIADO", processamentoOrigem: "EXTERNO" })
		.where(eq(schema.sales.id, "sale"));
	const run = () =>
		database.transaction((tx) =>
			processIntegratedSaleConfirmation({
				tx: asTransaction(tx),
				organizationId: "org",
				saleId: "sale",
				sale: importedSale().sale,
				organizationConfiguration: null,
			}),
		);
	assert.equal((await run()).processed, true);
	assert.equal((await run()).processed, false);
	assert.equal((await database.query.campaignEvents.findMany()).length, 1);
	assert.equal((await database.query.clients.findFirst({ where: eq(schema.clients.id, "client") }))?.metadataTotalCompras, 2);
});

test("an event that keeps failing is discarded after the attempt cap instead of retrying forever", async () => {
	await campaign("second");
	await confirm();
	const event = await database.query.campaignEvents.findFirst();
	assert.ok(event);
	await database.update(schema.campaignEvents).set({ versao: 99, tentativas: 10, erro: "sem handler" }).where(eq(schema.campaignEvents.id, event.id));
	assert.deepEqual(await processEvent(event.id), []);
	const discarded = await database.query.campaignEvents.findFirst();
	assert.equal(discarded?.status, "DESCARTADA");
	assert.match(discarded?.erro ?? "", /Tentativas esgotadas/);
	assert.equal((await database.query.campaignDispatches.findMany()).length, 0);
});

test("a stale or exhausted earlier event no longer holds back the customer's newer events", async () => {
	await campaign("second");
	await confirm();
	const stale = await database.query.campaignEvents.findFirst();
	assert.ok(stale);
	await database
		.update(schema.campaignEvents)
		.set({ dataEvento: new Date(Date.now() - 25 * 3600000) })
		.where(eq(schema.campaignEvents.id, stale.id));
	const newer = await database.transaction((tx) =>
		recordCampaignEvent({ tx: asTransaction(tx), input: eventInput({ chaveIdempotencia: "compra:previous", fonteId: "previous" }) }),
	);
	assert.ok(newer);
	await processEvent(newer);
	assert.equal((await database.query.campaignEvents.findFirst({ where: eq(schema.campaignEvents.id, newer) }))?.status, "PROCESSADA");
	assert.equal((await database.query.campaignEvents.findFirst({ where: eq(schema.campaignEvents.id, stale.id) }))?.status, "PENDENTE");
	await processEvent(stale.id);
	const expired = await database.query.campaignEvents.findFirst({ where: eq(schema.campaignEvents.id, stale.id) });
	assert.equal(expired?.status, "DESCARTADA");
	assert.match(expired?.erro ?? "", /expirado/);
	await database
		.update(schema.campaignEvents)
		.set({ dataEvento: new Date(), status: "PENDENTE", tentativas: 10 })
		.where(eq(schema.campaignEvents.id, stale.id));
	const another = await database.transaction((tx) =>
		recordCampaignEvent({ tx: asTransaction(tx), input: eventInput({ chaveIdempotencia: "compra:previous-2", fonteId: "previous" }) }),
	);
	assert.ok(another);
	await processEvent(another);
	assert.equal((await database.query.campaignEvents.findFirst({ where: eq(schema.campaignEvents.id, another) }))?.status, "PROCESSADA");
});

test("recovery publication pages through every pending event and keys each publish by its row state", async () => {
	for (let index = 0; index < 150; index++) {
		await database.transaction((tx) => recordCampaignEvent({ tx: asTransaction(tx), input: eventInput({ chaveIdempotencia: `bulk:${index}` }) }));
	}
	const published: [string, number][] = [];
	const collect = async (id: string, generation: number) => {
		published.push([id, generation]);
	};
	const at = new Date(Date.now() + 1000);
	const first = await publishPendingCampaignEvents({ executor: asTransaction(database), enabled: true, now: at, limit: 40, publish: collect });
	assert.equal(first.published, 150);
	assert.equal(new Set(published.map(([id]) => id)).size, 150);
	// Nothing is due again before the republish delay.
	const again = await publishPendingCampaignEvents({
		executor: asTransaction(database),
		enabled: true,
		now: new Date(at.getTime() + 1000),
		publish: collect,
	});
	assert.equal(again.published, 0);
	const later = await publishPendingCampaignEvents({
		executor: asTransaction(database),
		enabled: true,
		now: new Date(at.getTime() + 61_000),
		publish: collect,
	});
	assert.equal(later.published, 150);
	// A republish after the bump is a new key; the same row state would have reused it.
	const generations = new Map<string, Set<number>>();
	for (const [id, generation] of published) generations.set(id, (generations.get(id) ?? new Set()).add(generation));
	for (const set of generations.values()) assert.equal(set.size, 2);
});

test("scheduled and recurring recipients do not expire at send time and keep a null due time", async () => {
	await campaign("recurrent", { gatilhoTipo: "RECORRENTE", ativo: true });
	const eventId = await database.transaction((tx) =>
		recordCampaignEvent({
			tx: asTransaction(tx),
			input: {
				organizacaoId: "org",
				clienteId: null,
				fonteTipo: "CAMPANHA",
				fonteId: "recurrent",
				tipo: "CAMPANHA_AGENDADA",
				versao: 1,
				chaveIdempotencia: "recurrent:2026-10-07@14:00",
				dataEvento: new Date(),
				contexto: { campanhaId: "recurrent", gatilho: "RECORRENTE", janelaReferencia: "2026-10-07@14:00", dataAgendada: new Date().toISOString() },
			},
		}),
	);
	assert.ok(eventId);
	await processEvent(eventId);
	const dispatch = await database.query.campaignDispatches.findFirst();
	assert.ok(dispatch);
	assert.equal(dispatch.dataAgendada, null);
	assert.equal(dispatch.status, "RESOLVENDO");
	const recipient = await seed(schema.campaignDispatchRecipients, {
		dispatchId: dispatch.id,
		organizacaoId: "org",
		campanhaId: "recurrent",
		clienteId: "client",
		campanhaEventoId: eventId,
		chaveIdempotencia: "recipient-key",
	});
	assert.equal(
		await getCampaignEventRecipientBlock({
			executor: asTransaction(database),
			recipient: recipient as never,
			scheduledAt: null,
			now: new Date(Date.now() + 3 * 86400000),
		}),
		null,
	);
	await database.update(schema.campaigns).set({ ativo: false }).where(eq(schema.campaigns.id, "recurrent"));
	assert.equal(
		(await getCampaignEventRecipientBlock({ executor: asTransaction(database), recipient: recipient as never, scheduledAt: null }))?.motivo,
		"CAMPANHA_INATIVA",
	);
});

test("the send guard loads and parses a campaign-wide event once for all of its recipients", async () => {
	await campaign("worst", { gatilhoTipo: "PIOR-DIA-VENDAS", ativo: true });
	const current = await database.query.campaigns.findFirst({ where: eq(schema.campaigns.id, "worst") });
	assert.ok(current);
	for (const id of ["c2", "c3"]) await seed(schema.clients, { id, organizacaoId: "org", nome: id, telefone: `55119999${id}` });
	const { eventId } = await database.transaction((tx) =>
		recordCampaignOccurrence({
			tx: asTransaction(tx),
			organizationId: "org",
			campaign: current,
			janelaReferencia: "worst:2026-10-07",
			recipients: [{ clienteId: "client" }, { clienteId: "c2" }, { clienteId: "c3" }],
			scheduledAt: null,
		}),
	);
	assert.ok(eventId);
	await processEvent(eventId);
	const recipients = await database.query.campaignDispatchRecipients.findMany();
	assert.equal(recipients.length, 3);
	let eventLoads = 0;
	const base = asTransaction(database);
	const executor = new Proxy(base, {
		get(target, property, receiver) {
			if (property !== "query") return Reflect.get(target, property, receiver);
			return new Proxy(target.query, {
				get(query, table, queryReceiver) {
					const original = Reflect.get(query, table, queryReceiver) as { findFirst: (...args: unknown[]) => unknown };
					if (table !== "campaignEvents") return original;
					return {
						...original,
						findFirst: (...args: unknown[]) => {
							eventLoads += 1;
							return original.findFirst(...args);
						},
					};
				},
			});
		},
	});
	const guard = createCampaignEventSendGuard({ executor });
	const clientsById = new Map((await database.query.clients.findMany()).map((client) => [client.id, client]));
	for (const recipient of recipients) {
		assert.equal(await guard.getRecipientBlock({ recipient, client: clientsById.get(recipient.clienteId) ?? null, scheduledAt: null }), null);
	}
	assert.equal(eventLoads, 1);
	assert.equal(
		(await guard.getRecipientBlock({ recipient: { ...recipients[0], clienteId: "stranger" }, client: null, scheduledAt: null }))?.motivo,
		"EVENTO_INVALIDO",
	);
	assert.equal(eventLoads, 1);
});

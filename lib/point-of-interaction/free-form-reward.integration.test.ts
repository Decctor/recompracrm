import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import * as schema from "@/services/drizzle/schema";
import * as enums from "@/services/drizzle/schema/enums";
import type { DBTransaction } from "@/services/drizzle";

// Recompensa avulsa ponta a ponta no ledger: o caminho real do ponto de interação contra PostgreSQL
// em memória. Nenhum .env nem banco de produção é carregado.
const pg = new PGlite();
const database = drizzle(pg, { schema });
let prepareTransaction: typeof import("@/app/api/point-of-interaction/new-transaction/route").preparePointOfInteractionTransaction;

const OPERATOR_PASSWORD = "12345";

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

type TInput = Parameters<typeof prepareTransaction>[0]["input"];
type TOperatorContext = Parameters<typeof prepareTransaction>[0]["operatorContext"];

function buildInput(freeFormReward: { descricao: string; valor?: number | null } | null, overrides?: Partial<TInput["sale"]>): TInput {
	return {
		orgId: "org",
		client: { id: "client", nome: "Cliente", cpfCnpj: null, telefone: "11999999999" },
		sale: {
			valor: 0,
			entregaModalidade: "PRESENCIAL",
			cashback: { aplicar: false, valor: 0 },
			partnerCode: null,
			prizeRedemptions: [],
			coupon: null,
			freeFormReward,
			...overrides,
		},
		operatorIdentifier: OPERATOR_PASSWORD,
		operatorConfirmedSaleValue: null,
	} as TInput;
}

async function run(input: TInput, operatorContext?: TOperatorContext) {
	const execution = await database.transaction((tx) => prepareTransaction({ input, operatorContext, tx: asTransaction(tx) }));
	return execution.result.data;
}

async function readBalance() {
	const [balance] = await database.select().from(schema.cashbackProgramBalances).where(eq(schema.cashbackProgramBalances.clienteId, "client"));
	return balance;
}

async function readTransactions(tipo: "ACÚMULO" | "RESGATE") {
	const rows = await database.select().from(schema.cashbackProgramTransactions).where(eq(schema.cashbackProgramTransactions.clienteId, "client"));
	return rows.filter((row) => row.tipo === tipo);
}

before(async () => {
	// Construtores importados pela rota exigem chaves, mas nenhum serviço externo é chamado.
	process.env.RESEND_API_KEY = "re_test_unused";
	process.env.STRIPE_SECRET_KEY = "sk_test_unused";
	process.env.SUPABASE_DB_URL = "postgres://unused:unused@127.0.0.1:1/unused";
	// Captura ligada: os testes conferem se o evento de compra é gravado. A publicação só roda no
	// afterCommit, que o teste não chama, então nada sai para a fila.
	process.env.CAMPAIGN_EVENTS_ENABLED = "true";
	delete process.env.CAMPAIGN_EVENTS_ORGANIZATIONS;
	({ preparePointOfInteractionTransaction: prepareTransaction } = await import("@/app/api/point-of-interaction/new-transaction/route"));
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
	await seed(schema.users, { id: "user", email: "poi@example.invalid" });
	// Registro de vendas do POI ligado: a recompensa avulsa precisa NÃO criar venda mesmo assim.
	await seed(schema.organizations, {
		id: "org",
		autorId: "user",
		poiConfiguracao: { vendas: { registroAtivo: true } },
	});
	await seed(schema.sellers, { id: "seller", organizacaoId: "org", nome: "Operador", identificador: "OP", senhaOperador: OPERATOR_PASSWORD });
	await seed(schema.clients, { id: "client", organizacaoId: "org", nome: "Cliente", telefone: "11999999999", telefoneBase: "11999999999" });
	await seed(schema.cashbackPrograms, {
		id: "program",
		organizacaoId: "org",
		titulo: "Clube",
		terminologia: "PONTOS",
		modalidadeDescontosPermitida: false,
		modalidadeRecompensasPermitida: true,
		modalidadeRecompensaAvulsaPermitida: true,
		acumuloTipo: "FIXO",
		acumuloValor: 10,
		acumuloPermitirViaPontoIntegracao: true,
		resgatePermitirViaPontoIntegracao: true,
	});
	await seed(schema.cashbackProgramBalances, {
		organizacaoId: "org",
		clienteId: "client",
		programaId: "program",
		saldoValorDisponivel: 1000,
		saldoValorAcumuladoTotal: 1000,
	});
	await seed(schema.cashbackProgramTransactions, {
		id: "accrual",
		organizacaoId: "org",
		clienteId: "client",
		programaId: "program",
		tipo: "ACÚMULO",
		status: "ATIVO",
		valor: 1000,
		valorRestante: 1000,
		saldoValorAnterior: 0,
		saldoValorPosterior: 1000,
	});
});

after(async () => {
	await pg.close();
});

test("totem: debita o valor digitado, grava a descrição e não cria venda nem acúmulo", async () => {
	const result = await run(buildInput({ descricao: "  Kit   churrasco ", valor: 300 }));

	assert.equal(result.saleId, null);
	assert.deepEqual(result.freeFormReward, { descricao: "Kit churrasco", valor: 300 });
	assert.equal(result.clientNewOverallAvailableBalance, 700);
	assert.equal(result.visualClientAccumulatedCashbackValue, 0);

	const [redemption] = await readTransactions("RESGATE");
	assert.equal(redemption?.valor, -300);
	assert.equal(redemption?.resgateRecompensaDescricao, "Kit churrasco");
	assert.equal(redemption?.resgateRecompensaId, null);
	assert.equal(redemption?.vendaId, null);
	assert.equal(redemption?.operadorVendedorId, "seller");

	assert.equal((await readTransactions("ACÚMULO")).length, 1, "nenhum acúmulo novo");
	assert.equal((await database.select().from(schema.sales)).length, 0, "nenhuma venda");
	const balance = await readBalance();
	assert.equal(balance?.saldoValorDisponivel, 700);
	assert.equal(balance?.saldoValorResgatadoTotal, 300);
	const [client] = await database.select().from(schema.clients).where(eq(schema.clients.id, "client"));
	assert.equal(client?.metadataTotalCompras ?? 0, 0, "resgate não conta como compra");
	// Cliente sem compras: um evento COMPRA_CONFIRMADA dispararia PRIMEIRA-COMPRA / NOVA-COMPRA.
	assert.equal((await database.select().from(schema.campaignEvents)).length, 0, "nenhum evento de campanha");
});

test("aprovação: o débito é o do operador, o pedido do celular só descreve", async () => {
	const result = await run(buildInput({ descricao: "Camiseta", valor: null }), {
		operatorFreeFormRewardValue: 450,
		operatorSellerId: "seller",
	});
	assert.deepEqual(result.freeFormReward, { descricao: "Camiseta", valor: 450 });
	assert.equal((await readBalance())?.saldoValorDisponivel, 550);
});

test("sem valor do operador nem do totem, recusa", async () => {
	await assert.rejects(run(buildInput({ descricao: "Camiseta", valor: null })), /Informe quanto debitar/);
	assert.equal((await readBalance())?.saldoValorDisponivel, 1000);
});

test("saldo insuficiente é recusado sem mexer no saldo", async () => {
	await assert.rejects(run(buildInput({ descricao: "TV", valor: 1500 })), /Saldo insuficiente/);
	assert.equal((await readBalance())?.saldoValorDisponivel, 1000);
	assert.equal((await readTransactions("RESGATE")).length, 0);
});

test("programa sem a modalidade avulsa recusa", async () => {
	await database.update(schema.cashbackPrograms).set({ modalidadeRecompensaAvulsaPermitida: false });
	await assert.rejects(run(buildInput({ descricao: "Kit", valor: 100 })), /Recompensa avulsa não habilitada/);
	// Sub-modalidade: desligar a troca por recompensas também desliga a avulsa.
	await database.update(schema.cashbackPrograms).set({ modalidadeRecompensaAvulsaPermitida: true, modalidadeRecompensasPermitida: false });
	await assert.rejects(run(buildInput({ descricao: "Kit", valor: 100 })), /Recompensa avulsa não habilitada/);
});

test("não combina com desconto em cashback nem com recompensas do catálogo", async () => {
	await assert.rejects(
		run(buildInput({ descricao: "Kit", valor: 100 }, { cashback: { aplicar: true, valor: 50 } })),
		/não pode ser combinada com desconto/,
	);
	await assert.rejects(
		run(buildInput({ descricao: "Kit", valor: 100 }, { prizeRedemptions: [{ prizeId: "p", prizeValue: 1, prizeSaleValue: 1, quantity: 1 }] })),
		/não pode ser combinada com recompensas do catálogo/,
	);
});

test("superfície do ponto de interação desligada recusa a recompensa avulsa", async () => {
	await database.update(schema.cashbackPrograms).set({ resgatePermitirViaPontoIntegracao: false, resgatePermitirViaPos: true });
	await assert.rejects(run(buildInput({ descricao: "Kit", valor: 100 })));
	assert.equal((await readBalance())?.saldoValorDisponivel, 1000);
});

test("controle: a mesma configuração sem recompensa avulsa registra venda e acumula", async () => {
	const result = await run(buildInput(null, { valor: 100 }));
	assert.notEqual(result.saleId, null);
	assert.equal(result.freeFormReward, null);
	assert.equal((await database.select().from(schema.sales)).length, 1);
	assert.equal((await readTransactions("ACÚMULO")).length, 2);
	assert.equal((await database.select().from(schema.campaignEvents)).length, 1, "a venda grava o evento de compra");
});

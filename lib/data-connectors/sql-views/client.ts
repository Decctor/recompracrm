import { Client, types as pgTypes } from "pg";
import type { z } from "zod";
import type { TCanonicalImportWindow } from "../types";
import {
	SQL_VIEWS,
	SQL_VIEWS_SUPPORTED_CONTRACT_MAJOR_VERSIONS,
	SqlViewsClientRowSchema,
	SqlViewsMetadataRowSchema,
	SqlViewsProductRowSchema,
	SqlViewsSaleItemRowSchema,
	SqlViewsSaleRowSchema,
	type TSqlViewsConfig,
} from "./types";

const SQL_VIEWS_CONNECT_TIMEOUT_MS = 10_000;
/** Uma janela de um dia leva ~1s; o teto existe para um banco travado não segurar o cron inteiro. */
const SQL_VIEWS_STATEMENT_TIMEOUT_MS = 90_000;
const SQL_VIEWS_ID_CHUNK_SIZE = 1000;
const PG_DATE_OID = 1082;

export type TSqlViewsSession = {
	query: <TSchema extends z.ZodTypeAny>(schema: TSchema, text: string, params?: unknown[]) => Promise<z.infer<TSchema>[]>;
	schema: string;
};

function quoteIdentifier(identifier: string) {
	return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Abre UMA conexão curta, numa transação somente leitura, e a fecha ao fim — o banco é do
 * cliente, atrás de DDNS, e não há pool que sobreviva entre invocações serverless.
 */
export async function withSqlViewsSession<T>(config: TSqlViewsConfig, run: (session: TSqlViewsSession) => Promise<T>): Promise<T> {
	const client = new Client({
		host: config.host,
		port: config.port,
		database: config.database,
		user: config.username,
		password: config.password,
		ssl: config.ssl ? { rejectUnauthorized: false } : false,
		connectionTimeoutMillis: SQL_VIEWS_CONNECT_TIMEOUT_MS,
		statement_timeout: SQL_VIEWS_STATEMENT_TIMEOUT_MS,
		query_timeout: SQL_VIEWS_STATEMENT_TIMEOUT_MS + 5_000,
		application_name: "recompracrm",
		// `date` vira Date na meia-noite LOCAL por padrão; aniversário precisa do dia civil cru.
		types: {
			getTypeParser: ((oid: number) =>
				oid === PG_DATE_OID ? (value: string) => value : pgTypes.getTypeParser(oid, "text")) as typeof pgTypes.getTypeParser,
		},
	});

	await client.connect();
	try {
		await client.query("BEGIN READ ONLY");
		const session: TSqlViewsSession = {
			schema: config.schema,
			query: async (schema, text, params = []) => {
				const result = await client.query(text, params);
				return result.rows.map((row) => schema.parse(row));
			},
		};
		const result = await run(session);
		await client.query("COMMIT");
		return result;
	} finally {
		await client.end().catch(() => undefined);
	}
}

function view(session: TSqlViewsSession, name: string) {
	return `${quoteIdentifier(session.schema)}.${quoteIdentifier(name)}`;
}

function chunk<T>(values: T[], size: number) {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
	return chunks;
}

async function queryByIds<TSchema extends z.ZodTypeAny>(
	session: TSqlViewsSession,
	schema: TSchema,
	viewName: string,
	idColumn: string,
	ids: string[],
): Promise<z.infer<TSchema>[]> {
	const rows: z.infer<TSchema>[] = [];
	for (const idsChunk of chunk(Array.from(new Set(ids)), SQL_VIEWS_ID_CHUNK_SIZE)) {
		rows.push(...(await session.query(schema, `select * from ${view(session, viewName)} where ${quoteIdentifier(idColumn)} = any($1)`, [idsChunk])));
	}
	return rows;
}

/** Recusa contrato de versão MAJOR desconhecida antes de ler qualquer venda. */
export async function fetchSqlViewsMetadata(session: TSqlViewsSession) {
	const [metadata] = await session.query(SqlViewsMetadataRowSchema, `select * from ${view(session, SQL_VIEWS.metadata)} limit 1`);
	if (!metadata) throw new Error(`View ${SQL_VIEWS.metadata} vazia: contrato de views não identificado.`);
	const majorVersion = metadata.contrato_versao?.split(".")[0] ?? null;
	if (!majorVersion || !SQL_VIEWS_SUPPORTED_CONTRACT_MAJOR_VERSIONS.includes(majorVersion)) {
		throw new Error(`Versão do contrato de views não suportada: "${metadata.contrato_versao ?? "N/A"}".`);
	}
	return metadata;
}

/**
 * Vendas lançadas OU alteradas na janela: `data_atualizacao` traz cancelamentos de vendas
 * anteriores à janela, `data_venda` garante a venda nova mesmo se o ERP não carimbar a alteração.
 */
export async function fetchSqlViewsSales({
	session,
	window,
	storeId,
}: {
	session: TSqlViewsSession;
	window: TCanonicalImportWindow;
	storeId: string | null;
}) {
	const params: unknown[] = [window.startDate, window.endDate];
	const storeFilter = storeId ? `and loja_id = $${params.push(storeId)}` : "";
	return session.query(
		SqlViewsSaleRowSchema,
		`select * from ${view(session, SQL_VIEWS.sales)}
		where (data_venda between $1 and $2 or data_atualizacao between $1 and $2) ${storeFilter}
		order by data_venda, venda_id`,
		params,
	);
}

export function fetchSqlViewsSaleItems(session: TSqlViewsSession, saleIds: string[]) {
	return queryByIds(session, SqlViewsSaleItemRowSchema, SQL_VIEWS.saleItems, "venda_id", saleIds);
}

export function fetchSqlViewsClients(session: TSqlViewsSession, clientIds: string[]) {
	return queryByIds(session, SqlViewsClientRowSchema, SQL_VIEWS.clients, "cliente_id", clientIds);
}

export function fetchSqlViewsProducts(session: TSqlViewsSession, productIds: string[]) {
	return queryByIds(session, SqlViewsProductRowSchema, SQL_VIEWS.products, "produto_id", productIds);
}

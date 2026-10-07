import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { type PostgresJsQueryResultHKT, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// O SUPABASE_DB_URL usa o Transaction Pooler (Supavisor, porta 6543), que não suporta prepared
// statements entre transações. Sem `prepare: false`, uma conexão pode reutilizar statements de
// outra sessão do pool e produzir leituras/escritas inconsistentes.
//
// O Supavisor limita o total de clientes (200). Sem `idle_timeout`, cada instância mantém suas
// conexões abertas enquanto vive, e durante deploys as instâncias antiga e nova somam-se até
// estourar o limite (EMAXCONN, incidente de 07/10/2026). O fechamento é gracioso: espera queries e
// transações em andamento. `max` segue no padrão (10) porque há fluxos que seguram uma conexão
// e pedem outra ao `db` global (ex.: edição de venda) e travariam com um pool menor.
export const connection = postgres(process.env.SUPABASE_DB_URL as string, {
	prepare: false,
	idle_timeout: 20,
	max_lifetime: 60 * 5,
});

export const db = drizzle(connection, { schema });

export type DB = typeof db;
export type DBTransaction = PgTransaction<
	PostgresJsQueryResultHKT,
	typeof import("./schema/index"),
	ExtractTablesWithRelations<typeof import("./schema/index")>
>;

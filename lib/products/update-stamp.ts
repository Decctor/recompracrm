// Data de atualização do cadastro de produtos.
//
// Todo UPDATE em `products` passa o `.set(...)` por `withProductUpdateStamp`. A comparação acontece no
// próprio UPDATE (`IS DISTINCT FROM` contra o valor antigo da linha), então vale para escritas em lote
// (renomear grupo, fornecedor principal em vários produtos) sem ler as linhas antes, e uma sincronização
// que regrava os mesmos valores não mexe na data. O teste `update-stamp.test.ts` varre o repositório e
// falha se um caminho de escrita novo atualizar `products` sem o helper.

import { products } from "@/services/drizzle/schema";
import { Column, getTableColumns, is, SQL, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";

// Não são cadastro: o saldo muda a cada venda/compra, e o carimbo de sincronização a cada execução.
const NON_REGISTRY_COLUMNS = new Set<string>(["id", "organizacaoId", "quantidade", "dataUltimaSincronizacao", "dataInsercao", "dataAtualizacao"]);

// `dataAtualizacao` fica fora da entrada: é escrita só aqui.
export function withProductUpdateStamp<TSet extends Omit<PgUpdateSetSource<typeof products>, "dataAtualizacao">>(
	set: TSet,
): TSet & { dataAtualizacao?: SQL } {
	const columns = getTableColumns(products);
	const changes = Object.entries(set)
		.filter(([key, value]) => value !== undefined && !NON_REGISTRY_COLUMNS.has(key) && key in columns)
		.map(([key, value]) => {
			const column = columns[key as keyof typeof columns];
			return sql`${column} IS DISTINCT FROM ${is(value, SQL) || is(value, Column) ? value : sql.param(value, column)}`;
		});
	if (changes.length === 0) return set as TSet & { dataAtualizacao?: SQL };

	return {
		...set,
		dataAtualizacao: sql`CASE WHEN ${sql.join(changes, sql` OR `)} THEN now() ELSE ${products.dataAtualizacao} END`,
	};
}

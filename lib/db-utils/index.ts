import type { DBTransaction } from "@/services/drizzle";
import { and, eq, inArray, sql } from "drizzle-orm";

type THandleSimpleChildRowsProcessing<T extends { id?: string | null; deletar?: boolean | null }> = {
	trx: DBTransaction;
	table: any;
	entities: T[];
	fatherEntityKey: string;
	fatherEntityId: string;
	organizacaoId: string;
};
export async function handleSimpleChildRowsProcessing<T extends { id?: string | null; deletar?: boolean | null }>({
	trx,
	table,
	entities,
	fatherEntityKey,
	fatherEntityId,
	organizacaoId,
}: THandleSimpleChildRowsProcessing<T>) {
	const toDelete = entities.filter((e) => !!e.id && e.deletar);
	const toUpdate = entities.filter((e) => !!e.id && !e.deletar);
	const toInsert = entities.filter((e) => !e.id);
	// Excluir
	if (toDelete.length > 0) {
		await trx.delete(table).where(sql`${table.id} IN ${toDelete.map((e) => e.id)} AND ${table.organizacaoId} = ${organizacaoId}`);
	}

	// Atualizar
	for (const entity of toUpdate) {
		const update = { ...entity };
		delete update.id;
		delete update.deletar;
		await trx.update(table).set(update).where(sql`${table.id} = ${entity.id} AND ${table.organizacaoId} = ${organizacaoId}`);
	}

	// Criar
	if (toInsert.length > 0) {
		await trx.insert(table).values(
			toInsert.map((entity) => {
				return {
					...entity,
					[fatherEntityKey]: fatherEntityId,
					organizacaoId: organizacaoId,
					id: undefined,
					deletar: undefined,
				};
			}),
		);
	}
}

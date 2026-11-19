import { db } from "@/services/drizzle";
import { fiscalCreditRates, users } from "@/services/drizzle/schema";
import { and, desc, eq, getTableColumns } from "drizzle-orm";

export async function listFiscalCreditRates(organizationId: string, competencia?: string | null) {
	return db
		.select({ ...getTableColumns(fiscalCreditRates), autorNome: users.nome })
		.from(fiscalCreditRates)
		.leftJoin(users, eq(users.id, fiscalCreditRates.autorId))
		.where(and(eq(fiscalCreditRates.organizacaoId, organizationId), competencia ? eq(fiscalCreditRates.competencia, competencia) : undefined))
		.orderBy(desc(fiscalCreditRates.dataInsercao), desc(fiscalCreditRates.id));
}

export async function loadCurrentFiscalCreditRates(organizationId: string, competencia: string) {
	const rows = await listFiscalCreditRates(organizationId, competencia);
	const seen = new Set<string>();
	return rows.filter((row) => {
		if (seen.has(row.grupoTributarioId)) return false;
		seen.add(row.grupoTributarioId);
		return true;
	});
}

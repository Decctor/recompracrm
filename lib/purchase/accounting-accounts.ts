import { getDefaultAccountChartCodeByKey, RecompraCRMDefaultAccountingDefaults } from "@/config/onboarding";
import { resolveAccountingDefaultAccountIds } from "@/lib/finances/resolve-accounting-default-accounts";
import type { TAcquisitionNatureEnum } from "@/schemas/enums";
import type { DBTransaction } from "@/services/drizzle";

/** Par padrão (estoque × fornecedores) do lançamento da compra. */
export async function resolvePurchaseAccountingAccountIds({
	trx,
	orgId,
}: {
	trx: DBTransaction;
	orgId: string;
}): Promise<{ debitAccountId: string; creditAccountId: string }> {
	return await resolveAccountingDefaultAccountIds({ trx, orgId, kind: "compras" });
}

/**
 * Conta de débito de cada destinação: id configurado → chave configurada → chave do seed, resolvidas
 * pelo código no plano de contas da organização. REVENDA não entra: cai na conta de estoque do par.
 */
export async function resolvePurchaseDestinationAccountIds({
	trx,
	organizationId,
	configured,
	needed,
}: {
	trx: DBTransaction;
	organizationId: string;
	configured: Partial<Record<TAcquisitionNatureEnum, { contaId: string | null; contaKey: string | null } | undefined>> | undefined;
	needed: TAcquisitionNatureEnum[];
}) {
	const resolved: Partial<Record<TAcquisitionNatureEnum, string | null>> = {};
	const pending = needed.filter((destination) => destination !== "REVENDA");
	if (pending.length === 0) return resolved;
	const seedKeys = RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.debitoPorDestinacaoKey;
	const needsChart = pending.some((destination) => !configured?.[destination]?.contaId);
	const chart = needsChart
		? await trx.query.accountsCharts.findMany({
				where: (fields, { and, eq, isNotNull }) => and(eq(fields.organizacaoId, organizationId), isNotNull(fields.codigo)),
				columns: { id: true, codigo: true },
			})
		: [];
	const accountIdByCode = new Map(chart.filter((account) => !!account.codigo).map((account) => [account.codigo as string, account.id]));
	for (const destination of pending) {
		const entry = configured?.[destination];
		if (entry?.contaId) {
			resolved[destination] = entry.contaId;
			continue;
		}
		const key = entry?.contaKey ?? seedKeys[destination];
		const code = key ? getDefaultAccountChartCodeByKey(key) : null;
		resolved[destination] = (code ? accountIdByCode.get(code) : null) ?? null;
	}
	return resolved;
}

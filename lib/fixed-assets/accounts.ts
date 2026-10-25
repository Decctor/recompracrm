import { getDefaultAccountChartCodeByKey, RecompraCRMDefaultAccountingDefaults } from "@/config/onboarding";
import { provisionSeedAccountChart } from "@/lib/finances/resolve-accounting-default-accounts";
import type { TOrganizationDefaults } from "@/schemas/organizations";
import type { DBTransaction } from "@/services/drizzle";
import createHttpError from "http-errors";

export type TFixedAssetAccounts = {
	imobilizadoContaId: string;
	depreciacaoAcumuladaContaId: string;
	despesaDepreciacaoContaId: string;
	ciapControleContaId: string;
	/** ICMS a recuperar corrente (destino da parcela mensal do CIAP): a conta de crédito tributário das compras. */
	tributosRecuperarContaId: string | null;
	/** Resultado na baixa (valor contábil não recuperado): a conta de despesas do período das compras. */
	resultadoBaixaContaId: string | null;
};

type TPatrimonioDefaults = TOrganizationDefaults["contabilidade"]["lancamentosPadrao"]["patrimonio"] | undefined;

/**
 * Contas do patrimônio: id configurado → chave configurada → chave do seed, pelo código no plano
 * da organização. Com `autoProvisionFromSeed`, contas do seed ausentes são criadas na hora — o
 * fechamento mensal roda sem ninguém olhando e não pode parar por configuração ausente.
 */
export async function resolveFixedAssetAccounts({
	trx,
	organizationId,
	autoProvisionFromSeed = false,
}: {
	trx: DBTransaction;
	organizationId: string;
	autoProvisionFromSeed?: boolean;
}): Promise<TFixedAssetAccounts> {
	const organization = await trx.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, organizationId), columns: { configuracao: true } });
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");
	const lancamentos = organization.configuracao.defaults.contabilidade.lancamentosPadrao;
	const defaults = lancamentos.patrimonio as TPatrimonioDefaults;
	const seed = RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.patrimonio;

	const chart = await trx.query.accountsCharts.findMany({
		where: (fields, { and, eq, isNotNull }) => and(eq(fields.organizacaoId, organizationId), isNotNull(fields.codigo)),
		columns: { id: true, codigo: true },
	});
	const accountIdByCode = new Map(chart.filter((account) => !!account.codigo).map((account) => [account.codigo as string, account.id]));

	const resolve = async (configuredId: string | null | undefined, configuredKey: string | null | undefined, seedKey: string, label: string) => {
		if (configuredId) return configuredId;
		const key = configuredKey ?? seedKey;
		const code = getDefaultAccountChartCodeByKey(key);
		let id = (code ? accountIdByCode.get(code) : null) ?? null;
		if (!id && autoProvisionFromSeed) id = await provisionSeedAccountChart({ trx, orgId: organizationId, key });
		if (!id)
			throw new createHttpError.BadRequest(`Conta de ${label} não configurada. Defina-a em Configurações › Financeiro › Lançamentos padrão › Patrimônio.`);
		return id;
	};

	return {
		imobilizadoContaId: await resolve(defaults?.imobilizadoContaId, defaults?.imobilizadoContaKey, seed.imobilizadoKey, "imobilizado"),
		depreciacaoAcumuladaContaId: await resolve(
			defaults?.depreciacaoAcumuladaContaId,
			defaults?.depreciacaoAcumuladaContaKey,
			seed.depreciacaoAcumuladaKey,
			"depreciação acumulada",
		),
		despesaDepreciacaoContaId: await resolve(
			defaults?.despesaDepreciacaoContaId,
			defaults?.despesaDepreciacaoContaKey,
			seed.despesaDepreciacaoKey,
			"despesa de depreciação",
		),
		ciapControleContaId: await resolve(defaults?.ciapControleContaId, defaults?.ciapControleContaKey, seed.ciapControleKey, "controle do CIAP"),
		tributosRecuperarContaId:
			lancamentos.compras?.debitoCreditoTributarioContaId ??
			(() => {
				const code = getDefaultAccountChartCodeByKey(lancamentos.compras?.debitoCreditoTributarioContaKey ?? RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.debitoCreditoTributarioKey);
				return (code ? accountIdByCode.get(code) : null) ?? null;
			})(),
		resultadoBaixaContaId:
			lancamentos.compras?.debitoDespesaPeriodoContaId ??
			(() => {
				const code = getDefaultAccountChartCodeByKey(lancamentos.compras?.debitoDespesaPeriodoContaKey ?? RecompraCRMDefaultAccountingDefaults.lancamentosPadrao.compras.debitoDespesaPeriodoKey);
				return (code ? accountIdByCode.get(code) : null) ?? null;
			})(),
	};
}

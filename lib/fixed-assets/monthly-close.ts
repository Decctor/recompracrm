import { resolveFixedAssetAccounts } from "@/lib/fixed-assets/accounts";
import {
	fromCents,
	getCiapInstallmentCents,
	getMonthEnd,
	getMonthKey,
	getMonthlyDepreciationCents,
	getPreviousMonthKey,
	parseMonthKey,
	type TMonthKey,
} from "@/lib/fixed-assets/depreciation";
import { syncAccountingEntryLines, type TAccountingEntryLineInput } from "@/lib/finances/accounting-entry-lines";
import type { DB, DBTransaction } from "@/services/drizzle";
import { accountingEntries, accountingEntryLines, fixedAssets } from "@/services/drizzle/schema";
import { and, eq, like, sql } from "drizzle-orm";
import createHttpError from "http-errors";

/**
 * Fechamento mensal do patrimônio (ADR-0002, decisão 8): um lançamento por organização e mês,
 * origem PATRIMONIO, `chaveIdempotencia = patrimonio:{org}:{yyyy-mm}`. O lançamento É o registro
 * do mês: refazer recalcula e atualiza, nunca duplica. Linhas:
 *
 *   D Despesas com depreciação      Σ depreciação do mês
 *   C Depreciação acumulada         Σ depreciação do mês
 *   D ICMS a recuperar (corrente)   Σ parcela do CIAP × coeficiente
 *   C ICMS a recuperar — CIAP       Σ parcela do CIAP × coeficiente
 */

export const FIXED_ASSETS_CLOSE_PREFIX = "patrimonio";

export function buildFixedAssetsMonthKey(organizationId: string, month: string) {
	return `${FIXED_ASSETS_CLOSE_PREFIX}:${organizationId}:${month}`;
}

/** Último mês com lançamento PATRIMONIO mensal na organização (AAAA-MM), ou null. */
export async function findLatestClosedFixedAssetsMonth({ trx, organizationId }: { trx: DBTransaction | DB; organizationId: string }) {
	const prefix = `${FIXED_ASSETS_CLOSE_PREFIX}:${organizationId}:`;
	const [row] = await trx
		.select({ latest: sql<string | null>`max(substring(${accountingEntries.chaveIdempotencia} from ${prefix.length + 1}))` })
		.from(accountingEntries)
		.where(
			and(
				eq(accountingEntries.organizacaoId, organizationId),
				eq(accountingEntries.origemTipo, "PATRIMONIO"),
				like(accountingEntries.chaveIdempotencia, `${prefix}____-__`),
			),
		);
	return (row?.latest as TMonthKey | null) ?? null;
}

export type TFixedAssetsMonthClosing = {
	month: TMonthKey;
	entryId: string | null;
	bens: number;
	depreciacaoCentavos: number;
	ciapCentavos: number;
	coeficienteCiap: number;
};

/**
 * Fecha (ou refecha) o mês de uma organização. `coeficienteCiap` é a proporção de saídas
 * tributadas do mês (LC 87/96, art. 20, §5º, III); sem apuração de saídas o padrão é 1 e o valor
 * usado fica gravado em `metadados`, para auditoria e para o acerto humano.
 */
export async function closeFixedAssetsMonth({
	trx,
	organizationId,
	month,
	userId = null,
	coeficienteCiap = 1,
}: {
	trx: DBTransaction;
	organizationId: string;
	month: string;
	userId?: string | null;
	coeficienteCiap?: number;
}): Promise<TFixedAssetsMonthClosing> {
	const monthKey = month as TMonthKey;
	parseMonthKey(monthKey);
	if (getMonthEnd(monthKey).getTime() > Date.now()) throw new createHttpError.BadRequest(`O mês ${monthKey} ainda não terminou.`);

	const assets = await trx.query.fixedAssets.findMany({
		where: eq(fixedAssets.organizacaoId, organizationId),
		columns: {
			id: true,
			descricao: true,
			valorAquisicao: true,
			valorResidual: true,
			depreciacaoAcumuladaInicial: true,
			vidaUtilMeses: true,
			dataInicioUso: true,
			dataBaixa: true,
			creditoIcmsCiap: true,
		},
	});

	let depreciacaoCentavos = 0;
	let ciapCentavos = 0;
	const porBem: Record<string, { depreciacaoCentavos: number; ciapCentavos: number }> = {};
	for (const asset of assets) {
		const depreciation = getMonthlyDepreciationCents(asset, monthKey);
		const ciap = getCiapInstallmentCents(asset, monthKey, coeficienteCiap);
		if (depreciation === 0 && ciap === 0) continue;
		depreciacaoCentavos += depreciation;
		ciapCentavos += ciap;
		porBem[asset.id] = { depreciacaoCentavos: depreciation, ciapCentavos: ciap };
	}

	const key = buildFixedAssetsMonthKey(organizationId, monthKey);
	const existing = await trx.query.accountingEntries.findFirst({
		where: and(eq(accountingEntries.organizacaoId, organizationId), eq(accountingEntries.chaveIdempotencia, key)),
		columns: { id: true },
	});
	const totalCentavos = depreciacaoCentavos + ciapCentavos;

	if (totalCentavos === 0) {
		if (existing) {
			await trx.delete(accountingEntryLines).where(eq(accountingEntryLines.lancamentoContabilId, existing.id));
			await trx.delete(accountingEntries).where(eq(accountingEntries.id, existing.id));
		}
		return { month: monthKey, entryId: null, bens: 0, depreciacaoCentavos: 0, ciapCentavos: 0, coeficienteCiap };
	}

	const accounts = await resolveFixedAssetAccounts({ trx, organizationId, autoProvisionFromSeed: true });
	const lines: TAccountingEntryLineInput[] = [];
	let order = 0;
	if (depreciacaoCentavos > 0) {
		lines.push(
			{ contaContabilId: accounts.despesaDepreciacaoContaId, natureza: "DEBITO", valor: fromCents(depreciacaoCentavos), descricao: "Depreciação do mês", ordem: order++, metadados: { origem: "PATRIMONIO", tipo: "DEPRECIACAO" } },
			{ contaContabilId: accounts.depreciacaoAcumuladaContaId, natureza: "CREDITO", valor: fromCents(depreciacaoCentavos), descricao: "Depreciação acumulada", ordem: order++, metadados: { origem: "PATRIMONIO", tipo: "DEPRECIACAO" } },
		);
	}
	if (ciapCentavos > 0) {
		if (!accounts.tributosRecuperarContaId)
			throw new createHttpError.BadRequest("Conta de crédito tributário não configurada. Defina-a em Configurações › Financeiro › Lançamentos padrão › Compras.");
		lines.push(
			{ contaContabilId: accounts.tributosRecuperarContaId, natureza: "DEBITO", valor: fromCents(ciapCentavos), descricao: "Apropriação do CIAP (1/48)", ordem: order++, metadados: { origem: "PATRIMONIO", tipo: "CIAP", coeficiente: coeficienteCiap } },
			{ contaContabilId: accounts.ciapControleContaId, natureza: "CREDITO", valor: fromCents(ciapCentavos), descricao: "ICMS a recuperar — CIAP", ordem: order++, metadados: { origem: "PATRIMONIO", tipo: "CIAP" } },
		);
	}

	const { year, month: monthNumber } = parseMonthKey(monthKey);
	const titulo = `Patrimônio — depreciação e CIAP de ${String(monthNumber).padStart(2, "0")}/${year}`;
	const valor = fromCents(totalCentavos);
	const dataCompetencia = getMonthEnd(monthKey);
	const metadados = { mes: monthKey, coeficienteCiap, bens: porBem };
	let entryId: string;
	if (existing) {
		entryId = existing.id;
		await trx
			.update(accountingEntries)
			.set({ titulo, valor, dataCompetencia, idContaDebito: lines[0].contaContabilId, idContaCredito: lines[1].contaContabilId, anotacoes: JSON.stringify(metadados) })
			.where(eq(accountingEntries.id, entryId));
	} else {
		const [inserted] = await trx
			.insert(accountingEntries)
			.values({
				organizacaoId: organizationId,
				origemTipo: "PATRIMONIO",
				titulo,
				anotacoes: JSON.stringify(metadados),
				idContaDebito: lines[0].contaContabilId,
				idContaCredito: lines[1].contaContabilId,
				valor,
				dataCompetencia,
				chaveIdempotencia: key,
				autorId: userId,
			})
			.returning({ id: accountingEntries.id });
		if (!inserted) throw new createHttpError.InternalServerError("Erro ao criar o lançamento mensal do patrimônio.");
		entryId = inserted.id;
	}
	await syncAccountingEntryLines({ trx, organizationId, accountingEntryId: entryId, entryValue: valor, lines });
	return { month: monthKey, entryId, bens: Object.keys(porBem).length, depreciacaoCentavos, ciapCentavos, coeficienteCiap };
}

/**
 * Meses ainda sem fechamento entre o início de uso mais antigo e o último mês completo. Só meses
 * SEM lançamento: refechar um mês já lançado é decisão humana (rota do patrimônio), não do cron.
 */
export async function listPendingFixedAssetsMonths({ trx, organizationId, now = new Date() }: { trx: DBTransaction | DB; organizationId: string; now?: Date }) {
	const [earliest] = await trx
		.select({ start: sql<Date | null>`min(${fixedAssets.dataInicioUso})` })
		.from(fixedAssets)
		.where(eq(fixedAssets.organizacaoId, organizationId));
	if (!earliest?.start) return [] as TMonthKey[];
	const closed = new Set(
		(
			await trx
				.select({ key: accountingEntries.chaveIdempotencia })
				.from(accountingEntries)
				.where(and(eq(accountingEntries.organizacaoId, organizationId), eq(accountingEntries.origemTipo, "PATRIMONIO")))
		)
			.map((row) => row.key?.split(":")[2])
			.filter((month): month is string => !!month && /^\d{4}-\d{2}$/.test(month)),
	);
	const lastFullMonth = getPreviousMonthKey(getMonthKey(now));
	const pending: TMonthKey[] = [];
	let cursor = getMonthKey(new Date(earliest.start));
	// Limite de segurança: nenhuma organização tem bens com mais de 50 anos de histórico no sistema.
	for (let guard = 0; guard < 600 && cursor <= lastFullMonth; guard += 1) {
		if (!closed.has(cursor)) pending.push(cursor);
		const { year, month } = parseMonthKey(cursor);
		cursor = month === 12 ? (`${year + 1}-01` as TMonthKey) : (`${year}-${String(month + 1).padStart(2, "0")}` as TMonthKey);
	}
	return pending;
}

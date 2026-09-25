import { OPERATION_TIMEZONE } from "@/lib/operation-timezone";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { DB, DBTransaction } from "@/services/drizzle";
import { aiAgentRuns } from "@/services/drizzle/schema";
import { and, count, eq, gte, sql, sum } from "drizzle-orm";
import { AgentSpendLimitError } from "../shared/errors";

type TDb = DB | DBTransaction;

/**
 * Gasto mensal da organização com IA e o limite de créditos.
 *
 * `recursos.iaAtendimento.limiteCreditos` existia desde o redesign do atendimento e nunca foi
 * lido pelo runtime — o único freio era `maxRunsDiarios`. Aqui ele vira o que o rótulo promete:
 * um teto mensal, em USD estimados (`uso.custoUsd`), somado sobre `ai_agent_runs`.
 *
 * O mês é o de São Paulo: a organização pensa em "este mês" no fuso dela, e o limite deve virar
 * na mesma meia-noite em que ela vira o calendário.
 */

/** Primeiro instante do mês corrente no fuso da operação, como `Date` UTC. */
export function startOfCurrentMonthInOperationTimezone(now = new Date()): Date {
	const parts = new Intl.DateTimeFormat("en-US", { timeZone: OPERATION_TIMEZONE, year: "numeric", month: "2-digit" }).formatToParts(now);
	const year = Number(parts.find((part) => part.type === "year")?.value);
	const month = Number(parts.find((part) => part.type === "month")?.value);
	// Meia-noite local do dia 1: São Paulo é UTC-3 sem horário de verão desde 2019.
	return new Date(Date.UTC(year, month - 1, 1, 3, 0, 0, 0));
}

export type TOrganizationAiSpend = { custoUsd: number; runs: number; desde: Date };

export async function getOrganizationAiSpend(db: TDb, input: { organizacaoId: string; since?: Date }): Promise<TOrganizationAiSpend> {
	const desde = input.since ?? startOfCurrentMonthInOperationTimezone();
	const [row] = await db
		.select({
			custoUsd: sum(sql<number>`coalesce((${aiAgentRuns.uso} ->> 'custoUsd')::numeric, 0)`),
			runs: count(),
		})
		.from(aiAgentRuns)
		.where(and(eq(aiAgentRuns.organizacaoId, input.organizacaoId), gte(aiAgentRuns.dataInsercao, desde)));

	return { custoUsd: Number(row?.custoUsd ?? 0), runs: Number(row?.runs ?? 0), desde };
}

export function resolveAiSpendLimitUsd(configuracao: TOrganizationConfiguration | null | undefined): number | null {
	const limite = configuracao?.recursos?.iaAtendimento?.limiteCreditos;
	return typeof limite === "number" && limite > 0 ? limite : null;
}

/** `true` quando a organização já gastou o limite do mês. Sem limite configurado, nunca. */
export async function isAiSpendLimitReached(
	db: TDb,
	input: { organizacaoId: string; configuracao: TOrganizationConfiguration | null | undefined },
): Promise<boolean> {
	const limite = resolveAiSpendLimitUsd(input.configuracao);
	if (limite === null) return false;
	const { custoUsd } = await getOrganizationAiSpend(db, { organizacaoId: input.organizacaoId });
	return custoUsd >= limite;
}

export async function assertAiSpendWithinLimit(
	db: TDb,
	input: { organizacaoId: string; configuracao: TOrganizationConfiguration | null | undefined },
): Promise<void> {
	const limite = resolveAiSpendLimitUsd(input.configuracao);
	if (limite === null) return;
	const { custoUsd } = await getOrganizationAiSpend(db, { organizacaoId: input.organizacaoId });
	if (custoUsd >= limite) {
		throw new AgentSpendLimitError(
			`Limite mensal de créditos de IA atingido (US$ ${limite.toFixed(2)} configurados, US$ ${custoUsd.toFixed(2)} gastos).`,
		);
	}
}

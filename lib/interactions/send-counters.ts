import type { TCampaignDispatchSkipReasonEnum, TSendCounterWindowEnum } from "@/schemas/enums";
import { type DBTransaction, db } from "@/services/drizzle";
import { campaigns, interactions, organizations, sendCounters } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import weekOfYear from "dayjs/plugin/weekOfYear";
import { and, eq, sql } from "drizzle-orm";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(weekOfYear);

/**
 * Ledger O(1) de quota de envios, agnóstico de janela (Fase 1 do redesign de campanhas).
 *
 * Um envio é permitido sse TODAS as janelas aplicáveis têm saldo. Cada janela é uma linha em
 * `send_counters` (escopo organização ou campanha × DIARIO/SEMANAL); a reserva trava as linhas em
 * ordem fixa e incrementa `usados` numa única transação — sem COUNT(*), sem lock na linha da
 * organização, sem linhas BLOQUEADA em `interactions`.
 */

const INTERACTIONS_CRON_TIMEZONE = process.env.INTERACTIONS_CRON_TIMEZONE ?? "America/Sao_Paulo";

type TSendCounterExecutor = typeof db | DBTransaction;

export const SEND_COUNTER_WINDOWS: TSendCounterWindowEnum[] = ["DIARIO", "SEMANAL"];

export type TSendQuotaWindowKeys = {
	DIARIO: string;
	SEMANAL: string;
	startOfDay: Date;
	startOfWeek: Date;
};

// Chaves de período no fuso do cron de interações. A semana segue a mesma regra do ledger
// semanal antigo (dayjs `week`, domingo como início) para preservar as chaves já gravadas.
export function getSendQuotaWindowKeys(date: Date): TSendQuotaWindowKeys {
	const reference = dayjs(date).tz(INTERACTIONS_CRON_TIMEZONE);
	const startOfDay = reference.startOf("day");
	const startOfWeek = reference.startOf("week");
	const weekReference = dayjs(startOfWeek.toDate()).tz(INTERACTIONS_CRON_TIMEZONE);

	return {
		DIARIO: startOfDay.format("YYYY-MM-DD"),
		SEMANAL: `${weekReference.year()}-W${String(weekReference.week()).padStart(2, "0")}`,
		startOfDay: startOfDay.toDate(),
		startOfWeek: startOfWeek.toDate(),
	};
}

export type TSendQuotaLimits = {
	organizationDaily: number | null;
	organizationWeekly: number | null;
	campaignDaily: number | null;
	campaignWeekly: number | null;
};

export type TSendQuotaCounterScope = "ORG" | "CAMPANHA";

export type TSendQuotaCounterState = {
	scope: TSendQuotaCounterScope;
	tipo: TSendCounterWindowEnum;
	limit: number | null;
	used: number;
};

export type TSendQuotaGrant = {
	granted: number;
	// Janela que limitou a concessão (a primeira, na ordem fixa, que ficou sem saldo). Null quando
	// tudo que foi pedido coube.
	exhaustedBy: TCampaignDispatchSkipReasonEnum | null;
};

const SKIP_REASON_BY_COUNTER: Record<TSendQuotaCounterScope, Record<TSendCounterWindowEnum, TCampaignDispatchSkipReasonEnum>> = {
	ORG: { DIARIO: "QUOTA_ORG_DIARIO", SEMANAL: "QUOTA_ORG_SEMANAL" },
	CAMPANHA: { DIARIO: "QUOTA_CAMPANHA_DIARIO", SEMANAL: "QUOTA_CAMPANHA_SEMANAL" },
};

// Ordem fixa de aquisição (evita deadlock entre reservas concorrentes): org DIARIO -> org SEMANAL
// -> campanha DIARIO -> campanha SEMANAL. Espelha `ORDER BY campanha_id NULLS FIRST, tipo`.
export function listSendQuotaCounters(
	limits: TSendQuotaLimits,
): { scope: TSendQuotaCounterScope; tipo: TSendCounterWindowEnum; limit: number | null }[] {
	return [
		{ scope: "ORG", tipo: "DIARIO", limit: limits.organizationDaily },
		{ scope: "ORG", tipo: "SEMANAL", limit: limits.organizationWeekly },
		{ scope: "CAMPANHA", tipo: "DIARIO", limit: limits.campaignDaily },
		{ scope: "CAMPANHA", tipo: "SEMANAL", limit: limits.campaignWeekly },
	];
}

// Função pura: quanto de um pedido cabe em todas as janelas. Uma janela sem limite nunca restringe.
export function computeSendQuotaGrant({ counters, requested }: { counters: TSendQuotaCounterState[]; requested: number }): TSendQuotaGrant {
	let granted = Math.max(0, Math.floor(requested));
	let exhaustedBy: TCampaignDispatchSkipReasonEnum | null = null;

	for (const counter of counters) {
		if (counter.limit == null) continue;
		const remaining = Math.max(0, counter.limit - counter.used);
		if (remaining < granted) {
			granted = remaining;
			exhaustedBy = SKIP_REASON_BY_COUNTER[counter.scope][counter.tipo];
		}
	}

	return { granted, exhaustedBy };
}

export function getSendQuotaSkipReasonMessage(reason: TCampaignDispatchSkipReasonEnum): string {
	switch (reason) {
		case "QUOTA_ORG_DIARIO":
			return "Limite diário de envios da organização atingido.";
		case "QUOTA_ORG_SEMANAL":
			return "Limite semanal de envios da organização atingido.";
		case "QUOTA_CAMPANHA_DIARIO":
			return "Limite diário de envios da campanha atingido.";
		case "QUOTA_CAMPANHA_SEMANAL":
			return "Limite semanal de envios da campanha atingido.";
		case "SEM_CONTATO":
			return "Cliente não possui telefone nem e-mail para envio.";
		case "COMUNICACAO_PAUSADA":
			return "Comunicação com o cliente pausada.";
		case "FREQUENCIA":
			return "Cliente já recebeu esta campanha dentro do intervalo configurado.";
		case "CAMPANHA_INATIVA":
			return "Campanha pausada antes do envio.";
	}
}

export async function resolveSendQuotaLimits({
	executor = db,
	organizationId,
	campaignId,
}: {
	executor?: TSendCounterExecutor;
	organizationId: string;
	campaignId: string;
}): Promise<TSendQuotaLimits> {
	const [organization, campaign] = await Promise.all([
		executor.query.organizations.findFirst({ where: eq(organizations.id, organizationId), columns: { configuracao: true } }),
		executor.query.campaigns.findFirst({
			where: and(eq(campaigns.id, campaignId), eq(campaigns.organizacaoId, organizationId)),
			columns: { limiteEnviosSemanais: true },
		}),
	]);

	const preferences = organization?.configuracao?.preferencias;
	return {
		organizationDaily: preferences?.limiteMensagensDiariasViaCampanhas ?? null,
		organizationWeekly: preferences?.limiteMensagensSemanaisViaCampanhas ?? null,
		// Limite diário por campanha tem a mesma forma de linha; só entra quando o construtor pedir.
		campaignDaily: null,
		campaignWeekly: campaign?.limiteEnviosSemanais ?? null,
	};
}

// Cria o contador caso ainda não exista, inicializando `usados` a partir do COUNT(*) das
// interações que consomem quota na janela — backfill preguiçoso que só importa na janela de
// cutover (janelas novas começam em 0). O guard NOT EXISTS impede que o COUNT rode quando o
// contador já existe, mantendo o hot path O(1).
async function ensureSendCounter({
	executor,
	organizationId,
	campaignId,
	tipo,
	periodKey,
	windowStart,
}: {
	executor: TSendCounterExecutor;
	organizationId: string;
	campaignId: string | null;
	tipo: TSendCounterWindowEnum;
	periodKey: string;
	windowStart: Date;
}) {
	const rowId = crypto.randomUUID();
	const campaignFilterSql = campaignId == null ? sql`` : sql`AND i.campanha_id = ${campaignId}`;

	await executor.execute(sql`
		INSERT INTO ${sendCounters} (id, organizacao_id, campanha_id, tipo, periodo_chave, usados)
		SELECT ${rowId}, ${organizationId}, ${campaignId}, ${tipo}, ${periodKey}, (
			SELECT COUNT(*)::int
			FROM ${interactions} i
			WHERE i.organizacao_id = ${organizationId}
				AND i.campanha_id IS NOT NULL
				${campaignFilterSql}
				AND i.tipo = 'ENVIO-MENSAGEM'
				AND i.status_envio IN ('PENDENTE', 'ENVIADO', 'ENTREGUE', 'LIDO')
				AND COALESCE(i.metadados->>'teste', 'false') <> 'true'
				AND i.data_execucao >= ${windowStart.toISOString()}::timestamp
		)
		WHERE NOT EXISTS (
			SELECT 1 FROM ${sendCounters} c
			WHERE c.organizacao_id = ${organizationId}
				AND c.campanha_id IS NOT DISTINCT FROM ${campaignId}
				AND c.tipo = ${tipo}
				AND c.periodo_chave = ${periodKey}
		)
		ON CONFLICT (organizacao_id, campanha_id, tipo, periodo_chave) DO NOTHING
	`);
}

async function ensureSendCounters({
	executor,
	organizationId,
	campaignId,
	keys,
}: {
	executor: TSendCounterExecutor;
	organizationId: string;
	campaignId: string;
	keys: TSendQuotaWindowKeys;
}) {
	// Mesma ordem fixa da aquisição de locks.
	for (const scopeCampaignId of [null, campaignId]) {
		for (const tipo of SEND_COUNTER_WINDOWS) {
			await ensureSendCounter({
				executor,
				organizationId,
				campaignId: scopeCampaignId,
				tipo,
				periodKey: keys[tipo],
				windowStart: tipo === "DIARIO" ? keys.startOfDay : keys.startOfWeek,
			});
		}
	}
}

type TCounterRow = { campanha_id: string | null; tipo: TSendCounterWindowEnum; usados: number };

function windowKeysCondition(keys: TSendQuotaWindowKeys) {
	return sql`((c.tipo = 'DIARIO' AND c.periodo_chave = ${keys.DIARIO}) OR (c.tipo = 'SEMANAL' AND c.periodo_chave = ${keys.SEMANAL}))`;
}

function toCounterStates({ rows, limits }: { rows: TCounterRow[]; limits: TSendQuotaLimits }): TSendQuotaCounterState[] {
	const usedByKey = new Map(rows.map((row) => [`${row.campanha_id == null ? "ORG" : "CAMPANHA"}:${row.tipo}`, Number(row.usados ?? 0)]));
	return listSendQuotaCounters(limits).map((counter) => ({
		...counter,
		used: usedByKey.get(`${counter.scope}:${counter.tipo}`) ?? 0,
	}));
}

export type TSendQuotaReservation = TSendQuotaGrant & {
	reservedAt: Date;
	keys: TSendQuotaWindowKeys;
	counters: TSendQuotaCounterState[];
};

/**
 * Reserva quota para `requested` envios de uma campanha, numa única transação do chamador:
 * garante os contadores das janelas, trava-os em ordem fixa (FOR UPDATE), concede
 * min(saldo em cada janela, pedido) e incrementa todos os contadores pelo concedido.
 * Quem chama marca os excedentes como PULADA com `exhaustedBy`.
 */
export async function reserveSendQuota({
	tx,
	organizationId,
	campaignId,
	requested,
	limits,
	at = new Date(),
}: {
	tx: DBTransaction;
	organizationId: string;
	campaignId: string;
	requested: number;
	limits: TSendQuotaLimits;
	at?: Date;
}): Promise<TSendQuotaReservation> {
	const keys = getSendQuotaWindowKeys(at);
	const hasAnyLimit = listSendQuotaCounters(limits).some((counter) => counter.limit != null);

	// Sem nenhum limite configurado, ainda contabilizamos (o dashboard lê os contadores), mas sem
	// travar: não há decisão a serializar.
	await ensureSendCounters({ executor: tx, organizationId, campaignId, keys });

	const rows = (await tx.execute(sql`
		SELECT c.campanha_id, c.tipo, c.usados
		FROM ${sendCounters} c
		WHERE c.organizacao_id = ${organizationId}
			AND (c.campanha_id IS NULL OR c.campanha_id = ${campaignId})
			AND ${windowKeysCondition(keys)}
		ORDER BY c.campanha_id ASC NULLS FIRST, c.tipo ASC
		${hasAnyLimit ? sql`FOR UPDATE` : sql``}
	`)) as unknown as TCounterRow[];

	const counters = toCounterStates({ rows, limits });
	const grant = computeSendQuotaGrant({ counters, requested });

	if (grant.granted > 0) {
		await tx.execute(sql`
			UPDATE ${sendCounters} c
			SET usados = usados + ${grant.granted}
			WHERE c.organizacao_id = ${organizationId}
				AND (c.campanha_id IS NULL OR c.campanha_id = ${campaignId})
				AND ${windowKeysCondition(keys)}
		`);
	}

	return {
		...grant,
		reservedAt: at,
		keys,
		counters: counters.map((counter) => ({ ...counter, used: counter.used + grant.granted })),
	};
}

/**
 * Ajusta (±) todos os contadores que uma reserva incrementou, nas chaves de janela da própria
 * reserva — nunca "agora": uma falha depois da virada do dia/semana devolve quota à janela em que
 * foi consumida. `delta` negativo libera (falha terminal), positivo reconsome (FALHOU -> ENVIADO).
 */
export async function adjustSendQuota({
	tx,
	organizationId,
	campaignId,
	claimedAt,
	delta,
}: {
	tx?: DBTransaction;
	organizationId: string;
	campaignId: string;
	claimedAt: Date;
	delta: number;
}) {
	if (delta === 0) return;
	const keys = getSendQuotaWindowKeys(claimedAt);

	const apply = async (executor: DBTransaction) => {
		await ensureSendCounters({ executor, organizationId, campaignId, keys });
		await executor.execute(sql`
			UPDATE ${sendCounters} c
			SET usados = GREATEST(usados + ${delta}, 0)
			WHERE c.organizacao_id = ${organizationId}
				AND (c.campanha_id IS NULL OR c.campanha_id = ${campaignId})
				AND ${windowKeysCondition(keys)}
		`);
	};

	if (tx) return apply(tx);
	return db.transaction(apply);
}

export function releaseSendQuota({
	tx,
	organizationId,
	campaignId,
	reservedAt,
	count = 1,
}: {
	tx?: DBTransaction;
	organizationId: string;
	campaignId: string;
	reservedAt: Date;
	count?: number;
}) {
	return adjustSendQuota({ tx, organizationId, campaignId, claimedAt: reservedAt, delta: -count });
}

export type TSendQuotaWindowStatus = {
	tipo: TSendCounterWindowEnum;
	periodoChave: string;
	organizacao: { limite: number | null; usados: number; restante: number | null };
	campanha: { limite: number | null; usados: number; restante: number | null };
};

// Leitura sem lock, para estatísticas e para o dashboard.
export async function getSendQuotaStatus({
	executor = db,
	organizationId,
	campaignId,
	at = new Date(),
}: {
	executor?: TSendCounterExecutor;
	organizationId: string;
	campaignId: string;
	at?: Date;
}): Promise<TSendQuotaWindowStatus[]> {
	const keys = getSendQuotaWindowKeys(at);
	const limits = await resolveSendQuotaLimits({ executor, organizationId, campaignId });
	await ensureSendCounters({ executor, organizationId, campaignId, keys });

	const rows = (await executor.execute(sql`
		SELECT c.campanha_id, c.tipo, c.usados
		FROM ${sendCounters} c
		WHERE c.organizacao_id = ${organizationId}
			AND (c.campanha_id IS NULL OR c.campanha_id = ${campaignId})
			AND ${windowKeysCondition(keys)}
	`)) as unknown as TCounterRow[];
	const counters = toCounterStates({ rows, limits });

	const remaining = (limit: number | null, used: number) => (limit == null ? null : Math.max(limit - used, 0));
	return SEND_COUNTER_WINDOWS.map((tipo) => {
		const organization = counters.find((counter) => counter.scope === "ORG" && counter.tipo === tipo);
		const campaign = counters.find((counter) => counter.scope === "CAMPANHA" && counter.tipo === tipo);
		return {
			tipo,
			periodoChave: keys[tipo],
			organizacao: {
				limite: organization?.limit ?? null,
				usados: organization?.used ?? 0,
				restante: remaining(organization?.limit ?? null, organization?.used ?? 0),
			},
			campanha: { limite: campaign?.limit ?? null, usados: campaign?.used ?? 0, restante: remaining(campaign?.limit ?? null, campaign?.used ?? 0) },
		};
	});
}

// Uso agregado da organização nas janelas correntes (dashboard de saúde das campanhas).
export async function getOrganizationSendQuotaUsage({
	executor = db,
	organizationId,
	at = new Date(),
}: {
	executor?: TSendCounterExecutor;
	organizationId: string;
	at?: Date;
}): Promise<Record<TSendCounterWindowEnum, { periodoChave: string; usados: number }>> {
	const keys = getSendQuotaWindowKeys(at);
	const rows = (await executor.execute(sql`
		SELECT c.campanha_id, c.tipo, c.usados
		FROM ${sendCounters} c
		WHERE c.organizacao_id = ${organizationId}
			AND c.campanha_id IS NULL
			AND ${windowKeysCondition(keys)}
	`)) as unknown as TCounterRow[];

	return {
		DIARIO: { periodoChave: keys.DIARIO, usados: Number(rows.find((row) => row.tipo === "DIARIO")?.usados ?? 0) },
		SEMANAL: { periodoChave: keys.SEMANAL, usados: Number(rows.find((row) => row.tipo === "SEMANAL")?.usados ?? 0) },
	};
}
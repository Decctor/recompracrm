import type { TClientDuplicateReason } from "@/schemas/clients";
import { type DB, type DBTransaction, db as defaultDb } from "@/services/drizzle";
import { clientDuplicateCandidates, clients } from "@/services/drizzle/schema";
import { type SQL, and, eq, ne, sql } from "drizzle-orm";
import { buildClientNameDuplicateInsert, buildLiveDuplicateReasonsUpdate } from "./name-duplicate-query";

type TDetectionDb = DB | DBTransaction;

/** Normaliza @handle do Instagram para comparação (minúsculo, sem @, sem espaços). */
function normalizeInstagramHandle(handle: string | null | undefined): string | null {
	const normalized = handle?.trim().replace(/^@/, "").toLowerCase() ?? "";
	return normalized || null;
}

function normalizePair(clienteXId: string, clienteYId: string) {
	return clienteXId < clienteYId ? ([clienteXId, clienteYId] as const) : ([clienteYId, clienteXId] as const);
}

/**
 * Acima disto, o valor não é duplicidade — é preenchimento genérico. A base real
 * tinha 608 cadastros com "invalido@invalido.com.br" e 60 com "1111111111" numa
 * mesma organização: sem o corte, esse único e-mail geraria 184 mil pares e a
 * fila de reconciliação viraria ruído. Duplicidade legítima por valor
 * compartilhado (casal, telefone da empresa) fica bem abaixo do limite.
 */
const MAX_CLIENTS_PER_SIGNAL_VALUE = 10;

/**
 * Outros clientes da organização que compartilham o valor do sinal. Devolve
 * vazio quando o valor é genérico demais — o `limit` também impede que um
 * placeholder faça o gancho de criação de cliente varrer centenas de linhas.
 */
async function findSignalMatches({
	db,
	organizacaoId,
	clienteId,
	condition,
}: {
	db: TDetectionDb;
	organizacaoId: string;
	clienteId: string;
	condition: SQL;
}) {
	const matches = await db.query.clients.findMany({
		columns: { id: true },
		where: and(eq(clients.organizacaoId, organizacaoId), ne(clients.id, clienteId), condition),
		limit: MAX_CLIENTS_PER_SIGNAL_VALUE,
	});
	// `matches` exclui o próprio cliente: MAX linhas significam um grupo maior que MAX.
	return matches.length >= MAX_CLIENTS_PER_SIGNAL_VALUE ? [] : matches;
}

/**
 * Recalcula os candidatos a duplicidade envolvendo um cliente. Sinais
 * determinísticos apenas (telefone base, e-mail, cpf/cnpj, @ do Instagram);
 * pares já DESCARTADO/MESCLADO nunca são reabertos — o upsert só atualiza
 * motivos de pares PENDENTE.
 *
 * `whatsappUserId` fica de fora de propósito (único parcial por organização,
 * não pode gerar par) e `idExterno` também (não é escopado por integração;
 * dois ERPs podem emitir o mesmo id). Ver o plano, §4.
 *
 * Best-effort por contrato: chamadores nunca devem falhar a operação principal
 * por causa da detecção — use `recomputeClientDuplicatesSafely` nos ganchos.
 */
export async function recomputeClientDuplicatesForClient(input: { db?: TDetectionDb; organizacaoId: string; clienteId: string }): Promise<number> {
	const db = input.db ?? defaultDb;

	const client = await db.query.clients.findFirst({
		columns: { id: true, telefoneBase: true, email: true, cpfCnpj: true, instagram: true },
		where: and(eq(clients.id, input.clienteId), eq(clients.organizacaoId, input.organizacaoId)),
	});
	if (!client) return 0;

	const reasonsByOtherClient = new Map<string, TClientDuplicateReason[]>();
	function addReason(otherClientId: string, reason: TClientDuplicateReason) {
		const reasons = reasonsByOtherClient.get(otherClientId) ?? [];
		if (!reasons.some((existing) => existing.tipo === reason.tipo)) reasons.push(reason);
		reasonsByOtherClient.set(otherClientId, reasons);
	}

	const signals: { tipo: TClientDuplicateReason["tipo"]; valor: string | null; condition: (valor: string) => SQL }[] = [
		{ tipo: "TELEFONE", valor: client.telefoneBase?.trim() || null, condition: (valor) => eq(clients.telefoneBase, valor) },
		{ tipo: "EMAIL", valor: client.email?.trim().toLowerCase() || null, condition: (valor) => sql`lower(${clients.email}) = ${valor}` },
		{ tipo: "CPF_CNPJ", valor: client.cpfCnpj?.trim() || null, condition: (valor) => eq(clients.cpfCnpj, valor) },
		{
			tipo: "INSTAGRAM_USERNAME",
			valor: normalizeInstagramHandle(client.instagram),
			condition: (valor) => sql`lower(trim(leading '@' from coalesce(${clients.instagram}, ''))) = ${valor}`,
		},
	];

	for (const signal of signals) {
		if (!signal.valor) continue;
		const matches = await findSignalMatches({
			db,
			organizacaoId: input.organizacaoId,
			clienteId: client.id,
			condition: signal.condition(signal.valor),
		});
		for (const match of matches) addReason(match.id, { tipo: signal.tipo, valor: signal.valor });
	}

	let upserted = 0;
	for (const [otherClientId, motivos] of reasonsByOtherClient) {
		const [clienteAId, clienteBId] = normalizePair(client.id, otherClientId);
		await db
			.insert(clientDuplicateCandidates)
			.values({ organizacaoId: input.organizacaoId, clienteAId, clienteBId, motivos })
			.onConflictDoUpdate({
				target: [clientDuplicateCandidates.organizacaoId, clientDuplicateCandidates.clienteAId, clientDuplicateCandidates.clienteBId],
				set: {
					// Name evidence is maintained by the nightly sweep, not these live lookups.
					motivos: buildLiveDuplicateReasonsUpdate(motivos),
					dataAtualizacao: new Date(),
				},
				// Descartes e merges são permanentes — só pares pendentes recebem motivos novos.
				setWhere: sql`${clientDuplicateCandidates.status} = 'PENDENTE'`,
			});
		upserted += 1;
	}
	return upserted;
}

/** Variante que nunca propaga erro — para os ganchos (save de cliente, webhooks, syncs). */
export async function recomputeClientDuplicatesSafely(input: { db?: TDetectionDb; organizacaoId: string; clienteId: string }): Promise<void> {
	await recomputeClientDuplicatesForClient(input).catch((error) => {
		console.error("[CLIENT_DUPLICATES] Recompute failed:", { clienteId: input.clienteId, error });
	});
}

/**
 * Varredura set-based (cron + backfill do primeiro deploy): gera pares por
 * sinal via INSERT..SELECT com ON CONFLICT DO NOTHING. Pares que coincidem em
 * mais de um sinal ficam com o motivo do primeiro insert; o recheck ao vivo de
 * `getForEntity` completa os motivos quando a página é aberta.
 *
 * O CTE `valores` aplica o mesmo corte de MAX_CLIENTS_PER_SIGNAL_VALUE do
 * caminho event-driven: só valores compartilhados por 2..MAX cadastros da
 * organização viram pares.
 */
const SWEEP_SIGNALS: { tipo: TClientDuplicateReason["tipo"]; valorExpr: (alias: string) => string }[] = [
	{ tipo: "TELEFONE", valorExpr: (alias) => `nullif(trim(coalesce(${alias}.telefone_base, '')), '')` },
	{ tipo: "EMAIL", valorExpr: (alias) => `nullif(lower(trim(coalesce(${alias}.email, ''))), '')` },
	{ tipo: "CPF_CNPJ", valorExpr: (alias) => `nullif(trim(coalesce(${alias}.cpf_cnpj, '')), '')` },
	{ tipo: "INSTAGRAM_USERNAME", valorExpr: (alias) => `nullif(lower(trim(leading '@' from coalesce(${alias}.instagram, ''))), '')` },
];

export async function sweepClientDuplicates(input?: { db?: DB }): Promise<void> {
	const db = input?.db ?? defaultDb;

	for (const signal of SWEEP_SIGNALS) {
		// Sem interpolação de dado externo: alias e tipo são constantes deste módulo.
		await db.execute(
			sql.raw(`
				WITH valores AS (
					SELECT c.organizacao_id, ${signal.valorExpr("c")} AS valor
					FROM ampmais_clients c
					WHERE ${signal.valorExpr("c")} IS NOT NULL
					GROUP BY c.organizacao_id, ${signal.valorExpr("c")}
					HAVING count(*) BETWEEN 2 AND ${MAX_CLIENTS_PER_SIGNAL_VALUE}
				)
				INSERT INTO ampmais_client_duplicate_candidates (id, organizacao_id, cliente_a_id, cliente_b_id, motivos, status)
				SELECT gen_random_uuid(), v.organizacao_id, a.id, b.id,
					jsonb_build_array(jsonb_build_object('tipo', '${signal.tipo}', 'valor', v.valor)), 'PENDENTE'
				FROM valores v
				JOIN ampmais_clients a ON a.organizacao_id = v.organizacao_id AND ${signal.valorExpr("a")} = v.valor
				JOIN ampmais_clients b ON b.organizacao_id = v.organizacao_id AND ${signal.valorExpr("b")} = v.valor AND a.id < b.id
				ON CONFLICT (organizacao_id, cliente_a_id, cliente_b_id) DO NOTHING
			`),
		);
	}

	// Sequential per-organization work: a large tenant cannot monopolize the sweep.
	const organizations = await db.selectDistinct({ organizacaoId: clients.organizacaoId }).from(clients);
	const failedOrganizations: string[] = [];
	for (const { organizacaoId } of organizations) {
		const startedAt = Date.now();
		try {
			const candidates = await db.transaction(async (tx) => {
				await tx.execute(sql`set local statement_timeout = '15s'`);
				return tx.execute(buildClientNameDuplicateInsert(organizacaoId));
			});
			console.info("[CLIENT_DUPLICATES] Name sweep", { organizacaoId, candidates: candidates.length, durationMs: Date.now() - startedAt });
		} catch (error) {
			failedOrganizations.push(organizacaoId);
			console.error("[CLIENT_DUPLICATES] Name sweep failed", { organizacaoId, error });
		}
	}
	if (failedOrganizations.length) throw new Error(`Name duplicate sweep failed for ${failedOrganizations.length} organizations.`);
}

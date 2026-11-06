import type { DBTransaction } from "@/services/drizzle";
import { clients, organizations } from "@/services/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getStoreCreditHistoryByClient } from "./queries";

/**
 * Limite inicial de quem é pré-liberado ao ligar a exigência: o maior entre o que o cliente deve
 * hoje e o maior fiado que já tomou numa venda, arredondado para cima de R$ 10 em R$ 10.
 *
 * Só o saldo em aberto não basta: quem quitou tudo ficaria com limite zero e seria barrado na
 * primeira compra do dia seguinte — exatamente o que a pré-liberação existe para evitar. O maior
 * fiado de uma venda é o "tamanho de nota" que a loja já aceitava desse cliente; o gestor ajusta
 * no cadastro a partir daí.
 */
export function computeInitialStoreCreditLimit({ saldoAberto, maiorFiado }: { saldoAberto: number; maiorFiado: number }): number {
	const base = Math.max(saldoAberto, maiorFiado, 0);
	return Math.ceil(base / 10) * 10;
}

/** Quem a pré-liberação alcançaria: histórico de fiado e ainda não liberado. */
export async function getStoreCreditPreApprovalCandidates({ tx, organizacaoId }: { tx: DBTransaction; organizacaoId: string }) {
	const history = (await getStoreCreditHistoryByClient({ database: tx, organizacaoId })).filter((row) => row.maiorFiado > 0 || row.saldoAberto > 0);
	if (history.length === 0) return [];
	const alreadyReleased = await tx
		.select({ id: clients.id })
		.from(clients)
		.where(
			and(
				eq(clients.organizacaoId, organizacaoId),
				eq(clients.fiadoLiberado, true),
				inArray(
					clients.id,
					history.map((row) => row.clienteId),
				),
			),
		);
	const released = new Set(alreadyReleased.map((row) => row.id));
	return history.filter((row) => !released.has(row.clienteId)).map((row) => ({ ...row, fiadoLimite: computeInitialStoreCreditLimit(row) }));
}

/**
 * Liga/desliga a exigência de liberação. Ao ligar com `preApproveExisting`, libera na mesma
 * transação quem já compra fiado, com o limite de `computeInitialStoreCreditLimit` — quem já estava
 * liberado mantém a decisão que tem. Desligar não apaga liberações: religar volta ao mesmo estado.
 */
export async function updateStoreCreditPolicy({
	tx,
	organizacaoId,
	userId,
	exigeLiberacao,
	preApproveExisting,
}: {
	tx: DBTransaction;
	organizacaoId: string;
	userId: string;
	exigeLiberacao: boolean;
	preApproveExisting: boolean;
}): Promise<{ preApprovedCount: number }> {
	let preApprovedCount = 0;
	if (exigeLiberacao && preApproveExisting) {
		const candidates = await getStoreCreditPreApprovalCandidates({ tx, organizacaoId });
		const now = new Date();
		// Um UPDATE por faixa de limite: os candidatos costumam se concentrar em poucos valores.
		const byLimit = new Map<number, string[]>();
		for (const candidate of candidates) byLimit.set(candidate.fiadoLimite, [...(byLimit.get(candidate.fiadoLimite) ?? []), candidate.clienteId]);
		for (const [fiadoLimite, clientIds] of byLimit) {
			const updated = await tx
				.update(clients)
				.set({ fiadoLiberado: true, fiadoLimite, fiadoLiberadoPorId: userId, fiadoLiberadoEm: now })
				.where(and(eq(clients.organizacaoId, organizacaoId), eq(clients.fiadoLiberado, false), inArray(clients.id, clientIds)))
				.returning({ id: clients.id });
			preApprovedCount += updated.length;
		}
	}

	// jsonb_set em vez de ler-e-regravar a configuração inteira: não atropela uma edição concorrente
	// de outra preferência. O `jsonb_set` interno garante `preferencias` antes: o externo só cria a
	// última chave do caminho, e numa configuração sem `preferencias` não gravaria nada — a rota
	// responderia "exigida" com a regra desligada.
	const [updated] = await tx
		.update(organizations)
		.set({
			configuracao: sql`jsonb_set(jsonb_set(${organizations.configuracao}, '{preferencias}', coalesce(${organizations.configuracao}->'preferencias', '{}'::jsonb), true), '{preferencias,fiado}', ${JSON.stringify({ exigeLiberacao })}::jsonb, true)`,
		})
		.where(eq(organizations.id, organizacaoId))
		.returning({ exigeLiberacao: sql<boolean | null>`(${organizations.configuracao}->'preferencias'->'fiado'->>'exigeLiberacao')::boolean` });
	if ((updated?.exigeLiberacao ?? null) !== exigeLiberacao) throw new Error("A política de fiado não foi gravada na configuração da organização.");

	return { preApprovedCount };
}

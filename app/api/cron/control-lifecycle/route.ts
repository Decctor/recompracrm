import { syncControlLifecycleSafely } from "@/lib/control/sync";
import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { isControlLifecycleSyncEnabled } from "@/services/control";
import { db } from "@/services/drizzle";
import { controlLifecycleSyncs, organizations } from "@/services/drizzle/schema";
import { asc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Sincronização horária do ciclo de vida das organizações com o Syncroniza Control.
 *
 * Os pontos do produto (criação da organização, onboarding) já sincronizam na hora; este cron pega o
 * que só aparece com o tempo — primeira venda, primeira campanha entregue, primeiro resgate, um mês
 * de uso — e reconcilia o que falhou. Também é o backfill: na primeira rodada, todas as organizações
 * ainda sem registro vêm primeiro.
 *
 * Por rodada, as organizações sincronizadas há mais tempo, até o orçamento de tempo. O que sobrar
 * fica para a próxima hora; o cliente do Control limita o ritmo abaixo do teto da chave.
 */

const TIME_BUDGET_MS = 240_000;

async function syncControlLifecycleRoute(request: NextRequest) {
	assertCronAuthorized(request);
	if (!isControlLifecycleSyncEnabled()) {
		return NextResponse.json({
			data: { processadas: 0, falhas: 0, pendentes: 0 },
			message: "Sincronização com o Control desligada (CONTROL_API_KEY ausente).",
		});
	}

	const startedAt = Date.now();
	const queue = await db
		.select({ id: organizations.id })
		.from(organizations)
		.leftJoin(controlLifecycleSyncs, eq(controlLifecycleSyncs.organizacaoId, organizations.id))
		.orderBy(sql`${controlLifecycleSyncs.dataUltimaSincronizacao} asc nulls first`, asc(organizations.dataInsercao));

	let processed = 0;
	let failed = 0;
	for (const organization of queue) {
		if (Date.now() - startedAt > TIME_BUDGET_MS) break;
		const result = await syncControlLifecycleSafely(organization.id);
		processed += 1;
		if (!result) failed += 1;
	}

	return NextResponse.json({
		data: { processadas: processed, falhas: failed, pendentes: queue.length - processed },
		message: "Ciclo de vida sincronizado com o Control.",
	});
}

export const GET = appApiHandler({ GET: syncControlLifecycleRoute });
export const maxDuration = 300;

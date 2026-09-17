import "dotenv/config";
import { resolveDateForWindow } from "@/lib/campaigns/dispatch/schedule";
import type { TInteractionCronTimeBlock } from "@/lib/campaigns/time-blocks";
import { InteractionContextMetadataSchema } from "@/schemas/interactions";
import { connection, db } from "@/services/drizzle";
import { campaignDispatchRecipients, campaignDispatches, interactions } from "@/services/drizzle/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Cutover do pipeline de campanhas (drizzle/0109_campaign_dispatch_pipeline.sql, passo 2).
 *
 * Antes do redesign, `interactions` era também a fila: linhas com `status_envio IS NULL` eram
 * envios ainda não feitos (aguardando o cron do bloco horário), e `BLOQUEADA` marcava quem ficou
 * fora por quota/contato. Agora a fila é `campaign_dispatch_recipients` e uma interação só nasce
 * no envio. Este script:
 *
 *  1. converte cada interação de campanha ainda não enviada em um disparo de evento com um único
 *     destinatário (janela `legado:<interacao>`, agendado para a data+bloco originais, contexto
 *     copiado de `metadados`) e apaga a linha antiga — o relógio publica quando chegar a hora;
 *  2. apaga as linhas `BLOQUEADA` (decisão fechada no plano: lixo de timeline, não arquivo).
 *
 * Lê as colunas `agendamento_*` por SQL cru (o schema Drizzle já não as declara). Rode ANTES do
 * passo 3 da migration (drop das colunas). Dry-run por padrão; `--apply` persiste.
 */

const STALE_AFTER_HOURS = 48;

type TLegacyPendingRow = {
	id: string;
	organizacao_id: string;
	campanha_id: string;
	cliente_id: string;
	descricao: string | null;
	metadados: unknown;
	agendamento_data_referencia: string | null;
	agendamento_bloco_referencia: string | null;
	campanha_ativa: boolean;
};

async function main() {
	const apply = process.argv.includes("--apply");

	const pending = (await db.execute(sql`
		SELECT i.id, i.organizacao_id, i.campanha_id, i.cliente_id, i.descricao, i.metadados,
			i.agendamento_data_referencia, i.agendamento_bloco_referencia, c.ativo AS campanha_ativa
		FROM ${interactions} i
		JOIN ampmais_campaigns c ON c.id = i.campanha_id
		WHERE i.campanha_id IS NOT NULL
			AND i.tipo = 'ENVIO-MENSAGEM'
			AND i.status_envio IS NULL
			AND i.data_execucao IS NULL
		ORDER BY i.data_insercao ASC
	`)) as unknown as TLegacyPendingRow[];

	const [blocked] = (await db.execute(sql`SELECT count(*)::int AS total FROM ${interactions} WHERE status_envio = 'BLOQUEADA'`)) as unknown as {
		total: number;
	}[];

	// Pendência é só o que ainda faria sentido enviar: linhas cuja janela passou há mais de
	// STALE_AFTER_HOURS são restos de runs antigos que nunca saíram (o cron só drenava o dia
	// corrente). Convertê-las dispararia meses de "primeira compra" atrasados de uma vez.
	const now = new Date();
	const staleBefore = new Date(now.getTime() - STALE_AFTER_HOURS * 60 * 60_000);
	const classify = (row: TLegacyPendingRow): { kind: "CONVERT" | "INACTIVE" | "STALE"; scheduledAt: Date | null } => {
		const scheduledAt =
			row.agendamento_data_referencia && row.agendamento_bloco_referencia
				? resolveDateForWindow({
						dateKey: row.agendamento_data_referencia.slice(0, 10),
						block: row.agendamento_bloco_referencia as TInteractionCronTimeBlock,
					})
				: null;
		if (!row.campanha_ativa) return { kind: "INACTIVE", scheduledAt };
		if (scheduledAt && scheduledAt < staleBefore) return { kind: "STALE", scheduledAt };
		return { kind: "CONVERT", scheduledAt };
	};
	const classified = pending.map((row) => ({ row, ...classify(row) }));
	const counts = {
		convert: classified.filter((item) => item.kind === "CONVERT").length,
		inactive: classified.filter((item) => item.kind === "INACTIVE").length,
		stale: classified.filter((item) => item.kind === "STALE").length,
	};

	console.log(`${pending.length} interação(ões) de campanha ainda não enviadas:`);
	console.log(`  ${counts.convert} viram disparos (campanha ativa, janela nas últimas ${STALE_AFTER_HOURS}h ou futura);`);
	console.log(`  ${counts.stale} descartadas por janela vencida há mais de ${STALE_AFTER_HOURS}h;`);
	console.log(`  ${counts.inactive} descartadas por campanha pausada.`);
	console.log(`${blocked?.total ?? 0} interação(ões) BLOQUEADA (serão apagadas).`);

	if (!apply) {
		console.log("Execute novamente com --apply para migrar.");
		return;
	}

	let converted = 0;
	let discarded = 0;
	for (const { row, kind, scheduledAt } of classified) {
		await db.transaction(async (tx) => {
			if (kind !== "CONVERT") {
				await tx.delete(interactions).where(eq(interactions.id, row.id));
				discarded += 1;
				return;
			}

			const contexto = InteractionContextMetadataSchema.safeParse(row.metadados ?? {});

			const [dispatch] = await tx
				.insert(campaignDispatches)
				.values({
					organizacaoId: row.organizacao_id,
					campanhaId: row.campanha_id,
					origem: "EVENTO",
					janelaReferencia: `legado:${row.id}`,
					status: "PENDENTE",
					// Sem agenda ou já vencida: o relógio publica no próximo tick.
					dataAgendada: scheduledAt ?? now,
				})
				.onConflictDoNothing({ target: [campaignDispatches.campanhaId, campaignDispatches.janelaReferencia] })
				.returning({ id: campaignDispatches.id });
			if (!dispatch) return;

			await tx.insert(campaignDispatchRecipients).values({
				dispatchId: dispatch.id,
				organizacaoId: row.organizacao_id,
				campanhaId: row.campanha_id,
				clienteId: row.cliente_id,
				// O id antigo vira a chave de idempotência (e o id da interação nova): links de
				// rastreio já gerados com esse id continuam válidos.
				chaveIdempotencia: row.id,
				contexto: contexto.success ? contexto.data : null,
				descricao: row.descricao,
			});
			await tx.update(campaignDispatches).set({ totalDestinatarios: 1 }).where(eq(campaignDispatches.id, dispatch.id));
			await tx.delete(interactions).where(eq(interactions.id, row.id));
			converted += 1;
		});
	}

	const deletedBlocked = await db.execute(sql`DELETE FROM ${interactions} WHERE status_envio = 'BLOQUEADA'`);

	console.log(
		`Migração aplicada: ${converted} disparo(s) criado(s), ${discarded} pendência(s) descartada(s), ${deletedBlocked.count} BLOQUEADA apagada(s).`,
	);
}

main()
	.catch((error) => {
		console.error("Falha na migração de interações pendentes para disparos:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});

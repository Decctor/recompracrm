import { transferChatAttendance, updateChatAttendanceSummary } from "@/lib/chats/attendance-state";
import { notifyChatTransferRecipient } from "@/lib/chats/transfer-notification/notify";
import type { DB, DBTransaction } from "@/services/drizzle";
import { chats } from "@/services/drizzle/schema/chats";
import { organizationMembers } from "@/services/drizzle/schema/organizations";
import { users } from "@/services/drizzle/schema/users";
import { and, eq, sql } from "drizzle-orm";

/**
 * Handoff da IA para um humano.
 *
 * Transfere o atendimento ativo pela camada canônica (`transferChatAttendance`) e notifica o
 * destinatário por template do WhatsApp (`notifyChatTransferRecipient`, o mesmo das transferências
 * manuais). O motivo entra prefixado com `HUMAN_HANDOFF:`, que é como o hub identifica um
 * episódio encerrado pela IA.
 *
 * `organizacaoId` agora vem do chamador (contexto da execução) e entra no WHERE da busca do
 * chat — antes a função derivava a organização do próprio chat, sem verificar o tenant.
 */
export async function transferChatToHuman({
	db,
	organizacaoId,
	chatId,
	motivo,
	resumoConversa,
}: {
	db: DB | DBTransaction;
	organizacaoId: string;
	chatId: string;
	motivo: string;
	resumoConversa: string;
}): Promise<{ atendimentoId?: string; usuarioDestinoNome: string }> {
	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, chatId), eq(chats.organizacaoId, organizacaoId)),
		columns: { id: true },
	});

	if (!chat) throw new Error("Chat não encontrado.");

	// Candidatos: membros da organização com permissão de receber transferências.
	const candidates = await db
		.select({ id: users.id, nome: users.nome })
		.from(organizationMembers)
		.innerJoin(users, eq(users.id, organizationMembers.usuarioId))
		.where(
			and(
				eq(organizationMembers.organizacaoId, organizacaoId),
				sql`${organizationMembers.permissoes}->'atendimentos'->>'receberTransferencias' = 'true'`,
			),
		);

	if (candidates.length === 0) throw new Error("Nenhum usuário apto a receber transferências de atendimentos encontrado.");

	const target = candidates[Math.floor(Math.random() * candidates.length)];
	const summary = `[TRANSFERÊNCIA IA]\nMotivo: ${motivo}\n\nResumo da conversa:\n${resumoConversa}`;

	const attendance = await transferChatAttendance(db, {
		organizacaoId,
		chatId,
		usuarioDestinoId: target.id,
		motivo: `HUMAN_HANDOFF: ${motivo}`,
		// As estatísticas contam `resultado = 'HUMAN_HANDOFF'`; nada gravava isso, e o card de
		// handoffs ficava em zero. O ticket segue ativo com o humano e o resultado vale quando ele fechar.
		resultado: "HUMAN_HANDOFF",
	});
	// Depois da transferência, que garante o ticket: `updateChatAttendanceSummary` não abre ticket
	// e devolve `null` sem ele, e o resumo do handoff é justamente o que o humano precisa ler.
	await updateChatAttendanceSummary(db, { organizacaoId, chatId, resumo: summary });

	await notifyChatTransferRecipient({
		db,
		organizacaoId,
		chatId,
		usuarioDestinoId: target.id,
		transferidoPor: null,
		motivo,
		detalhes: summary,
	});

	return { atendimentoId: attendance?.id, usuarioDestinoNome: target.nome };
}

import { triggerAgentTurnFromHub } from "@/lib/ai/agent/hub-turn";
import { ensureOrganizationAgent } from "@/lib/ai/agent/provisioning";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertChatAccess, mayManageAssignment } from "@/lib/chats/access";
import { AI_ASSIGNMENT_BLOCK_MESSAGES, resolveAiAssignmentAvailability } from "@/lib/chats/ai-assignment";
import {
	assignChatAttendance,
	assignChatAttendanceToAgent,
	assumeChatAttendanceForUser,
	changeChatAttendancePriority,
	changeChatAttendanceStatus,
	getCurrentChatAttendance,
	releaseChatAttendance,
	type TCurrentChatAttendance,
	transferChatAttendance,
	updateChatAttendanceSummary,
} from "@/lib/chats/attendance-state";
import { ChatAssignmentPriorityEnum, ChatAssignmentStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { chats } from "@/services/drizzle/schema/chats";
import { organizationMembers } from "@/services/drizzle/schema/organizations";
import { users } from "@/services/drizzle/schema/users";
import { waitUntil } from "@vercel/functions";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ============= PATCH - Ações sobre o atendimento =============

const chatIdField = z.string({ required_error: "ID do chat não informado.", invalid_type_error: "Tipo inválido para o ID do chat." });
const motivoField = z.string({ invalid_type_error: "Tipo inválido para o motivo." }).trim().max(1000).optional().nullable();

const UpdateChatAssignmentInputSchema = z.discriminatedUnion("acao", [
	z.object({ acao: z.literal("assumir"), chatId: chatIdField }),
	z.object({
		acao: z.literal("transferir"),
		chatId: chatIdField,
		// Os destinos legais de uma transferência, enumerados em um lugar só. `EXTERNO` (o
		// telefone) não é expressável de propósito: aquele estado só nasce do echo do WhatsApp
		// Business, nunca de uma decisão do hub. `NAO_ATRIBUIDO` se alcança por `liberar`.
		destino: z.discriminatedUnion("tipo", [
			z.object({
				tipo: z.literal("USUARIO"),
				usuarioDestinoId: z.string({ required_error: "Usuário de destino não informado." }),
			}),
			z.object({ tipo: z.literal("AGENTE") }),
		]),
		motivo: motivoField,
		prioridade: ChatAssignmentPriorityEnum.optional().nullable(),
	}),
	z.object({ acao: z.literal("liberar"), chatId: chatIdField, motivo: motivoField }),
	z.object({ acao: z.literal("alterar_status"), chatId: chatIdField, status: ChatAssignmentStatusEnum }),
	z.object({ acao: z.literal("alterar_prioridade"), chatId: chatIdField, prioridade: ChatAssignmentPriorityEnum.nullable() }),
	z.object({
		acao: z.literal("alterar_resumo"),
		chatId: chatIdField,
		resumo: z.string({ required_error: "Resumo não informado.", invalid_type_error: "Tipo inválido para o resumo." }).trim().max(4000),
	}),
	z.object({ acao: z.literal("atribuir"), chatId: chatIdField, usuarioDestinoId: z.string({ required_error: "Usuário de destino não informado." }) }),
]);
export type TUpdateChatAssignmentInput = z.infer<typeof UpdateChatAssignmentInputSchema>;

/** Cada ação tem sua permissão de entrada; a posse é verificada depois, por atendimento. */
const ACTION_PERMISSION = {
	assumir: "responder",
	transferir: "receberTransferencias",
	liberar: "receberTransferencias",
	alterar_status: "responder",
	alterar_prioridade: "responder",
	alterar_resumo: "responder",
	atribuir: "finalizar",
} as const;

async function assertChatBelongsToOrganization({ organizacaoId, chatId }: { organizacaoId: string; chatId: string }) {
	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, chatId), eq(chats.organizacaoId, organizacaoId)),
		columns: { id: true },
	});
	if (!chat) throw new createHttpError.NotFound("Chat não encontrado.");
}

async function assertTargetUserIsActiveMember({ organizacaoId, usuarioId }: { organizacaoId: string; usuarioId: string }) {
	const [member] = await db
		.select({ id: users.id })
		.from(organizationMembers)
		.innerJoin(users, eq(users.id, organizationMembers.usuarioId))
		.where(and(eq(organizationMembers.organizacaoId, organizacaoId), eq(users.id, usuarioId)))
		.limit(1);
	if (!member) throw new createHttpError.BadRequest("Usuário de destino não encontrado nesta organização.");
}

/**
 * Entrega o atendimento ao agente de IA.
 *
 * Duas famílias de regra, na ordem em que importam:
 *
 * 1. **Estado de origem.** `EXTERNO` é barrado: o telefone é um humano respondendo pelo celular,
 *    e colocar a IA em paralelo com ele produziria duas respostas. Quem quiser mesmo entregar à
 *    IA assume do telefone primeiro — dois cliques que tornam a decisão explícita em vez de um
 *    override escondido. Já estar com o agente é no-op idempotente.
 * 2. **Disponibilidade do recurso.** A mesma cadeia que os webhooks checam antes de executar o
 *    agente (`resolveAiAssignmentAvailability`). Atribuir a um agente que o webhook vai ignorar
 *    deixaria o cliente esperando uma resposta que nunca chega.
 */
async function assignAttendanceToAgent({
	session,
	organizacaoId,
	atual,
	input,
}: {
	session: TAuthUserSession;
	organizacaoId: string;
	atual: NonNullable<TCurrentChatAttendance>;
	input: Extract<TUpdateChatAssignmentInput, { acao: "transferir" }>;
}) {
	if (atual.responsavelTipo === "EXTERNO") {
		throw new createHttpError.Conflict("Este atendimento está sendo conduzido pelo telefone. Assuma o atendimento antes de direcioná-lo ao agente.");
	}
	if (atual.responsavelTipo === "AGENTE") {
		return { data: { chatId: input.chatId, atendimentoId: atual.id }, message: "Este atendimento já está com o agente de IA." };
	}

	const disponibilidade = await resolveAiAssignmentAvailability(db, {
		organizacaoId,
		chatId: input.chatId,
		configuracao: session.membership?.organizacao.configuracao,
	});
	if (!disponibilidade.disponivel) {
		const mensagem = AI_ASSIGNMENT_BLOCK_MESSAGES[disponibilidade.motivo];
		// Plano é permissão (403); número desabilitado e agente pausado são estado corrigível
		// pela própria organização (409).
		if (disponibilidade.motivo === "RECURSO_INDISPONIVEL") throw new createHttpError.Forbidden(mensagem);
		throw new createHttpError.Conflict(mensagem);
	}

	// Provisionamento lazy, como nos webhooks: a organização pode nunca ter tido um agente.
	const agente = await ensureOrganizationAgent(db, organizacaoId);

	const assigned = await assignChatAttendanceToAgent(db, {
		organizacaoId,
		chatId: input.chatId,
		agenteId: agente.id,
		atribuidoPorUsuarioId: session.user.id,
		motivo: input.motivo ?? null,
		prioridade: input.prioridade ?? null,
	});
	if (!assigned) throw new createHttpError.Conflict("Conversa sem atendimento ativo.");

	// A resposta imediata é acessória à atribuição: roda fora do ciclo do request e uma falha
	// dela não desfaz a posse. Sem pendência do cliente nada é disparado — a IA atende o
	// próximo turno, pelo webhook.
	waitUntil(triggerAgentTurnFromHub({ organizacaoId, chatId: input.chatId, agenteId: agente.id }));

	return { data: { chatId: input.chatId, atendimentoId: assigned.id }, message: "Atendimento direcionado ao agente de IA." };
}

async function updateChatAssignment({ session, input }: { session: TAuthUserSession; input: TUpdateChatAssignmentInput }) {
	const { organizacaoId } = assertChatAccess({ session, permission: ACTION_PERMISSION[input.acao] });
	await assertChatBelongsToOrganization({ organizacaoId, chatId: input.chatId });

	if (input.acao === "assumir") {
		const assumed = await assumeChatAttendanceForUser(db, { organizacaoId, chatId: input.chatId, usuarioId: session.user.id });
		// null = o compare-and-set não casou: outro usuário assumiu entre a leitura e a
		// escrita. Sobrescrever aqui seria roubar a conversa de quem chegou primeiro.
		if (!assumed) throw new createHttpError.Conflict("Esta conversa já possui responsável.");
		return { data: { chatId: input.chatId, atendimentoId: assumed.id }, message: "Atendimento assumido." };
	}

	const atual = await getCurrentChatAttendance(db, { organizacaoId, chatId: input.chatId });

	if (input.acao === "atribuir") {
		await assertTargetUserIsActiveMember({ organizacaoId, usuarioId: input.usuarioDestinoId });
		const assigned = await assignChatAttendance(db, {
			organizacaoId,
			chatId: input.chatId,
			usuarioId: input.usuarioDestinoId,
			atribuidoPorUsuarioId: session.user.id,
		});
		return { data: { chatId: input.chatId, atendimentoId: assigned?.id ?? null }, message: "Atendimento atribuído." };
	}

	if (input.acao === "transferir") {
		if (!atual) throw new createHttpError.Conflict("Conversa sem atendimento ativo.");
		if (!mayManageAssignment({ session, assignment: atual })) {
			throw new createHttpError.Forbidden("Somente o responsável ou um gestor pode transferir este atendimento.");
		}

		if (input.destino.tipo === "AGENTE") {
			const assigned = await assignAttendanceToAgent({ session, organizacaoId, atual, input });
			return assigned;
		}

		await assertTargetUserIsActiveMember({ organizacaoId, usuarioId: input.destino.usuarioDestinoId });
		const transferred = await transferChatAttendance(db, {
			organizacaoId,
			chatId: input.chatId,
			usuarioDestinoId: input.destino.usuarioDestinoId,
			motivo: input.motivo ?? null,
			prioridade: input.prioridade ?? null,
			transferidoPorUsuarioId: session.user.id,
		});
		return { data: { chatId: input.chatId, atendimentoId: transferred?.id ?? null }, message: "Atendimento transferido." };
	}

	if (input.acao === "liberar") {
		if (!atual) throw new createHttpError.Conflict("Conversa sem atendimento ativo.");
		if (!mayManageAssignment({ session, assignment: atual })) {
			throw new createHttpError.Forbidden("Somente o responsável ou um gestor pode liberar este atendimento.");
		}
		const released = await releaseChatAttendance(db, { organizacaoId, chatId: input.chatId, motivo: input.motivo ?? null });
		return { data: { chatId: input.chatId, atendimentoId: released?.id ?? null }, message: "Atendimento liberado." };
	}

	if (input.acao === "alterar_status") {
		if (atual && !mayManageAssignment({ session, assignment: atual })) {
			throw new createHttpError.Forbidden("Somente o responsável ou um gestor pode alterar este atendimento.");
		}
		const updated = await changeChatAttendanceStatus(db, {
			organizacaoId,
			chatId: input.chatId,
			status: input.status,
			usuarioId: session.user.id,
		});
		return { data: { chatId: input.chatId, atendimentoId: updated?.id ?? null }, message: "Status do atendimento atualizado." };
	}

	if (input.acao === "alterar_resumo") {
		if (atual && !mayManageAssignment({ session, assignment: atual })) {
			throw new createHttpError.Forbidden("Somente o responsável ou um gestor pode alterar este atendimento.");
		}
		const updated = await updateChatAttendanceSummary(db, { organizacaoId, chatId: input.chatId, resumo: input.resumo });
		return { data: { chatId: input.chatId, atendimentoId: updated?.id ?? null }, message: "Resumo do atendimento atualizado." };
	}

	if (atual && !mayManageAssignment({ session, assignment: atual })) {
		throw new createHttpError.Forbidden("Somente o responsável ou um gestor pode alterar este atendimento.");
	}
	const updated = await changeChatAttendancePriority(db, { organizacaoId, chatId: input.chatId, prioridade: input.prioridade });
	return { data: { chatId: input.chatId, atendimentoId: updated?.id ?? null }, message: "Prioridade do atendimento atualizada." };
}
export type TUpdateChatAssignmentOutput = Awaited<ReturnType<typeof updateChatAssignment>>;

async function updateChatAssignmentRoute(req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const input = UpdateChatAssignmentInputSchema.parse(await req.json());
	const result = await updateChatAssignment({ session: session as TAuthUserSession, input });
	return NextResponse.json(result, { status: 200 });
}

// ============= GET - Usuários elegíveis para transferência =============

async function getTransferTargets({ session }: { session: TAuthUserSession }) {
	const { organizacaoId } = assertChatAccess({ session, permission: "visualizar" });

	const rows = await db
		.select({ id: users.id, nome: users.nome, avatarUrl: users.avatarUrl, permissoes: organizationMembers.permissoes })
		.from(organizationMembers)
		.innerJoin(users, eq(users.id, organizationMembers.usuarioId))
		.where(eq(organizationMembers.organizacaoId, organizacaoId));

	// Só faz sentido transferir para quem pode receber transferências e responder.
	const usuarios = rows
		.filter((row) => row.id !== session.user.id)
		.filter((row) => row.permissoes?.atendimentos?.receberTransferencias ?? false)
		.map((row) => ({ id: row.id, nome: row.nome, avatarUrl: row.avatarUrl }));

	return { data: { usuarios }, message: "Usuários carregados com sucesso." };
}
export type TGetTransferTargetsOutput = Awaited<ReturnType<typeof getTransferTargets>>;

async function getTransferTargetsRoute(_req: NextRequest) {
	const session = await getCurrentSessionUncached();
	const result = await getTransferTargets({ session: session as TAuthUserSession });
	return NextResponse.json(result, { status: 200 });
}

// ============= Export handlers =============

// O turno do agente disparado por `waitUntil` mantém a função viva depois da resposta, e isso
// conta contra o limite da rota. Mesmo teto do playground, que executa o mesmo pipeline.
export const maxDuration = 300;

export const GET = appApiHandler({ GET: getTransferTargetsRoute });
export const PATCH = appApiHandler({ PATCH: updateChatAssignmentRoute });

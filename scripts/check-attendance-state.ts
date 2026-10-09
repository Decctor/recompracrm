import "dotenv/config";
import {
	ATTENDANCE_TAKEOVER_REASON,
	assumeChatAttendanceForUser,
	changeChatAttendancePriority,
	changeChatAttendanceStatus,
	claimChatAttendanceForAgent,
	getCurrentChatAttendance,
	markChatAnswered,
	markChatAttendedExternally,
	markChatNeedsResponse,
	releaseChatAttendance,
	updateChatAttendanceSummary,
} from "@/lib/chats/attendance-state";
import { connection, db } from "@/services/drizzle";
import { chatAssignments, chats } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";

/**
 * Exercita as garantias de concorrência de lib/chats/attendance-state.ts contra um
 * Postgres descartável (NUNCA apontar para produção — o script apaga atendimentos).
 *
 * Uso: SUPABASE_DB_URL=postgres://... npx tsx ./scripts/check-attendance-state.ts
 */

const ORG = "org1";
let failures = 0;

function check(name: string, condition: boolean, detail?: unknown) {
	if (condition) {
		console.log(`  ✓ ${name}`);
		return;
	}
	failures++;
	console.error(`  ✗ ${name}`, detail ?? "");
}

async function resetChat(chatId: string, input: { entrada?: Date | null; saida?: Date | null }) {
	await db.delete(chatAssignments).where(eq(chatAssignments.chatId, chatId));
	await db
		.update(chats)
		.set({ ultimaMensagemEntradaData: input.entrada ?? null, ultimaMensagemSaidaData: input.saida ?? null })
		.where(eq(chats.id, chatId));
}

async function countActive(chatId: string) {
	const rows = await db.query.chatAssignments.findMany({
		where: and(eq(chatAssignments.chatId, chatId), eq(chatAssignments.organizacaoId, ORG)),
	});
	return rows.filter((row) => row.status !== "ENCERRADO" && row.status !== "CANCELADO").length;
}

async function main() {
	const chat = await db.query.chats.findFirst({ columns: { id: true } });
	if (!chat) throw new Error("Nenhum chat na base de teste.");
	const chatId = chat.id;
	const now = new Date();
	const antes = new Date(now.getTime() - 60_000);

	console.log("\n1. ensureCurrentAttendance concorrente cria um único ticket");
	await resetChat(chatId, { entrada: antes });
	await Promise.all([
		markChatNeedsResponse(db, { organizacaoId: ORG, chatId, messageDate: antes }),
		markChatNeedsResponse(db, { organizacaoId: ORG, chatId, messageDate: antes }),
		markChatNeedsResponse(db, { organizacaoId: ORG, chatId, messageDate: antes }),
	]);
	check("1 atendimento ativo após 3 inbounds simultâneos", (await countActive(chatId)) === 1);

	console.log("\n2. assumir concorrente: só um usuário ganha");
	await resetChat(chatId, { entrada: antes });
	await markChatNeedsResponse(db, { organizacaoId: ORG, chatId, messageDate: antes });
	const assumidos = await Promise.all([
		assumeChatAttendanceForUser(db, { organizacaoId: ORG, chatId, usuarioId: "user1" }),
		assumeChatAttendanceForUser(db, { organizacaoId: ORG, chatId, usuarioId: "user2" }),
	]);
	const vencedores = assumidos.filter(Boolean);
	check(
		"exatamente 1 usuário assumiu",
		vencedores.length === 1,
		assumidos.map((a) => a?.responsavelUsuarioId),
	);

	console.log("\n2b. assumir toma a conversa de um colega e registra como transferência");
	const dono = await getCurrentChatAttendance(db, { organizacaoId: ORG, chatId });
	const outroUsuario = dono?.responsavelUsuarioId === "user1" ? "user2" : "user1";
	const tomada = await assumeChatAttendanceForUser(db, { organizacaoId: ORG, chatId, usuarioId: outroUsuario });
	check("take-over devolve o ticket", !!tomada && tomada.id === dono?.id);
	check("novo responsável é quem assumiu", tomada?.responsavelUsuarioId === outroUsuario, tomada?.responsavelUsuarioId);
	check("motivo registrado como transferência", tomada?.transferenciaMotivo === ATTENDANCE_TAKEOVER_REASON, tomada?.transferenciaMotivo);
	check("segue um único atendimento ativo", (await countActive(chatId)) === 1);

	console.log("\n2c. alterar status/resumo/prioridade sem ticket ativo não cria ticket fantasma");
	await db.delete(chatAssignments).where(eq(chatAssignments.chatId, chatId));
	check("status devolve null", (await changeChatAttendanceStatus(db, { organizacaoId: ORG, chatId, status: "ENCERRADO" })) === null);
	check("resumo devolve null", (await updateChatAttendanceSummary(db, { organizacaoId: ORG, chatId, resumo: "x" })) === null);
	check("prioridade devolve null", (await changeChatAttendancePriority(db, { organizacaoId: ORG, chatId, prioridade: "ALTA" })) === null);
	check(
		"nenhum atendimento criado",
		(await countActive(chatId)) === 0 && (await db.query.chatAssignments.findMany({ where: eq(chatAssignments.chatId, chatId) })).length === 0,
	);
	await resetChat(chatId, { entrada: antes });
	await markChatNeedsResponse(db, { organizacaoId: ORG, chatId, messageDate: antes });
	await assumeChatAttendanceForUser(db, { organizacaoId: ORG, chatId, usuarioId: "user1" });

	console.log("\n3. IA recua quando um humano já assumiu");
	const claimed = await claimChatAttendanceForAgent(db, { organizacaoId: ORG, chatId });
	check("claim devolve null", claimed === null);
	const aposClaim = await getCurrentChatAttendance(db, { organizacaoId: ORG, chatId });
	check("responsável segue USUARIO", aposClaim?.responsavelTipo === "USUARIO", aposClaim?.responsavelTipo);

	console.log("\n4. echo do celular não rouba a conversa de um humano");
	await markChatAttendedExternally(db, { organizacaoId: ORG, chatId, responseDate: now });
	const aposEcho = await getCurrentChatAttendance(db, { organizacaoId: ORG, chatId });
	check("responsável segue USUARIO", aposEcho?.responsavelTipo === "USUARIO", aposEcho?.responsavelTipo);
	check(
		"echo registra a resposta (sai de ABERTO, primeira resposta gravada)",
		aposEcho?.status === "EM_ATENDIMENTO" && !!aposEcho?.dataPrimeiraResposta,
		aposEcho?.status,
	);

	console.log("\n5. dataPrimeiraResposta não muda na segunda resposta");
	await resetChat(chatId, { entrada: antes });
	await markChatNeedsResponse(db, { organizacaoId: ORG, chatId, messageDate: antes });
	const primeira = await markChatAnswered(db, { organizacaoId: ORG, chatId, responseDate: now, source: "HUB" });
	const depois = new Date(now.getTime() + 60_000);
	const segunda = await markChatAnswered(db, { organizacaoId: ORG, chatId, responseDate: depois, source: "HUB" });
	check("dataPrimeiraResposta preservada", primeira?.dataPrimeiraResposta?.getTime() === segunda?.dataPrimeiraResposta?.getTime());
	check("dataUltimaResposta avançou", segunda?.dataUltimaResposta?.getTime() === depois.getTime());
	check("status virou EM_ATENDIMENTO", segunda?.status === "EM_ATENDIMENTO", segunda?.status);

	console.log("\n6. encerrar libera o chat para um ticket novo");
	const encerrado = await changeChatAttendanceStatus(db, { organizacaoId: ORG, chatId, status: "ENCERRADO", usuarioId: "user1" });
	check("dataEncerramento gravada", !!encerrado?.dataEncerramento);
	check("nenhum atendimento ativo", (await countActive(chatId)) === 0);
	const novo = await markChatNeedsResponse(db, { organizacaoId: ORG, chatId, messageDate: now });
	check("novo ticket criado", !!novo && novo.id !== encerrado?.id);
	check("1 atendimento ativo", (await countActive(chatId)) === 1);

	console.log("\n7. liberar com pendência do cliente volta para ABERTO");
	await resetChat(chatId, { entrada: now, saida: antes });
	await assumeChatAttendanceForUser(db, { organizacaoId: ORG, chatId, usuarioId: "user1" });
	const liberado = await releaseChatAttendance(db, { organizacaoId: ORG, chatId, motivo: "teste" });
	check("responsável NAO_ATRIBUIDO", liberado?.responsavelTipo === "NAO_ATRIBUIDO", liberado?.responsavelTipo);
	check("status ABERTO", liberado?.status === "ABERTO", liberado?.status);
	check("dataLiberacao gravada", !!liberado?.dataLiberacao);

	console.log("\n8. IA reivindica um ticket livre");
	const claimLivre = await claimChatAttendanceForAgent(db, { organizacaoId: ORG, chatId });
	check("claim bem-sucedido", claimLivre?.responsavelTipo === "AGENTE", claimLivre?.responsavelTipo);

	console.log(failures === 0 ? "\nTodos os cenários passaram.\n" : `\n${failures} cenário(s) falharam.\n`);
	await connection.end();
	process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
	console.error("Falha inesperada:", error);
	await connection.end();
	process.exit(1);
});

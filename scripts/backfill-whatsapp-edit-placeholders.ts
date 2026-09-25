import "dotenv/config";
import { connection, db } from "@/services/drizzle";
import { chatMessages, chats } from "@/services/drizzle/schema";
import type { TChatMessageMetadata } from "@/schemas/chats";
import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";

/**
 * Backfill das edições do WhatsApp gravadas como placeholder.
 *
 * Até o fix(whatsapp) de 2026-09-24, cada edição (do cliente ou do app do celular) virava uma
 * mensagem nova com o texto `[Mensagem do tipo "edit" recebida — conteúdo não suportado]`. O
 * conteúdo da edição nunca foi perdido: o payload bruto de todo webhook da Meta fica em
 * `external_events`, com o wamid da edição, o wamid da mensagem original e o texto novo.
 *
 * Para cada placeholder, casado pelo wamid com o payload:
 * - original encontrada na mesma organização → aplica a edição na original (mesma regra do
 *   webhook: texto novo em `conteudoTexto`, anterior em `metadados.whatsappEdits`) e apaga o
 *   placeholder, reapontando `chats.ultima_mensagem_id` se ele era a última mensagem;
 * - original fora da base → o placeholder vira a mensagem com o texto editado, marcada como
 *   editada (é o que o webhook faz hoje quando não acha a original);
 * - sem payload → listado e ignorado.
 *
 * Edições da mesma mensagem são aplicadas em ordem cronológica, então o texto final é o da
 * última edição e o histórico guarda cada versão intermediária.
 */

const PLACEHOLDER_PREFIX = '[Mensagem do tipo "edit" recebida';
const LOG = "[WHATSAPP_EDIT_PLACEHOLDERS_BACKFILL]";

type TEditEvent = { whatsappMessageId: string; originalWhatsappMessageId: string; textContent: string };

function hasFlag(name: string) {
	return process.argv.includes(`--${name}`);
}

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const inlineArg = process.argv.find((arg) => arg.startsWith(prefix));
	if (inlineArg) return inlineArg.slice(prefix.length);
	const index = process.argv.indexOf(`--${name}`);
	if (index >= 0) return process.argv[index + 1] ?? null;
	return null;
}

function printUsage() {
	console.log(`Uso:
  npm run backfill:whatsapp-edit-placeholders
  npm run backfill:whatsapp-edit-placeholders -- --apply
  npm run backfill:whatsapp-edit-placeholders -- --apply --orgId=<id>

Opcoes:
  --apply   Persiste o backfill. Sem esta flag, roda em modo dry-run.
  --orgId   Restringe o backfill a uma organizacao.`);
}

/**
 * Lê as edições dos payloads brutos. Cobre os dois formatos: `messages` (cliente) e
 * `message_echoes` (app do celular). Mensagem sem alvo ou sem texto não é aplicável.
 */
async function loadEditEvents(since: Date): Promise<Map<string, TEditEvent>> {
	const rows = await db.execute<{ wamid: string; original: string | null; texto: string | null }>(sql`
		select
			item->>'id' as wamid,
			item->'edit'->>'original_message_id' as original,
			coalesce(
				item->'edit'->'message'->'text'->>'body',
				item->'edit'->'message'->'image'->>'caption',
				item->'edit'->'message'->'video'->>'caption',
				item->'edit'->'message'->'document'->>'caption'
			) as texto
		from ampmais_external_events e
		cross join lateral jsonb_array_elements(e.payload->'entry') entry
		cross join lateral jsonb_array_elements(entry->'changes') change
		cross join lateral jsonb_array_elements(
			coalesce(change->'value'->'messages', change->'value'->'message_echoes', '[]'::jsonb)
		) item
		where e.origem = 'META-WHATSAPP'
			and e.data_insercao >= ${since.toISOString()}::timestamp
			and item->>'type' = 'edit'
	`);

	const events = new Map<string, TEditEvent>();
	for (const row of rows) {
		if (!row.wamid || !row.original || !row.texto) continue;
		events.set(row.wamid, { whatsappMessageId: row.wamid, originalWhatsappMessageId: row.original, textContent: row.texto });
	}
	return events;
}

async function main() {
	if (hasFlag("help") || process.argv.includes("-h")) {
		printUsage();
		return;
	}
	const apply = hasFlag("apply");
	const orgId = getArgValue("orgId");

	const placeholders = await db
		.select({
			id: chatMessages.id,
			organizacaoId: chatMessages.organizacaoId,
			chatId: chatMessages.chatId,
			whatsappMessageId: chatMessages.whatsappMessageId,
			dataEnvio: chatMessages.dataEnvio,
			metadados: chatMessages.metadados,
		})
		.from(chatMessages)
		.where(and(like(chatMessages.conteudoTexto, `${PLACEHOLDER_PREFIX}%`), orgId ? eq(chatMessages.organizacaoId, orgId) : undefined))
		.orderBy(asc(chatMessages.dataEnvio));

	console.log(`${LOG} Placeholders encontrados: ${placeholders.length}${apply ? "" : " (dry-run)"}`);
	if (placeholders.length === 0) return;

	// Folga de um dia: o evento é gravado no recebimento, e a mensagem usa o timestamp da Meta.
	const since = new Date(placeholders[0].dataEnvio.getTime() - 24 * 60 * 60 * 1000);
	const events = await loadEditEvents(since);
	console.log(`${LOG} Edições lidas dos payloads: ${events.size}`);

	const originalIds = [...new Set([...events.values()].map((event) => event.originalWhatsappMessageId))];
	const originals = originalIds.length
		? await db
				.select({
					id: chatMessages.id,
					organizacaoId: chatMessages.organizacaoId,
					whatsappMessageId: chatMessages.whatsappMessageId,
					conteudoTexto: chatMessages.conteudoTexto,
					metadados: chatMessages.metadados,
				})
				.from(chatMessages)
				.where(inArray(chatMessages.whatsappMessageId, originalIds))
		: [];
	// Estado em memória: edições encadeadas da mesma original precisam ver o texto da anterior.
	const originalsByKey = new Map(originals.map((original) => [`${original.organizacaoId}:${original.whatsappMessageId}`, original]));

	const stats = { applied: 0, converted: 0, missingPayload: 0 };
	const touchedChatIds = new Set<string>();

	for (const placeholder of placeholders) {
		const event = placeholder.whatsappMessageId ? events.get(placeholder.whatsappMessageId) : undefined;
		if (!event) {
			stats.missingPayload++;
			console.warn(`${LOG} Sem payload para o placeholder ${placeholder.id} (wamid ${placeholder.whatsappMessageId})`);
			continue;
		}

		const date = placeholder.dataEnvio.toISOString();
		const original = originalsByKey.get(`${placeholder.organizacaoId}:${event.originalWhatsappMessageId}`);

		if (original) {
			const metadados: TChatMessageMetadata = original.metadados ?? {};
			const nextMetadados = { ...metadados, whatsappEdits: [...(metadados.whatsappEdits ?? []), { previousText: original.conteudoTexto, date }] };
			if (apply) {
				await db.transaction(async (tx) => {
					await tx.update(chatMessages).set({ conteudoTexto: event.textContent, metadados: nextMetadados }).where(eq(chatMessages.id, original.id));
					await tx.delete(chatMessages).where(eq(chatMessages.id, placeholder.id));
				});
			}
			original.conteudoTexto = event.textContent;
			original.metadados = nextMetadados;
			touchedChatIds.add(placeholder.chatId);
			stats.applied++;
			continue;
		}

		if (apply) {
			const metadados: TChatMessageMetadata = placeholder.metadados ?? {};
			await db
				.update(chatMessages)
				.set({ conteudoTexto: event.textContent, metadados: { ...metadados, whatsappEdits: [{ previousText: null, date }] } })
				.where(eq(chatMessages.id, placeholder.id));
		}
		stats.converted++;
	}

	// Placeholder apagado que era a última mensagem: o preview do chat aponta para a mais
	// recente que sobrou. As datas de entrada/saída ficam — a edição de fato aconteceu ali.
	let repointedChats = 0;
	if (apply) {
		for (const chatId of touchedChatIds) {
			const chat = await db.query.chats.findFirst({ where: eq(chats.id, chatId), columns: { ultimaMensagemId: true } });
			if (!chat?.ultimaMensagemId) continue;
			const stillExists = await db.query.chatMessages.findFirst({ where: eq(chatMessages.id, chat.ultimaMensagemId), columns: { id: true } });
			if (stillExists) continue;

			const latest = await db.query.chatMessages.findFirst({
				where: eq(chatMessages.chatId, chatId),
				orderBy: [desc(chatMessages.dataEnvio), desc(chatMessages.id)],
				columns: { id: true, dataEnvio: true },
			});
			if (!latest) continue;
			await db.update(chats).set({ ultimaMensagemId: latest.id, ultimaMensagemData: latest.dataEnvio }).where(eq(chats.id, chatId));
			repointedChats++;
		}
	}

	console.log(
		`${LOG} Aplicadas na original: ${stats.applied} | convertidas (original fora da base): ${stats.converted} | sem payload: ${stats.missingPayload}${
			apply ? ` | chats reapontados: ${repointedChats}` : ""
		}`,
	);
	if (!apply) console.log(`${LOG} Dry-run: nada foi gravado. Rode com --apply para persistir.`);
}

main()
	.catch((error) => {
		console.error(`${LOG} Falha:`, error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});

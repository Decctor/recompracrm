import "dotenv/config";
import { processChatMessageMedia } from "@/lib/chats/media-processing";
import { connection, db } from "@/services/drizzle";
import { chatMessages, organizations } from "@/services/drizzle/schema";
import type { TChatMessageContentTypeEnum } from "@/schemas/enums";
import { and, asc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";

/**
 * Reprocessa mídias de clientes que ficaram sem transcrição/descrição.
 *
 * Uma queda do AI Gateway (crédito esgotado, indisponibilidade) deixa áudios, imagens e
 * documentos com `conteudo_midia_texto_processado` nulo. O arquivo continua no storage, então
 * basta rodar o mesmo processamento do webhook de novo. Entre 21 e 24 de setembro de 2026 foram
 * 309 mensagens assim.
 *
 * Seleciona mensagens do cliente com arquivo armazenado e sem texto processado a partir de
 * `--since` (padrão: 2026-09-21). Dry-run por padrão; `--apply` processa, com concorrência baixa
 * para não disputar o gateway com o tráfego em tempo real.
 */

const LOG = "[REPROCESS_CHAT_MEDIA]";
const DEFAULT_SINCE = "2026-09-21";
const CONCURRENCY = 3;
const MEDIA_TYPES: Array<Exclude<TChatMessageContentTypeEnum, "TEXTO">> = ["AUDIO", "IMAGEM", "DOCUMENTO", "VIDEO"];

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
  npm run reprocess:chat-media
  npm run reprocess:chat-media -- --apply
  npm run reprocess:chat-media -- --apply --since=2026-09-21 --orgId=<id>

Opcoes:
  --apply   Processa as midias. Sem esta flag, so lista o que seria processado.
  --since   Data minima da mensagem (YYYY-MM-DD). Padrao: ${DEFAULT_SINCE}.
  --orgId   Restringe a uma organizacao.`);
}

async function main() {
	if (hasFlag("help") || process.argv.includes("-h")) {
		printUsage();
		return;
	}
	const apply = hasFlag("apply");
	const orgId = getArgValue("orgId");
	const since = new Date(`${getArgValue("since") ?? DEFAULT_SINCE}T00:00:00-03:00`);
	if (Number.isNaN(since.getTime())) throw new Error("Data inválida em --since.");

	const pending = await db
		.select({
			id: chatMessages.id,
			organizacaoId: chatMessages.organizacaoId,
			organizacao: organizations.nome,
			tipo: chatMessages.conteudoMidiaTipo,
			storageId: chatMessages.conteudoMidiaStorageId,
			mimeType: chatMessages.conteudoMidiaMimeType,
			dataEnvio: chatMessages.dataEnvio,
		})
		.from(chatMessages)
		.innerJoin(organizations, eq(organizations.id, chatMessages.organizacaoId))
		.where(
			and(
				eq(chatMessages.autorTipo, "CLIENTE"),
				inArray(chatMessages.conteudoMidiaTipo, MEDIA_TYPES),
				isNotNull(chatMessages.conteudoMidiaStorageId),
				isNull(chatMessages.conteudoMidiaTextoProcessado),
				gte(chatMessages.dataEnvio, since),
				orgId ? eq(chatMessages.organizacaoId, orgId) : undefined,
			),
		)
		.orderBy(asc(chatMessages.dataEnvio));

	const byOrgAndType = new Map<string, number>();
	for (const row of pending) {
		const key = `${row.organizacao} / ${row.tipo}`;
		byOrgAndType.set(key, (byOrgAndType.get(key) ?? 0) + 1);
	}
	console.log(`${LOG} Mensagens sem texto processado desde ${since.toISOString().slice(0, 10)}: ${pending.length}${apply ? "" : " (dry-run)"}`);
	for (const [key, total] of [...byOrgAndType.entries()].sort()) console.log(`${LOG}   ${key}: ${total}`);
	if (!apply || pending.length === 0) {
		if (!apply) console.log(`${LOG} Dry-run: nada foi processado. Rode com --apply para processar.`);
		return;
	}

	const stats = { processed: 0, failed: 0, skipped: 0 };
	let cursor = 0;
	const worker = async () => {
		while (cursor < pending.length) {
			const row = pending[cursor++];
			if (!row.storageId || !row.mimeType || row.tipo === "TEXTO") {
				stats.skipped++;
				continue;
			}
			const result = await processChatMessageMedia({
				messageId: row.id,
				organizacaoId: row.organizacaoId,
				storageId: row.storageId,
				mimeType: row.mimeType,
				mediaType: row.tipo,
				log: LOG,
			});
			stats[result.status]++;
			if (result.status === "failed") console.warn(`${LOG} Falhou ${row.id} (${row.organizacao}, ${row.tipo}): ${result.error}`);
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));

	// O evento do webhook ficou como FALHOU por causa da mídia; com a mensagem processada, o
	// status do inbox passaria a mentir. Só toca os eventos cuja falha foi de crédito do gateway.
	const [reconciled] = await db.execute<{ total: number }>(sql`
		with updated as (
			update ampmais_external_events
			set processamento_status = 'PROCESSADO', processamento_ultimo_erro = null
			where origem = 'META-WHATSAPP'
				and processamento_status = 'FALHOU'
				and data_insercao >= ${since.toISOString()}::timestamp
				and processamento_ultimo_erro ilike '%credit balance%'
			returning id
		)
		select count(*)::int as total from updated
	`);

	console.log(
		`${LOG} Processadas: ${stats.processed} | falharam: ${stats.failed} | puladas: ${stats.skipped} | eventos do inbox reconciliados: ${reconciled?.total ?? 0}`,
	);
}

main()
	.catch((error) => {
		console.error(`${LOG} Falha:`, error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});

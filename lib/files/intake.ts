import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getAgentTemplateMediaPrefix } from "@/lib/message-templates/agent-media";
import type { TFileVisibilityEnum, TUploadPurposeEnum } from "@/schemas/enums";
import type { TUploadConsumption, TUploadContext } from "@/schemas/files";
import { db } from "@/services/drizzle";
import { uploads, type TFileEntity, type TUploadEntity } from "@/services/drizzle/schema";
import { and, eq, lt } from "drizzle-orm";
import createHttpError from "http-errors";
import { PRIVATE_FILES_BUCKET } from "@/lib/files-storage/buckets";
import { getStorageDriver } from "./drivers";
import { inspectImageFile, sniffMimeType, type TInspectedFile } from "./inspect";
import { getFileById, registerStoredFile, sanitizeFileName, sha256Hex, storeFile } from "./service";

const PUBLIC_FILES_BUCKET = "files";
const ALLOWED_TEMPLATE_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

type TUploadPurposeBase = {
	maxBytes: number;
	/** Janela entre criar a intenção e receber os bytes; depois disso a varredura marca EXPIRADO. */
	ttlMinutes: number;
	bucket: string;
	visibilidade: TFileVisibilityEnum;
	storagePrefix: (input: { organizacaoId: string }) => string;
};

/**
 * Como os bytes chegam:
 * - `PROXY`: PUT same-origin em /api/uploads/[id]; o servidor decodifica o conteúdo por completo.
 *   O corpo de requisição na Vercel é limitado a ~4.5 MB — `maxBytes` fica abaixo disso.
 * - `DIRECT`: o cliente envia ao provedor por URL assinada (sem limite de corpo da Vercel) e o
 *   servidor confere depois, em `completeDirectUpload`: tamanho exato, SHA-256 e tipo pela
 *   assinatura dos primeiros bytes. Para arquivos gerados no navegador (PDFs, imagens de peças).
 */
export type TUploadPurposeDefinition =
	| (TUploadPurposeBase & {
			transport: "PROXY";
			/** Valida os bytes por sniffing e decodificação COMPLETA — nunca confie em mime declarado. */
			inspect: (buffer: Buffer) => Promise<TInspectedFile>;
	  })
	| (TUploadPurposeBase & {
			transport: "DIRECT";
			mimeTypes: ReadonlySet<string>;
	  });

/**
 * Registro de propósitos de upload — a fonte da verdade sobre o que cada tipo de arquivo aceita
 * e onde ele é gravado. Novo propósito = nova entrada aqui + novo membro em `UploadPurposeEnum`
 * (schemas/enums.ts); o banco não muda (`proposito` é varchar). Ver README.md.
 */
export const UPLOAD_PURPOSES: Record<TUploadPurposeEnum, TUploadPurposeDefinition> = {
	MIDIA_TEMPLATE_MENSAGEM: {
		transport: "PROXY",
		maxBytes: 4 * 1024 * 1024,
		ttlMinutes: 60,
		bucket: PUBLIC_FILES_BUCKET,
		visibilidade: "PUBLICO",
		storagePrefix: getAgentTemplateMediaPrefix,
		inspect: (buffer) => inspectImageFile(buffer, { allowedMimeTypes: ALLOWED_TEMPLATE_IMAGE_TYPES }),
	},
	// Arquivos das peças de comunicação visual, gerados no navegador (lib/visual-kits/generation).
	ARQUIVO_KIT_VISUAL: {
		transport: "DIRECT",
		maxBytes: 50 * 1024 * 1024,
		ttlMinutes: 60,
		bucket: PRIVATE_FILES_BUCKET,
		visibilidade: "PRIVADO",
		storagePrefix: ({ organizacaoId }) => `visual-kits/${organizacaoId}/`,
		mimeTypes: new Set(["application/pdf", "image/png", "image/jpeg"]),
	},
};

function hashUploadToken(token: string) {
	return createHash("sha256").update(token).digest("hex");
}

function getAppBaseUrl() {
	const base = process.env.NEXT_PUBLIC_APP_URL;
	if (!base) throw new createHttpError.InternalServerError("URL base da aplicação não configurada.");
	return new URL(base).origin;
}

function getPurposeDefinition(proposito: string): TUploadPurposeDefinition {
	const definition = UPLOAD_PURPOSES[proposito as TUploadPurposeEnum];
	if (!definition) throw new createHttpError.BadRequest("Propósito de upload desconhecido.");
	return definition;
}

export async function createUploadIntake({
	organizacaoId,
	proposito,
	nomeArquivo,
	tamanhoEsperadoBytes,
	sha256Esperado,
	criadoPorId,
	contexto,
}: {
	organizacaoId: string;
	proposito: TUploadPurposeEnum;
	nomeArquivo?: string | null;
	tamanhoEsperadoBytes: number;
	sha256Esperado?: string | null;
	criadoPorId?: string | null;
	contexto?: TUploadContext | null;
}) {
	const definition = getPurposeDefinition(proposito);
	if (definition.transport !== "PROXY")
		throw new createHttpError.BadRequest("Este propósito usa envio direto: crie a intenção com createDirectUploadIntake.");
	if (!Number.isInteger(tamanhoEsperadoBytes) || tamanhoEsperadoBytes <= 0 || tamanhoEsperadoBytes > definition.maxBytes) {
		throw new createHttpError.BadRequest(`O arquivo deve ter mais de 0 e no máximo ${Math.floor(definition.maxBytes / (1024 * 1024))} MB.`);
	}
	const normalizedSha256 = sha256Esperado?.trim().toLowerCase() || null;
	if (normalizedSha256 && !/^[0-9a-f]{64}$/.test(normalizedSha256)) {
		throw new createHttpError.BadRequest("O SHA-256 declarado é inválido (esperado: 64 caracteres hexadecimais).");
	}

	const token = randomBytes(32).toString("base64url");
	const dataExpiracao = new Date(Date.now() + definition.ttlMinutes * 60 * 1000);
	const [upload] = await db
		.insert(uploads)
		.values({
			organizacaoId,
			proposito,
			tokenHash: hashUploadToken(token),
			nomeArquivo: nomeArquivo?.trim() || null,
			tamanhoEsperadoBytes,
			sha256Esperado: normalizedSha256,
			criadoPorId: criadoPorId ?? null,
			contexto: contexto ?? null,
			dataExpiracao,
		})
		.returning();

	return {
		uploadId: upload.id,
		uploadUrl: `${getAppBaseUrl()}/api/uploads/${upload.id}`,
		token,
		expiraEm: dataExpiracao,
		tamanhoMaximoBytes: definition.maxBytes,
	};
}

/**
 * Recebe os bytes do PUT: confere token, janela e o contrato de integridade (tamanho e, se
 * declarado, SHA-256) ANTES de inspecionar e gravar. Bytes truncados no caminho — a causa da
 * imagem cinza que motivou este contrato — falham aqui com um erro que diz exatamente o que
 * chegou versus o que foi declarado, em vez de virarem um arquivo corrompido no ar.
 */
export async function receiveUploadBytes({
	uploadId,
	token,
	buffer,
}: {
	uploadId: string;
	token: string;
	buffer: Buffer;
}): Promise<{ upload: TUploadEntity; arquivo: TFileEntity }> {
	const upload = await db.query.uploads.findFirst({ where: eq(uploads.id, uploadId) });
	if (!upload) throw new createHttpError.NotFound("Upload não encontrado.");

	const presentedHash = Buffer.from(hashUploadToken(token));
	const storedHash = Buffer.from(upload.tokenHash);
	if (presentedHash.length !== storedHash.length || !timingSafeEqual(presentedHash, storedHash)) {
		throw new createHttpError.Unauthorized("Token de upload inválido.");
	}
	if (upload.status !== "AGUARDANDO") throw new createHttpError.Conflict("Este upload já foi recebido, consumido ou expirou.");
	if (upload.dataExpiracao <= new Date()) throw new createHttpError.BadRequest("Este upload expirou. Crie um novo antes de enviar os bytes.");

	const definition = getPurposeDefinition(upload.proposito);
	if (definition.transport !== "PROXY") throw new createHttpError.BadRequest("Este upload usa envio direto ao armazenamento.");
	if (buffer.length !== upload.tamanhoEsperadoBytes) {
		throw new createHttpError.BadRequest(
			`Foram recebidos ${buffer.length} bytes, mas o upload declarou ${upload.tamanhoEsperadoBytes}. O arquivo chegou incompleto ou alterado — envie novamente.`,
		);
	}
	const digest = sha256Hex(buffer);
	if (upload.sha256Esperado && digest !== upload.sha256Esperado) {
		throw new createHttpError.BadRequest("O SHA-256 dos bytes recebidos não bate com o declarado. O arquivo chegou corrompido — envie novamente.");
	}

	const inspected = await definition.inspect(buffer);
	const fileName = sanitizeFileName(upload.nomeArquivo || "arquivo", inspected.mimeType);
	const caminho = `${definition.storagePrefix({ organizacaoId: upload.organizacaoId })}${crypto.randomUUID()}/${fileName}`;
	const arquivo = await storeFile({
		organizacaoId: upload.organizacaoId,
		bucket: definition.bucket,
		caminho,
		visibilidade: definition.visibilidade,
		buffer,
		mimeType: inspected.mimeType,
		nomeOriginal: upload.nomeArquivo,
		metadados: inspected.metadados,
	});

	// Update condicionado ao status: um PUT concorrente que chegou primeiro vence, e este vira
	// conflito em vez de sobrescrever o resultado.
	const [updated] = await db
		.update(uploads)
		.set({ status: "RECEBIDO", arquivoId: arquivo.id, dataRecebimento: new Date() })
		.where(and(eq(uploads.id, upload.id), eq(uploads.status, "AGUARDANDO")))
		.returning();
	if (!updated) throw new createHttpError.Conflict("Este upload foi recebido por outra requisição.");
	return { upload: updated, arquivo };
}

// -----------------------------------------------------------------------------
// UPLOAD DIRETO (cliente → provedor por URL assinada; conferência no servidor)
// -----------------------------------------------------------------------------

// Cada upload direto tem a própria pasta (o id): a varredura remove a pasta de um envio abandonado
// sem precisar saber o nome final do arquivo.
function directUploadFolder(definition: TUploadPurposeDefinition, upload: { id: string; organizacaoId: string }) {
	return `${definition.storagePrefix({ organizacaoId: upload.organizacaoId })}${upload.id}/`;
}

function directUploadPath(
	definition: TUploadPurposeDefinition,
	upload: { id: string; organizacaoId: string; nomeArquivo: string | null },
	mimeType: string,
) {
	return `${directUploadFolder(definition, upload)}${sanitizeFileName(upload.nomeArquivo || "arquivo", mimeType)}`;
}

/**
 * Intenção de upload direto: registra o contrato (tamanho, SHA-256 e tipo OBRIGATÓRIOS — o
 * servidor não vê os bytes na ida, então confere tudo na volta) e devolve a URL assinada do
 * provedor. O caminho é derivado do id do upload, então nada além da linha precisa ser guardado.
 */
export async function createDirectUploadIntake({
	organizacaoId,
	proposito,
	nomeArquivo,
	mimeType,
	tamanhoEsperadoBytes,
	sha256Esperado,
	criadoPorId,
	contexto,
}: {
	organizacaoId: string;
	proposito: TUploadPurposeEnum;
	nomeArquivo: string;
	mimeType: string;
	tamanhoEsperadoBytes: number;
	sha256Esperado: string;
	criadoPorId?: string | null;
	contexto?: TUploadContext | null;
}) {
	const definition = getPurposeDefinition(proposito);
	if (definition.transport !== "DIRECT") throw new createHttpError.BadRequest("Este propósito não aceita envio direto.");
	if (!definition.mimeTypes.has(mimeType)) throw new createHttpError.BadRequest("Tipo de arquivo não aceito para este envio.");
	if (!Number.isInteger(tamanhoEsperadoBytes) || tamanhoEsperadoBytes <= 0 || tamanhoEsperadoBytes > definition.maxBytes) {
		throw new createHttpError.BadRequest(`O arquivo deve ter mais de 0 e no máximo ${Math.floor(definition.maxBytes / (1024 * 1024))} MB.`);
	}
	const normalizedSha256 = sha256Esperado.trim().toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(normalizedSha256))
		throw new createHttpError.BadRequest("O SHA-256 declarado é inválido (esperado: 64 caracteres hexadecimais).");

	const dataExpiracao = new Date(Date.now() + definition.ttlMinutes * 60 * 1000);
	const [upload] = await db
		.insert(uploads)
		.values({
			organizacaoId,
			proposito,
			// Envio direto não usa o PUT same-origin: o hash de um token aleatório descartado só
			// satisfaz a coluna (única e obrigatória) sem abrir esse caminho.
			tokenHash: hashUploadToken(randomBytes(32).toString("base64url")),
			nomeArquivo: nomeArquivo.trim() || null,
			tamanhoEsperadoBytes,
			sha256Esperado: normalizedSha256,
			criadoPorId: criadoPorId ?? null,
			contexto: contexto ?? null,
			dataExpiracao,
		})
		.returning();

	const { signedUrl } = await getStorageDriver("SUPABASE").createSignedUpload({
		bucket: definition.bucket,
		caminho: directUploadPath(definition, upload, mimeType),
	});
	return { uploadId: upload.id, signedUrl, mimeType, expiraEm: dataExpiracao };
}

/**
 * Confere um upload direto e o materializa no catálogo (RECEBIDO). Lê o objeto do provedor em
 * streaming — sem carregá-lo inteiro em memória — calculando tamanho e SHA-256 e guardando os
 * primeiros bytes para conferir o tipo pela assinatura. Qualquer divergência remove o objeto.
 */
export async function completeDirectUpload({
	uploadId,
	organizacaoId,
	mimeType,
}: {
	uploadId: string;
	organizacaoId: string;
	mimeType: string;
}): Promise<{ upload: TUploadEntity; arquivo: TFileEntity }> {
	const upload = await db.query.uploads.findFirst({ where: and(eq(uploads.id, uploadId), eq(uploads.organizacaoId, organizacaoId)) });
	if (!upload) throw new createHttpError.NotFound("Upload não encontrado.");
	if (upload.status !== "AGUARDANDO") throw new createHttpError.Conflict("Este upload já foi conferido, consumido ou expirou.");
	if (upload.dataExpiracao <= new Date()) throw new createHttpError.BadRequest("Este upload expirou. Gere os arquivos de novo.");
	const definition = getPurposeDefinition(upload.proposito);
	if (definition.transport !== "DIRECT") throw new createHttpError.BadRequest("Este upload não é de envio direto.");
	if (!definition.mimeTypes.has(mimeType)) throw new createHttpError.BadRequest("Tipo de arquivo não aceito para este envio.");

	const driver = getStorageDriver("SUPABASE");
	const caminho = directUploadPath(definition, upload, mimeType);
	const readUrl = await driver.signedUrl({ bucket: definition.bucket, caminho, expiraEmSegundos: 5 * 60 });
	const response = await fetch(readUrl).catch(() => null);
	if (!response?.ok || !response.body) throw new createHttpError.BadRequest("O arquivo não chegou ao armazenamento. Envie novamente.");

	const discard = () => driver.remove({ bucket: definition.bucket, caminho }).catch(() => undefined);
	const hash = createHash("sha256");
	const head = new Uint8Array(16);
	let received = 0;
	const reader = response.body.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (received < head.length) head.set(value.subarray(0, head.length - received), received);
		received += value.length;
		if (received > upload.tamanhoEsperadoBytes) {
			await reader.cancel();
			break;
		}
		hash.update(value);
	}

	if (received !== upload.tamanhoEsperadoBytes) {
		await discard();
		throw new createHttpError.BadRequest(
			`O armazenamento recebeu ${received} bytes, mas o envio declarou ${upload.tamanhoEsperadoBytes}. Envie novamente.`,
		);
	}
	const digest = hash.digest("hex");
	if (digest !== upload.sha256Esperado) {
		await discard();
		throw new createHttpError.BadRequest("O SHA-256 do arquivo recebido não bate com o declarado. Envie novamente.");
	}
	if (sniffMimeType(head) !== mimeType) {
		await discard();
		throw new createHttpError.BadRequest("O conteúdo do arquivo não corresponde ao tipo declarado.");
	}

	const arquivo = await registerStoredFile({
		organizacaoId: upload.organizacaoId,
		bucket: definition.bucket,
		caminho,
		visibilidade: definition.visibilidade,
		mimeType,
		tamanhoBytes: received,
		sha256: digest,
		nomeOriginal: upload.nomeArquivo,
	});
	const [updated] = await db
		.update(uploads)
		.set({ status: "RECEBIDO", arquivoId: arquivo.id, dataRecebimento: new Date() })
		.where(and(eq(uploads.id, upload.id), eq(uploads.status, "AGUARDANDO")))
		.returning();
	if (!updated) throw new createHttpError.Conflict("Este upload foi conferido por outra requisição.");
	return { upload: updated, arquivo };
}

/** Consome um upload RECEBIDO em nome de uma feature, registrando o que o consumiu. */
export async function consumeUpload({
	uploadId,
	organizacaoId,
	proposito,
	consumo,
}: {
	uploadId: string;
	organizacaoId: string;
	proposito: TUploadPurposeEnum;
	consumo?: TUploadConsumption | null;
}): Promise<{ upload: TUploadEntity; arquivo: TFileEntity }> {
	const upload = await db.query.uploads.findFirst({ where: and(eq(uploads.id, uploadId), eq(uploads.organizacaoId, organizacaoId)) });
	if (!upload) throw new createHttpError.NotFound("Upload não encontrado.");
	if (upload.proposito !== proposito) throw new createHttpError.BadRequest("O upload não pertence a este propósito.");
	if (upload.status === "CONSUMIDO") throw new createHttpError.Conflict("Este upload já foi consumido.");
	if (upload.status !== "RECEBIDO" || !upload.arquivoId) {
		throw new createHttpError.BadRequest("Os bytes deste upload ainda não foram recebidos. Faça o PUT na uploadUrl antes de concluir.");
	}

	const [updated] = await db
		.update(uploads)
		.set({ status: "CONSUMIDO", dataConsumo: new Date(), consumo: consumo ?? null })
		.where(and(eq(uploads.id, upload.id), eq(uploads.status, "RECEBIDO")))
		.returning();
	if (!updated) throw new createHttpError.Conflict("Este upload foi consumido por outra requisição.");
	const arquivo = await getFileById({ arquivoId: updated.arquivoId! });
	return { upload: updated, arquivo };
}

/**
 * Marca como EXPIRADO os uploads cuja janela de recebimento passou. Envios diretos abandonados
 * podem ter deixado bytes no provedor (enviados, nunca conferidos): a pasta deles é removida.
 * Idempotente, para cron.
 */
export async function sweepExpiredUploads() {
	const expired = await db
		.update(uploads)
		.set({ status: "EXPIRADO" })
		.where(and(eq(uploads.status, "AGUARDANDO"), lt(uploads.dataExpiracao, new Date())))
		.returning({ id: uploads.id, proposito: uploads.proposito, organizacaoId: uploads.organizacaoId });

	const driver = getStorageDriver("SUPABASE");
	let removedFolders = 0;
	for (const upload of expired) {
		const definition = UPLOAD_PURPOSES[upload.proposito as TUploadPurposeEnum];
		if (definition?.transport !== "DIRECT") continue;
		await driver
			.removeFolder({ bucket: definition.bucket, prefix: directUploadFolder(definition, upload) })
			.then(() => {
				removedFolders += 1;
			})
			.catch((error) => console.error("[UPLOADS] [SWEEP] Falha ao remover envio direto abandonado:", upload.id, error));
	}
	return { expired: expired.length, removedFolders };
}

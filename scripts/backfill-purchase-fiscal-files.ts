import "dotenv/config";
import { createHash } from "node:crypto";
import { PRIVATE_FILES_BUCKET } from "@/lib/files-storage/buckets";
import { registerStoredFile } from "@/lib/files/service";
import { buildPurchaseImportedDocumentPath } from "@/lib/purchase/imported-documents";
import { PurchaseImportedDocumentsSnapshotSchema, type TPurchaseImportedDocument } from "@/schemas/purchases";
import { connection, db } from "@/services/drizzle";
import { files, fiscalInboundDocuments, purchaseItems, purchases } from "@/services/drizzle/schema";
import { createClient } from "@supabase/supabase-js";
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";

/**
 * Backfill de 0138_purchase_fiscal_entry_documents.sql (ADR-0002, Fase 1). Rodar DEPOIS da migração
 * e do deploy; cada etapa é idempotente e pode ser repetida.
 *
 *   npx tsx ./scripts/backfill-purchase-fiscal-files.ts --dry-run
 *   npx tsx ./scripts/backfill-purchase-fiscal-files.ts
 *   npx tsx ./scripts/backfill-purchase-fiscal-files.ts --only=purchase-documents
 *
 * Etapas, na ordem de execução:
 *   purchase-documents  cada documento em `purchases.documentos_importados` sem `arquivoId` entra no
 *                       catálogo `files` NO CAMINHO EM QUE JÁ ESTÁ (nada é copiado), depois de conferir
 *                       o sha256 gravado no snapshot. XML com chave vira linha em
 *                       fiscal_inbound_documents (provedor MANUAL) presa à compra.
 *   inbound-assets      `xml_storage_path`/`pdf_storage_path` de notas recebidas viram linhas em
 *                       `files` (também no caminho atual) e preenchem `xml_arquivo_id`/`pdf_arquivo_id`.
 *   item-pointers       itens sem `documento_ref` cujos modificadores apontam todos para o mesmo
 *                       documento recebem esse `documento_ref`. `documento_item` fica nulo: o item
 *                       antigo não guardou o nItem e inferir pelo código do fornecedor seria chute.
 *
 * Nenhuma etapa apaga objeto do Storage nem remove as colunas de caminho: isso é um passo à parte,
 * depois que uma leitura pela rota autenticada confirmar que todo documento resolve por `arquivoId`.
 */

const ALL_STEPS = ["purchase-documents", "inbound-assets", "item-pointers"] as const;
type TStep = (typeof ALL_STEPS)[number];

const dryRun = process.argv.includes("--dry-run");
const onlyArgument = process.argv.find((argument) => argument.startsWith("--only="));
const requestedSteps = onlyArgument
	? new Set(
			onlyArgument
				.slice("--only=".length)
				.split(",")
				.map((step) => step.trim()),
		)
	: new Set<string>(ALL_STEPS);
const steps: TStep[] = ALL_STEPS.filter((step) => requestedSteps.has(step));

function log(message: string) {
	console.log(`${dryRun ? "[dry-run] " : ""}${message}`);
}

// Cliente próprio: `services/supabase/admin.ts` é `server-only` e não resolve fora do Next.
function getStorage() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !secretKey) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY.");
	return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }).storage;
}

async function downloadPrivate(path: string): Promise<Buffer | null> {
	const { data, error } = await getStorage().from(PRIVATE_FILES_BUCKET).download(path);
	if (error || !data) return null;
	return Buffer.from(await data.arrayBuffer());
}

const MIME_BY_EXTENSION: Record<string, string> = {
	xml: "application/xml",
	pdf: "application/pdf",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
};

/**
 * Cataloga um objeto que já está no bucket privado, no caminho em que está. A linha é única por
 * (provedor, bucket, caminho), então rodar de novo devolve a mesma linha.
 */
async function catalogExistingObject({
	organizacaoId,
	caminho,
	mimeType,
	nomeOriginal,
	expectedSha256,
}: {
	organizacaoId: string;
	caminho: string;
	mimeType: string;
	nomeOriginal: string | null;
	expectedSha256: string | null;
}) {
	const existing = await db.query.files.findFirst({
		where: and(eq(files.provedor, "SUPABASE"), eq(files.bucket, PRIVATE_FILES_BUCKET), eq(files.caminho, caminho)),
	});
	if (existing) return { arquivoId: existing.id, status: "existente" as const };

	const buffer = await downloadPrivate(caminho);
	if (!buffer) return { arquivoId: null, status: "objeto-ausente" as const };
	const sha256 = createHash("sha256").update(buffer).digest("hex");
	if (expectedSha256 && sha256 !== expectedSha256) return { arquivoId: null, status: "sha256-divergente" as const };
	if (dryRun) return { arquivoId: "dry-run", status: "catalogado" as const };

	const file = await registerStoredFile({
		organizacaoId,
		bucket: PRIVATE_FILES_BUCKET,
		caminho,
		visibilidade: "PRIVADO",
		mimeType,
		tamanhoBytes: buffer.length,
		sha256,
		nomeOriginal,
	});
	return { arquivoId: file.id, status: "catalogado" as const };
}

async function upsertManualInboundDocument({
	organizacaoId,
	purchaseId,
	document,
	purchase,
}: {
	organizacaoId: string;
	purchaseId: string;
	document: TPurchaseImportedDocument & { arquivoId: string };
	purchase: { pedidoFornecedorCnpj: string | null; pedidoFornecedorNome: string | null; fornecedorId: string | null };
}) {
	const chaveAcesso = document.chaveAcesso?.replace(/\D/g, "") ?? "";
	if (chaveAcesso.length !== 44) return { documentoFiscalId: null, status: "sem-chave" as const };

	const existing = await db.query.fiscalInboundDocuments.findFirst({
		where: and(eq(fiscalInboundDocuments.organizacaoId, organizacaoId), eq(fiscalInboundDocuments.chaveAcesso, chaveAcesso)),
		columns: { id: true, compraId: true, xmlArquivoId: true },
	});
	if (existing) {
		if (existing.compraId && existing.compraId !== purchaseId) return { documentoFiscalId: existing.id, status: "presa-a-outra-compra" as const };
		if (!dryRun)
			await db
				.update(fiscalInboundDocuments)
				.set({ compraId: purchaseId, xmlArquivoId: existing.xmlArquivoId ?? document.arquivoId, completo: true, dataAtualizacao: new Date() })
				.where(eq(fiscalInboundDocuments.id, existing.id));
		return { documentoFiscalId: existing.id, status: "vinculada" as const };
	}
	if (dryRun) return { documentoFiscalId: "dry-run", status: "criada" as const };
	const [inserted] = await db
		.insert(fiscalInboundDocuments)
		.values({
			organizacaoId,
			fornecedorId: purchase.fornecedorId,
			chaveAcesso,
			modelo: "NFE",
			provedor: "MANUAL",
			completo: true,
			emitenteCnpj: purchase.pedidoFornecedorCnpj?.replace(/\D/g, "") || null,
			emitenteNome: purchase.pedidoFornecedorNome,
			dataEmissao: document.dataEmissao ? new Date(`${document.dataEmissao.slice(0, 10)}T00:00:00.000Z`) : null,
			valorTotal: document.totaisOriginais?.documentoCentavos != null ? document.totaisOriginais.documentoCentavos / 100 : null,
			xmlArquivoId: document.arquivoId,
			compraId: purchaseId,
		})
		.returning({ id: fiscalInboundDocuments.id });
	return { documentoFiscalId: inserted?.id ?? null, status: "criada" as const };
}

async function backfillPurchaseDocuments() {
	const rows = await db
		.select({
			id: purchases.id,
			organizacaoId: purchases.organizacaoId,
			fornecedorId: purchases.fornecedorId,
			pedidoFornecedorCnpj: purchases.pedidoFornecedorCnpj,
			pedidoFornecedorNome: purchases.pedidoFornecedorNome,
			documentosImportados: purchases.documentosImportados,
		})
		.from(purchases)
		.where(and(isNotNull(purchases.organizacaoId), sql`${purchases.documentosImportados}->'documentos' @> '[{}]'::jsonb`));

	const counters: Record<string, number> = {};
	const bump = (key: string) => (counters[key] = (counters[key] ?? 0) + 1);

	for (const row of rows) {
		if (!row.organizacaoId) continue;
		const parsed = PurchaseImportedDocumentsSnapshotSchema.safeParse(row.documentosImportados);
		if (!parsed.success) {
			bump("snapshot-invalido");
			continue;
		}
		let changed = false;
		const documentos: TPurchaseImportedDocument[] = [];
		for (const document of parsed.data.documentos) {
			let next = { ...document };
			if (!next.arquivoId && next.arquivo) {
				const extension = (next.arquivo.nomeOriginal ?? "").split(".").pop()?.toLowerCase() ?? "";
				const mimeType = next.arquivo.mimeType ?? MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
				const result = await catalogExistingObject({
					organizacaoId: row.organizacaoId,
					caminho: buildPurchaseImportedDocumentPath({ organizationId: row.organizacaoId, referencia: next.referencia }),
					mimeType,
					nomeOriginal: next.arquivo.nomeOriginal ?? null,
					expectedSha256: next.arquivo.sha256 ?? null,
				});
				bump(`arquivo:${result.status}`);
				if (result.arquivoId) {
					next = { ...next, arquivoId: result.arquivoId };
					changed = true;
				} else log(`compra ${row.id} · documento ${next.referencia}: ${result.status}`);
			}
			if (next.arquivoId && !next.documentoFiscalId && next.origem === "XML") {
				const result = await upsertManualInboundDocument({
					organizacaoId: row.organizacaoId,
					purchaseId: row.id,
					document: next as TPurchaseImportedDocument & { arquivoId: string },
					purchase: row,
				});
				bump(`nota:${result.status}`);
				if (result.status === "presa-a-outra-compra") log(`compra ${row.id} · chave ${next.chaveAcesso}: já lançada em outra compra`);
				else if (result.documentoFiscalId) {
					next = { ...next, documentoFiscalId: result.documentoFiscalId };
					changed = true;
				}
			}
			documentos.push(next);
		}
		if (changed && !dryRun)
			await db
				.update(purchases)
				.set({ documentosImportados: { versao: 1, documentos } })
				.where(eq(purchases.id, row.id));
		if (changed) bump("compras-atualizadas");
	}
	log(`purchase-documents: ${JSON.stringify(counters)}`);
}

async function backfillInboundAssets() {
	const rows = await db
		.select({
			id: fiscalInboundDocuments.id,
			organizacaoId: fiscalInboundDocuments.organizacaoId,
			chaveAcesso: fiscalInboundDocuments.chaveAcesso,
			xmlStoragePath: fiscalInboundDocuments.xmlStoragePath,
			pdfStoragePath: fiscalInboundDocuments.pdfStoragePath,
			xmlArquivoId: fiscalInboundDocuments.xmlArquivoId,
			pdfArquivoId: fiscalInboundDocuments.pdfArquivoId,
		})
		.from(fiscalInboundDocuments)
		.where(
			or(
				and(isNotNull(fiscalInboundDocuments.xmlStoragePath), isNull(fiscalInboundDocuments.xmlArquivoId)),
				and(isNotNull(fiscalInboundDocuments.pdfStoragePath), isNull(fiscalInboundDocuments.pdfArquivoId)),
			),
		);

	const counters: Record<string, number> = {};
	const bump = (key: string) => (counters[key] = (counters[key] ?? 0) + 1);
	for (const row of rows) {
		const patch: { xmlArquivoId?: string; pdfArquivoId?: string } = {};
		for (const asset of ["xml", "pdf"] as const) {
			const caminho = asset === "xml" ? row.xmlStoragePath : row.pdfStoragePath;
			const current = asset === "xml" ? row.xmlArquivoId : row.pdfArquivoId;
			if (!caminho || current) continue;
			const result = await catalogExistingObject({
				organizacaoId: row.organizacaoId,
				caminho,
				mimeType: MIME_BY_EXTENSION[asset],
				nomeOriginal: `${row.chaveAcesso}.${asset}`,
				expectedSha256: null,
			});
			bump(`${asset}:${result.status}`);
			if (result.arquivoId) patch[asset === "xml" ? "xmlArquivoId" : "pdfArquivoId"] = result.arquivoId;
			else log(`nota ${row.chaveAcesso} · ${asset}: ${result.status}`);
		}
		if (Object.keys(patch).length > 0 && !dryRun)
			await db
				.update(fiscalInboundDocuments)
				.set({ ...patch, dataAtualizacao: new Date() })
				.where(eq(fiscalInboundDocuments.id, row.id));
	}
	log(`inbound-assets: ${JSON.stringify(counters)}`);
}

async function backfillItemPointers() {
	const rows = await db
		.select({ id: purchaseItems.id, modificadoresCusto: purchaseItems.modificadoresCusto })
		.from(purchaseItems)
		.where(and(isNull(purchaseItems.documentoRef), isNotNull(purchaseItems.modificadoresCusto)));
	let updated = 0;
	let ambiguous = 0;
	for (const row of rows) {
		const refs = new Set((row.modificadoresCusto?.modificadores ?? []).map((modifier) => modifier.documentoRef).filter((ref): ref is string => !!ref));
		if (refs.size !== 1) {
			if (refs.size > 1) ambiguous++;
			continue;
		}
		const [documentoRef] = refs;
		if (!dryRun) await db.update(purchaseItems).set({ documentoRef }).where(eq(purchaseItems.id, row.id));
		updated++;
	}
	log(`item-pointers: ${updated} itens apontados, ${ambiguous} ambíguos (mais de um documento), ${rows.length - updated - ambiguous} sem referência`);
}

async function main() {
	log(`Etapas: ${steps.join(", ")}`);
	for (const step of steps) {
		if (step === "purchase-documents") await backfillPurchaseDocuments();
		if (step === "inbound-assets") await backfillInboundAssets();
		if (step === "item-pointers") await backfillItemPointers();
	}
}

main()
	.catch((error) => {
		console.error("Falha no backfill:", error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());

import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { downloadPrivateFile } from "@/lib/files-storage/private";
import { getOrganizationFileById, readStoredFile } from "@/lib/files/service";
import { buildPurchaseImportedDocumentPath } from "@/lib/purchase/imported-documents";
import { PurchaseImportedDocumentsSnapshotSchema } from "@/schemas/purchases";
import { db } from "@/services/drizzle";
import { purchases } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const GetPurchaseImportedDocumentInputSchema = z.object({
	purchaseId: z.string({ required_error: "ID da compra não informado." }),
	referencia: z.string({ required_error: "Referência do documento não informada." }),
	// "inline" serve the file for an in-page preview; anything else downloads it.
	disposition: z
		.string({ invalid_type_error: "Tipo não válido para a forma de entrega do arquivo." })
		.optional()
		.nullable()
		.transform((value) => (value === "inline" ? ("inline" as const) : ("attachment" as const))),
});
export type TGetPurchaseImportedDocumentInput = z.infer<typeof GetPurchaseImportedDocumentInputSchema>;

async function getPurchaseImportedDocument(input: TGetPurchaseImportedDocumentInput) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership.permissoes.compras.visualizar) throw new createHttpError.Forbidden("Você não possui permissão para visualizar compras.");
	const purchase = await db.query.purchases.findFirst({
		where: and(eq(purchases.id, input.purchaseId), eq(purchases.organizacaoId, session.membership.organizacao.id)),
		columns: { documentosImportados: true },
	});
	if (!purchase) throw new createHttpError.NotFound("Compra não encontrada.");
	const snapshot = PurchaseImportedDocumentsSnapshotSchema.parse(purchase.documentosImportados ?? { versao: 1, documentos: [] });
	const document = snapshot.documentos.find((candidate) => candidate.referencia === input.referencia);
	if (!document?.arquivo) throw new createHttpError.NotFound("Arquivo importado não encontrado.");
	const organizationId = session.membership.organizacao.id;
	if (document.arquivoId) {
		// A linha de `files` é buscada pela organização da sessão: um id gravado por um payload
		// malicioso só alcança arquivos da própria organização.
		const file = await getOrganizationFileById({ arquivoId: document.arquivoId, organizacaoId: organizationId });
		const bytes = await readStoredFile(file);
		return {
			data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
			mimeType: file.mimeType,
			fileName: document.arquivo.nomeOriginal ?? file.nomeOriginal ?? `documento-${document.referencia}`,
		};
	}
	// Snapshot anterior ao catálogo (até o backfill): o caminho é reconstruído a partir da
	// organização da sessão — nunca lido do snapshot.
	const data = await downloadPrivateFile(buildPurchaseImportedDocumentPath({ organizationId, referencia: document.referencia }));
	return {
		data,
		mimeType: document.arquivo.mimeType ?? "application/octet-stream",
		fileName: document.arquivo.nomeOriginal ?? `documento-${document.referencia}`,
	};
}

async function getPurchaseImportedDocumentRoute(request: NextRequest) {
	const input = GetPurchaseImportedDocumentInputSchema.parse({
		purchaseId: request.nextUrl.searchParams.get("purchaseId") ?? undefined,
		referencia: request.nextUrl.searchParams.get("referencia") ?? undefined,
		disposition: request.nextUrl.searchParams.get("disposition"),
	});
	const result = await getPurchaseImportedDocument(input);
	// Only PDFs and raster images may render in the page. An XML or SVG served inline from this origin could carry
	// script (XHTML namespaces), so it always downloads. No CSP sandbox: Chrome refuses to render a
	// sandboxed PDF, and nosniff keeps the browser on the declared type.
	const canPreview = ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(result.mimeType);
	const inline = input.disposition === "inline" && canPreview;
	return new NextResponse(result.data, {
		headers: {
			"Content-Type": result.mimeType,
			"Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${result.fileName.replace(/["\\\r\n]/g, "-")}"`,
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}

export const GET = appApiHandler({ GET: getPurchaseImportedDocumentRoute });

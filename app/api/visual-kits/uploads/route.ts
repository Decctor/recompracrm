import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { createDirectUploadIntake } from "@/lib/files/intake";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { db } from "@/services/drizzle";
import { visualKits } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Teto de arquivos por geração: 20 páginas de carrossel + uma imagem por produto em selo/post/story
// (até 200 produtos cada) cabem com folga; mais que isso é erro do cliente.
const MAX_FILES_PER_GENERATION = 700;

const CreateVisualKitUploadsInputSchema = z.object({
	kitId: z.string({
		required_error: "ID do kit não informado.",
		invalid_type_error: "Tipo inválido para ID do kit.",
	}),
	arquivos: z
		.array(
			z.object({
				nome: z
					.string({
						required_error: "Nome do arquivo não informado.",
						invalid_type_error: "Tipo inválido para nome do arquivo.",
					})
					.min(1, { message: "Nome do arquivo não informado." })
					.max(200, { message: "Nome do arquivo muito longo." }),
				mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"], {
					required_error: "Tipo do arquivo não informado.",
					invalid_type_error: "Tipo de arquivo não aceito.",
				}),
				tamanhoBytes: z
					.number({
						required_error: "Tamanho do arquivo não informado.",
						invalid_type_error: "Tipo inválido para tamanho do arquivo.",
					})
					.int()
					.positive(),
				sha256: z.string({
					required_error: "SHA-256 do arquivo não informado.",
					invalid_type_error: "Tipo inválido para SHA-256 do arquivo.",
				}),
			}),
			{
				required_error: "Arquivos não informados.",
				invalid_type_error: "Tipo inválido para arquivos.",
			},
		)
		.min(1, { message: "Nenhum arquivo para enviar." })
		.max(MAX_FILES_PER_GENERATION, { message: `Uma geração pode ter até ${MAX_FILES_PER_GENERATION} arquivos.` }),
});
export type TCreateVisualKitUploadsInput = z.infer<typeof CreateVisualKitUploadsInputSchema>;

/**
 * Intenções de upload direto para os arquivos de uma geração: devolve, na mesma ordem do pedido,
 * a URL assinada para o navegador enviar cada arquivo direto ao armazenamento. Os bytes só entram
 * no catálogo depois, em /api/visual-kits/generation, que confere cada um.
 */
async function createVisualKitUploads({ input, session }: { input: TCreateVisualKitUploadsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const kit = await db.query.visualKits.findFirst({
		where: and(eq(visualKits.id, input.kitId), eq(visualKits.organizacaoId, organizationId)),
		columns: { id: true },
	});
	if (!kit) throw new createHttpError.NotFound("Kit não encontrado.");

	const uploads = await mapWithConcurrency(input.arquivos, 8, (arquivo) =>
		createDirectUploadIntake({
			organizacaoId: organizationId,
			proposito: "ARQUIVO_KIT_VISUAL",
			nomeArquivo: arquivo.nome,
			mimeType: arquivo.mimeType,
			tamanhoEsperadoBytes: arquivo.tamanhoBytes,
			sha256Esperado: arquivo.sha256,
			criadoPorId: session.user.id,
			contexto: { origem: "SESSAO_WEB" },
		}),
	);

	return {
		data: { uploads: uploads.map((upload) => ({ uploadId: upload.uploadId, signedUrl: upload.signedUrl, mimeType: upload.mimeType })) },
		message: "Envio dos arquivos preparado.",
	};
}
export type TCreateVisualKitUploadsOutput = Awaited<ReturnType<typeof createVisualKitUploads>>;

async function createVisualKitUploadsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = CreateVisualKitUploadsInputSchema.parse(await request.json());
	const result = await createVisualKitUploads({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const POST = appApiHandler({ POST: createVisualKitUploadsRoute });

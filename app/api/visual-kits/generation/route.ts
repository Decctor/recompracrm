import { appApiHandler } from "@/lib/app-api";
import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { completeDirectUpload, consumeUpload } from "@/lib/files/intake";
import { deleteStoredFile } from "@/lib/files/service";
import { visualKitItemKey } from "@/lib/visual-kits/types";
import { VisualKitFormatEnum, VisualKitOutputEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { files, type TFileEntity, visualKitItems, visualKitPieceFiles, visualKitPieces, visualKits } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Conferir cada arquivo lê os bytes do armazenamento em streaming (tamanho + SHA-256).
export const maxDuration = 300;

const GeneratedFileSchema = z.object({
	uploadId: z.string({
		required_error: "Upload do arquivo não informado.",
		invalid_type_error: "Tipo inválido para upload do arquivo.",
	}),
	nome: z
		.string({
			required_error: "Nome do arquivo não informado.",
			invalid_type_error: "Tipo inválido para nome do arquivo.",
		})
		.min(1)
		.max(200),
	mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"], {
		required_error: "Tipo do arquivo não informado.",
		invalid_type_error: "Tipo de arquivo não aceito.",
	}),
	produtoId: z.string({ invalid_type_error: "Tipo inválido para produto do arquivo." }).nullable(),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo inválido para variante do arquivo." }).nullable(),
	ordem: z.number({ required_error: "Ordem do arquivo não informada.", invalid_type_error: "Tipo inválido para ordem do arquivo." }).int(),
});

const CompleteVisualKitGenerationInputSchema = z.object({
	kitId: z.string({
		required_error: "ID do kit não informado.",
		invalid_type_error: "Tipo inválido para ID do kit.",
	}),
	pieces: z.array(
		z.object({
			formato: VisualKitFormatEnum,
			saida: VisualKitOutputEnum,
			arquivos: z.array(GeneratedFileSchema, {
				required_error: "Arquivos da peça não informados.",
				invalid_type_error: "Tipo inválido para arquivos da peça.",
			}),
		}),
		{
			required_error: "Peças geradas não informadas.",
			invalid_type_error: "Tipo inválido para peças geradas.",
		},
	),
	// Preços efetivamente impressos, por item: base do aviso "Preço mudou".
	prices: z.array(
		z.object({
			produtoId: z.string({ required_error: "Produto não informado.", invalid_type_error: "Tipo inválido para produto." }),
			produtoVarianteId: z.string({ invalid_type_error: "Tipo inválido para variante." }).nullable(),
			preco: z.number({ required_error: "Preço não informado.", invalid_type_error: "Tipo inválido para preço." }),
			precoDe: z.number({ invalid_type_error: "Tipo inválido para preço De." }).nullable(),
		}),
		{
			required_error: "Preços impressos não informados.",
			invalid_type_error: "Tipo inválido para preços impressos.",
		},
	),
});
export type TCompleteVisualKitGenerationInput = z.infer<typeof CompleteVisualKitGenerationInputSchema>;

/**
 * Conclui uma geração: confere cada upload direto (tamanho, SHA-256, tipo), troca os arquivos das
 * peças pelos novos numa transação, grava os preços impressos e marca o kit como GERADO. Os
 * arquivos da geração anterior saem do catálogo e do armazenamento depois do commit.
 */
async function completeVisualKitGeneration({ input, session }: { input: TCompleteVisualKitGenerationInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const kit = await db.query.visualKits.findFirst({
		where: and(eq(visualKits.id, input.kitId), eq(visualKits.organizacaoId, organizationId)),
		with: { pecas: { columns: { id: true, formato: true } } },
	});
	if (!kit) throw new createHttpError.NotFound("Kit não encontrado.");

	const pieceByFormat = new Map(kit.pecas.map((piece) => [piece.formato, piece.id]));
	if (input.pieces.length !== kit.pecas.length || input.pieces.some((piece) => !pieceByFormat.has(piece.formato))) {
		throw new createHttpError.BadRequest("As peças geradas não correspondem às peças do kit. Atualize a página e gere de novo.");
	}
	if (input.pieces.some((piece) => piece.arquivos.length === 0)) throw new createHttpError.BadRequest("Alguma peça foi gerada sem arquivos.");

	// 1. Conferência dos bytes (fora da transação: lê o armazenamento).
	const generatedFiles = input.pieces.flatMap((piece) => piece.arquivos.map((arquivo) => ({ ...arquivo, formato: piece.formato })));
	const fileByUpload = new Map<string, TFileEntity>();
	try {
		await mapWithConcurrency(generatedFiles, 4, async (arquivo) => {
			await completeDirectUpload({ uploadId: arquivo.uploadId, organizacaoId: organizationId, mimeType: arquivo.mimeType });
			const { arquivo: file } = await consumeUpload({
				uploadId: arquivo.uploadId,
				organizacaoId: organizationId,
				proposito: "ARQUIVO_KIT_VISUAL",
				consumo: { visualKitId: kit.id, formato: arquivo.formato },
			});
			fileByUpload.set(arquivo.uploadId, file);
		});
	} catch (error) {
		// Geração incompleta não troca nada: o que já entrou no catálogo sai de novo.
		await Promise.all([...fileByUpload.values()].map(deleteStoredFile));
		throw error;
	}

	// 2. Troca dos arquivos e registro dos preços, atomicamente.
	const now = new Date();
	const previousFileIds = await db.transaction(async (tx) => {
		const pieceIds = kit.pecas.map((piece) => piece.id);
		const previous = await tx
			.select({ arquivoId: visualKitPieceFiles.arquivoId })
			.from(visualKitPieceFiles)
			.where(inArray(visualKitPieceFiles.pecaId, pieceIds));
		await tx.delete(visualKitPieceFiles).where(inArray(visualKitPieceFiles.pecaId, pieceIds));

		for (const piece of input.pieces) {
			const pecaId = pieceByFormat.get(piece.formato) as string;
			await tx.insert(visualKitPieceFiles).values(
				piece.arquivos.map((arquivo) => {
					const file = fileByUpload.get(arquivo.uploadId);
					if (!file) throw new createHttpError.InternalServerError("Arquivo conferido não encontrado.");
					return {
						organizacaoId: organizationId,
						pecaId,
						arquivoId: file.id,
						nome: arquivo.nome,
						produtoId: arquivo.produtoId,
						produtoVarianteId: arquivo.produtoVarianteId,
						ordem: arquivo.ordem,
					};
				}),
			);
			await tx.update(visualKitPieces).set({ saida: piece.saida, dataGeracao: now }).where(eq(visualKitPieces.id, pecaId));
		}

		const priceByKey = new Map(input.prices.map((price) => [visualKitItemKey(price), price]));
		const items = await tx
			.select({ id: visualKitItems.id, produtoId: visualKitItems.produtoId, produtoVarianteId: visualKitItems.produtoVarianteId })
			.from(visualKitItems)
			.where(eq(visualKitItems.kitId, kit.id));
		for (const item of items) {
			const price = priceByKey.get(visualKitItemKey(item));
			await tx
				.update(visualKitItems)
				.set({ precoGerado: price?.preco ?? null, precoDeGerado: price?.precoDe ?? null })
				.where(eq(visualKitItems.id, item.id));
		}

		await tx.update(visualKits).set({ status: "GERADO", dataUltimaGeracao: now, dataAtualizacao: now }).where(eq(visualKits.id, kit.id));
		return previous.map((row) => row.arquivoId);
	});

	// 3. Arquivos da geração anterior: fora do catálogo e do armazenamento.
	if (previousFileIds.length) {
		const previousFiles = await db.query.files.findMany({ where: inArray(files.id, previousFileIds) });
		await Promise.all(previousFiles.map(deleteStoredFile));
	}

	return { data: { kitId: kit.id, fileCount: fileByUpload.size }, message: "Kit gerado com sucesso." };
}
export type TCompleteVisualKitGenerationOutput = Awaited<ReturnType<typeof completeVisualKitGeneration>>;

async function completeVisualKitGenerationRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = CompleteVisualKitGenerationInputSchema.parse(await request.json());
	const result = await completeVisualKitGeneration({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const POST = appApiHandler({ POST: completeVisualKitGenerationRoute });

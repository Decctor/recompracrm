"use client";

import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { getErrorMessage } from "@/lib/errors";
import { completeVisualKitGeneration, createVisualKitUploads } from "@/lib/mutations/visual-kits";
import { fetchVisualKitCatalogItems } from "@/lib/queries/visual-kits";
import { uploadToSignedUrl } from "@/lib/uploads/signed-direct-upload";
import { generateVisualKit, sha256Hex, type TGeneratedPiece } from "@/lib/visual-kits/generation";
import { type TVisualKitPieceItem, toVisualKitPieceItem } from "@/lib/visual-kits/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useKitBuilder } from "./kit-builder-context";

export type TKitGenerationStep = 0 | 1 | 2 | 3;

export type TKitGenerationState =
	| { phase: "IDLE" }
	| { phase: "RUNNING"; step: TKitGenerationStep; detail: string | null; progress: number; piecesDone: number; items: TVisualKitPieceItem[] }
	| { phase: "DONE"; pieces: TGeneratedPiece[]; items: TVisualKitPieceItem[] }
	| { phase: "FAILED"; message: string };

const UPLOAD_CONCURRENCY = 4;

/**
 * Geração do kit no navegador, em quatro etapas (as mesmas do checklist da tela):
 * 0. confere os preços atuais no servidor (o que sai impresso é o preço de agora, não o da tela);
 * 1. prepara marca e imagens (proxy same-origin para não sujar o canvas);
 * 2. monta e rasteriza as peças, gerando PDFs e imagens;
 * 3. envia os arquivos direto ao armazenamento e conclui a geração no servidor (que confere cada um).
 */
export function useKitGeneration() {
	const queryClient = useQueryClient();
	const { state, itemKeys, brand, saveNow, setIsGenerating } = useKitBuilder();
	const [generation, setGeneration] = useState<TKitGenerationState>({ phase: "IDLE" });
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => () => abortRef.current?.abort(), []);

	const isRunning = generation.phase === "RUNNING";
	// O construtor trava etapas e "Voltar" enquanto a geração roda (sair daqui a abortaria).
	useEffect(() => {
		setIsGenerating(isRunning);
		return () => setIsGenerating(false);
	}, [isRunning, setIsGenerating]);
	useEffect(() => {
		if (!isRunning) return;
		const handler = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [isRunning]);

	const start = useCallback(async () => {
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;
		const signal = controller.signal;
		let items: TVisualKitPieceItem[] = [];
		const step = (step: TKitGenerationStep, detail: string | null, progress: number, piecesDone = 0) =>
			setGeneration({ phase: "RUNNING", step, detail, progress, piecesDone, items });

		try {
			step(0, null, 0.02);
			const kitId = await saveNow();
			if (!kitId) throw new Error("Não foi possível salvar o kit antes de gerar.");
			const fresh = await fetchVisualKitCatalogItems(itemKeys, state.kit.canalVendaId);
			items = fresh.map(toVisualKitPieceItem).filter((item): item is TVisualKitPieceItem => item !== null);
			if (items.length === 0) throw new Error("Nenhum produto do kit tem preço de venda.");

			step(1, null, 0.08);
			const pieceInputs = state.pecas.map((piece) => ({
				formato: piece.formato,
				saida: piece.saida,
				// `generateVisualKit` passa as imagens de outros domínios pelo proxy same-origin.
				props: {
					items,
					chamada: piece.configuracao?.chamada?.trim() || state.kit.chamada,
					validadeFim: state.kit.validadeFim,
					brand,
					configuracao: state.kit.configuracao,
				},
			}));

			step(2, null, 0.12);
			const generated = await generateVisualKit({
				pieces: pieceInputs,
				signal,
				onProgress: (progress) => {
					const pieceShare = (progress.pieceIndex + progress.page / Math.max(1, progress.pageCount)) / progress.pieceCount;
					step(2, progress.formato, 0.12 + pieceShare * 0.63, progress.pieceIndex);
				},
			});

			const files = generated.flatMap((piece) => piece.arquivos.map((file) => ({ piece, file })));
			step(3, `${files.length} ${files.length === 1 ? "arquivo" : "arquivos"}`, 0.76, generated.length);
			const declared = await mapWithConcurrency(files, UPLOAD_CONCURRENCY, async ({ file }) => ({
				nome: file.nome,
				mimeType: file.mimeType,
				tamanhoBytes: file.blob.size,
				sha256: await sha256Hex(file.blob),
			}));
			const { data } = await createVisualKitUploads({ kitId, files: declared });

			let sent = 0;
			await mapWithConcurrency(files, UPLOAD_CONCURRENCY, async ({ file }, index) => {
				if (signal.aborted) throw new DOMException("Geração cancelada.", "AbortError");
				await uploadToSignedUrl({ signedUrl: data.uploads[index].signedUrl, blob: file.blob, signal });
				sent += 1;
				step(3, `${sent} de ${files.length} arquivos enviados`, 0.76 + (sent / files.length) * 0.2, generated.length);
			});

			// Arquivos já no armazenamento: a conclusão no servidor não é mais cancelável. Desliga o
			// controlador para que desmontar ou reiniciar não descarte o resultado nem o erro dela.
			if (abortRef.current === controller) abortRef.current = null;
			const uploadIdByFile = new Map(files.map(({ file }, index) => [file, data.uploads[index].uploadId]));
			await completeVisualKitGeneration({
				kitId,
				pieces: generated.map((piece) => ({
					formato: piece.formato,
					saida: piece.saida,
					arquivos: piece.arquivos.map((file) => ({
						uploadId: uploadIdByFile.get(file) as string,
						nome: file.nome,
						mimeType: file.mimeType,
						produtoId: file.produtoId,
						produtoVarianteId: file.produtoVarianteId,
						ordem: file.ordem,
					})),
				})),
				prices: items.map((item) => ({
					produtoId: item.produtoId,
					produtoVarianteId: item.produtoVarianteId,
					preco: item.preco,
					precoDe: item.promocao.precoDe,
				})),
			});

			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["visual-kits"] }),
				queryClient.invalidateQueries({ queryKey: ["visual-kit-by-id", kitId] }),
			]);
			setGeneration({ phase: "DONE", pieces: generated, items });
		} catch (error) {
			if (signal.aborted) return;
			setGeneration({ phase: "FAILED", message: getErrorMessage(error) });
		}
	}, [itemKeys, brand, queryClient, saveNow, state]);

	const reset = useCallback(() => {
		abortRef.current?.abort();
		setGeneration({ phase: "IDLE" });
	}, []);

	return { generation, start, reset };
}

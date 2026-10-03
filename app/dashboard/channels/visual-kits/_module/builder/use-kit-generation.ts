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
	| { fase: "OCIOSO" }
	| { fase: "GERANDO"; etapa: TKitGenerationStep; detalhe: string | null; progresso: number; pecasProntas: number; itens: TVisualKitPieceItem[] }
	| { fase: "PRONTO"; pecas: TGeneratedPiece[]; itens: TVisualKitPieceItem[] }
	| { fase: "ERRO"; mensagem: string };

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
	const { state, itemKeys, marca, saveNow } = useKitBuilder();
	const [generation, setGeneration] = useState<TKitGenerationState>({ fase: "OCIOSO" });
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => () => abortRef.current?.abort(), []);

	const isRunning = generation.fase === "GERANDO";
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
		let itens: TVisualKitPieceItem[] = [];
		const step = (etapa: TKitGenerationStep, detalhe: string | null, progresso: number, pecasProntas = 0) =>
			setGeneration({ fase: "GERANDO", etapa, detalhe, progresso, pecasProntas, itens });

		try {
			step(0, null, 0.02);
			const kitId = await saveNow();
			if (!kitId) throw new Error("Não foi possível salvar o kit antes de gerar.");
			const fresh = await fetchVisualKitCatalogItems(itemKeys, state.kit.canalVendaId);
			itens = fresh.map(toVisualKitPieceItem).filter((item): item is TVisualKitPieceItem => item !== null);
			if (itens.length === 0) throw new Error("Nenhum produto do kit tem preço de venda.");

			step(1, null, 0.08);
			const pecas = state.pecas.map((piece) => ({
				formato: piece.formato,
				saida: piece.saida,
				// `generateVisualKit` passa as imagens de outros domínios pelo proxy same-origin.
				props: {
					itens,
					chamada: piece.configuracao?.chamada?.trim() || state.kit.chamada,
					validadeFim: state.kit.validadeFim,
					marca,
					opcoes: state.kit.configuracao,
				},
			}));

			step(2, null, 0.12);
			const generated = await generateVisualKit({
				pecas,
				signal,
				onProgress: (progress) => {
					const pieceShare = (progress.pecaIndice + progress.paginaAtual / Math.max(1, progress.totalPaginas)) / progress.totalPecas;
					step(2, progress.formato, 0.12 + pieceShare * 0.63, progress.pecaIndice);
				},
			});

			const files = generated.flatMap((piece) => piece.arquivos.map((arquivo) => ({ piece, arquivo })));
			step(3, `${files.length} ${files.length === 1 ? "arquivo" : "arquivos"}`, 0.76, generated.length);
			const declared = await mapWithConcurrency(files, UPLOAD_CONCURRENCY, async ({ arquivo }) => ({
				nome: arquivo.nome,
				mimeType: arquivo.mimeType,
				tamanhoBytes: arquivo.blob.size,
				sha256: await sha256Hex(arquivo.blob),
			}));
			const { data } = await createVisualKitUploads({ kitId, arquivos: declared });

			let sent = 0;
			await mapWithConcurrency(files, UPLOAD_CONCURRENCY, async ({ arquivo }, index) => {
				if (signal.aborted) throw new DOMException("Geração cancelada.", "AbortError");
				await uploadToSignedUrl({ signedUrl: data.uploads[index].signedUrl, blob: arquivo.blob, signal });
				sent += 1;
				step(3, `${sent} de ${files.length} arquivos enviados`, 0.76 + (sent / files.length) * 0.2, generated.length);
			});

			const uploadIdByFile = new Map(files.map(({ arquivo }, index) => [arquivo, data.uploads[index].uploadId]));
			await completeVisualKitGeneration({
				kitId,
				pecas: generated.map((piece) => ({
					formato: piece.formato,
					saida: piece.saida,
					arquivos: piece.arquivos.map((arquivo) => ({
						uploadId: uploadIdByFile.get(arquivo) as string,
						nome: arquivo.nome,
						mimeType: arquivo.mimeType,
						produtoId: arquivo.produtoId,
						produtoVarianteId: arquivo.produtoVarianteId,
						ordem: arquivo.ordem,
					})),
				})),
				precos: itens.map((item) => ({
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
			setGeneration({ fase: "PRONTO", pecas: generated, itens });
		} catch (error) {
			if (signal.aborted) return;
			setGeneration({ fase: "ERRO", mensagem: getErrorMessage(error) });
		}
	}, [itemKeys, marca, queryClient, saveNow, state]);

	const reset = useCallback(() => {
		abortRef.current?.abort();
		setGeneration({ fase: "OCIOSO" });
	}, []);

	return { generation, start, reset };
}

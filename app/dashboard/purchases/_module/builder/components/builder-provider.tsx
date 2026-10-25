"use client";

import type { TImportPurchaseCompositionStageEvent } from "@/app/api/purchases/import-composition/route";
import type { TSelectSupplierValue } from "@/components/Inputs/SelectSupplierInput";
import { getErrorMessage } from "@/lib/errors";
import { formatToCNPJ, formatToPhone } from "@/lib/formatting";
import { importPurchaseComposition } from "@/lib/mutations/purchases";
import { isAcceptedImportFile, prepareImportFilePayload } from "@/lib/purchase/import-files";
import type { TPurchaseImportStageEnum, TPurchaseImportStageStatusEnum } from "@/schemas/enums";
import { usePurchaseState, type TPurchaseAccountingEntryTransaction, type TUsePurchaseState } from "@/state-hooks/use-purchase-state";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
	createReviewLines,
	getLineIssue,
	type TImportDocument,
	type TImportResult,
	type TImportSupplier,
	type TReviewLine,
} from "../helpers/review-lines";
import { nextStage, prevStage, type TBuilderStageId } from "../helpers/stages";
import type { TNewSupplierDraft } from "../helpers/submit";
import type { TBuilderOrigin, TBuilderReadStatus } from "../helpers/validation";

export type TBuilderFileStatus = "pending" | "reading" | "done" | "error";
export type TBuilderFileEntry = {
	id: string;
	file: File;
	/** Nota recebida (DF-e): o servidor lê o XML do catálogo; `file` é só o rótulo na fila. */
	inboundId: string | null;
	status: TBuilderFileStatus;
	stages: Partial<Record<TPurchaseImportStageEnum, { status: TPurchaseImportStageStatusEnum; detail: string | null }>>;
	errorMessage: string | null;
	itemCount: number | null;
};

/** Fields filled by the reading. They carry the "Lido da nota" mark until the operator changes them. */
export type TReadFieldKey = "titulo" | "telefone" | "email" | "pedidoData" | "valor" | "dataCompetencia" | "transacoes" | "transportadora";

export type TBuilderImport = {
	fornecedor: TImportSupplier | null;
	documento: TImportDocument | null;
	avisos: string[];
	fileCount: number;
};

type TBuilderContext = TUsePurchaseState & {
	currentStage: TBuilderStageId;
	setCurrentStage: (stage: TBuilderStageId) => void;
	next: () => void;
	back: () => void;
	dirty: boolean;
	markClean: () => void;

	origin: TBuilderOrigin | null;
	chooseOrigin: (origin: TBuilderOrigin) => void;
	files: TBuilderFileEntry[];
	addFiles: (files: File[]) => void;
	removeFile: (id: string) => void;
	readStatus: TBuilderReadStatus;
	readingFileId: string | null;
	startReading: () => Promise<void>;
	cancelReading: () => void;
	restartReading: () => void;
	importData: TBuilderImport | null;
	readFields: Set<TReadFieldKey>;
	clearReadField: (key: TReadFieldKey) => void;

	lines: TReviewLine[];
	updateLine: (id: string, patch: Partial<TReviewLine>) => void;
	setLines: (updater: (lines: TReviewLine[]) => TReviewLine[]) => void;
	queueOpen: boolean;
	queueLineId: string | null;
	openQueue: (lineId?: string) => void;
	closeQueue: () => void;
	setQueueLineId: (lineId: string | null) => void;

	newSupplier: TNewSupplierDraft | null;
	updateNewSupplier: (patch: Partial<TNewSupplierDraft>) => void;
	pickExistingSupplier: (supplier: TSelectSupplierValue) => void;
	clearSupplier: () => void;

	received: boolean;
	setReceived: (received: boolean) => void;
};

const BuilderContext = createContext<TBuilderContext | null>(null);

export function useBuilder() {
	const context = useContext(BuilderContext);
	if (!context) throw new Error("useBuilder must be used inside <BuilderProvider>.");
	return context;
}

function toDate(value: Date | string | null | undefined) {
	if (!value) return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mergeImportResults(results: TImportResult[]) {
	// The first document defines the purchase header; the following ones only add items.
	return {
		fornecedor: results.find((result) => result.fornecedor.existente || result.fornecedor.extraido)?.fornecedor ?? null,
		documento: results[0]?.documento ?? null,
		importados: results.map((result) => result.documento.importado),
		avisos: [...new Set(results.flatMap((result) => result.avisos))],
	};
}

export function BuilderProvider({
	initialStage,
	inboundId = null,
	children,
}: {
	initialStage: TBuilderStageId;
	inboundId?: string | null;
	children: ReactNode;
}) {
	const purchaseState = usePurchaseState({ initialState: {} });
	const { state, updatePurchase, updateAccountingEntry, redefineState } = purchaseState;

	const [currentStage, setCurrentStage] = useState<TBuilderStageId>(initialStage);
	const [dirty, setDirty] = useState(false);
	const [origin, setOrigin] = useState<TBuilderOrigin | null>(null);
	const [files, setFiles] = useState<TBuilderFileEntry[]>([]);
	const [readStatus, setReadStatus] = useState<TBuilderReadStatus>("idle");
	const [readingFileId, setReadingFileId] = useState<string | null>(null);
	const [importData, setImportData] = useState<TBuilderImport | null>(null);
	const [readFields, setReadFields] = useState<Set<TReadFieldKey>>(new Set());
	const [lines, setLinesState] = useState<TReviewLine[]>([]);
	const [queueOpen, setQueueOpen] = useState(false);
	const [queueLineId, setQueueLineId] = useState<string | null>(null);
	const [newSupplier, setNewSupplier] = useState<TNewSupplierDraft | null>(null);
	const [received, setReceivedState] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	const markDirty = useCallback(() => setDirty(true), []);

	const goTo = useCallback((stage: TBuilderStageId) => {
		setQueueOpen(false);
		setCurrentStage(stage);
	}, []);

	const clearReadField = useCallback((key: TReadFieldKey) => {
		setReadFields((previous) => {
			if (!previous.has(key)) return previous;
			const next = new Set(previous);
			next.delete(key);
			return next;
		});
	}, []);

	const addFiles = useCallback(
		(candidates: File[]) => {
			const accepted: TBuilderFileEntry[] = [];
			for (const file of candidates) {
				if (!isAcceptedImportFile(file)) {
					toast.error(`"${file.name}" não é suportado. Envie XML, PDF ou uma imagem (PNG, JPG, WEBP).`);
					continue;
				}
				accepted.push({ id: crypto.randomUUID(), file, inboundId: null, status: "pending", stages: {}, errorMessage: null, itemCount: null });
			}
			if (accepted.length === 0) return;
			markDirty();
			setFiles((previous) => [...previous, ...accepted]);
		},
		[markDirty],
	);

	const applyImport = useCallback(
		(results: TImportResult[], fileCount: number) => {
			const merged = mergeImportResults(results);
			const nextLines = results.flatMap((result) => createReviewLines(result, () => crypto.randomUUID()));
			const documento = merged.documento;
			const supplierName = merged.fornecedor?.existente?.nome ?? merged.fornecedor?.extraido?.nome ?? null;
			const title = supplierName
				? documento?.numero
					? `Compra ${supplierName} - NF ${documento.numero}`
					: `Compra ${supplierName}`
				: documento?.numero
					? `Compra - NF ${documento.numero}`
					: "";
			const emissionDate = toDate(documento?.dataEmissao);
			const entryValue = documento ? (documento.valorTotal ?? documento.somaItens) : 0;
			const filled = new Set<TReadFieldKey>();

			const purchasePatch: Partial<TUsePurchaseState["state"]["purchase"]> = {
				documentosImportados: { versao: 1, documentos: merged.importados },
			};
			if (title && !state.purchase.titulo.trim()) {
				purchasePatch.titulo = title;
				filled.add("titulo");
			}
			if (emissionDate) {
				purchasePatch.pedidoData = emissionDate;
				filled.add("pedidoData");
			}
			const existing = merged.fornecedor?.existente ?? null;
			const extracted = merged.fornecedor?.extraido ?? null;
			if (existing) {
				Object.assign(purchasePatch, {
					fornecedorId: existing.id,
					pedidoFornecedorNome: existing.nome,
					pedidoFornecedorCnpj: existing.cpfCnpj ? formatToCNPJ(existing.cpfCnpj) : null,
					pedidoFornecedorTelefone: existing.telefone || (extracted?.telefone ? formatToPhone(extracted.telefone) : null),
					pedidoFornecedorEmail: existing.email || extracted?.email || null,
				});
				setNewSupplier(null);
			} else if (extracted?.nome) {
				const telefone = extracted.telefone ? formatToPhone(extracted.telefone) : null;
				Object.assign(purchasePatch, {
					fornecedorId: null,
					pedidoFornecedorNome: extracted.nome,
					pedidoFornecedorCnpj: extracted.cnpj ? formatToCNPJ(extracted.cnpj) : null,
					pedidoFornecedorTelefone: telefone,
					pedidoFornecedorEmail: extracted.email,
				});
				setNewSupplier({
					nome: extracted.nome,
					cpfCnpj: extracted.cnpj,
					inscricaoEstadual: extracted.inscricaoEstadual,
					telefone,
					email: extracted.email,
				});
			}
			if (extracted?.telefone) filled.add("telefone");
			if (extracted?.email) filled.add("email");
			if (documento?.transportadora) {
				purchasePatch.transporteTransportadoraNome = documento.transportadora.nome;
				purchasePatch.transporteTransportadoraCnpj = documento.transportadora.cnpj ? formatToCNPJ(documento.transportadora.cnpj) : null;
				filled.add("transportadora");
			}
			updatePurchase(purchasePatch);

			const accountingPatch: Partial<TUsePurchaseState["state"]["lancamentoContabil"]> = {};
			if (entryValue > 0) {
				accountingPatch.valor = entryValue;
				filled.add("valor");
			}
			if (emissionDate) {
				accountingPatch.dataCompetencia = emissionDate;
				filled.add("dataCompetencia");
			}
			const installments = documento?.duplicatas ?? [];
			if (installments.length > 0 && state.lancamentoContabil.transacoes.length === 0) {
				const documentLabel = documento?.numero ? `NF ${documento.numero}` : "Compra";
				accountingPatch.transacoes = installments.map(
					(installment, index): TPurchaseAccountingEntryTransaction => ({
						contaFinanceiraId: null,
						titulo: `${documentLabel} - Duplicata ${index + 1}/${installments.length}`,
						tipo: "SAIDA",
						valor: installment.valor,
						metodo: "BOLETO",
						dataPrevisao: toDate(installment.dataVencimento) ?? emissionDate ?? new Date(),
						dataEfetivacao: null,
						parcela: index + 1,
						totalParcelas: installments.length,
					}),
				);
				filled.add("transacoes");
			}
			updateAccountingEntry(accountingPatch);

			setLinesState(nextLines);
			setImportData({ fornecedor: merged.fornecedor, documento, avisos: merged.avisos, fileCount });
			setReadFields(filled);
		},
		[state.purchase.titulo, state.lancamentoContabil.transacoes.length, updatePurchase, updateAccountingEntry],
	);

	const startReading = useCallback(async () => {
		const pending = files;
		if (pending.length === 0) return;
		const controller = new AbortController();
		abortRef.current = controller;
		setReadStatus("reading");
		setFiles((previous) => previous.map((entry) => ({ ...entry, status: "pending", stages: {}, errorMessage: null, itemCount: null })));

		const results: TImportResult[] = [];
		for (const entry of pending) {
			if (controller.signal.aborted) return;
			setReadingFileId(entry.id);
			setFiles((previous) => previous.map((current) => (current.id === entry.id ? { ...current, status: "reading" } : current)));
			try {
				const result = await importPurchaseComposition(
					entry.inboundId ? { inboundId: entry.inboundId } : { file: await prepareImportFilePayload(entry.file) },
					{
						signal: controller.signal,
						onStage: (event: TImportPurchaseCompositionStageEvent) =>
							setFiles((previous) =>
								previous.map((current) =>
									current.id === entry.id
										? { ...current, stages: { ...current.stages, [event.stage]: { status: event.status, detail: event.detail } } }
										: current,
								),
							),
					},
				);
				results.push(result.data);
				setFiles((previous) =>
					previous.map((current) => (current.id === entry.id ? { ...current, status: "done", itemCount: result.data.itens.length } : current)),
				);
			} catch (error) {
				if (controller.signal.aborted) return;
				setFiles((previous) =>
					previous.map((current) => (current.id === entry.id ? { ...current, status: "error", errorMessage: getErrorMessage(error) } : current)),
				);
			}
		}
		abortRef.current = null;
		setReadingFileId(null);

		if (results.length === 0) {
			toast.error("Nenhum item foi identificado nos arquivos enviados.");
			setReadStatus("idle");
			return;
		}
		applyImport(results, pending.length);
		setReadStatus("done");
	}, [files, applyImport]);

	// "Lançar compra" na aba de notas recebidas: a nota entra na fila como um arquivo que o servidor
	// já tem, e a leitura começa sozinha. Uma vez só: o estado do builder vive no navegador.
	const inboundStartedRef = useRef(false);
	useEffect(() => {
		if (!inboundId || inboundStartedRef.current) return;
		inboundStartedRef.current = true;
		setOrigin("document");
		setFiles([
			{
				id: crypto.randomUUID(),
				file: new File([], "nota-recebida.xml", { type: "application/xml" }),
				inboundId,
				status: "pending",
				stages: {},
				errorMessage: null,
				itemCount: null,
			},
		]);
	}, [inboundId]);
	const inboundReadRef = useRef(false);
	useEffect(() => {
		if (!inboundId || inboundReadRef.current || files.length === 0 || !files.some((entry) => entry.inboundId)) return;
		inboundReadRef.current = true;
		void startReading();
	}, [inboundId, files, startReading]);

	const cancelReading = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setReadingFileId(null);
		setReadStatus("idle");
		setFiles((previous) => previous.map((entry) => ({ ...entry, status: "pending", stages: {}, errorMessage: null, itemCount: null })));
	}, []);

	/** Back to the file picker: the previous reading is discarded with everything it filled. */
	const restartReading = useCallback(() => {
		redefineState({
			...state,
			purchaseItems: [],
			purchase: { ...state.purchase, documentosImportados: { versao: 1, documentos: [] }, fornecedorId: null },
			lancamentoContabil: { ...state.lancamentoContabil, transacoes: [] },
		});
		setLinesState([]);
		setImportData(null);
		setReadFields(new Set());
		setNewSupplier(null);
		setReadStatus("idle");
		setFiles((previous) => previous.map((entry) => ({ ...entry, status: "pending", stages: {}, errorMessage: null, itemCount: null })));
	}, [redefineState, state]);

	const updateLine = useCallback(
		(id: string, patch: Partial<TReviewLine>) => {
			markDirty();
			setLinesState((previous) => previous.map((line) => (line.id === id ? { ...line, ...patch } : line)));
		},
		[markDirty],
	);

	const setLines = useCallback(
		(updater: (lines: TReviewLine[]) => TReviewLine[]) => {
			markDirty();
			setLinesState(updater);
		},
		[markDirty],
	);

	const openQueue = useCallback(
		(lineId?: string) => {
			const target = lineId ?? lines.find((line) => getLineIssue(line) !== null)?.id ?? null;
			setQueueLineId(target);
			setQueueOpen(true);
			setCurrentStage("items");
		},
		[lines],
	);

	const updateNewSupplier = useCallback(
		(patch: Partial<TNewSupplierDraft>) => {
			markDirty();
			setNewSupplier((previous) => (previous ? { ...previous, ...patch } : previous));
		},
		[markDirty],
	);

	const pickExistingSupplier = useCallback(
		(supplier: TSelectSupplierValue) => {
			markDirty();
			setNewSupplier(null);
			updatePurchase({
				fornecedorId: supplier.id,
				pedidoFornecedorNome: supplier.nome,
				pedidoFornecedorCnpj: supplier.cpfCnpj ? formatToCNPJ(supplier.cpfCnpj) : null,
				pedidoFornecedorTelefone: supplier.telefone || state.purchase.pedidoFornecedorTelefone,
				pedidoFornecedorEmail: supplier.email || state.purchase.pedidoFornecedorEmail,
			});
		},
		[markDirty, updatePurchase, state.purchase.pedidoFornecedorTelefone, state.purchase.pedidoFornecedorEmail],
	);

	const clearSupplier = useCallback(() => {
		markDirty();
		const extracted = importData?.fornecedor?.extraido ?? null;
		// Dropping the picked supplier goes back to the one read from the invoice, when there is one.
		setNewSupplier(
			extracted?.nome && !importData?.fornecedor?.existente
				? {
						nome: extracted.nome,
						cpfCnpj: extracted.cnpj,
						inscricaoEstadual: extracted.inscricaoEstadual,
						telefone: state.purchase.pedidoFornecedorTelefone ?? null,
						email: state.purchase.pedidoFornecedorEmail ?? null,
					}
				: null,
		);
		updatePurchase({ fornecedorId: null });
	}, [markDirty, importData, updatePurchase, state.purchase.pedidoFornecedorTelefone, state.purchase.pedidoFornecedorEmail]);

	const setReceived = useCallback(
		(value: boolean) => {
			markDirty();
			setReceivedState(value);
			// The status follows the choice, so the reused delivery section unlocks the receipt date.
			updatePurchase({
				status: value ? "RECEBIDA" : "CONFIRMADA",
				entregaDataRecebimentoEfetivacao: value ? (state.purchase.entregaDataRecebimentoEfetivacao ?? new Date()) : null,
			});
		},
		[markDirty, updatePurchase, state.purchase.entregaDataRecebimentoEfetivacao],
	);

	// Every purchase-state mutator marks the builder dirty, like the campaign builder does.
	const wrapped = useMemo(() => {
		const wrap =
			<TArgs extends unknown[]>(fn: (...args: TArgs) => void) =>
			(...args: TArgs) => {
				markDirty();
				fn(...args);
			};
		return {
			updatePurchase: wrap(purchaseState.updatePurchase),
			addPurchaseItem: wrap(purchaseState.addPurchaseItem),
			updatePurchaseItem: wrap(purchaseState.updatePurchaseItem),
			removePurchaseItem: wrap(purchaseState.removePurchaseItem),
			updateAccountingEntry: wrap(purchaseState.updateAccountingEntry),
			addAccountingEntryTransaction: wrap(purchaseState.addAccountingEntryTransaction),
			updateAccountingEntryTransaction: wrap(purchaseState.updateAccountingEntryTransaction),
			removeAccountingEntryTransaction: wrap(purchaseState.removeAccountingEntryTransaction),
		};
	}, [purchaseState, markDirty]);

	const value: TBuilderContext = {
		...purchaseState,
		...wrapped,
		currentStage,
		setCurrentStage: goTo,
		next: () => {
			const stage = nextStage(currentStage);
			if (stage) goTo(stage);
		},
		back: () => {
			if (queueOpen) return setQueueOpen(false);
			const stage = prevStage(currentStage);
			if (stage) goTo(stage);
		},
		dirty,
		markClean: () => setDirty(false),
		origin,
		chooseOrigin: (nextOrigin) => {
			markDirty();
			setOrigin(nextOrigin);
		},
		files,
		addFiles,
		removeFile: (id) => setFiles((previous) => previous.filter((entry) => entry.id !== id)),
		readStatus,
		readingFileId,
		startReading,
		cancelReading,
		restartReading,
		importData,
		readFields,
		clearReadField,
		lines,
		updateLine,
		setLines,
		queueOpen,
		queueLineId,
		openQueue,
		closeQueue: () => setQueueOpen(false),
		setQueueLineId,
		newSupplier,
		updateNewSupplier,
		pickExistingSupplier,
		clearSupplier,
		received,
		setReceived,
	};

	return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>;
}

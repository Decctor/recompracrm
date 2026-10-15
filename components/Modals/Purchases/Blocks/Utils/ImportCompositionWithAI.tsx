"use client";

import type { TImportPurchaseCompositionOutput } from "@/app/api/purchases/import-composition/route";
import SelectProductWithVariants from "@/components/Inputs/SelectProductWithVariants";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToCNPJ, formatToMoney } from "@/lib/formatting";
import { createProduct } from "@/lib/mutations/products";
import { importPurchaseComposition } from "@/lib/mutations/purchases";
import { createSupplier, createSupplierProductMappings } from "@/lib/mutations/suppliers";
import { cn } from "@/lib/utils";
import type { TUsePurchaseState } from "@/state-hooks/use-purchase-state";
import { ArrowRight, Building2, CircleAlert, CircleCheck, FileText, ImageIcon, Info, Loader2, PackagePlus, Sparkles, Upload, X } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { convertLineToProductUnit, unitsAreEquivalent } from "@/lib/purchase/units";
import { createEmptyPurchaseItem, normalizeItemValues } from "../Items";
import { IMPORT_ACCEPTED_MIME_TYPES, isAcceptedImportFile, prepareImportFilePayload } from "@/lib/purchase/import-files";

type TImportFornecedor = TImportPurchaseCompositionOutput["data"]["fornecedor"];
type TImportDocumento = TImportPurchaseCompositionOutput["data"]["documento"];
type TImportedLine = TImportPurchaseCompositionOutput["data"]["itens"][number];

/**
 * Rascunho de produto a criar para uma linha sem correspondente no catálogo. Espelha o fluxo do
 * fornecedor: nada é criado antes do confirmar, então cancelar a revisão não deixa produto órfão.
 */
type TNewProductDraft = {
	nome: string;
	codigo: string;
	unidade: string;
	ncm: string;
	vendavel: boolean;
	rastreamentoEstoqueAtivo: boolean;
};

type TReviewLine = TImportedLine & {
	incluir: boolean;
	produtoNovo: TNewProductDraft | null;
	/** Raw extracted values, frozen before user edits, persisted as externo* on the item. */
	extraidoQuantidade: number;
	extraidoValorUnitario: number;
	produtoVariante: { nome: string; codigo: string; imagemCapaUrl: string | null } | null;
	manualOverride: boolean;
	/** Quantas unidades internas cabem em 1 unidade da nota. Null quando as unidades batem. */
	fatorConversao: number | null;
	documentoRef: string;
	origemImportacao: "XML" | "IA";
};

/**
 * Campos do lançamento contábil que a leitura propõe. Campo vazio entra marcado; campo já
 * preenchido com valor diferente entra como conflito e DESMARCADO, para que a importação nunca
 * sobrescreva em silêncio o que o operador digitou.
 *
 * `valorPrevisto` (orçado) nunca é proposto: a nota é o valor efetivo, não a previsão, e preenchê-lo
 * a partir dela faria o orçado bater sempre com o realizado.
 */
type TAccountingProposalKey = "valor" | "dataCompetencia" | "titulo";

type TAccountingProposal = {
	key: TAccountingProposalKey;
	label: string;
	atual: string | null;
	proposto: string;
	conflito: boolean;
	patch: Partial<TUsePurchaseState["state"]["lancamentoContabil"]>;
};

type TFileEntry = {
	file: File;
	status: "PENDENTE" | "PROCESSANDO" | "CONCLUIDO" | "ERRO";
	itemCount: number | null;
	errorMessage: string | null;
};

type TPhase = "UPLOAD" | "PROCESSANDO" | "REVISAO";

const MATCH_BADGE: Record<TImportedLine["matchTipo"], { label: string; className: string }> = {
	MAPEADO: { label: "Mapeado", className: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
	CODIGO: { label: "Código", className: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
	SUGERIDO: { label: "Sugerido", className: "border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300" },
	NAO_MAPEADO: { label: "Não mapeado", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

// Mesmo visual do badge "SERÁ CRIADO" do fornecedor: amarelo de "vai nascer no confirmar".
const CREATE_BADGE = { label: "Será criado", className: "border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300" };

const COST_MODIFIER_LABELS: Record<string, string> = {
	DESCONTO: "Desconto",
	FRETE: "Frete",
	SEGURO: "Seguro",
	DESPESA_ACESSORIA: "Despesa acessória",
	IMPOSTOS_IPI: "IPI",
	IMPOSTOS_ICMS_ST: "ICMS-ST",
	IMPOSTOS_FCP_ST: "FCP-ST",
};

function getLineTotal(line: TReviewLine) {
	// O fator de conversão não entra: ele redistribui quantidade e valor unitário entre as unidades,
	// preservando o total da linha impresso na nota.
	if (line.modificadoresCusto)
		return (
			line.quantidade * line.valorUnitario +
			line.modificadoresCusto.reduce((total, modifier) => total + (modifier.efeito === "REDUCAO" ? -1 : 1) * (modifier.valorCentavos / 100), 0)
		);
	return line.quantidade * line.valorUnitario - (line.desconto ?? 0);
}

/** Unidade interna efetiva da linha: a do produto vinculado ou a do rascunho a criar. */
function getLineInternalUnit(line: TReviewLine) {
	if (line.produto) return line.produto.unidade ?? "UN";
	if (line.produtoNovo) return line.produtoNovo.unidade.trim() || "UN";
	return null;
}

/**
 * O servidor só calcula a divergência para produtos existentes; para o rascunho ela nasce aqui,
 * quando o operador escolhe estocar numa unidade diferente da faturada na nota.
 */
function lineHasUnitDivergence(line: TReviewLine) {
	if (line.produto) return line.divergenciaUnidade;
	if (line.produtoNovo) return !unitsAreEquivalent(line.unidade, line.produtoNovo.unidade);
	return false;
}

function isBlank(value: unknown) {
	if (value === null || value === undefined) return true;
	if (typeof value === "string") return value.trim().length === 0;
	if (typeof value === "number") return value === 0;
	return false;
}

function sameDay(a?: Date | null, b?: Date | null) {
	if (!a || !b) return false;
	return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

function buildAccountingProposals({
	documento,
	fornecedor,
	accountingEntry,
}: {
	documento: TImportDocumento;
	fornecedor: TImportFornecedor | null;
	accountingEntry: TUsePurchaseState["state"]["lancamentoContabil"];
}): TAccountingProposal[] {
	const proposals: TAccountingProposal[] = [];

	// O total do documento manda; sem total declarado, a soma das linhas lidas.
	const valorProposto = documento.valorTotal ?? documento.somaItens;
	if (valorProposto > 0) {
		const atual = accountingEntry.valor ?? 0;
		proposals.push({
			key: "valor",
			label: "Valor efetivo (a pagar)",
			atual: isBlank(atual) ? null : formatToMoney(atual),
			proposto: formatToMoney(valorProposto),
			conflito: !isBlank(atual) && Math.abs(atual - valorProposto) > 0.01,
			patch: { valor: valorProposto },
		});
	}

	if (documento.dataEmissao) {
		const emissao = new Date(documento.dataEmissao);
		const atual = accountingEntry.dataCompetencia ? new Date(accountingEntry.dataCompetencia) : null;
		proposals.push({
			key: "dataCompetencia",
			label: "Data de competência",
			atual: atual ? (formatDateAsLocale(atual) ?? null) : null,
			proposto: formatDateAsLocale(emissao) ?? "",
			// A competência nasce com a data de hoje, então quase toda importação é tecnicamente um
			// conflito. Só tratamos como tal se o operador tiver escolhido outra data que não hoje.
			conflito: !!atual && !sameDay(atual, emissao) && !sameDay(atual, new Date()),
			patch: { dataCompetencia: emissao },
		});
	}

	const fornecedorNome = fornecedor?.existente?.nome ?? fornecedor?.extraido?.nome ?? null;
	const tituloProposto = fornecedorNome
		? documento.numero
			? `Compra ${fornecedorNome} - Doc. ${documento.numero}`
			: `Compra ${fornecedorNome}`
		: documento.numero
			? `Compra - Doc. ${documento.numero}`
			: null;
	if (tituloProposto && isBlank(accountingEntry.titulo)) {
		proposals.push({
			key: "titulo",
			label: "Título do lançamento",
			atual: null,
			proposto: tituloProposto,
			conflito: false,
			patch: { titulo: tituloProposto },
		});
	}

	return proposals;
}

type ImportCompositionWithAIProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	addPurchaseItem: TUsePurchaseState["addPurchaseItem"];
	updatePurchase: TUsePurchaseState["updatePurchase"];
	/** Lançamento contábil da compra: é ele que carrega o valor efetivo lido do documento. */
	accountingEntry: TUsePurchaseState["state"]["lancamentoContabil"];
	updateAccountingEntry: TUsePurchaseState["updateAccountingEntry"];
	currentFornecedorId: string | null;
	currentImportedDocuments?: TUsePurchaseState["state"]["purchase"]["documentosImportados"];
};

export default function ImportCompositionWithAI({
	open,
	onOpenChange,
	addPurchaseItem,
	updatePurchase,
	accountingEntry,
	updateAccountingEntry,
	currentFornecedorId,
	currentImportedDocuments,
}: ImportCompositionWithAIProps) {
	const [phase, setPhase] = useState<TPhase>("UPLOAD");
	const [fileEntries, setFileEntries] = useState<TFileEntry[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [lines, setLines] = useState<TReviewLine[]>([]);
	const [fornecedor, setFornecedor] = useState<TImportFornecedor | null>(null);
	const [documento, setDocumento] = useState<TImportDocumento | null>(null);
	const [importedDocuments, setImportedDocuments] = useState<TImportDocumento["importado"][]>([]);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [rejectedProposals, setRejectedProposals] = useState<Set<TAccountingProposalKey>>(new Set());
	const [vincularFornecedor, setVincularFornecedor] = useState(true);
	const [isConfirming, setIsConfirming] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const includedLines = useMemo(() => lines.filter((line) => line.incluir && (line.produto || line.produtoNovo)), [lines]);
	const unresolvedCount = useMemo(() => lines.filter((line) => !line.produto && !line.produtoNovo).length, [lines]);
	const pendingUnitCount = useMemo(
		() => lines.filter((line) => line.incluir && (line.produto || line.produtoNovo) && lineHasUnitDivergence(line) && !line.fatorConversao).length,
		[lines],
	);
	const pendingTaxTreatmentCount = useMemo(
		() => includedLines.reduce((total, line) => total + (line.modificadoresCusto ?? []).filter((modifier) => modifier.tratamento === null).length, 0),
		[includedLines],
	);
	const includedTotal = useMemo(() => includedLines.reduce((acc, line) => acc + getLineTotal(line), 0), [includedLines]);
	const accountingProposals = useMemo(
		() => (documento ? buildAccountingProposals({ documento, fornecedor, accountingEntry }) : []),
		[documento, fornecedor, accountingEntry],
	);

	function resetAndClose(nextOpen: boolean) {
		onOpenChange(nextOpen);
		if (!nextOpen) {
			setPhase("UPLOAD");
			setFileEntries([]);
			setLines([]);
			setFornecedor(null);
			setDocumento(null);
			setImportedDocuments([]);
			setWarnings([]);
			setRejectedProposals(new Set());
			setVincularFornecedor(true);
			setIsDragging(false);
		}
	}

	function addFiles(candidates: File[]) {
		const accepted: TFileEntry[] = [];
		for (const file of candidates) {
			if (!isAcceptedImportFile(file)) {
				toast.error(`"${file.name}" não é suportado. Envie XML, PDF ou uma imagem (PNG, JPG, WEBP).`);
				continue;
			}
			accepted.push({ file, status: "PENDENTE", itemCount: null, errorMessage: null });
		}
		if (accepted.length > 0) setFileEntries((prev) => [...prev, ...accepted]);
	}

	function handleDrop(event: DragEvent<HTMLLabelElement>) {
		event.preventDefault();
		setIsDragging(false);
		addFiles(Array.from(event.dataTransfer.files));
	}

	function updateFileEntry(index: number, updates: Partial<TFileEntry>) {
		setFileEntries((prev) => prev.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...updates } : entry)));
	}

	function updateLine(index: number, updates: Partial<TReviewLine>) {
		setLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? { ...line, ...updates } : line)));
	}

	function startProductDraft(index: number) {
		const line = lines[index];
		if (!line) return;
		updateLine(index, {
			produtoNovo: {
				nome: line.descricao,
				codigo: line.ean?.trim() || line.codigoFornecedor?.trim() || "",
				unidade: line.unidade?.trim() || "UN",
				ncm: line.ncm?.trim() ?? "",
				// Compras trazem sobretudo insumos: nasce fora das superfícies de venda, mas com
				// rastreamento de estoque ativo — é a própria compra que dará a primeira entrada.
				vendavel: false,
				rastreamentoEstoqueAtivo: true,
			},
			incluir: true,
			manualOverride: true,
		});
	}

	function updateProductDraft(index: number, updates: Partial<TNewProductDraft>) {
		setLines((prev) =>
			prev.map((line, lineIndex) => (lineIndex === index && line.produtoNovo ? { ...line, produtoNovo: { ...line.produtoNovo, ...updates } } : line)),
		);
	}

	function updateModifierTreatment(lineIndex: number, modifierIndex: number, tratamento: "CUSTO_ESTOQUE" | "CREDITO_TRIBUTARIO" | "DESPESA_PERIODO") {
		setLines((previous) =>
			previous.map((line, currentLineIndex) =>
				currentLineIndex !== lineIndex
					? line
					: {
							...line,
							modificadoresCusto: (line.modificadoresCusto ?? []).map((modifier, currentModifierIndex) =>
								currentModifierIndex === modifierIndex ? { ...modifier, tratamento } : modifier,
							),
						},
			),
		);
	}

	async function handleExtract() {
		if (fileEntries.length === 0) return;
		setPhase("PROCESSANDO");

		const mergedLines: TReviewLine[] = [];
		const mergedWarnings: string[] = [];
		const mergedImportedDocuments: TImportDocumento["importado"][] = [];
		let mergedFornecedor: TImportFornecedor | null = null;
		let mergedDocumento: TImportDocumento | null = null;

		for (let index = 0; index < fileEntries.length; index++) {
			updateFileEntry(index, { status: "PROCESSANDO" });
			try {
				const payload = await prepareImportFilePayload(fileEntries[index].file);
				const result = await importPurchaseComposition({ file: payload });
				mergedLines.push(
					...result.data.itens.map((item) => ({
						...item,
						incluir: !!item.produto,
						produtoNovo: null,
						extraidoQuantidade: item.quantidade,
						extraidoValorUnitario: item.valorUnitario,
						produtoVariante: null,
						manualOverride: false,
						fatorConversao: item.fatorConversaoSugerido,
						documentoRef: result.data.documento.importado.referencia,
						origemImportacao: result.data.documento.origem,
					})),
				);
				mergedImportedDocuments.push(result.data.documento.importado);
				mergedWarnings.push(...result.data.avisos);
				if (!mergedFornecedor && (result.data.fornecedor.existente || result.data.fornecedor.extraido)) mergedFornecedor = result.data.fornecedor;
				// O primeiro documento define o cabeçalho da compra; os seguintes só somam itens.
				if (!mergedDocumento) mergedDocumento = result.data.documento;
				updateFileEntry(index, { status: "CONCLUIDO", itemCount: result.data.itens.length });
			} catch (error) {
				updateFileEntry(index, { status: "ERRO", errorMessage: getErrorMessage(error) });
			}
		}

		if (mergedLines.length === 0) {
			toast.error("Nenhum item foi identificado nos arquivos enviados.");
			setPhase("UPLOAD");
			return;
		}

		setLines(mergedLines);
		setFornecedor(mergedFornecedor);
		setDocumento(mergedDocumento);
		setImportedDocuments(mergedImportedDocuments);
		setWarnings([...new Set(mergedWarnings)]);
		setRejectedProposals(
			mergedDocumento
				? new Set(
						buildAccountingProposals({ documento: mergedDocumento, fornecedor: mergedFornecedor, accountingEntry })
							.filter((proposal) => proposal.conflito)
							.map((proposal) => proposal.key),
					)
				: new Set(),
		);
		setPhase("REVISAO");
	}

	function toggleProposal(key: TAccountingProposalKey) {
		setRejectedProposals((previous) => {
			const next = new Set(previous);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	async function handleConfirm() {
		if (includedLines.length === 0) return;
		if (pendingUnitCount > 0) {
			toast.error(`Informe o fator de conversão dos ${pendingUnitCount} itens com unidade divergente antes de adicionar.`);
			return;
		}
		if (pendingTaxTreatmentCount > 0) {
			toast.error(`Revise o tratamento dos ${pendingTaxTreatmentCount} tributos destacados antes de adicionar.`);
			return;
		}
		setIsConfirming(true);
		try {
			// 1. Supplier: link the existing one or create it now (idempotent by CNPJ on the server).
			let supplierId = fornecedor?.existente?.id ?? null;
			if (vincularFornecedor && fornecedor) {
				let supplierData = fornecedor.existente;
				if (!supplierData && fornecedor.extraido?.nome) {
					const created = await createSupplier({
						supplier: {
							nome: fornecedor.extraido.nome,
							cpfCnpj: fornecedor.extraido.cnpj,
							telefone: null,
							email: null,
							inscricaoEstadual: null,
						},
					});
					supplierId = created.data.insertedId;
					supplierData = created.data.supplier;
				}
				if (supplierId && supplierData) {
					updatePurchase({
						fornecedorId: supplierId,
						pedidoFornecedorNome: supplierData.nome,
						pedidoFornecedorCnpj: supplierData.cpfCnpj ? formatToCNPJ(supplierData.cpfCnpj) : null,
					});
				}
			}

			// 1.5 Produtos rascunhados: como o fornecedor, só nascem aqui no confirmar — cancelar a
			//     revisão nunca deixa produto órfão. Linhas com o mesmo EAN/código no lote viram UM
			//     produto só (a mesma mercadoria pode aparecer em mais de uma linha ou arquivo).
			const resolvedLines: TReviewLine[] = [];
			const createdProductByKey = new Map<string, NonNullable<TReviewLine["produto"]>>();
			for (const line of includedLines) {
				if (line.produto || !line.produtoNovo) {
					resolvedLines.push(line);
					continue;
				}
				const draft = line.produtoNovo;
				if (!draft.nome.trim()) throw new Error(`Informe o nome do novo produto para "${line.descricao}".`);
				const draftKey = (line.ean?.trim() || line.codigoFornecedor?.trim() || draft.nome.trim()).toUpperCase();
				let produto = createdProductByKey.get(draftKey) ?? null;
				if (!produto) {
					const convertido = convertLineToProductUnit({
						quantidade: line.quantidade,
						valorUnitario: line.valorUnitario,
						fatorConversao: line.fatorConversao,
					});
					const created = await createProduct({
						product: {
							nome: draft.nome.trim(),
							codigo: draft.codigo.trim(),
							unidade: draft.unidade.trim() || "UN",
							ncm: draft.ncm.trim(),
							tipo: "",
							grupo: "",
							descricao: null,
							imagemCapaUrl: null,
							vendavel: draft.vendavel,
							rastreamentoEstoqueAtivo: draft.rastreamentoEstoqueAtivo,
							// Estoque inicial em 0: é a própria compra que dará a entrada.
							quantidade: 0,
							precoVenda: null,
							precoCusto: convertido.valorUnitario,
							fichaTecnicaReceitaId: null,
						},
						productVariants: [],
						productOptions: [],
						productAddOns: [],
						productFiscalProfiles: [],
					});
					produto = {
						id: created.data.productId,
						nome: draft.nome.trim(),
						codigo: draft.codigo.trim(),
						unidade: draft.unidade.trim() || "UN",
						imagemCapaUrl: null,
					};
					createdProductByKey.set(draftKey, produto);
				}
				resolvedLines.push({ ...line, produto, produtoVarianteId: null, produtoVariante: null, produtoNovo: null });
			}

			// 2. Inject reviewed lines into the purchase draft, already converted to the product unit.
			//    Os valores lidos da nota seguem gravados em externo*, independentemente do ajuste.
			for (const line of resolvedLines) {
				if (!line.produto) continue;
				const convertido = convertLineToProductUnit({
					quantidade: line.quantidade,
					valorUnitario: line.valorUnitario,
					fatorConversao: line.fatorConversao,
				});
				addPurchaseItem(
					normalizeItemValues({
						...createEmptyPurchaseItem(),
						produtoId: line.produto.id,
						produtoVarianteId: line.produtoVarianteId,
						snapshotProdutoDescricao: line.produtoVariante?.nome ?? line.produto.nome,
						snapshotProdutoCodigo: line.produtoVariante?.codigo ?? line.produto.codigo,
						produto: {
							nome: line.produto.nome,
							codigo: line.produto.codigo,
							unidade: line.produto.unidade ?? "UN",
							imagemCapaUrl: line.produto.imagemCapaUrl,
						},
						produtoVariante: line.produtoVariante ?? undefined,
						quantidade: convertido.quantidade,
						valorUnitarioBruto: convertido.valorUnitario,
						descontosTotal: line.desconto ?? 0,
						modificadoresCusto: {
							versao: 1,
							modificadores: (line.modificadoresCusto ?? []).map((modifier) => ({
								...modifier,
								tratamento: modifier.tratamento!,
								origem: line.origemImportacao === "XML" ? "XML" : "IA",
								documentoRef: line.documentoRef,
								rateio: { metodo: "INFORMADO_ITEM" },
							})),
						},
						externoQtde: line.extraidoQuantidade,
						externoValor: line.extraidoValorUnitario,
						externoUnidade: line.unidade,
						externoFatorConversao: line.fatorConversao,
						anotacoes: `Importado via ${line.origemImportacao}: ${line.descricao}`,
					}),
				);
			}
			updatePurchase({
				documentosImportados: {
					versao: 1,
					documentos: [...(currentImportedDocuments?.documentos ?? []), ...importedDocuments],
				},
			});

			// 3. Campos aceitos do lançamento contábil. `valorPrevisto` nunca entra: a nota é o valor
			//    efetivo, e preenchê-lo faria o orçado bater sempre com o realizado.
			const acceptedPatch = accountingProposals
				.filter((proposal) => !rejectedProposals.has(proposal.key))
				.reduce<Partial<TUsePurchaseState["state"]["lancamentoContabil"]>>((patch, proposal) => ({ ...patch, ...proposal.patch }), {});
			if (Object.keys(acceptedPatch).length > 0) updateAccountingEntry(acceptedPatch);

			// 4. Learning: persist confirmed de-paras so the next invoice of this supplier matches
			//    deterministically — including the products recém-criados, que entram com o id real.
			//    A MAPEADO line the operator re-pointed is a correction: it must overwrite the stored de-para.
			const learnableLines = resolvedLines.filter(
				(line) => line.produto && (line.matchTipo !== "MAPEADO" || line.manualOverride) && (line.codigoFornecedor?.trim() || line.ean?.trim()),
			);
			if (supplierId && learnableLines.length > 0) {
				createSupplierProductMappings({
					fornecedorId: supplierId,
					mappings: learnableLines.map((line) => ({
						codigoFornecedor: line.codigoFornecedor,
						ean: line.ean,
						produtoId: line.produto!.id,
						produtoVarianteId: line.produtoVarianteId,
						unidadeExterna: line.unidade,
						fatorConversao: line.fatorConversao,
					})),
				}).catch((error) => toast.error(`Itens adicionados, mas houve um erro ao registrar os mapeamentos do fornecedor: ${getErrorMessage(error)}`));
			}

			const createdCount = createdProductByKey.size;
			const ignoredCount = lines.length - includedLines.length;
			let successMessage = `${resolvedLines.length} ${resolvedLines.length === 1 ? "item adicionado" : "itens adicionados"} à composição da compra.`;
			if (createdCount > 0) successMessage += ` ${createdCount} ${createdCount === 1 ? "produto criado" : "produtos criados"} no catálogo.`;
			if (ignoredCount > 0) successMessage += ` ${ignoredCount} ${ignoredCount === 1 ? "item ignorado" : "itens ignorados"}.`;
			toast.success(successMessage);
			resetAndClose(false);
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			setIsConfirming(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(nextOpen) => (isConfirming || phase === "PROCESSANDO" ? null : resetAndClose(nextOpen))}>
			<DialogContent data-dialog-container className="flex max-h-[85vh] w-full flex-col gap-3 overflow-hidden sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base">
						<Sparkles className="h-4 w-4 text-primary" />
						IMPORTAR DOCUMENTO
					</DialogTitle>
					<DialogDescription className="text-xs">
						{phase === "REVISAO"
							? "Revise os itens extraídos, resolva os não mapeados e adicione-os à composição da compra."
							: "Envie o XML da NF-e para leitura exata, ou PDF/foto para extração assistida por IA."}
					</DialogDescription>
				</DialogHeader>

				{phase !== "REVISAO" ? (
					<div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
						{phase === "UPLOAD" ? (
							<label
								onDragOver={(event) => {
									event.preventDefault();
									setIsDragging(true);
								}}
								onDragLeave={() => setIsDragging(false)}
								onDrop={handleDrop}
								className={cn(
									"flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-8 text-center transition-colors",
									isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40",
								)}
							>
								<Upload className="h-6 w-6 text-muted-foreground" />
								<p className="text-sm font-medium">Arraste os arquivos aqui ou clique para selecionar</p>
								<p className="text-xs text-muted-foreground">XML de NF-e, PDF ou foto de cupom · até 3MB por arquivo</p>
								<input
									ref={fileInputRef}
									type="file"
									multiple
									accept={IMPORT_ACCEPTED_MIME_TYPES.join(",")}
									className="hidden"
									onChange={(event) => {
										addFiles(Array.from(event.target.files ?? []));
										event.target.value = "";
									}}
								/>
							</label>
						) : null}

						{fileEntries.length > 0 ? (
							<div className="flex w-full flex-col overflow-hidden rounded-md border border-border">
								{fileEntries.map((entry, index) => (
									<div key={`${entry.file.name}-${index}`} className="flex w-full items-center gap-2 border-t border-border px-3 py-2 first:border-t-0">
										{entry.file.type === "application/pdf" || entry.file.name.toLowerCase().endsWith(".xml") ? (
											<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
										) : (
											<ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
										)}
										<div className="flex min-w-0 flex-1 flex-col">
											<p className="truncate text-sm font-medium">{entry.file.name}</p>
											<p className="text-xs text-muted-foreground">
												{entry.status === "ERRO" ? (
													<span className="text-destructive">{entry.errorMessage}</span>
												) : entry.status === "CONCLUIDO" ? (
													`${entry.itemCount} ${entry.itemCount === 1 ? "item identificado" : "itens identificados"}`
												) : (
													`${(entry.file.size / 1024 / 1024).toFixed(2)} MB`
												)}
											</p>
										</div>
										{entry.status === "PROCESSANDO" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" /> : null}
										{entry.status === "CONCLUIDO" ? <CircleCheck className="h-4 w-4 shrink-0 text-green-600" /> : null}
										{entry.status === "ERRO" ? <CircleAlert className="h-4 w-4 shrink-0 text-destructive" /> : null}
										{phase === "UPLOAD" ? (
											<button
												type="button"
												aria-label={`Remover ${entry.file.name}`}
												onClick={() => setFileEntries((prev) => prev.filter((_, entryIndex) => entryIndex !== index))}
												className="cursor-pointer rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
											>
												<X className="h-3.5 w-3.5" />
											</button>
										) : null}
									</div>
								))}
							</div>
						) : null}

						{phase === "PROCESSANDO" ? (
							<p className="text-center text-xs text-muted-foreground">Lendo os documentos com IA — isso pode levar alguns segundos por arquivo...</p>
						) : null}

						<div className="flex w-full items-center justify-end gap-2">
							<Button type="button" variant="ghost" size="sm" disabled={phase === "PROCESSANDO"} onClick={() => resetAndClose(false)}>
								CANCELAR
							</Button>
							<LoadingButton type="button" size="sm" loading={phase === "PROCESSANDO"} disabled={fileEntries.length === 0} onClick={handleExtract}>
								<Sparkles className="h-4 w-4" />
								EXTRAIR ITENS
							</LoadingButton>
						</div>
					</div>
				) : (
					<div className="flex min-h-0 flex-1 flex-col gap-3">
						<div className="flex w-full flex-col gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex min-w-0 items-center gap-2">
								<Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
								{fornecedor?.existente ? (
									<div className="flex min-w-0 items-center gap-2">
										<p className="truncate text-sm font-medium">{fornecedor.existente.nome}</p>
										<span className="shrink-0 rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[0.65rem] font-medium text-blue-700 dark:text-blue-300">
											FORNECEDOR EXISTENTE
										</span>
									</div>
								) : fornecedor?.extraido?.nome ? (
									<div className="flex min-w-0 items-center gap-2">
										<p className="truncate text-sm font-medium">{fornecedor.extraido.nome}</p>
										<span className="shrink-0 rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-medium text-amber-700 dark:text-amber-300">
											SERÁ CRIADO
										</span>
									</div>
								) : (
									<p className="text-sm italic text-muted-foreground">Fornecedor não identificado no documento.</p>
								)}
							</div>
							{fornecedor?.existente || fornecedor?.extraido?.nome ? (
								<label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-foreground/80">
									<Switch checked={vincularFornecedor} onCheckedChange={setVincularFornecedor} />
									{currentFornecedorId ? "Substituir fornecedor da compra" : "Vincular à compra"}
								</label>
							) : null}
						</div>

						{warnings.length > 0 ? (
							<ul className="flex w-full flex-col gap-1">
								{warnings.map((warning) => (
									<li key={warning} className="flex items-start gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
										<Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
										<p className="text-[0.68rem] leading-relaxed text-muted-foreground">{warning}</p>
									</li>
								))}
							</ul>
						) : null}

						{accountingProposals.length > 0 ? (
							<section className="flex w-full flex-col overflow-hidden rounded-md border border-border">
								<header className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
									<h3 className="text-[0.68rem] font-medium uppercase text-muted-foreground">Lançamento contábil</h3>
									<span className="text-[0.65rem] text-muted-foreground">Desmarque o que não quiser aplicar</span>
								</header>
								<ul className="flex w-full flex-col">
									{accountingProposals.map((proposal) => {
										const aceito = !rejectedProposals.has(proposal.key);
										const inputId = `proposta-contabil-${proposal.key}`;
										return (
											<li
												key={proposal.key}
												className={cn(
													"flex w-full items-start gap-2.5 border-t border-border px-3 py-2 first:border-t-0",
													proposal.conflito && aceito && "bg-destructive/5",
													!aceito && "opacity-55",
												)}
											>
												<Checkbox id={inputId} checked={aceito} onCheckedChange={() => toggleProposal(proposal.key)} className="mt-0.5" />
												<div className="flex min-w-0 flex-1 flex-col gap-0.5">
													<label htmlFor={inputId} className="cursor-pointer text-xs font-medium leading-tight">
														{proposal.label}
													</label>
													<div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[0.68rem]">
														{proposal.atual ? (
															<>
																<span className="truncate text-muted-foreground line-through">{proposal.atual}</span>
																<ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
															</>
														) : (
															<span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">vazio</span>
														)}
														<span className={cn("min-w-0 break-words font-medium", proposal.conflito ? "text-destructive" : "text-foreground")}>
															{proposal.proposto}
														</span>
													</div>
												</div>
											</li>
										);
									})}
								</ul>
							</section>
						) : null}

						{unresolvedCount > 0 ? (
							<div className="flex w-full items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
								<CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
								<p className="leading-relaxed">
									{unresolvedCount} {unresolvedCount === 1 ? "item não foi mapeado" : "itens não foram mapeados"} a produtos. Selecione o produto
									correspondente ou crie um novo produto para incluí-los — ou deixe desmarcado para ignorar.
								</p>
							</div>
						) : null}

						<div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-md border border-border">
							{lines.map((line, index) => {
								const badge = line.produto ? MATCH_BADGE[line.matchTipo] : line.produtoNovo ? CREATE_BADGE : MATCH_BADGE.NAO_MAPEADO;
								const internalUnit = getLineInternalUnit(line);
								const unitDivergence = lineHasUnitDivergence(line);
								return (
									<div key={index} className={cn("flex w-full flex-col gap-2 border-t border-border p-3 first:border-t-0", !line.incluir && "opacity-60")}>
										<div className="flex w-full items-start gap-2.5">
											<Checkbox
												checked={line.incluir}
												disabled={!line.produto && !line.produtoNovo}
												onCheckedChange={(checked) => updateLine(index, { incluir: checked === true })}
												aria-label={`Incluir "${line.descricao}"`}
												className="mt-0.5"
											/>
											<div className="flex min-w-0 flex-1 flex-col gap-0.5">
												<p className="text-sm font-medium leading-tight">{line.descricao}</p>
												<p className="text-xs text-muted-foreground">
													{[
														line.codigoFornecedor ? `Cód. ${line.codigoFornecedor}` : null,
														line.ean ? `EAN ${line.ean}` : null,
														line.unidade ? `Un. ${line.unidade}` : null,
														`${line.extraidoQuantidade} × ${formatToMoney(line.extraidoValorUnitario)}`,
													]
														.filter(Boolean)
														.join(" · ")}
												</p>
											</div>
											<span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium", badge.className)}>{badge.label}</span>
										</div>
										<div className="flex w-full flex-col gap-1.5 pl-6 sm:flex-row sm:items-end">
											<div className="min-w-0 flex-1">
												<SelectProductWithVariants
													label="PRODUTO CORRESPONDENTE"
													showLabel={false}
													value={line.produto ? { productId: line.produto.id, productVariantId: line.produtoVarianteId } : null}
													selectedLabel={
														line.produto ? (line.produtoVariante ? `${line.produto.nome} - ${line.produtoVariante.nome}` : line.produto.nome) : undefined
													}
													resetOptionLabel="REMOVER PRODUTO"
													initialSearch=""
													handleChange={(value) => {
														if (!value?.product) return;
														updateLine(index, {
															produto: {
																id: value.product.id,
																nome: value.product.nome,
																codigo: value.product.codigo,
																unidade: value.product.unidade,
																imagemCapaUrl: value.product.imagemCapaUrl ?? null,
															},
															produtoVarianteId: value.productVariant?.id ?? null,
															produtoVariante: value.productVariant
																? {
																		nome: value.productVariant.nome,
																		codigo: value.productVariant.codigo ?? "",
																		imagemCapaUrl: value.productVariant.imagemCapaUrl ?? null,
																	}
																: null,
															produtoNovo: null,
															manualOverride: true,
															incluir: true,
														});
													}}
													onReset={() => updateLine(index, { produto: null, produtoVarianteId: null, produtoVariante: null, produtoNovo: null, incluir: false })}
													triggerProps={{ size: "sm", className: "h-8 w-full text-xs" }}
												/>
											</div>
											{!line.produto && !line.produtoNovo ? (
												<Button type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={() => startProductDraft(index)}>
													<PackagePlus className="h-3.5 w-3.5" />
													CRIAR PRODUTO
												</Button>
											) : null}
											<div className="flex shrink-0 items-end gap-1.5">
												<div className="flex flex-col gap-0.5">
													<label className="text-[0.65rem] font-medium uppercase text-muted-foreground">Qtde</label>
													<Input
														type="number"
														min={0}
														step="any"
														value={line.quantidade}
														onChange={(event) => updateLine(index, { quantidade: Number(event.target.value) || 0 })}
														className="h-8 w-20 text-xs tabular-nums"
													/>
												</div>
												<div className="flex flex-col gap-0.5">
													<label className="text-[0.65rem] font-medium uppercase text-muted-foreground">Valor unit.</label>
													<Input
														type="number"
														min={0}
														step="any"
														value={line.valorUnitario}
														onChange={(event) => updateLine(index, { valorUnitario: Number(event.target.value) || 0 })}
														className="h-8 w-24 text-xs tabular-nums"
													/>
												</div>
												<div className="flex h-8 w-24 items-center justify-end rounded-md bg-muted/50 px-2">
													<span className="font-mono text-xs font-medium tabular-nums">{formatToMoney(getLineTotal(line))}</span>
												</div>
											</div>
										</div>

										{line.produtoNovo ? (
											<div className="ml-6 overflow-hidden rounded-md border border-amber-500/35 bg-amber-500/5">
												<div className="flex items-center justify-between gap-2 border-b border-amber-500/25 px-2.5 py-1.5">
													<span className="text-[0.65rem] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
														Novo produto — criado ao adicionar os itens
													</span>
													<button
														type="button"
														aria-label={`Descartar novo produto de "${line.descricao}"`}
														onClick={() => updateLine(index, { produtoNovo: null, incluir: false })}
														className="cursor-pointer rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
													>
														<X className="h-3.5 w-3.5" />
													</button>
												</div>
												<div className="flex flex-col gap-1.5 px-2.5 py-2 sm:flex-row sm:items-end">
													<div className="flex min-w-0 flex-1 flex-col gap-0.5">
														<label className="text-[0.65rem] font-medium uppercase text-muted-foreground">Nome</label>
														<Input
															value={line.produtoNovo.nome}
															onChange={(event) => updateProductDraft(index, { nome: event.target.value })}
															className="h-8 text-xs"
														/>
													</div>
													<div className="flex shrink-0 items-end gap-1.5">
														<div className="flex flex-col gap-0.5">
															<label className="text-[0.65rem] font-medium uppercase text-muted-foreground">Código</label>
															<Input
																value={line.produtoNovo.codigo}
																onChange={(event) => updateProductDraft(index, { codigo: event.target.value })}
																className="h-8 w-28 text-xs"
															/>
														</div>
														<div className="flex flex-col gap-0.5">
															<label className="text-[0.65rem] font-medium uppercase text-muted-foreground">Unidade</label>
															<Input
																value={line.produtoNovo.unidade}
																onChange={(event) => updateProductDraft(index, { unidade: event.target.value.toUpperCase() })}
																className="h-8 w-20 text-xs"
															/>
														</div>
														<div className="flex flex-col gap-0.5">
															<label className="text-[0.65rem] font-medium uppercase text-muted-foreground">NCM</label>
															<Input
																value={line.produtoNovo.ncm}
																onChange={(event) => updateProductDraft(index, { ncm: event.target.value })}
																placeholder="—"
																className="h-8 w-24 text-xs tabular-nums"
															/>
														</div>
													</div>
												</div>
												<div className="flex flex-wrap items-center gap-4 border-t border-amber-500/25 px-2.5 py-1.5">
													<label className="flex cursor-pointer items-center gap-1.5 text-[0.68rem] font-medium text-foreground/80">
														<Switch checked={line.produtoNovo.vendavel} onCheckedChange={(checked) => updateProductDraft(index, { vendavel: checked })} />
														Disponível para venda
													</label>
													<label className="flex cursor-pointer items-center gap-1.5 text-[0.68rem] font-medium text-foreground/80">
														<Switch
															checked={line.produtoNovo.rastreamentoEstoqueAtivo}
															onCheckedChange={(checked) => updateProductDraft(index, { rastreamentoEstoqueAtivo: checked })}
														/>
														Rastrear estoque
													</label>
												</div>
											</div>
										) : null}

										{line.modificadoresCusto && line.modificadoresCusto.length > 0 ? (
											<div className="ml-6 overflow-hidden rounded-md border border-border bg-muted/20">
												<div className="border-b border-border px-2.5 py-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
													Custos e tributos destacados
												</div>
												{line.modificadoresCusto.map((modifier, modifierIndex) => (
													<div
														key={`${modifier.chave}-${modifierIndex}`}
														className="flex flex-col gap-1.5 border-t border-border px-2.5 py-2 first:border-t-0 sm:flex-row sm:items-center"
													>
														<div className="min-w-0 flex-1">
															<p className="text-xs font-medium">{COST_MODIFIER_LABELS[modifier.chave] ?? modifier.chave}</p>
															<p className="text-[0.68rem] text-muted-foreground">{formatToMoney(modifier.valorCentavos / 100)}</p>
														</div>
														<select
															aria-label={`Tratamento de ${COST_MODIFIER_LABELS[modifier.chave] ?? modifier.chave}`}
															value={modifier.tratamento ?? ""}
															onChange={(event) =>
																updateModifierTreatment(index, modifierIndex, event.target.value as "CUSTO_ESTOQUE" | "CREDITO_TRIBUTARIO" | "DESPESA_PERIODO")
															}
															className={cn("h-8 rounded-md border bg-background px-2 text-xs", modifier.tratamento === null && "border-amber-500 text-amber-700")}
														>
															<option value="" disabled>
																Revisar tratamento
															</option>
															<option value="CUSTO_ESTOQUE">Custo do estoque</option>
															<option value="CREDITO_TRIBUTARIO">Crédito tributário</option>
															<option value="DESPESA_PERIODO">Despesa do período</option>
														</select>
													</div>
												))}
											</div>
										) : null}

										{(line.produto || line.produtoNovo) && unitDivergence ? (
											<div className="ml-6 flex flex-col gap-1.5 rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
												<p className="text-[0.68rem] leading-relaxed text-destructive">
													A nota fatura em <strong>{line.unidade}</strong> e o produto é estocado em <strong>{internalUnit}</strong>. Informe quantas{" "}
													{internalUnit} cabem em 1 {line.unidade}.
												</p>
												<div className="flex shrink-0 items-end gap-1.5">
													<div className="flex flex-col gap-0.5">
														<label className="text-[0.65rem] font-medium uppercase text-muted-foreground">Fator</label>
														<Input
															type="number"
															min={0}
															step="any"
															value={line.fatorConversao ?? ""}
															placeholder="—"
															onChange={(event) => updateLine(index, { fatorConversao: Number(event.target.value) || null })}
															className="h-8 w-20 text-xs tabular-nums"
														/>
													</div>
													<div className="flex flex-col gap-0.5">
														<span className="text-[0.65rem] font-medium uppercase text-muted-foreground">Entra como</span>
														<span className="flex h-8 items-center font-mono text-xs font-medium tabular-nums">
															{line.fatorConversao && line.fatorConversao > 0
																? `${line.quantidade * line.fatorConversao} ${internalUnit} × ${formatToMoney(line.valorUnitario / line.fatorConversao)}`
																: "—"}
														</span>
													</div>
												</div>
											</div>
										) : null}
									</div>
								);
							})}
						</div>

						<div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-xs text-muted-foreground">
								{includedLines.length} de {lines.length} {lines.length === 1 ? "item selecionado" : "itens selecionados"} · Total:{" "}
								<span className="font-medium text-foreground">{formatToMoney(includedTotal)}</span>
							</p>
							<div className="flex items-center justify-end gap-2">
								<Button type="button" variant="ghost" size="sm" disabled={isConfirming} onClick={() => setPhase("UPLOAD")}>
									VOLTAR
								</Button>
								<LoadingButton
									type="button"
									size="sm"
									loading={isConfirming}
									disabled={includedLines.length === 0 || pendingTaxTreatmentCount > 0}
									onClick={handleConfirm}
								>
									ADICIONAR {includedLines.length} {includedLines.length === 1 ? "ITEM" : "ITENS"}
								</LoadingButton>
							</div>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

"use client";

import SelectProductWithVariants, { type TSelectProductWithVariantsValue } from "@/components/Inputs/SelectProductWithVariants";
import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatToMoney } from "@/lib/formatting";
import { inferPackFactorFromDescription, unitsAreEquivalent } from "@/lib/purchase/units";
import { cn } from "@/lib/utils";
import { AcquisitionNatureEnum, type TAcquisitionNatureEnum, type TPurchaseCostTreatmentEnum } from "@/schemas/enums";
import { ACQUISITION_NATURE_LABELS } from "@/lib/purchase/entry-rules";
import { ArrowRight, Check, CheckCheck, EyeOff, FileText, Link2, List, Minus, PackagePlus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import {
	applyTaxTreatment,
	buildNewProductDraft,
	getLineIssue,
	getLineTotal,
	getPendingModifierIndex,
	type TNewProductDraft,
	type TReviewIssue,
	type TReviewLine,
} from "../helpers/review-lines";
import { useBuilder } from "../components/builder-provider";
import { RadioCard, StatusPill, TONE_CLASSES } from "../components/builder-ui";
import { ISSUE_META } from "../helpers/issue-meta";

const ISSUE_QUESTIONS: Record<TReviewIssue, string> = {
	unmapped: "Este item não existe no seu catálogo",
	suggested: "É este o produto?",
	unit: "Quantas unidades vêm em cada embalagem?",
	tax: "Como tratar este tributo?",
};

const TAX_LABELS: Record<string, string> = {
	IMPOSTOS_IPI: "IPI",
	IMPOSTOS_ICMS: "ICMS",
	IMPOSTOS_ICMS_SN: "crédito de ICMS do Simples",
	IMPOSTOS_PIS: "PIS",
	IMPOSTOS_COFINS: "COFINS",
	IMPOSTOS_ICMS_ST: "ICMS-ST",
	IMPOSTOS_FCP_ST: "FCP-ST",
	IMPOSTOS_DIFAL: "DIFAL",
	IMPOSTOS_FCP_DIFAL: "FCP do DIFAL",
	IMPOSTOS_ANTECIPACAO: "antecipação de ICMS",
	IMPOSTOS_ICMS_ST_ENTRADA: "ICMS-ST de entrada",
	IMPOSTOS_IBS: "IBS",
	IMPOSTOS_CBS: "CBS",
	BONIFICACAO: "Bonificação",
	DESCONTO: "Desconto",
	FRETE: "Frete",
	SEGURO: "Seguro",
	DESPESA_ACESSORIA: "Despesa acessória",
	OUTRO: "Outro",
};

const TAX_OPTIONS: { id: TPurchaseCostTreatmentEnum; label: string; description: string }[] = [
	{ id: "CUSTO_ESTOQUE", label: "Custo do estoque", description: "Soma ao custo do produto. O mais comum para quem não recupera o tributo." },
	{ id: "CREDITO_TRIBUTARIO", label: "Crédito tributário", description: "Não entra no custo; fica como crédito a compensar." },
	{ id: "DESPESA_PERIODO", label: "Despesa do período", description: "Lançado como despesa do mês, fora do custo do produto." },
];
// Tributo embutido no preço: a pergunta é se ele sai do custo, não se ele soma.
const EMBEDDED_TAX_OPTIONS: { id: TPurchaseCostTreatmentEnum; label: string; description: string }[] = [
	{ id: "CUSTO_ESTOQUE", label: "Fica no custo", description: "Você não recupera este tributo: o preço da nota é o custo. O mais comum no Simples." },
	{ id: "CREDITO_TRIBUTARIO", label: "Tomar o crédito", description: "Sai do custo do produto e vira crédito a compensar. O valor a pagar não muda." },
	{ id: "DESPESA_PERIODO", label: "Despesa do período", description: "Sai do custo e vai direto ao resultado do mês." },
];

type TUnmappedMode = "create" | "link" | "ignore";

/**
 * Resolves the reviewed lines one problem at a time: the invoice data on top, a single question
 * below, and one confirm button. A line with more than one problem stays until all are answered.
 */
export default function ItemsQueue() {
	const { lines, queueLineId, setQueueLineId, closeQueue, setCurrentStage } = useBuilder();
	// The lines that entered the queue keep their slot in the progress dots, even after resolved.
	const [queueIds] = useState(() => {
		const pending = lines.filter((line) => getLineIssue(line) !== null).map((line) => line.id);
		return queueLineId && !pending.includes(queueLineId) ? [queueLineId, ...pending] : pending;
	});
	const queueLines = queueIds.map((id) => lines.find((line) => line.id === id)).filter((line): line is TReviewLine => !!line);
	const current =
		lines.find((line) => line.id === queueLineId && getLineIssue(line) !== null) ?? queueLines.find((line) => getLineIssue(line) !== null) ?? null;
	const issue = current ? getLineIssue(current) : null;
	const resolvedCount = queueLines.filter((line) => getLineIssue(line) === null).length;

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Button type="button" variant="ghost" size="sm" className="flex items-center gap-1.5" onClick={closeQueue}>
					<List className="h-3.5 w-3.5" />
					VER TODOS OS ITENS
				</Button>
				<div className="flex items-center gap-2.5">
					<span className="text-xs font-semibold text-muted-foreground">
						{current
							? `Pendência ${queueLines.findIndex((line) => line.id === current.id) + 1} de ${queueLines.length}`
							: `${resolvedCount} de ${queueLines.length} resolvidas`}
					</span>
					<div className="flex gap-1">
						{queueLines.map((line) => (
							<span
								key={line.id}
								className={cn(
									"h-1.5 w-5 rounded-full",
									line.id === current?.id ? "bg-brand" : !line.incluir ? "bg-muted-foreground/30" : getLineIssue(line) ? "bg-border" : "bg-green-600",
								)}
							/>
						))}
					</div>
				</div>
			</div>

			{current && issue ? (
				<QueuePanel
					// A fresh panel per line and problem: the drafts never leak from one question to the next.
					key={`${current.id}-${issue}-${getPendingModifierIndex(current)}`}
					line={current}
					issue={issue}
					onAdvance={(updatedLines) => {
						const updated = updatedLines.find((line) => line.id === current.id);
						if (updated && getLineIssue(updated) !== null) return setQueueLineId(updated.id);
						const order = queueIds.indexOf(current.id);
						const rotated = [...queueIds.slice(order + 1), ...queueIds.slice(0, order)];
						const nextId = rotated.find((id) => {
							const candidate = updatedLines.find((line) => line.id === id);
							return candidate && getLineIssue(candidate) !== null;
						});
						setQueueLineId(nextId ?? null);
					}}
					onSkip={() => {
						const order = queueIds.indexOf(current.id);
						const rotated = [...queueIds.slice(order + 1), ...queueIds.slice(0, order)];
						const nextId = rotated.find((id) => {
							const candidate = lines.find((line) => line.id === id);
							return candidate && getLineIssue(candidate) !== null;
						});
						if (nextId) setQueueLineId(nextId);
					}}
				/>
			) : (
				<div className="flex flex-col items-center gap-2.5 py-6 text-center">
					<span className={cn("flex h-11 w-11 items-center justify-center rounded-full", TONE_CLASSES.ok)}>
						<CheckCheck className="h-5 w-5" />
					</span>
					<p className="text-base font-semibold">Todas as pendências resolvidas</p>
					<p className="text-xs text-muted-foreground">
						{lines.filter((line) => line.incluir).length} itens prontos para entrar na compra
						{lines.some((line) => !line.incluir) ? `, ${lines.filter((line) => !line.incluir).length} não incluído(s)` : ""}.
					</p>
					<div className="mt-1.5 flex gap-2">
						<Button type="button" variant="outline" onClick={closeQueue}>
							VER LISTA
						</Button>
						<Button type="button" className="flex items-center gap-1.5" onClick={() => setCurrentStage("finance")}>
							IR PARA FINANCEIRO
							<ArrowRight className="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

function QueuePanel({
	line,
	issue,
	onAdvance,
	onSkip,
}: {
	line: TReviewLine;
	issue: TReviewIssue;
	onAdvance: (lines: TReviewLine[]) => void;
	onSkip: () => void;
}) {
	const { lines, setLines, importData } = useBuilder();
	const supplierName = importData?.fornecedor?.existente?.nome ?? importData?.fornecedor?.extraido?.nome ?? null;

	const [mode, setMode] = useState<TUnmappedMode>("create");
	const [productDraft, setProductDraft] = useState<TNewProductDraft>(() => line.produtoNovo ?? buildNewProductDraft(line, crypto.randomUUID()));
	const [linkPick, setLinkPick] = useState<TSelectProductWithVariantsValue>(null);
	const [pickingOther, setPickingOther] = useState(false);
	const [fatorDraft, setFatorDraft] = useState("");
	const [taxDraft, setTaxDraft] = useState<TPurchaseCostTreatmentEnum | null>(null);
	const [applyToWholeDocument, setApplyToWholeDocument] = useState(true);
	const [remember, setRemember] = useState(line.lembrarVinculo);

	const modifierIndex = getPendingModifierIndex(line);
	const modifier = modifierIndex === -1 ? null : (line.modificadoresCusto?.[modifierIndex] ?? null);
	const fator = Number(fatorDraft.replace(",", "."));
	const canRemember =
		!!(line.codigoFornecedor?.trim() || line.ean?.trim()) && issue !== "tax" && !(issue === "unmapped" && mode === "ignore") && !!supplierName;

	const ready =
		issue === "unit"
			? fator > 0
			: issue === "tax"
				? !!taxDraft
				: issue === "unmapped"
					? mode === "ignore" || (mode === "create" ? productDraft.nome.trim().length > 0 : !!linkPick?.product)
					: issue === "suggested"
						? !pickingOther || !!linkPick?.product
						: true;

	const confirmLabel =
		issue === "suggested"
			? pickingOther
				? "VINCULAR E SEGUIR"
				: "SIM, É ESTE PRODUTO"
			: issue === "unmapped"
				? mode === "ignore"
					? "NÃO INCLUIR E SEGUIR"
					: mode === "create"
						? "CRIAR E SEGUIR"
						: "VINCULAR E SEGUIR"
				: "CONFIRMAR E SEGUIR";

	function linkPatch(pick: NonNullable<TSelectProductWithVariantsValue>): Partial<TReviewLine> {
		const equivalent = unitsAreEquivalent(line.unidade, pick.product.unidade);
		return {
			produto: {
				id: pick.product.id,
				nome: pick.product.nome,
				codigo: pick.product.codigo,
				unidade: pick.product.unidade,
				// O seletor não carrega a natureza; o servidor usa a do cadastro ao gravar o de-para.
				natureza: "REVENDA",
				imagemCapaUrl: pick.product.imagemCapaUrl ?? null,
			},
			produtoVarianteId: pick.productVariant?.id ?? null,
			produtoVariante: pick.productVariant
				? { nome: pick.productVariant.nome, codigo: pick.productVariant.codigo ?? "", imagemCapaUrl: pick.productVariant.imagemCapaUrl ?? null }
				: null,
			produtoNovo: null,
			manualOverride: true,
			divergenciaUnidade: !equivalent,
			fatorConversaoSugerido: equivalent ? null : inferPackFactorFromDescription(line.descricao),
			fatorConversao: null,
		};
	}

	function confirm() {
		if (!ready) return;
		let patch: Partial<TReviewLine> = {};
		let nextLines = lines;
		if (issue === "unmapped") {
			if (mode === "ignore") patch = { incluir: false };
			else if (mode === "create")
				patch = { produtoNovo: { ...productDraft, nome: productDraft.nome.trim() }, manualOverride: true, fatorConversao: null };
			else if (linkPick?.product) patch = linkPatch(linkPick);
		} else if (issue === "suggested") {
			patch = pickingOther && linkPick?.product ? linkPatch(linkPick) : { vinculoConfirmado: true };
		} else if (issue === "unit") {
			patch = { fatorConversao: fator };
		} else if (issue === "tax" && taxDraft) {
			nextLines = applyTaxTreatment({ lines, lineId: line.id, modifierIndex, tratamento: taxDraft, applyToWholeDocument });
		}
		if (canRemember) patch.lembrarVinculo = remember;
		nextLines = nextLines.map((current) => (current.id === line.id ? { ...current, ...patch } : current));
		setLines(() => nextLines);
		onAdvance(nextLines);
	}

	const meta = ISSUE_META[issue];
	const internalUnit = line.produto?.unidade ?? line.produtoNovo?.unidade ?? "UN";
	const linkedName = line.produto?.nome ?? line.produtoNovo?.nome ?? "";

	return (
		<div className="flex flex-col gap-3.5">
			<div className="flex flex-wrap items-center gap-2">
				<StatusPill tone={meta.tone} icon={meta.icon}>
					{meta.pill}
				</StatusPill>
				<h3 className="text-[0.95rem] font-semibold tracking-tight">{ISSUE_QUESTIONS[issue]}</h3>
			</div>

			<div className="flex flex-col gap-2.5 rounded-xl bg-muted/70 px-3.5 py-3">
				<div className="flex flex-wrap items-center gap-2.5">
					<span className="flex items-center gap-1.5 text-[0.7rem] font-extrabold uppercase tracking-widest text-muted-foreground">
						<FileText className="h-3 w-3" />
						Na nota
					</span>
					<span className="font-mono text-sm font-semibold tracking-tight">{line.descricao}</span>
				</div>
				<div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
					<NoteField label="Código" value={line.codigoFornecedor ?? "—"} />
					<NoteField label="EAN" value={line.ean ?? "—"} />
					<NoteField label="NCM" value={line.ncm ?? "—"} />
					<NoteField label="Quantidade" value={`${line.quantidade} ${line.unidade ?? ""} × ${formatToMoney(line.valorUnitario)}`} />
					<NoteField label="Total da linha" value={formatToMoney(getLineTotal(line))} strong />
				</div>
			</div>

			{issue === "unmapped" ? (
				<div className="flex flex-col gap-2.5">
					<p className="text-xs font-bold uppercase">O que fazer com esta linha?</p>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
						<RadioCard
							selected={mode === "create"}
							onClick={() => setMode("create")}
							icon={PackagePlus}
							iconTone="ok"
							title="Criar novo produto"
							description="Cadastra o item no catálogo com os dados da nota."
						/>
						<RadioCard
							selected={mode === "link"}
							onClick={() => setMode("link")}
							icon={Link2}
							iconTone="info"
							title="Vincular a um existente"
							description="O item já existe com outro nome ou código."
						/>
						<RadioCard
							selected={mode === "ignore"}
							onClick={() => setMode("ignore")}
							icon={EyeOff}
							iconTone="mute"
							title="Não incluir"
							description="Sai do total dos itens. Para brindes ou o que não vai ao estoque."
						/>
					</div>
					{mode === "create" ? (
						<NewProductForm draft={productDraft} onChange={(patch) => setProductDraft((previous) => ({ ...previous, ...patch }))} />
					) : null}
					{mode === "link" ? <ProductPicker value={linkPick} initialSearch={line.descricao.split(" ")[0] ?? ""} onChange={setLinkPick} /> : null}
				</div>
			) : null}

			{issue === "suggested" && line.produto ? (
				<div className="flex flex-col gap-2.5 rounded-xl border border-border p-3.5">
					<p className="flex items-center gap-1.5 text-[0.7rem] font-extrabold uppercase tracking-widest text-blue-800 dark:text-blue-300">
						<Sparkles className="h-3 w-3" />
						Sugestão do catálogo
						{line.confianca !== null ? (
							<span className={cn("rounded-full px-1.5 py-0.5 text-[0.6rem] tracking-normal", TONE_CLASSES.info)}>
								{Math.round(line.confianca * 100)}% de confiança
							</span>
						) : null}
					</p>
					<div className="flex items-center gap-2.5">
						<span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-[0.7rem] font-semibold text-muted-foreground">
							{line.produto.nome.slice(0, 2).toUpperCase()}
						</span>
						<div className="flex flex-col">
							<span className="text-sm font-semibold">{line.produto.nome}</span>
							<span className="text-xs text-muted-foreground">
								Cód. {line.produto.codigo} · estocado em {line.produto.unidade ?? "UN"}
							</span>
						</div>
					</div>
					<ul className="flex flex-col gap-1 text-xs">
						{line.motivo ? (
							<li className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
								<Check className="h-3 w-3 shrink-0" />
								{line.motivo}
							</li>
						) : null}
						{unitsAreEquivalent(line.unidade, line.produto.unidade) ? (
							<li className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
								<Check className="h-3 w-3 shrink-0" />
								Mesma unidade ({line.produto.unidade ?? line.unidade})
							</li>
						) : (
							<li className="flex items-center gap-1.5 text-muted-foreground">
								<Minus className="h-3 w-3 shrink-0" />
								Unidades diferentes: a nota fatura em {line.unidade}, você estoca em {line.produto.unidade}
							</li>
						)}
						{!line.ean ? (
							<li className="flex items-center gap-1.5 text-muted-foreground">
								<Minus className="h-3 w-3 shrink-0" />A nota não traz EAN para conferir
							</li>
						) : null}
					</ul>
					{pickingOther ? (
						<ProductPicker value={linkPick} initialSearch="" onChange={setLinkPick} />
					) : (
						<Button
							type="button"
							variant="outline"
							size="xs"
							className="flex w-fit items-center gap-1.5 rounded-full"
							onClick={() => setPickingOther(true)}
						>
							<Search className="h-3 w-3" />
							Não é este, escolher outro
						</Button>
					)}
				</div>
			) : null}

			{issue === "unit" ? (
				<div className="flex flex-col gap-3 rounded-xl border border-border p-3.5">
					<p className="text-xs leading-relaxed">
						Vinculado a <strong>{linkedName}</strong>, que você estoca em <strong>{internalUnit}</strong>. A nota fatura em{" "}
						<strong>{line.unidade ?? "outra unidade"}</strong>.
					</p>
					<div className="flex items-center gap-2 text-sm font-medium">
						<span>1 {line.unidade ?? "UN"} =</span>
						<Input
							value={fatorDraft}
							onChange={(event) => setFatorDraft(event.target.value.replace(/[^\d.,]/g, ""))}
							placeholder="?"
							inputMode="decimal"
							className="h-9 w-20 text-center font-semibold"
							autoFocus
						/>
						<span>{internalUnit}</span>
					</div>
					{!fatorDraft && line.fatorConversaoSugerido ? (
						<button
							type="button"
							onClick={() => setFatorDraft(String(line.fatorConversaoSugerido))}
							className={cn("flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", TONE_CLASSES.info)}
						>
							<Sparkles className="h-3 w-3" />
							Usar {line.fatorConversaoSugerido} ·{" "}
							{line.matchTipo === "MAPEADO" && !line.manualOverride ? "aprendido nas notas anteriores" : "lido na descrição do item"}
						</button>
					) : null}
					<div className="flex justify-between gap-2 rounded-md bg-muted/70 px-2.5 py-2 text-xs">
						<span className="text-muted-foreground">Entra no estoque como</span>
						<span className="font-mono font-semibold">
							{fator > 0 ? `${line.quantidade * fator} ${internalUnit} × ${formatToMoney(line.valorUnitario / fator)}` : "—"}
						</span>
					</div>
				</div>
			) : null}

			{issue === "tax" && modifier ? (
				<div className="flex flex-col gap-2">
					<p className="text-xs leading-relaxed text-muted-foreground">
						{modifier.contrapartida === "INCLUSO_NO_VALOR" ? (
							<>
								A nota traz{" "}
								<strong className="text-foreground">
									{TAX_LABELS[modifier.chave] ?? modifier.chave} de {formatToMoney(modifier.valorCentavos / 100)}
								</strong>{" "}
								embutido no preço desta linha. Ele já está no valor a pagar; a pergunta é se sai do custo do produto.
							</>
						) : (
							<>
								A nota destaca{" "}
								<strong className="text-foreground">
									{TAX_LABELS[modifier.chave] ?? modifier.chave} de {formatToMoney(modifier.valorCentavos / 100)}
								</strong>{" "}
								nesta linha. O tratamento define se o valor muda o custo médio do produto.
							</>
						)}
					</p>
					{(modifier.contrapartida === "INCLUSO_NO_VALOR" ? EMBEDDED_TAX_OPTIONS : TAX_OPTIONS).map((option) => (
						<RadioCard
							key={option.id}
							selected={taxDraft === option.id}
							onClick={() => setTaxDraft(option.id)}
							title={option.label}
							description={option.description}
						/>
					))}
					<label className="flex cursor-pointer items-center gap-2 px-0.5 py-1 text-xs font-medium">
						<Checkbox checked={applyToWholeDocument} onCheckedChange={(checked) => setApplyToWholeDocument(checked === true)} />
						Usar este tratamento para o {TAX_LABELS[modifier.chave] ?? "tributo"} de toda a nota
					</label>
				</div>
			) : null}

			{canRemember ? (
				<label className={cn("flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2.5", TONE_CLASSES.info)}>
					<Checkbox className="mt-0.5" checked={remember} onCheckedChange={(checked) => setRemember(checked === true)} />
					<span className="flex flex-col gap-0.5">
						<span className="text-xs font-semibold">Lembrar para {supplierName}</span>
						<span className="text-[0.7rem]">Na próxima nota deste fornecedor, este item já chega vinculado.</span>
					</span>
				</label>
			) : null}

			<div className="flex items-center justify-between gap-2 border-t border-border pt-3">
				<Button type="button" variant="ghost" className="text-muted-foreground" onClick={onSkip}>
					PULAR POR ENQUANTO
				</Button>
				<Button type="button" className="flex items-center gap-1.5" disabled={!ready} onClick={confirm}>
					{confirmLabel}
					<ArrowRight className="h-3.5 w-3.5" />
				</Button>
			</div>
		</div>
	);
}

function NoteField({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
	return (
		<div className="flex flex-col gap-px">
			<span className="text-[0.65rem] font-medium uppercase text-muted-foreground">{label}</span>
			<span className={cn(strong && "font-semibold")}>{value}</span>
		</div>
	);
}

function ProductPicker({
	value,
	initialSearch,
	onChange,
}: {
	value: TSelectProductWithVariantsValue;
	initialSearch: string;
	onChange: (value: TSelectProductWithVariantsValue) => void;
}) {
	const selectedLabel = useMemo(
		() => (value?.product ? (value.productVariant ? `${value.product.nome} - ${value.productVariant.nome}` : value.product.nome) : undefined),
		[value],
	);
	return (
		<SelectProductWithVariants
			label="BUSCAR NO CATÁLOGO"
			showLabel={false}
			value={value?.product ? { productId: value.product.id, productVariantId: value.productVariant?.id ?? null } : null}
			selectedLabel={selectedLabel}
			resetOptionLabel="LIMPAR"
			initialSearch={initialSearch}
			handleChange={onChange}
			onReset={() => onChange(null)}
			triggerProps={{ className: "h-9 w-full rounded-full text-sm" }}
		/>
	);
}

function NewProductForm({ draft, onChange }: { draft: TNewProductDraft; onChange: (patch: Partial<TNewProductDraft>) => void }) {
	return (
		<div className="flex flex-col gap-2.5 rounded-xl border border-border px-3.5 py-3">
			<p className="flex items-center gap-1.5 text-[0.7rem] font-extrabold uppercase tracking-widest text-muted-foreground">
				<PackagePlus className="h-3 w-3" />
				Novo produto · criado ao confirmar a compra
			</p>
			<div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(90px,1fr))]">
				<TextInput label="NOME" value={draft.nome} placeholder="Nome do produto" handleChange={(value) => onChange({ nome: value ?? "" })} />
				<TextInput label="CÓDIGO" value={draft.codigo} placeholder="Código" handleChange={(value) => onChange({ codigo: value ?? "" })} />
				<TextInput label="UNIDADE" value={draft.unidade} placeholder="UN" handleChange={(value) => onChange({ unidade: (value ?? "").toUpperCase() })} />
				<TextInput label="NCM" value={draft.ncm} placeholder="NCM" handleChange={(value) => onChange({ ncm: value ?? "" })} />
			</div>
			<label className="flex flex-col gap-1 text-xs font-medium text-foreground/80">
				<span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">Natureza do produto</span>
				<select
					value={draft.natureza}
					onChange={(event) => onChange({ natureza: event.target.value as TAcquisitionNatureEnum })}
					className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm md:w-64"
				>
					{AcquisitionNatureEnum.options.map((value) => (
						<option key={value} value={value}>
							{ACQUISITION_NATURE_LABELS[value]}
						</option>
					))}
				</select>
			</label>
			<div className="flex flex-wrap gap-4 text-xs font-medium text-foreground/80">
				<label className="flex items-center gap-1.5">
					<Switch checked={draft.vendavel} onCheckedChange={(checked) => onChange({ vendavel: checked })} />
					Disponível para venda
				</label>
				<label className="flex items-center gap-1.5">
					<Switch checked={draft.rastreamentoEstoqueAtivo} onCheckedChange={(checked) => onChange({ rastreamentoEstoqueAtivo: checked })} />
					Rastrear estoque
				</label>
			</div>
		</div>
	);
}

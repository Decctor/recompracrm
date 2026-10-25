"use client";

import { Button } from "@/components/ui/button";
import { formatToMoney } from "@/lib/formatting";
import { isXmlFile } from "@/lib/purchase/import-files";
import { cn } from "@/lib/utils";
import { PurchaseImportStageEnum, type TPurchaseImportStageEnum } from "@/schemas/enums";
import { IMPORT_ACCEPTED_MIME_TYPES } from "@/lib/purchase/import-files";
import {
	Check,
	CheckCheck,
	Circle,
	CircleAlert,
	CircleCheck,
	FileCode2,
	FileText,
	ImageIcon,
	Link2Off,
	ListTodo,
	LoaderCircle,
	PencilLine,
	ReceiptText,
	Ruler,
	ScanSearch,
	Sparkles,
	Upload,
	X,
} from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { StageShell } from "@/app/dashboard/growth/campaigns/_module/builder/components/stage-shell";
import { getLineIssue, getPendingModifierIndex } from "../helpers/review-lines";
import { BUILDER_STAGES } from "../helpers/stages";
import { useBuilder, type TBuilderFileEntry } from "../components/builder-provider";
import { ReadBadge, TONE_CLASSES } from "../components/builder-ui";
import { useBuilderSummary } from "../components/use-builder-summary";

const STAGE_LABELS: Record<TPurchaseImportStageEnum, { label: string; waiting: string }> = {
	LEITURA: { label: "Lendo o documento", waiting: "Aguardando" },
	FORNECEDOR: { label: "Identificando o fornecedor", waiting: "Aguardando" },
	ITENS: { label: "Extraindo itens e valores", waiting: "Aguardando" },
	CATALOGO: { label: "Comparando com seu catálogo", waiting: "Aguardando" },
};

export default function StageOrigin() {
	const { origin, readStatus, back, next, startReading, files } = useBuilder();
	const { activeValidation } = useBuilderSummary();
	const stage = BUILDER_STAGES.origin;

	const footer =
		readStatus === "reading" ? null : readStatus === "done" || origin === "manual" ? (
			<StageShell.Footer canGoBack={false} onNext={next} nextLabel={readStatus === "done" ? "REVISAR FORNECEDOR" : "PRÓXIMO"} />
		) : origin === "document" ? (
			<StageShell.Footer
				canGoBack={false}
				onNext={() => void startReading()}
				nextLabel="LER DOCUMENTO"
				nextDisabled={files.length === 0}
				nextDisabledReason="Adicione ao menos um arquivo."
			/>
		) : (
			<StageShell.Footer canGoBack={false} onBack={back} onNext={next} nextDisabled nextDisabledReason={activeValidation.reason} />
		);

	return (
		<StageShell>
			<StageShell.Title icon={stage.icon} label={stage.label} description={stage.description} />
			<StageShell.Body>
				{readStatus === "idle" ? <OriginPicker /> : null}
				{readStatus === "reading" ? <ReadingProgress /> : null}
				{readStatus === "done" ? <ReadingResult /> : null}
			</StageShell.Body>
			{footer}
		</StageShell>
	);
}

function OriginPicker() {
	const { origin, chooseOrigin, files, addFiles, removeFile } = useBuilder();
	const [isDragging, setIsDragging] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	function handleDrop(event: DragEvent<HTMLLabelElement>) {
		event.preventDefault();
		setIsDragging(false);
		addFiles(Array.from(event.dataTransfer.files));
	}

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				<button
					type="button"
					onClick={() => chooseOrigin("document")}
					className={cn(
						"flex flex-col gap-2.5 rounded-xl border p-4 text-left transition-colors",
						origin === "document" ? "border-brand bg-brand/5" : "border-border hover:bg-muted/40",
					)}
				>
					<div className="flex w-full items-center justify-between">
						<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15 text-brand">
							<Sparkles className="h-4.5 w-4.5" />
						</span>
						<span className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-bold", TONE_CLASSES.warn)}>RECOMENDADO</span>
					</div>
					<div className="flex flex-col gap-1">
						<span className="text-sm font-semibold">Começar por documento</span>
						<span className="text-xs leading-relaxed text-muted-foreground">
							Envie a nota fiscal e o sistema preenche fornecedor, itens, valores e transações. Você só revisa o que ele não conseguiu resolver.
						</span>
					</div>
					<div className="flex flex-wrap gap-1.5">
						<span className="rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-medium">XML · leitura exata</span>
						<span className="rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-medium">PDF ou foto · leitura com IA</span>
					</div>
				</button>
				<button
					type="button"
					onClick={() => chooseOrigin("manual")}
					className={cn(
						"flex flex-col gap-2.5 rounded-xl border p-4 text-left transition-colors",
						origin === "manual" ? "border-brand bg-brand/5" : "border-border hover:bg-muted/40",
					)}
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
						<PencilLine className="h-4.5 w-4.5" />
					</span>
					<div className="flex flex-col gap-1">
						<span className="text-sm font-semibold">Preencher manualmente</span>
						<span className="text-xs leading-relaxed text-muted-foreground">
							Para pedidos sem nota ainda, compras de serviço ou quando você prefere digitar os itens.
						</span>
					</div>
				</button>
			</div>

			{origin === "document" ? (
				<div className="flex flex-col gap-3">
					<label
						onDragOver={(event) => {
							event.preventDefault();
							setIsDragging(true);
						}}
						onDragLeave={() => setIsDragging(false)}
						onDrop={handleDrop}
						className={cn(
							"flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-7 text-center text-muted-foreground transition-colors",
							isDragging ? "border-brand bg-brand/5" : "border-border hover:bg-muted/30",
						)}
					>
						<Upload className="h-6 w-6" />
						<p className="text-sm font-medium text-foreground">Arraste a nota aqui ou clique para selecionar</p>
						<p className="text-xs">XML de NF-e, PDF ou foto · até 3MB por arquivo · pode enviar mais de um</p>
						<input
							ref={inputRef}
							type="file"
							multiple
							accept={[...IMPORT_ACCEPTED_MIME_TYPES, ".xml"].join(",")}
							className="hidden"
							onChange={(event) => {
								addFiles(Array.from(event.target.files ?? []));
								if (inputRef.current) inputRef.current.value = "";
							}}
						/>
					</label>
					{files.length > 0 ? (
						<div className="flex flex-col overflow-hidden rounded-md border border-border">
							{files.map((entry, index) => (
								<FileRow key={entry.id} entry={entry} first={index === 0} onRemove={() => removeFile(entry.id)} />
							))}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function getFileVisual(file: File, inboundId: string | null) {
	if (inboundId) return { icon: FileCode2, mode: "Nota recebida · leitura exata", tone: TONE_CLASSES.ok };
	if (isXmlFile(file)) return { icon: FileCode2, mode: "Leitura exata", tone: TONE_CLASSES.ok };
	if (file.type === "application/pdf") return { icon: FileText, mode: "Leitura com IA", tone: TONE_CLASSES.info };
	return { icon: ImageIcon, mode: "Leitura com IA", tone: TONE_CLASSES.info };
}

function formatFileSize(bytes: number) {
	return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MB`;
}

function FileRow({ entry, first, onRemove }: { entry: TBuilderFileEntry; first: boolean; onRemove?: () => void }) {
	const visual = getFileVisual(entry.file, entry.inboundId);
	return (
		<div className={cn("flex items-center gap-2.5 px-3 py-2.5", !first && "border-t border-border")}>
			<visual.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{entry.inboundId ? "XML da nota recebida (DF-e)" : entry.file.name}</p>
				<p className={cn("text-xs", entry.status === "error" ? "text-destructive" : "text-muted-foreground")}>
					{entry.status === "error"
						? entry.errorMessage
						: entry.inboundId
							? "Já está no seu catálogo de notas recebidas"
							: formatFileSize(entry.file.size)}
				</p>
			</div>
			<span className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-semibold", visual.tone)}>{visual.mode}</span>
			{onRemove ? (
				<button
					type="button"
					onClick={onRemove}
					aria-label={`Remover ${entry.file.name}`}
					className="flex rounded-md p-1 text-muted-foreground hover:bg-muted"
				>
					<X className="h-3.5 w-3.5" />
				</button>
			) : null}
		</div>
	);
}

function ReadingProgress() {
	const { files, readingFileId, cancelReading } = useBuilder();
	const currentIndex = Math.max(
		0,
		files.findIndex((entry) => entry.id === readingFileId),
	);
	const current = files[currentIndex];
	const stages = PurchaseImportStageEnum.options;
	const completedStages = current ? stages.filter((stageId) => current.stages[stageId]?.status === "CONCLUIDO").length : 0;
	const progress = Math.min(100, (completedStages / stages.length) * 100 + 8);
	const isXml = current ? !!current.inboundId || isXmlFile(current.file) : false;

	return (
		<div className="flex w-full flex-col items-center gap-5 pt-3 pb-2">
			<div className="flex flex-col items-center gap-1.5 text-center">
				<span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/15 text-brand">
					<Sparkles className="h-5 w-5" />
				</span>
				<p className="text-base font-semibold">Lendo {current?.inboundId ? "a nota recebida" : (current?.file.name ?? "documento")}</p>
				<p className="text-xs text-muted-foreground">
					{files.length > 1 ? `Arquivo ${currentIndex + 1} de ${files.length}. ` : ""}
					{isXml ? "Leitura exata do XML, leva poucos segundos." : "Leva cerca de 20 segundos. Mantenha esta página aberta."}
				</p>
			</div>
			<div className="h-1.5 w-full max-w-[520px] overflow-hidden rounded-full bg-muted">
				<div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${progress}%` }} />
			</div>
			<ol className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-lg border border-border">
				{stages.map((stageId, index) => {
					const stageState = current?.stages[stageId];
					const done = stageState?.status === "CONCLUIDO";
					const running = stageState?.status === "INICIADO" || (!stageState && index === completedStages && current?.status === "reading");
					const Icon = done ? Check : running ? LoaderCircle : Circle;
					return (
						<li
							key={stageId}
							className={cn("flex items-center gap-3 px-3.5 py-3", index > 0 && "border-t border-border", !done && !running && "opacity-50")}
						>
							<span
								className={cn(
									"flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
									done ? TONE_CLASSES.ok : running ? "bg-brand/15 text-brand" : TONE_CLASSES.mute,
								)}
							>
								<Icon className={cn("h-3.5 w-3.5", running && "animate-spin")} />
							</span>
							<div className="min-w-0 flex-1">
								<p className="text-[0.82rem] font-medium">{STAGE_LABELS[stageId].label}</p>
								<p className="text-xs text-muted-foreground">{stageState?.detail ?? (running ? "Processando…" : STAGE_LABELS[stageId].waiting)}</p>
							</div>
						</li>
					);
				})}
			</ol>
			<Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={cancelReading}>
				CANCELAR LEITURA
			</Button>
		</div>
	);
}

function ReadingResult() {
	const { importData, lines, state, files, restartReading } = useBuilder();
	const { readyCount, pendingLines } = useBuilderSummary();
	const documento = importData?.documento ?? null;
	const supplierName = importData?.fornecedor?.existente?.nome ?? importData?.fornecedor?.extraido?.nome ?? null;
	const failedFiles = files.filter((entry) => entry.status === "error");
	const transactions = state.lancamentoContabil.transacoes.filter((transaction) => !transaction.deletar);
	const issueCounts = {
		unmapped: lines.filter((line) => getLineIssue(line) === "unmapped").length,
		suggested: lines.filter((line) => getLineIssue(line) === "suggested").length,
		unit: lines.filter((line) => line.incluir && getLineIssue(line) === "unit").length,
		tax: lines.filter((line) => line.incluir && getPendingModifierIndex(line) !== -1).length,
	};
	const total = documento ? (documento.valorTotal ?? documento.somaItens) : 0;
	// Taxes waiting for a treatment are already listed under "Precisa de você".
	const warnings = (importData?.avisos ?? []).filter((aviso) => !aviso.includes("tratamento contábil"));

	return (
		<div className="flex w-full flex-col gap-4">
			<div className={cn("flex items-center gap-2.5 rounded-lg px-3.5 py-2.5", TONE_CLASSES.ok)}>
				<CircleCheck className="h-4.5 w-4.5 shrink-0" />
				<p className="text-[0.82rem] font-semibold">
					Leitura concluída. {lines.length} {lines.length === 1 ? "linha encontrada" : "linhas encontradas"}, totalizando {formatToMoney(total)}.
				</p>
			</div>
			{failedFiles.length > 0 ? (
				<div className={cn("flex flex-col gap-1 rounded-lg px-3.5 py-2.5 text-xs", TONE_CLASSES.bad)}>
					{failedFiles.map((entry) => (
						<p key={entry.id}>
							<strong>{entry.file.name}</strong>: {entry.errorMessage}
						</p>
					))}
				</div>
			) : null}
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				<div className="flex flex-col gap-2.5 rounded-xl border border-border p-3.5">
					<p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-green-700 dark:text-green-400">
						<CheckCheck className="h-3.5 w-3.5" />
						Já preenchido
					</p>
					<ul className="flex flex-col gap-1.5 text-[0.82rem]">
						<ResultRow label="Fornecedor" value={supplierName ?? "Não identificado"} />
						<ResultRow
							label="Documento"
							value={
								documento?.numero
									? `NF-e ${documento.numero}${documento.dataEmissao ? ` · ${new Date(documento.dataEmissao).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : ""}`
									: "Sem número"
							}
						/>
						<ResultRow label="Itens prontos" value={`${readyCount} de ${lines.length}`} />
						<ResultRow label="Valor a pagar" value={formatToMoney(total)} />
						<ResultRow
							label="Transações"
							value={transactions.length > 0 ? `${transactions.length} ${transactions.length === 1 ? "duplicata" : "duplicatas"}` : "Nenhuma na nota"}
						/>
					</ul>
				</div>
				<div
					className={cn(
						"flex flex-col gap-2.5 rounded-xl border p-3.5",
						pendingLines.length > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-green-500/30 bg-green-500/5",
					)}
				>
					<p
						className={cn(
							"flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest",
							pendingLines.length > 0 ? "text-amber-800 dark:text-amber-300" : "text-green-700 dark:text-green-400",
						)}
					>
						<ListTodo className="h-3.5 w-3.5" />
						Precisa de você · {pendingLines.length}
					</p>
					<ul className="flex flex-col gap-1.5 text-[0.82rem] text-amber-800 dark:text-amber-300">
						{issueCounts.unmapped > 0 ? (
							<IssueRow
								icon={Link2Off}
								text={`${issueCounts.unmapped} ${issueCounts.unmapped === 1 ? "item sem produto" : "itens sem produto"} no catálogo`}
							/>
						) : null}
						{issueCounts.suggested > 0 ? (
							<IssueRow
								icon={ScanSearch}
								text={`${issueCounts.suggested} ${issueCounts.suggested === 1 ? "vínculo sugerido" : "vínculos sugeridos"} para confirmar`}
							/>
						) : null}
						{issueCounts.unit > 0 ? (
							<IssueRow icon={Ruler} text={`${issueCounts.unit} ${issueCounts.unit === 1 ? "item com unidade" : "itens com unidade"} para converter`} />
						) : null}
						{issueCounts.tax > 0 ? (
							<IssueRow icon={ReceiptText} text={`${issueCounts.tax} ${issueCounts.tax === 1 ? "tributo" : "tributos"} para classificar`} />
						) : null}
						{pendingLines.length === 0 ? <li className="text-green-700 dark:text-green-400">Nada pendente. Tudo foi resolvido pela leitura.</li> : null}
					</ul>
				</div>
			</div>
			{warnings.length > 0 ? (
				<div className={cn("flex flex-col gap-1 rounded-lg px-3.5 py-2.5 text-xs", TONE_CLASSES.warn)}>
					{warnings.map((aviso) => (
						<p key={aviso} className="flex gap-1.5">
							<CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							{aviso}
						</p>
					))}
				</div>
			) : null}
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-xs text-muted-foreground">
					Os campos preenchidos pela leitura aparecem com a marca <ReadBadge /> até você alterá-los.
				</p>
				<Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={restartReading}>
					LER OUTRO DOCUMENTO
				</Button>
			</div>
		</div>
	);
}

function ResultRow({ label, value }: { label: string; value: string }) {
	return (
		<li className="flex justify-between gap-2">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right font-medium">{value}</span>
		</li>
	);
}

function IssueRow({ icon: Icon, text }: { icon: typeof Link2Off; text: string }) {
	return (
		<li className="flex gap-2">
			<Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
			<span>{text}</span>
		</li>
	);
}

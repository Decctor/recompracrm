"use client";

import type { TImportPurchaseCompositionStageEvent } from "@/app/api/purchases/import-composition/route";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { importPurchaseComposition } from "@/lib/mutations/purchases";
import { appRoutes } from "@/lib/navigation/routes";
import { prepareImportFilePayload } from "@/lib/purchase/import-files";
import { cn } from "@/lib/utils";
import { PurchaseImportStageEnum, type TPurchaseImportStageEnum, type TPurchaseImportStageStatusEnum } from "@/schemas/enums";
import {
	ArrowRight,
	Check,
	CircleAlert,
	CircleCheck,
	Circle,
	FileCheck2,
	Info,
	LoaderCircle,
	RotateCcw,
	Sparkles,
	TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ISSUE_META } from "../builder/helpers/issue-meta";
import {
	buildImportedPurchaseTitle,
	createReviewLines,
	REVIEW_ISSUE_ORDER,
	summarizeReviewLines,
	type TImportResult,
	type TReviewIssue,
} from "../builder/helpers/review-lines";
import { fetchInboundXmlFile, stashInboundReading } from "./inbound-reading";

export type TRegisterInboundTarget = {
	inboundId: string;
	numero: string | null;
	chaveAcesso: string;
	fornecedorNome: string;
	dataEmissaoLabel: string | null;
	/** A ciência acabou de ser registrada para liberar o XML: a gaveta avisa antes da leitura. */
	cienciaRegistrada: boolean;
};

const STAGE_LABELS: Record<TPurchaseImportStageEnum, string> = {
	LEITURA: "Lendo o XML da nota",
	FORNECEDOR: "Identificando o fornecedor",
	ITENS: "Extraindo itens e valores",
	CATALOGO: "Comparando com seu catálogo",
};

const ISSUE_TEXT: Record<TReviewIssue, (count: number) => string> = {
	unmapped: (count) => (count === 1 ? "1 item sem produto no catálogo" : `${count} itens sem produto no catálogo`),
	suggested: (count) => (count === 1 ? "1 vínculo sugerido para confirmar" : `${count} vínculos sugeridos para confirmar`),
	unit: (count) => (count === 1 ? "1 item com unidade para converter" : `${count} itens com unidade para converter`),
	tax: (count) => (count === 1 ? "1 tributo para classificar" : `${count} tributos para classificar`),
};

type TReadingState =
	| { status: "reading"; stages: Partial<Record<TPurchaseImportStageEnum, TPurchaseImportStageStatusEnum>> }
	| { status: "done"; file: File; result: TImportResult }
	| { status: "error"; message: string };

export default function RegisterPurchaseFromInboundDrawer({ target, onClose }: { target: TRegisterInboundTarget | null; onClose: () => void }) {
	return (
		<Sheet open={!!target} onOpenChange={(open) => !open && onClose()}>
			<SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[480px]">
				{target ? <DrawerBody key={target.inboundId} target={target} onClose={onClose} /> : null}
			</SheetContent>
		</Sheet>
	);
}

function DrawerBody({ target, onClose }: { target: TRegisterInboundTarget; onClose: () => void }) {
	const router = useRouter();
	const [reading, setReading] = useState<TReadingState>({ status: "reading", stages: {} });
	const abortRef = useRef<AbortController | null>(null);

	const read = useCallback(async () => {
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;
		setReading({ status: "reading", stages: {} });
		try {
			const file = await fetchInboundXmlFile({ inboundId: target.inboundId, fileName: `NFe-${target.chaveAcesso}.xml` });
			const payload = await prepareImportFilePayload(file);
			const response = await importPurchaseComposition(
				{ file: payload },
				{
					signal: controller.signal,
					onStage: (event: TImportPurchaseCompositionStageEvent) =>
						setReading((previous) =>
							previous.status === "reading" ? { status: "reading", stages: { ...previous.stages, [event.stage]: event.status } } : previous,
						),
				},
			);
			if (controller.signal.aborted) return;
			setReading({ status: "done", file, result: response.data });
		} catch (error) {
			if (controller.signal.aborted) return;
			setReading({ status: "error", message: getErrorMessage(error) });
		}
	}, [target.inboundId, target.chaveAcesso]);

	useEffect(() => {
		void read();
		return () => abortRef.current?.abort();
	}, [read]);

	function handleContinue() {
		if (reading.status !== "done") return;
		stashInboundReading({ inboundId: target.inboundId, file: reading.file, result: reading.result });
		router.push(appRoutes.newPurchaseFromInbound(target.inboundId));
	}

	return (
		<>
			<SheetHeader className="gap-1.5 px-6 pb-4 pt-6">
				<span className="text-xs font-extrabold uppercase leading-none tracking-[0.08em] text-muted-foreground">Registrar compra</span>
				<SheetTitle className="text-[22px] font-extrabold leading-tight tracking-tight">
					{target.numero ? `NF-e nº ${Number(target.numero).toLocaleString("pt-BR")}` : "Nota recebida"}
				</SheetTitle>
				<SheetDescription className="text-[13px]">
					{target.fornecedorNome}
					{target.dataEmissaoLabel ? ` · emitida em ${target.dataEmissaoLabel}` : ""}
				</SheetDescription>
			</SheetHeader>

			<div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 pb-5">
				{target.cienciaRegistrada ? (
					<Banner tone="info" icon={Info}>
						Ciência registrada na SEFAZ. O XML completo foi liberado.
					</Banner>
				) : null}
				{reading.status === "reading" ? <ReadingProgress stages={reading.stages} /> : null}
				{reading.status === "error" ? (
					<div className="flex flex-col gap-3">
						<Banner tone="danger" icon={CircleAlert}>
							{reading.message}
						</Banner>
						<Button variant="outline" className="w-fit" onClick={() => void read()}>
							<RotateCcw className="h-4 w-4" />
							TENTAR DE NOVO
						</Button>
					</div>
				) : null}
				{reading.status === "done" ? <ReadingSummary result={reading.result} /> : null}
				<p className="text-xs leading-relaxed text-muted-foreground">
					Você revisa tudo no construtor antes de confirmar. Nada entra no estoque nem no financeiro até lá.
				</p>
			</div>

			<SheetFooter className="mt-0 flex-row justify-end gap-2 border-t border-border px-6 py-3.5">
				<Button variant="ghost" className="h-11 rounded-[14px] px-[18px] font-bold" onClick={onClose}>
					Cancelar
				</Button>
				<Button className="h-11 rounded-2xl px-5 font-extrabold shadow-sm" disabled={reading.status !== "done"} onClick={handleContinue}>
					Revisar no construtor
					<ArrowRight className="h-4 w-4" />
				</Button>
			</SheetFooter>
		</>
	);
}

function ReadingProgress({ stages }: { stages: Partial<Record<TPurchaseImportStageEnum, TPurchaseImportStageStatusEnum>> }) {
	return (
		<div className="flex flex-col gap-2.5 rounded-[18px] border border-border px-4 py-3.5">
			{PurchaseImportStageEnum.options.map((stage) => {
				const status = stages[stage];
				const Icon = status === "CONCLUIDO" ? Check : status === "INICIADO" ? LoaderCircle : Circle;
				return (
					<div key={stage} className={cn("flex items-center gap-2.5 text-[13px]", !status && "text-muted-foreground")}>
						<Icon className={cn("h-4 w-4", status === "CONCLUIDO" && "text-success", status === "INICIADO" && "animate-spin text-primary")} />
						{STAGE_LABELS[stage]}
					</div>
				);
			})}
		</div>
	);
}

function ReadingSummary({ result }: { result: TImportResult }) {
	const lines = createReviewLines(result, () => crypto.randomUUID());
	const { ready, issues, pending } = summarizeReviewLines(lines);
	const documento = result.documento;
	const value = documento.valorTotal ?? documento.somaItens;
	const existingSupplier = result.fornecedor.existente;
	const supplierName = existingSupplier?.nome ?? result.fornecedor.extraido?.nome ?? null;
	const installments = documento.duplicatas.length;
	const title = buildImportedPurchaseTitle({ supplierName, documentNumber: documento.numero });

	return (
		<>
			<Banner tone="success" icon={FileCheck2}>
				Leitura concluída. {lines.length} {lines.length === 1 ? "linha encontrada" : "linhas encontradas"}, totalizando {formatToMoney(value)}.
			</Banner>

			<div className="flex flex-col gap-2.5 rounded-[18px] border border-border px-4 py-3.5">
				<span className="flex items-center gap-1.5 text-xs font-extrabold uppercase leading-none tracking-[0.08em] text-success-strong">
					<Sparkles className="h-3.5 w-3.5" />
					Já preenchido
				</span>
				{title ? <SummaryRow label="Título" value={title} /> : null}
				<SummaryRow
					label="Fornecedor"
					value={supplierName ? `${supplierName} (${existingSupplier ? "cadastrado" : "novo cadastro"})` : "Não identificado"}
				/>
				<SummaryRow label="Itens prontos" value={`${ready} de ${lines.length}`} />
				<SummaryRow label="Valor a pagar" value={formatToMoney(value)} />
				<SummaryRow
					label="Transações"
					value={installments === 0 ? "Sem duplicatas na nota" : installments === 1 ? "1 duplicata" : `${installments} duplicatas`}
				/>
			</div>

			{pending > 0 ? (
				<div className="flex flex-col gap-2.5 rounded-[18px] border border-warning/35 bg-warning-surface px-4 py-3.5 text-warning-surface-foreground">
					<span className="flex items-center gap-1.5 text-xs font-extrabold uppercase leading-none tracking-[0.08em]">
						<TriangleAlert className="h-3.5 w-3.5" />
						Precisa de você · {pending}
					</span>
					{REVIEW_ISSUE_ORDER.filter((issue) => issues[issue] > 0).map((issue) => {
						const Icon = ISSUE_META[issue].icon;
						return (
							<div key={issue} className="flex items-center gap-2 text-[13px]">
								<Icon className="h-4 w-4 shrink-0" />
								<span>{ISSUE_TEXT[issue](issues[issue])}</span>
							</div>
						);
					})}
				</div>
			) : (
				<Banner tone="success" icon={CircleCheck}>
					Nada pendente. Todos os itens foram vinculados pela leitura.
				</Banner>
			)}

			{result.avisos.length > 0 ? (
				<ul className="flex flex-col gap-1 text-xs text-muted-foreground">
					{result.avisos.map((aviso) => (
						<li key={aviso} className="flex items-start gap-1.5">
							<Info className="mt-0.5 h-3 w-3 shrink-0" />
							{aviso}
						</li>
					))}
				</ul>
			) : null}
		</>
	);
}

function SummaryRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-3 text-[13px]">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right font-semibold">{value}</span>
		</div>
	);
}

const BANNER_TONES = {
	info: "bg-info-surface text-info-surface-foreground",
	success: "bg-success-surface text-success-surface-foreground",
	danger: "bg-destructive-surface text-destructive-surface-foreground",
} as const;

function Banner({ tone, icon: Icon, children }: { tone: keyof typeof BANNER_TONES; icon: typeof Info; children: ReactNode }) {
	return (
		<div className={cn("flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-[13px] font-semibold", BANNER_TONES[tone])}>
			<Icon className="h-4 w-4 shrink-0" />
			<span>{children}</span>
		</div>
	);
}

"use client";
import type { TGetInboundDocumentsOutputDefault } from "@/app/api/fiscal/inbound/route";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale } from "@/lib/formatting";
import { manifestInboundDocumentMutation, requestInboundSyncMutation } from "@/lib/mutations/fiscal";
import { appRoutes } from "@/lib/navigation/routes";
import { useFiscalInboundDocuments, type TFiscalInboundListFilter } from "@/lib/queries/fiscal";
import { cn } from "@/lib/utils";
import type { TFiscalInboundManifestEventEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, FileText, RefreshCcw, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

const MANIFEST_LABELS: Record<TFiscalInboundManifestEventEnum, string> = {
	CIENCIA: "CIÊNCIA",
	CONFIRMACAO: "CONFIRMADA",
	DESCONHECIMENTO: "DESCONHECIDA",
	NAO_REALIZADA: "NÃO REALIZADA",
};

const MANIFEST_DIALOG_COPY: Record<TFiscalInboundManifestEventEnum, { title: string; description: string; requiresJustification: boolean }> = {
	CIENCIA: {
		title: "Registrar ciência da operação",
		description: "A ciência destrava o XML completo na SEFAZ e pode ser substituída depois por uma manifestação definitiva.",
		requiresJustification: false,
	},
	CONFIRMACAO: {
		title: "Confirmar a operação",
		description: "A confirmação é definitiva e não pode ser desfeita. Confirme apenas se a operação realmente ocorreu.",
		requiresJustification: false,
	},
	DESCONHECIMENTO: {
		title: "Desconhecer a operação",
		description: "O desconhecimento é definitivo e não pode ser desfeito. Informe a justificativa (mínimo de 15 caracteres).",
		requiresJustification: true,
	},
	NAO_REALIZADA: {
		title: "Marcar operação como não realizada",
		description: "Esta manifestação é definitiva e não pode ser desfeita. Informe a justificativa (mínimo de 15 caracteres).",
		requiresJustification: true,
	},
};

const LIST_FILTERS: { value: TFiscalInboundListFilter; label: string }[] = [
	{ value: "PENDENTES", label: "A LANÇAR" },
	{ value: "LANCADAS", label: "LANÇADAS" },
	{ value: "TODAS", label: "TODAS" },
];

type TInboundDocument = TGetInboundDocumentsOutputDefault["documents"][number];
type TManifestDialogState = { inboundId: string; evento: TFiscalInboundManifestEventEnum } | null;

export default function InboundDocumentsTab() {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, isSuccess, error, queryKey, page, setPage, lancamento, setLancamento } = useFiscalInboundDocuments();
	const documents = data?.documents ?? [];
	const totalPages = data?.totalPages ?? 0;
	const matched = data?.documentsMatched ?? 0;

	const [manifestDialog, setManifestDialog] = useState<TManifestDialogState>(null);
	const [justificativa, setJustificativa] = useState("");

	const { mutate: manifest, isPending } = useMutation({
		mutationKey: ["manifest-inbound-document"],
		mutationFn: manifestInboundDocumentMutation,
		onSuccess: (res) => {
			toast.success(res.message);
			setManifestDialog(null);
			setJustificativa("");
			queryClient.invalidateQueries({ queryKey });
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	const { mutate: requestSync, isPending: syncPending } = useMutation({
		mutationKey: ["request-inbound-sync"],
		mutationFn: requestInboundSyncMutation,
		onSuccess: (res) => {
			if (res.data.accepted) toast.success(res.message);
			else toast.warning(res.message);
			queryClient.invalidateQueries({ queryKey });
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	const dialogCopy = manifestDialog ? MANIFEST_DIALOG_COPY[manifestDialog.evento] : null;
	const justificativaValida = !dialogCopy?.requiresJustification || justificativa.trim().length >= 15;

	function handleConfirmManifest() {
		if (!manifestDialog || !dialogCopy) return;
		if (!justificativaValida) return toast.error("A justificativa deve ter ao menos 15 caracteres.");
		manifest({
			inboundId: manifestDialog.inboundId,
			evento: manifestDialog.evento,
			justificativa: dialogCopy.requiresJustification ? justificativa.trim() : null,
		});
	}

	return (
		<div className="w-full flex flex-col gap-3">
			<div className="flex w-full items-center justify-between gap-2 flex-wrap">
				<div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
					{LIST_FILTERS.map((filter) => (
						<button
							key={filter.value}
							type="button"
							onClick={() => setLancamento(filter.value)}
							className={cn(
								"rounded-md px-2.5 py-1 text-[0.65rem] font-bold tracking-tight transition-colors",
								lancamento === filter.value ? "bg-brand text-white" : "text-muted-foreground hover:bg-muted",
							)}
						>
							{filter.label}
						</button>
					))}
				</div>
				<Button variant="outline" size="sm" disabled={syncPending} onClick={() => requestSync()}>
					<RefreshCcw className="mr-2 h-3.5 w-3.5" />
					SINCRONIZAR AGORA
				</Button>
			</div>
			<GeneralPaginationComponent
				activePage={page}
				queryLoading={isLoading}
				selectPage={(p) => setPage(p)}
				totalPages={totalPages || 0}
				itemsMatchedText={`${matched} nota(s) recebida(s).`}
				itemsShowingText={`Mostrando ${documents.length} nota(s).`}
			/>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				documents.length > 0 ? (
					documents.map((doc) => (
						<InboundDocumentCard
							key={doc.id}
							doc={doc}
							isPending={isPending}
							onManifest={(inboundId, evento) => {
								setJustificativa("");
								setManifestDialog({ inboundId, evento });
							}}
						/>
					))
				) : (
					<div className="flex items-center justify-center py-10">
						<p className="text-sm text-muted-foreground">
							{lancamento === "PENDENTES"
								? "Nenhuma nota a lançar. Toda nota recebida já virou compra."
								: lancamento === "LANCADAS"
									? "Nenhuma nota lançada em compra ainda."
									: "Nenhuma nota recebida. As notas dos seus fornecedores aparecem aqui automaticamente."}
						</p>
					</div>
				)
			) : null}
			<Dialog open={manifestDialog !== null} onOpenChange={(open) => !open && setManifestDialog(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{dialogCopy?.title}</DialogTitle>
						<DialogDescription>{dialogCopy?.description}</DialogDescription>
					</DialogHeader>
					{dialogCopy?.requiresJustification ? (
						<TextareaInput
							label="JUSTIFICATIVA"
							placeholder="Descreva o motivo (mínimo de 15 caracteres)..."
							value={justificativa}
							handleChange={setJustificativa}
						/>
					) : null}
					<DialogFooter>
						<Button variant="outline" disabled={isPending} onClick={() => setManifestDialog(null)}>
							CANCELAR
						</Button>
						<Button disabled={isPending || !justificativaValida} onClick={handleConfirmManifest}>
							{isPending ? "REGISTRANDO..." : "REGISTRAR"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

type InboundDocumentCardProps = {
	doc: TInboundDocument;
	isPending: boolean;
	onManifest: (inboundId: string, evento: TFiscalInboundManifestEventEnum) => void;
};
function InboundDocumentCard({ doc, isPending, onManifest }: InboundDocumentCardProps) {
	const canDownloadXml = !!doc.xmlArquivoId || !!doc.xmlStoragePath || !!doc.provedorDocumentoId;
	const invalid = doc.situacao === "CANCELADA" || doc.situacao === "DENEGADA";
	// Lançar exige o XML completo (itens e impostos) e uma nota que ainda vale e ainda não virou compra.
	const canCreatePurchase = doc.completo && !doc.compraId && !invalid;
	return (
		<div className="bg-card border-border flex w-full flex-col gap-2 rounded-xl border px-3 py-3 shadow-2xs">
			<div className="flex w-full items-center justify-between gap-2 flex-wrap">
				<div className="flex items-center gap-2">
					<FileText className="h-4 w-4 text-muted-foreground" />
					<h3 className="text-sm font-bold tracking-tight">{doc.fornecedor?.nome ?? doc.emitenteNome ?? "Fornecedor não identificado"}</h3>
				</div>
				<div className="flex items-center gap-2">
					{doc.completo ? (
						<span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-emerald-700">COMPLETA</span>
					) : (
						<span
							title="A SEFAZ libera o XML completo após a manifestação do destinatário."
							className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight"
						>
							RESUMO
						</span>
					)}
					{doc.manifestacaoAtual ? (
						<span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight">
							{MANIFEST_LABELS[doc.manifestacaoAtual]}
						</span>
					) : (
						<span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-amber-700">SEM MANIFESTAÇÃO</span>
					)}
					{doc.situacao ? (
						<span
							className={cn(
								"rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight",
								invalid ? "bg-red-100 text-red-700" : "text-muted-foreground",
							)}
						>
							{doc.situacao}
						</span>
					) : null}
					{doc.compra ? (
						<Link
							href={appRoutes.purchase(doc.compra.id)}
							className="flex items-center gap-1 rounded bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-brand hover:underline"
						>
							<ShoppingCart className="h-3 w-3" />
							{invalid ? "LANÇADA · REVISAR COMPRA" : "LANÇADA"}
							<ArrowRight className="h-3 w-3" />
						</Link>
					) : null}
				</div>
			</div>
			<div className="flex w-full items-center gap-3 flex-wrap text-[0.7rem] font-medium text-muted-foreground">
				<span title={doc.chaveAcesso} className="font-mono">
					{doc.chaveAcesso}
				</span>
				{doc.emitenteCnpj ? <span>CNPJ {doc.emitenteCnpj}</span> : null}
				{typeof doc.valorTotal === "number" ? <span>R$ {doc.valorTotal.toFixed(2)}</span> : null}
				{doc.dataEmissao ? <span>{formatDateAsLocale(doc.dataEmissao, true)}</span> : null}
				{doc.manifestacaoProtocolo ? (
					<span>
						Protocolo {doc.manifestacaoProtocolo}
						{doc.manifestacaoData ? ` em ${formatDateAsLocale(doc.manifestacaoData, true)}` : ""}
					</span>
				) : null}
			</div>
			{invalid && doc.compra ? (
				<p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
					Esta nota deixou de valer na SEFAZ depois de virar a compra "{doc.compra.titulo}". A compra não é desfeita sozinha: cancele-a ou lance a nota
					substituta.
				</p>
			) : null}
			<div className="flex w-full items-center gap-1.5 flex-wrap">
				{canCreatePurchase ? (
					<Button asChild size="xs">
						<Link href={appRoutes.newPurchaseFromInbound(doc.id)}>
							<ShoppingCart className="h-3.5 w-3.5" />
							LANÇAR COMPRA
						</Link>
					</Button>
				) : null}
				<Button variant="ghost" size="xs" disabled={isPending} onClick={() => onManifest(doc.id, "CIENCIA")}>
					Ciência
				</Button>
				<Button variant="ghost" size="xs" disabled={isPending} onClick={() => onManifest(doc.id, "CONFIRMACAO")}>
					Confirmar
				</Button>
				<Button variant="ghost" size="xs" disabled={isPending} onClick={() => onManifest(doc.id, "DESCONHECIMENTO")}>
					Desconhecer
				</Button>
				<Button variant="ghost" size="xs" disabled={isPending} onClick={() => onManifest(doc.id, "NAO_REALIZADA")}>
					Não realizada
				</Button>
				{canDownloadXml ? (
					<Button
						variant="ghost"
						size="xs"
						title={doc.completo ? "Baixar XML autorizado" : "Baixar XML de resumo (não vale para escrituração)"}
						onClick={() => window.open(`/api/fiscal/inbound/xml?inboundId=${doc.id}`, "_blank", "noopener,noreferrer")}
					>
						<Download className="h-3.5 w-3.5" />
						XML
					</Button>
				) : null}
				{doc.completo && doc.provedorDocumentoId ? (
					<Button variant="ghost" size="xs" onClick={() => window.open(`/api/fiscal/inbound/pdf?inboundId=${doc.id}`, "_blank", "noopener,noreferrer")}>
						<Download className="h-3.5 w-3.5" />
						DANFE
					</Button>
				) : null}
			</div>
		</div>
	);
}

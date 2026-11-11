"use client";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { getErrorMessage } from "@/lib/errors";
import { manifestInboundDocumentMutation, requestInboundSyncMutation } from "@/lib/mutations/fiscal";
import { DEFAULT_FISCAL_INBOUND_FILTERS, useFiscalInboundDocuments } from "@/lib/queries/fiscal";
import { cn } from "@/lib/utils";
import type { TFiscalInboundManifestEventEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Inbox, RefreshCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import RegisterPurchaseFromInboundDrawer, { type TRegisterInboundTarget } from "../_module/inbound/RegisterPurchaseFromInboundDrawer";
import InboundDocumentCard, { formatInboundIssueDate, type TInboundDocument } from "./InboundDocumentCard";
import InboundDocumentsInlineFilters from "./InboundDocumentsInlineFilters";

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

const GUIDE_STORAGE_KEY = "purchases:inbound-guide-dismissed";

type TManifestDialogState = { inboundId: string; evento: TFiscalInboundManifestEventEnum } | null;

function toRegisterTarget(doc: TInboundDocument, cienciaRegistrada: boolean): TRegisterInboundTarget {
	return {
		inboundId: doc.id,
		numero: doc.numero,
		chaveAcesso: doc.chaveAcesso,
		fornecedorNome: doc.fornecedor?.nome ?? doc.emitenteNome ?? "Fornecedor não identificado",
		dataEmissaoLabel: formatInboundIssueDate(doc.dataEmissao),
		cienciaRegistrada,
	};
}

type InboundDocumentsTabProps = {
	canCreatePurchase: boolean;
	canManifest: boolean;
};

export default function InboundDocumentsTab({ canCreatePurchase, canManifest }: InboundDocumentsTabProps) {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, isSuccess, error, page, setPage, pageSize, setPageSize, filters, updateFilters } = useFiscalInboundDocuments();
	const documents = data?.documents ?? [];
	const matched = data?.documentsMatched ?? 0;

	const [manifestDialog, setManifestDialog] = useState<TManifestDialogState>(null);
	const [justificativa, setJustificativa] = useState("");
	const [registerTarget, setRegisterTarget] = useState<TRegisterInboundTarget | null>(null);
	const invalidateInbound = () => queryClient.invalidateQueries({ queryKey: ["fiscal-inbound-documents"] });

	const { mutate: manifest, isPending: manifestPending } = useMutation({
		mutationKey: ["manifest-inbound-document"],
		mutationFn: manifestInboundDocumentMutation,
		onSuccess: (res) => {
			toast.success(res.message);
			setManifestDialog(null);
			setJustificativa("");
			void invalidateInbound();
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	// "Dar ciência e registrar": a ciência libera o XML; se a SEFAZ já o entregou, segue direto para a leitura.
	const {
		mutate: registerWithCiencia,
		isPending: cienciaPending,
		variables: cienciaVariables,
	} = useMutation({
		mutationKey: ["manifest-inbound-document-and-register"],
		mutationFn: ({ doc }: { doc: TInboundDocument }) => manifestInboundDocumentMutation({ inboundId: doc.id, evento: "CIENCIA", justificativa: null }),
		onSuccess: (res, { doc }) => {
			void invalidateInbound();
			if (res.data.completo) return setRegisterTarget(toRegisterTarget(doc, true));
			toast.info("Ciência registrada. A SEFAZ libera o XML completo em alguns minutos, e a nota fica pronta para registrar sozinha.");
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	const { mutate: requestSync, isPending: syncPending } = useMutation({
		mutationKey: ["request-inbound-sync"],
		mutationFn: requestInboundSyncMutation,
		onSuccess: (res) => {
			if (res.data.accepted) toast.success(res.message);
			else toast.warning(res.message);
			void invalidateInbound();
		},
		onError: (err) => toast.error(getErrorMessage(err)),
	});

	const dialogCopy = manifestDialog ? MANIFEST_DIALOG_COPY[manifestDialog.evento] : null;
	const justificativaValida = !dialogCopy?.requiresJustification || justificativa.trim().length >= 15;
	// Sem filtro algum (nem a situação padrão "A registrar"), lista vazia é ausência de notas, não de resultados.
	const hasActiveFilters =
		JSON.stringify({ ...filters, search: filters.search?.trim() ?? "" }) !==
		JSON.stringify({ ...DEFAULT_FISCAL_INBOUND_FILTERS, registrationStatuses: [] });

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
		<div className="flex w-full flex-col gap-3">
			<InboundGuide />
			<div className="flex w-full flex-col gap-2">
				<div className="flex w-full flex-col-reverse items-center gap-2 lg:flex-row">
					<Input
						value={filters.search ?? ""}
						placeholder="Pesquisar por fornecedor, CNPJ, nº ou chave da nota..."
						onChange={(event) => updateFilters({ search: event.target.value })}
						className="grow rounded-xl"
					/>
					<Button variant="outline" size="sm" className="flex w-full items-center gap-2 lg:w-fit" disabled={syncPending} onClick={() => requestSync()}>
						<RefreshCcw className={cn("h-3.5 w-3.5", syncPending && "animate-spin")} />
						SINCRONIZAR AGORA
					</Button>
				</div>
				<InboundDocumentsInlineFilters filters={filters} updateFilters={updateFilters} lastSync={data?.ultimaSincronizacao ?? null} />
			</div>
			<GeneralPaginationComponent
				activePage={page}
				queryLoading={isLoading}
				selectPage={(p) => setPage(p)}
				totalPages={data?.totalPages ?? 0}
				pageSize={pageSize}
				onPageSizeChange={(nextPageSize) => {
					setPageSize(nextPageSize);
					setPage(1);
				}}
				itemsMatchedText={matched === 1 ? "1 nota encontrada" : `${matched} notas encontradas`}
				itemsShowingText={`mostrando ${documents.length}`}
			/>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				documents.length > 0 ? (
					<div className="flex w-full flex-col gap-3">
						{documents.map((doc) => (
							<InboundDocumentCard
								key={doc.id}
								doc={doc}
								canCreatePurchase={canCreatePurchase}
								canManifest={canManifest}
								registeringCiencia={cienciaPending && cienciaVariables?.doc.id === doc.id}
								manifestDisabled={manifestPending || cienciaPending}
								onRegister={() => setRegisterTarget(toRegisterTarget(doc, false))}
								onRegisterWithCiencia={() => registerWithCiencia({ doc })}
								onManifest={(evento) => {
									setJustificativa("");
									setManifestDialog({ inboundId: doc.id, evento });
								}}
							/>
						))}
					</div>
				) : (
					<div className="flex flex-col items-center gap-1.5 rounded-3xl border border-dashed border-border px-5 py-10 text-center">
						<Inbox className="h-5 w-5 text-muted-foreground" />
						<span className="text-sm font-bold">{hasActiveFilters ? "Nenhuma nota com esses filtros" : "Nenhuma nota aqui"}</span>
						<span className="text-xs text-muted-foreground">
							{hasActiveFilters ? "Ajuste a busca ou os filtros para ver outras notas." : "As notas dos seus fornecedores aparecem automaticamente."}
						</span>
						{hasActiveFilters ? (
							<Button
								variant="ghost"
								size="sm"
								className="mt-1"
								onClick={() => updateFilters({ ...DEFAULT_FISCAL_INBOUND_FILTERS, registrationStatuses: [] })}
							>
								VER TODAS AS NOTAS
							</Button>
						) : null}
					</div>
				)
			) : null}

			<RegisterPurchaseFromInboundDrawer target={registerTarget} onClose={() => setRegisterTarget(null)} />

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
						<Button variant="outline" disabled={manifestPending} onClick={() => setManifestDialog(null)}>
							CANCELAR
						</Button>
						<Button disabled={manifestPending || !justificativaValida} onClick={handleConfirmManifest}>
							{manifestPending ? "REGISTRANDO..." : "REGISTRAR"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

const GUIDE_STEPS = [
	{ title: "A nota chega sozinha", description: "Notas emitidas para o seu CNPJ são buscadas na SEFAZ automaticamente." },
	{ title: "Clique em Registrar compra", description: "Fornecedor, itens, valores e duplicatas vêm preenchidos pela nota." },
	{ title: "Revise e confirme", description: "Você só resolve o que a leitura não conseguiu vincular ao seu catálogo." },
];

/** Como a aba funciona, em três passos. Some quando o operador fecha (lembrado neste navegador). */
function InboundGuide() {
	const [visible, setVisible] = useState(false);
	useEffect(() => {
		try {
			setVisible(window.localStorage.getItem(GUIDE_STORAGE_KEY) !== "1");
		} catch {
			setVisible(true);
		}
	}, []);
	if (!visible) return null;

	function dismiss() {
		setVisible(false);
		try {
			window.localStorage.setItem(GUIDE_STORAGE_KEY, "1");
		} catch {
			// Sem storage o guia só volta na próxima visita.
		}
	}

	return (
		<div className="relative grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 rounded-3xl bg-muted py-4 pl-[18px] pr-11">
			{GUIDE_STEPS.map((step, index) => (
				<div key={step.title} className="flex gap-2.5">
					<span
						className={cn(
							"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
							index === 1 ? "bg-primary text-primary-foreground" : "border border-border bg-background",
						)}
					>
						{index + 1}
					</span>
					<div className="flex flex-col gap-0.5">
						<span className="text-[13px] font-bold">{step.title}</span>
						<span className="text-xs leading-snug text-muted-foreground">{step.description}</span>
					</div>
				</div>
			))}
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Fechar"
				className="absolute right-2.5 top-2.5 rounded-full hover:bg-background"
				onClick={dismiss}
			>
				<X className="h-4 w-4" />
			</Button>
		</div>
	);
}

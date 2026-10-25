"use client";

import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { attachPurchaseFreightDocument } from "@/lib/mutations/purchases";
import { isXmlFile, prepareImportFilePayload } from "@/lib/purchase/import-files";
import { cn } from "@/lib/utils";
import type { TPurchaseState } from "@/state-hooks/use-purchase-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Brain, Download, FileCode2, Files, Loader2, TriangleAlert, Truck } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { TONE_CLASSES } from "../../builder/components/builder-ui";
import type { TPurchaseById } from "../helpers/hydrate";
import { getItemTags } from "./items-tab";

type TImportedDocument = NonNullable<TPurchaseState["purchase"]["documentosImportados"]>["documentos"][number];

const ORIGIN_LABELS: Record<TImportedDocument["origem"], { label: string; tone: keyof typeof TONE_CLASSES }> = {
	XML: { label: "Leitura exata", tone: "ok" },
	PDF: { label: "Leitura com IA", tone: "info" },
	IMAGEM: { label: "Leitura com IA", tone: "info" },
	DFE: { label: "Nota recebida (DF-e)", tone: "ok" },
	MANUAL: { label: "Informado à mão", tone: "mute" },
};

const PREVIEWABLE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

function formatAccessKey(key: string) {
	return key.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
}

function documentUrl(purchaseId: string, referencia: string, inline: boolean) {
	const params = new URLSearchParams({ purchaseId, referencia });
	if (inline) params.set("disposition", "inline");
	return `/api/purchases/imported-document?${params.toString()}`;
}

export default function DocumentsTab({ purchase, state }: { purchase: TPurchaseById; state: TPurchaseState }) {
	const queryClient = useQueryClient();
	const freightInputRef = useRef<HTMLInputElement>(null);
	// CT-e anexado depois: frete da transportadora, capitalizado ou em despesa conforme o recebimento (ADR-0002, fluxo E).
	const { mutate: attachFreight, isPending: attachingFreight } = useMutation({
		mutationKey: ["attach-purchase-freight-document", purchase.id],
		mutationFn: attachPurchaseFreightDocument,
		onSuccess: async (result) => {
			toast.success(result.message);
			for (const aviso of result.data.avisos) toast.warning(aviso);
			await queryClient.invalidateQueries({ queryKey: ["purchase-by-id", purchase.id] });
			await queryClient.invalidateQueries({ queryKey: ["fiscal-inbound-documents"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});
	async function handleFreightFile(file: File | undefined) {
		if (!file) return;
		if (!isXmlFile(file)) {
			toast.error("Envie o XML do CT-e.");
			return;
		}
		try {
			const payload = await prepareImportFilePayload(file);
			attachFreight({ file: { dataBase64: payload.dataBase64, fileName: payload.fileName }, purchaseId: purchase.id });
		} catch (error) {
			toast.error(getErrorMessage(error));
		}
	}
	const canAttachFreight = purchase.status !== "CANCELADA";
	const documents = state.purchase.documentosImportados?.documentos ?? [];
	// Adjustments are recorded on the items (unit factors and tax treatments), not per document.
	const adjustments = [...new Set(state.purchaseItems.filter((item) => !item.deletar).flatMap((item) => getItemTags(item).map((tag) => tag.label)))];
	const supplierName = purchase.fornecedor?.nome ?? purchase.pedidoFornecedorNome ?? "este fornecedor";
	// Notas que deixaram de valer na SEFAZ depois de virar esta compra (sync do DF-e).
	const invalidInvoices = (purchase.notasRecebidas ?? []).filter((invoice) => invoice.situacao === "CANCELADA" || invoice.situacao === "DENEGADA");

	return (
		<div className="flex w-full flex-col gap-6">
			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<Files />
					</Section.Icon>
					<Section.Title>Documentos importados</Section.Title>
					<Section.Count>{documents.length}</Section.Count>
					{canAttachFreight ? (
						<Section.Actions>
							<input
								ref={freightInputRef}
								type="file"
								accept=".xml,application/xml,text/xml"
								className="hidden"
								onChange={(event) => {
									void handleFreightFile(event.target.files?.[0]);
									event.target.value = "";
								}}
							/>
							<Button
								variant="ghost"
								size="xs"
								disabled={attachingFreight}
								onClick={() => freightInputRef.current?.click()}
								className="flex items-center gap-1"
							>
								{attachingFreight ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
								ANEXAR CT-e
							</Button>
						</Section.Actions>
					) : null}
				</Section.Header>
				<Section.Body>
					{invalidInvoices.map((invoice) => (
						<div key={invoice.id} className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-red-800">
							<TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
							<p className="text-xs leading-relaxed">
								A NF-e {formatAccessKey(invoice.chaveAcesso)}
								{invoice.emitenteNome ? ` de ${invoice.emitenteNome}` : ""} consta como{" "}
								<strong>{invoice.situacao === "DENEGADA" ? "denegada" : "cancelada"}</strong> na SEFAZ.{" "}
								{purchase.status === "RECEBIDA"
									? "A compra já foi recebida: o estoque e o lançamento continuam valendo. Cancele ou estorne a compra se a mercadoria não entrou."
									: "A compra não pode ser recebida enquanto a nota estiver assim. Cancele a compra ou lance a nota substituta."}
							</p>
						</div>
					))}
					{documents.length === 0 ? (
						<p className="text-xs text-muted-foreground">Esta compra foi preenchida à mão, sem documento importado.</p>
					) : (
						documents.map((document, index) => (
							<DocumentCard
								key={document.referencia}
								purchaseId={purchase.id}
								document={document}
								adjustments={index === 0 ? adjustments : []}
								separated={index > 0}
							/>
						))
					)}
				</Section.Body>
			</Section.Root>

			{purchase.fornecedorId ? (
				<Section.Root>
					<Section.Header>
						<Section.Icon>
							<Brain />
						</Section.Icon>
						<Section.Title>Vínculos do fornecedor usados nesta compra</Section.Title>
						<Section.Count>{purchase.vinculosFornecedor.length}</Section.Count>
					</Section.Header>
					<Section.Body>
						<p className="-mt-3 text-xs text-muted-foreground">
							{purchase.vinculosFornecedor.length > 0
								? `Nas próximas notas de ${supplierName}, estas linhas já chegam vinculadas.`
								: `Nenhum vínculo de ${supplierName} aponta para os produtos desta compra.`}
						</p>
					</Section.Body>
					{purchase.vinculosFornecedor.length > 0 ? (
						<Section.Bleed className="text-xs">
							{purchase.vinculosFornecedor.map((mapping, index) => (
								<div
									key={mapping.id}
									className={cn(
										"grid grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_120px] items-center gap-2 px-3 py-2.5",
										index > 0 && "border-t border-border",
									)}
								>
									<span className="truncate font-mono text-[0.7rem]">
										{[mapping.codigoFornecedor ? `Cód. ${mapping.codigoFornecedor}` : null, mapping.ean ? `EAN ${mapping.ean}` : null]
											.filter(Boolean)
											.join(" · ")}
									</span>
									<ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
									<span className="truncate">{mapping.produtoNome}</span>
									<span className="text-muted-foreground">
										{mapping.fatorConversao && mapping.fatorConversao !== 1
											? `1 ${mapping.unidadeExterna ?? "?"} = ${mapping.fatorConversao} ${mapping.produtoUnidade}`
											: "Mesma unidade"}
									</span>
								</div>
							))}
						</Section.Bleed>
					) : null}
				</Section.Root>
			) : null}
		</div>
	);
}

function DocumentCard({
	purchaseId,
	document,
	adjustments,
	separated,
}: {
	purchaseId: string;
	document: TImportedDocument;
	adjustments: string[];
	separated: boolean;
}) {
	const mimeType = document.arquivo?.mimeType ?? null;
	const canPreview = !!document.arquivo && !!mimeType && PREVIEWABLE_TYPES.includes(mimeType);
	const origin = ORIGIN_LABELS[document.origem];
	const isCte = document.modelo === "CTE";
	const modelLabel = isCte ? "CT-e" : "NF-e";
	const fileName = document.arquivo?.nomeOriginal ?? (document.numero ? `${modelLabel} ${document.numero}` : "Documento");

	return (
		<div className={cn("flex flex-wrap gap-3.5", separated && "border-t border-border pt-4")}>
			<div className="flex h-49 w-37.5 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
				{canPreview && mimeType === "application/pdf" ? (
					<iframe
						title={`Prévia de ${fileName}`}
						src={`${documentUrl(purchaseId, document.referencia, true)}#toolbar=0&view=FitH`}
						className="h-full w-full"
					/>
				) : canPreview ? (
					// eslint-disable-next-line @next/next/no-img-element -- private same-origin file, served by the purchase route
					<img src={documentUrl(purchaseId, document.referencia, true)} alt={`Prévia de ${fileName}`} className="h-full w-full object-cover" />
				) : (
					<FileCode2 className="h-8 w-8 text-muted-foreground" />
				)}
			</div>
			<div className="flex min-w-[240px] flex-1 flex-col gap-2.5">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm font-semibold">{fileName}</span>
					<span className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-semibold", TONE_CLASSES[origin.tone])}>{origin.label}</span>
					{isCte ? <span className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-semibold", TONE_CLASSES.info)}>Frete (CT-e)</span> : null}
				</div>
				<div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
					{document.numero ? (
						<>
							<span className="text-muted-foreground">Documento</span>
							<span>
								{modelLabel} {document.numero}
								{document.serie ? ` · série ${document.serie}` : ""}
								{document.dataEmissao ? ` · emitida em ${formatDateAsLocale(document.dataEmissao)}` : ""}
							</span>
						</>
					) : null}
					{document.chaveAcesso ? (
						<>
							<span className="text-muted-foreground">Chave</span>
							<span className="font-mono text-[0.7rem]">{formatAccessKey(document.chaveAcesso)}</span>
						</>
					) : null}
					{adjustments.length > 0 ? (
						<>
							<span className="text-muted-foreground">Ajustes</span>
							<span>{adjustments.join(" · ")}</span>
						</>
					) : null}
					{document.frete ? (
						<>
							<span className="text-muted-foreground">Frete</span>
							<span>
								{formatToMoney(document.frete.valorCentavos / 100)}
								{document.frete.transportadoraNome ? ` · ${document.frete.transportadoraNome}` : ""}
								{document.frete.icmsCentavos > 0 ? ` · ICMS ${formatToMoney(document.frete.icmsCentavos / 100)}` : ""}
								{document.frete.capitalizado ? " · no custo dos itens" : " · despesa do período (compra já recebida)"}
							</span>
						</>
					) : null}
				</div>
				{document.arquivo ? (
					<Button variant="outline" size="sm" asChild className="flex w-fit items-center gap-1.5 rounded-full">
						<a href={documentUrl(purchaseId, document.referencia, false)}>
							<Download className="h-3.5 w-3.5" />
							BAIXAR
						</a>
					</Button>
				) : null}
			</div>
		</div>
	);
}

"use client";

import type { TGetFiscalDocumentsOutputById } from "@/app/api/fiscal/documents/route";
import { CopyButton } from "@/components/ui/copy-button";
import { Section } from "@/components/ui/section";
import { formatDateAsLocale } from "@/lib/formatting";
import { Calendar, CircleCheck, CircleX, Fingerprint, Hash, Landmark } from "lucide-react";
import { FISCAL_DOCUMENT_STATUS_LABELS } from "../../../shared/fiscal-labels";
import { formatFiscalDocumentTypeLabel } from "../../helpers/fiscal-document-action-state";
import { FiscalDocumentInfoRows } from "./fiscal-document-info-rows";

type FiscalDocumentIdentificationPanelProps = {
	document: TGetFiscalDocumentsOutputById["document"];
};

// 44 digitos em blocos de 4: e assim que a chave aparece no DANFE e como o contador confere.
function formatAccessKey(chave: string) {
	return chave.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatTimestamp(value: Date | string | null | undefined) {
	return value ? formatDateAsLocale(value, true) : null;
}

/**
 * O que o contador pede: chave de acesso em destaque e com cópia, protocolo e as datas que
 * definem a nota. Identificadores do provedor ficam em "Suporte" — não são do operador.
 */
export function FiscalDocumentIdentificationPanel({ document }: FiscalDocumentIdentificationPanelProps) {
	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Fingerprint />
				</Section.Icon>
				<Section.Title>Identificação</Section.Title>
			</Section.Header>
			<Section.Body>
				<div className="flex flex-col gap-1 rounded-lg bg-secondary/30 px-3 py-2.5">
					<span className="text-micro text-muted-foreground uppercase">Chave de acesso</span>
					{document.chaveAcesso ? (
						<div className="flex items-center justify-between gap-2">
							<span className="text-[0.8125rem] leading-normal font-bold break-all tabular-nums">{formatAccessKey(document.chaveAcesso)}</span>
							<CopyButton value={document.chaveAcesso} label="Copiar chave de acesso" className="text-muted-foreground" />
						</div>
					) : (
						<span className="text-xs text-muted-foreground">Gerada quando a SEFAZ autoriza o documento.</span>
					)}
				</div>
				<FiscalDocumentInfoRows
					rows={[
						{ icon: Hash, label: "Protocolo", value: document.protocolo },
						{ icon: Landmark, label: "Status SEFAZ", value: FISCAL_DOCUMENT_STATUS_LABELS[document.status] ?? document.status },
						{ icon: Calendar, label: "Emissão", value: formatTimestamp(document.dataEmissao) },
						{ icon: CircleCheck, label: "Autorização", value: formatTimestamp(document.dataAutorizacao) },
						...(document.dataCancelamento ? [{ icon: CircleX, label: "Cancelamento", value: formatTimestamp(document.dataCancelamento) }] : []),
					]}
				/>
				{document.documentoOrigem ? (
					<p className="text-xs text-muted-foreground">
						Derivado de {formatFiscalDocumentTypeLabel(document.documentoOrigem.tipo)} nº {document.documentoOrigem.numero ?? "—"}
						{document.chaveAcessoReferencia ? (
							<>
								{" "}
								· ref. <span className="break-all tabular-nums">{document.chaveAcessoReferencia}</span>
							</>
						) : null}
					</p>
				) : null}
			</Section.Body>
		</Section.Root>
	);
}

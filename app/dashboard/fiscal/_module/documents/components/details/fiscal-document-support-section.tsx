"use client";

import type { TGetFiscalDocumentsOutputById } from "@/app/api/fiscal/documents/route";
import { CodeBlock } from "@/components/ui/code-block";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Section } from "@/components/ui/section";
import { formatDateAsLocale, formatJsonForDisplay } from "@/lib/formatting";
import { ChevronDown, LifeBuoy } from "lucide-react";
import { useState } from "react";

function JsonPanel({ title, value }: { title: string; value: unknown }) {
	return (
		<CodeBlock.Root value={formatJsonForDisplay(value)}>
			<CodeBlock.Header className="pr-3">
				<CodeBlock.Trigger className="px-3">{title}</CodeBlock.Trigger>
				<CodeBlock.Copy label={`Copiar ${title.toLowerCase()}`} className="text-muted-foreground" />
			</CodeBlock.Header>
			<CodeBlock.Content className="border-t border-border px-3 sm:px-3" />
		</CodeBlock.Root>
	);
}

type FiscalDocumentSupportSectionProps = {
	document: TGetFiscalDocumentsOutputById["document"];
	payload: unknown;
	response: unknown;
	messages: string[];
};

/**
 * Material de suporte: identificadores do provedor, payload, retorno e mensagens. Fechado por
 * padrão — o operador que está corrigindo uma nota não precisa disso; quem abre o chamado, sim.
 */
export function FiscalDocumentSupportSection({ document, payload, response, messages }: FiscalDocumentSupportSectionProps) {
	const [open, setOpen] = useState(false);
	const tiles = [
		{ label: "ID no provedor", value: document.provedorDocumentoId ? `${document.provedor} · ${document.provedorDocumentoId}` : document.provedor },
		{ label: "Referência", value: document.referencia },
		{ label: "Tentativas de envio", value: String(document.tentativasEnvio ?? 0) },
		{ label: "Última sincronização", value: document.dataUltimaSincronizacao ? formatDateAsLocale(document.dataUltimaSincronizacao, true) : null },
	];

	return (
		<Section.Root>
			{/* `contents`: gatilho e conteúdo continuam filhos diretos do flex da seção, com o mesmo `gap`. */}
			<Collapsible open={open} onOpenChange={setOpen} className="contents">
				<CollapsibleTrigger className="group flex min-h-8 w-full cursor-pointer flex-wrap items-center gap-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
					<Section.Icon>
						<LifeBuoy />
					</Section.Icon>
					<Section.Title>Suporte</Section.Title>
					<span className="text-xs text-muted-foreground">Payload, retorno e mensagens do provedor</span>
					<ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
				</CollapsibleTrigger>
				<CollapsibleContent>
					<Section.Body>
						<div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
							{tiles.map((tile) => (
								<div key={tile.label} className="flex flex-col gap-0.5 rounded-lg bg-secondary/30 px-3 py-2.5">
									<span className="text-micro text-muted-foreground uppercase">{tile.label}</span>
									<span className="text-[0.8125rem] font-bold break-all tabular-nums">{tile.value?.trim() ? tile.value : "—"}</span>
								</div>
							))}
						</div>
						<div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
							{payload != null ? (
								<JsonPanel title="Payload enviado ao provedor" value={payload} />
							) : (
								<p className="px-3 py-3 text-xs text-muted-foreground">O payload aparece após a primeira tentativa de envio ao provedor fiscal.</p>
							)}
							{response != null ? <JsonPanel title="Retorno do provedor" value={response} /> : null}
						</div>
						{messages.map((message, index) => (
							<p key={`${index}-${message.slice(0, 24)}`} className="rounded-lg bg-secondary/50 px-3 py-2 text-xs leading-relaxed">
								{message}
							</p>
						))}
					</Section.Body>
				</CollapsibleContent>
			</Collapsible>
		</Section.Root>
	);
}

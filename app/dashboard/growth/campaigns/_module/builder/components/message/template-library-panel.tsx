"use client";

import { Button } from "@/components/ui/button";
import type { getMessageTemplateLibraryEntries } from "@/config/message-template-library";
import { ArrowLeft, Copy, Library, PenLine } from "lucide-react";
import TemplatePreviewClip from "./template-preview-clip";

export type TMessageTemplateLibraryEntry = ReturnType<typeof getMessageTemplateLibraryEntries>[number];

type TemplateLibraryPanelProps = {
	entries: TMessageTemplateLibraryEntry[];
	onBack: () => void;
	onClone: (entry: TMessageTemplateLibraryEntry) => void;
	onCreateBlank: () => void;
};

export default function TemplateLibraryPanel({ entries, onBack, onClone, onCreateBlank }: TemplateLibraryPanelProps) {
	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2.5">
					<Button type="button" size="sm" variant="outline" onClick={onBack} className="flex items-center gap-1.5 rounded-full">
						<ArrowLeft className="h-3.5 w-3.5" />
						MEUS TEMPLATES
					</Button>
					<div className="flex w-fit items-center gap-2 rounded bg-primary/20 px-2 py-1">
						<Library className="h-4 w-4" />
						<h3 className="text-xs font-medium tracking-tight">BIBLIOTECA RECOMPRACRM</h3>
					</div>
				</div>
				<span className="text-xs text-muted-foreground">
					{entries.length === 1
						? "1 modelo compatível com este gatilho"
						: `${entries.length} modelos mantidos pela RecompraCRM · compatíveis com este gatilho`}
				</span>
			</div>

			{entries.length === 0 ? (
				<p className="rounded-xl border border-border bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
					Nenhum modelo da biblioteca usa apenas as variáveis que este gatilho preenche. Crie um template do zero para esta campanha.
				</p>
			) : null}

			<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
				{entries.map((entry) => (
					<div key={entry.key} className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
						<div className="flex items-start justify-between gap-2 p-2.5">
							<div className="flex min-w-0 flex-col gap-0.5">
								<p className="line-clamp-2 break-words text-[13px] font-semibold tracking-tight">{entry.titulo}</p>
								<p className="text-[11px] text-muted-foreground">
									{entry.nome} · {entry.variables.join(", ")}
								</p>
							</div>
							<span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary/10 px-2 py-1">
								<Library className="h-3 w-3 text-primary" />
								<span className="text-[0.65rem] font-semibold uppercase text-primary">Modelo</span>
							</span>
						</div>

						<div className="flex min-h-0 flex-1 flex-col justify-center border-y border-border px-2 py-2">
							<TemplatePreviewClip
								content={entry.conteudo}
								title={entry.titulo}
								subtitle={`${entry.nome} · ${entry.variables.join(", ")}`}
							/>
						</div>

						<div className="flex items-center justify-between gap-2 p-2">
							<span className="text-[11px] text-muted-foreground">Clonar e editar antes de aprovar</span>
							<Button type="button" size="sm" onClick={() => onClone(entry)} className="flex items-center gap-1.5 rounded-full">
								<Copy className="h-3 w-3" />
								CLONAR
							</Button>
						</div>
					</div>
				))}

				<button
					type="button"
					onClick={onCreateBlank}
					className="flex h-full min-h-[240px] flex-col items-start justify-center gap-2.5 rounded-xl border border-dashed border-primary/45 bg-primary/[0.04] p-4 text-left transition-colors hover:bg-primary/10"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<PenLine className="h-4 w-4" />
					</span>
					<span className="flex flex-col gap-1">
						<span className="text-sm font-semibold tracking-tight">Escrever do zero</span>
						<span className="text-xs leading-relaxed text-muted-foreground">Nenhum modelo serve? Abra o construtor com o corpo em branco.</span>
					</span>
				</button>
			</div>
		</div>
	);
}

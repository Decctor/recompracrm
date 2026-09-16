"use client";

import TemplatePreview from "@/components/MessageTemplates/TemplatePreview";
import { cn } from "@/lib/utils";
import type { TMessageTemplateContent, TMessageTemplateMetadata } from "@/schemas/message-templates";
import { Check, Pencil } from "lucide-react";
import TemplateStatusBadge from "./template-status-badge";

export type TCampaignTemplateCardData = {
	id: string;
	nome: string;
	categoria: string;
	linguagem: string;
	conteudo: TMessageTemplateContent;
	metadados: TMessageTemplateMetadata;
};

type TemplateCardProps = {
	template: TCampaignTemplateCardData;
	selectedPhoneId: string;
	isSelected: boolean;
	onSelect: () => void;
	onEdit: () => void;
};

const VISIBLE_VARIABLES = 2;

export default function TemplateCard({ template, selectedPhoneId, isSelected, onSelect, onEdit }: TemplateCardProps) {
	const parameters = template.conteudo.corpo.parametros;
	const visibleParameters = parameters.slice(0, VISIBLE_VARIABLES);
	const hiddenParametersCount = parameters.length - visibleParameters.length;

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: o cartão inteiro é um alvo de clique com role explícito.
		<div
			role="radio"
			aria-checked={isSelected}
			tabIndex={0}
			onClick={onSelect}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onSelect();
				}
			}}
			className={cn(
				"relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/40",
				isSelected && "ring-2 ring-primary ring-inset",
			)}
		>
			<div className="flex items-start justify-between gap-2 p-2.5">
				<div className="flex min-w-0 flex-col gap-0.5">
					<p className="truncate text-[13px] font-semibold tracking-tight">{template.nome}</p>
					<p className="text-[11px] text-muted-foreground">
						{template.categoria} · {template.linguagem}
					</p>
				</div>
				<TemplateStatusBadge metadata={template.metadados} selectedPhoneId={selectedPhoneId} />
			</div>

			<div className="border-y border-border px-2 py-2">
				<TemplatePreview content={template.conteudo} compact />
			</div>

			<div className="flex items-center justify-between gap-2 p-2">
				<div className="flex min-w-0 flex-wrap gap-1">
					{visibleParameters.map((parameter) => (
						<span
							key={parameter.identificadorInterno}
							className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
						>
							{parameter.identificadorInterno}
						</span>
					))}
					{hiddenParametersCount > 0 ? (
						<span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
							+{hiddenParametersCount}
						</span>
					) : null}
				</div>
				<button
					type="button"
					aria-label={`Editar ${template.nome}`}
					onClick={(event) => {
						event.stopPropagation();
						onEdit();
					}}
					className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted"
				>
					<Pencil className="h-3.5 w-3.5" />
				</button>
			</div>

			{isSelected ? (
				<span className="absolute right-3 top-11 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold tracking-wide text-primary-foreground">
					<Check className="h-3 w-3" />
					SELECIONADO
				</span>
			) : null}
		</div>
	);
}

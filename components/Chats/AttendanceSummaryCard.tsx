"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { stripCatalogMemory } from "@/lib/ai/agent/run-memory";
import { cn } from "@/lib/utils";
import { ChevronDown, Loader2, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type AttendanceSummaryCardProps = {
	resumo: string | null | undefined;
	/** Motivo da transferência do episódio atual (handoff da IA ou de um colega). */
	transferenciaMotivo?: string | null;
	/** Abre expandido: quem acabou de receber a conversa precisa do resumo inteiro à vista. */
	defaultOpen?: boolean;
	/** Presentes só para quem detém o atendimento: editar à mão e pedir à IA que refaça. */
	onSave?: (resumo: string) => void;
	onRegenerate?: () => void;
	isSaving?: boolean;
	isRegenerating?: boolean;
	className?: string;
};

/**
 * Resumo do atendimento no topo da thread, colapsado a uma linha.
 *
 * O resumo é escrito pela IA a cada turno (`resumoAtendimento`) e, até aqui, só aparecia na
 * aba Atendimento do painel lateral — fechado por padrão em telas menores. Quem assume da IA lia
 * quarenta mensagens para descobrir que o cliente quer três rolos de cabo e perguntou prazo.
 *
 * O bloco [CATALOGO_INTERNO] que `run-memory.ts` anexa ao resumo é memória do agente, não texto
 * para humanos: sai antes de renderizar. Ao editar, o bloco é preservado no que se grava — a
 * memória do agente não pode ser apagada por um humano corrigindo uma frase.
 */
export function AttendanceSummaryCard({
	resumo,
	transferenciaMotivo,
	defaultOpen = false,
	onSave,
	onRegenerate,
	isSaving,
	isRegenerating,
	className,
}: AttendanceSummaryCardProps) {
	const [open, setOpen] = useState(defaultOpen);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState("");
	useEffect(() => setOpen(defaultOpen), [defaultOpen]);

	const texto = resumo ? stripCatalogMemory(resumo) : "";
	const canAct = Boolean(onSave || onRegenerate);
	if (!texto && !transferenciaMotivo && !canAct) return null;

	const startEditing = () => {
		setDraft(texto);
		setEditing(true);
		setOpen(true);
	};

	return (
		<div className={cn("border-b border-border bg-muted/30 px-4 py-1.5", className)}>
			<div className="flex items-start gap-2">
				<button
					type="button"
					onClick={() => setOpen((current) => !current)}
					aria-expanded={open}
					className="flex min-w-0 flex-1 items-start gap-2 rounded-sm text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				>
					<Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
					<span className="min-w-0 flex-1">
						{transferenciaMotivo ? (
							<span className={cn("block font-medium text-foreground", !open && "truncate")}>
								<span className="text-muted-foreground">Transferido: </span>
								{transferenciaMotivo}
							</span>
						) : null}
						{texto && !editing ? (
							<span className={cn("block text-muted-foreground", !open && "truncate", open && "whitespace-pre-wrap leading-snug")}>
								{!transferenciaMotivo || open ? <span className="font-medium text-foreground">Resumo: </span> : null}
								{texto}
							</span>
						) : null}
						{!texto && !editing ? <span className="block italic text-muted-foreground/80">Sem resumo do atendimento ainda.</span> : null}
					</span>
					<ChevronDown className={cn("mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
				</button>
				{canAct && !editing ? (
					<span className="flex shrink-0 items-center gap-0.5">
						{onRegenerate ? (
							<Button
								size="icon-sm"
								variant="ghost"
								className="h-6 w-6"
								aria-label={texto ? "Pedir à IA que refaça o resumo" : "Pedir à IA que gere o resumo"}
								title={texto ? "Refazer com a IA" : "Gerar com a IA"}
								onClick={onRegenerate}
								disabled={isRegenerating || isSaving}
							>
								{isRegenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
							</Button>
						) : null}
						{onSave ? (
							<Button
								size="icon-sm"
								variant="ghost"
								className="h-6 w-6"
								aria-label="Editar resumo"
								title="Editar"
								onClick={startEditing}
								disabled={isSaving}
							>
								<Pencil className="h-3 w-3" />
							</Button>
						) : null}
					</span>
				) : null}
			</div>

			{editing && onSave ? (
				<div className="mt-1.5 flex flex-col gap-1.5 pl-5">
					<Textarea
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						rows={3}
						aria-label="Resumo do atendimento"
						className="resize-none text-xs"
						disabled={isSaving}
					/>
					<div className="flex items-center justify-end gap-1.5">
						<Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)} disabled={isSaving}>
							Cancelar
						</Button>
						<Button
							size="sm"
							className="h-7"
							onClick={() => {
								// Reanexa a memória de catálogo que o humano nunca viu, para o agente não perdê-la.
								const memory = resumo ? resumo.slice(resumo.indexOf("[CATALOGO_INTERNO]")) : "";
								const keepMemory = resumo?.includes("[CATALOGO_INTERNO]") ? `\n\n${memory}` : "";
								onSave(`${draft.trim()}${keepMemory}`);
								setEditing(false);
							}}
							disabled={isSaving || !draft.trim()}
						>
							{isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
							Salvar
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}

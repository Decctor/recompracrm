"use client";

import { stripCatalogMemory } from "@/lib/ai/agent/run-memory";
import { cn } from "@/lib/utils";
import { ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type AttendanceSummaryCardProps = {
	resumo: string | null | undefined;
	/** Motivo da transferência do episódio atual (handoff da IA ou de um colega). */
	transferenciaMotivo?: string | null;
	/** Abre expandido: quem acabou de receber a conversa precisa do resumo inteiro à vista. */
	defaultOpen?: boolean;
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
 * para humanos: sai antes de renderizar.
 */
export function AttendanceSummaryCard({ resumo, transferenciaMotivo, defaultOpen = false, className }: AttendanceSummaryCardProps) {
	const [open, setOpen] = useState(defaultOpen);
	useEffect(() => setOpen(defaultOpen), [defaultOpen]);

	const texto = resumo ? stripCatalogMemory(resumo) : "";
	if (!texto && !transferenciaMotivo) return null;

	return (
		<div className={cn("border-b border-border bg-muted/30 px-4 py-1.5", className)}>
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				aria-expanded={open}
				className="flex w-full items-start gap-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
			>
				<Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
				<span className="min-w-0 flex-1">
					{transferenciaMotivo ? (
						<span className={cn("block font-medium text-foreground", !open && "truncate")}>
							<span className="text-muted-foreground">Transferido: </span>
							{transferenciaMotivo}
						</span>
					) : null}
					{texto ? (
						<span className={cn("block text-muted-foreground", !open && "truncate", open && "whitespace-pre-wrap leading-snug")}>
							{!transferenciaMotivo || open ? <span className="font-medium text-foreground">Resumo: </span> : null}
							{texto}
						</span>
					) : null}
				</span>
				<ChevronDown className={cn("mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
			</button>
		</div>
	);
}

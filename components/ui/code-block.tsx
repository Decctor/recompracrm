"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { createContext, use, useState, type ReactNode } from "react";

/**
 * Bloco de código dobrável: payload de integração, retorno de provedor, XML, chave de API.
 *
 * É a exceção nomeada da regra de voz única do `DESIGN.md §3` — código literal é monoespaçado
 * porque ali o alinhamento por caractere é informação. A exceção mora aqui dentro justamente para
 * não vazar: número em tabela continua em Outfit com `tabular-nums`.
 *
 * O conteúdo vive na raiz e as partes o leem por contexto, para que copiar e exibir não possam
 * divergir — o botão copia exatamente o que está na tela.
 */

const CodeBlockContext = createContext<{ value: string } | null>(null);

function useCodeBlockContext() {
	const context = use(CodeBlockContext);
	if (!context) throw new Error("CodeBlock.* precisa estar dentro de CodeBlock.Root.");
	return context;
}

type CodeBlockRootProps = {
	value: string;
	defaultOpen?: boolean;
	className?: string;
	children: ReactNode;
};

function CodeBlockRoot({ value, defaultOpen = false, className, children }: CodeBlockRootProps) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<CodeBlockContext value={{ value }}>
			<Collapsible open={open} onOpenChange={setOpen} className={className} data-slot="code-block">
				{children}
			</Collapsible>
		</CodeBlockContext>
	);
}

function CodeBlockHeader({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<div data-slot="code-block-header" className={cn("flex items-center justify-between gap-2", className)}>
			{children}
		</div>
	);
}

/** Rótulo clicável com a seta que gira. Alvo de toque de 44px: é um controle, não um texto. */
function CodeBlockTrigger({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<CollapsibleTrigger
			data-slot="code-block-trigger"
			className={cn(
				"group flex min-h-11 flex-1 items-center gap-2 text-left text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none",
				className,
			)}
		>
			<ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
			{children}
		</CollapsibleTrigger>
	);
}

function CodeBlockCopy({ label, className }: { label: string; className?: string }) {
	const { value } = useCodeBlockContext();
	return <CopyButton value={value} label={label} className={className} />;
}

function CodeBlockContent({ className }: { className?: string }) {
	const { value } = useCodeBlockContext();
	return (
		<CollapsibleContent>
			<pre
				data-slot="code-block-content"
				className={cn(
					"max-h-80 overflow-auto bg-secondary/40 px-4 py-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap sm:px-5",
					className,
				)}
			>
				{value}
			</pre>
		</CollapsibleContent>
	);
}

export const CodeBlock = {
	Root: CodeBlockRoot,
	Header: CodeBlockHeader,
	Trigger: CodeBlockTrigger,
	Copy: CodeBlockCopy,
	Content: CodeBlockContent,
};

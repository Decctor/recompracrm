"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
	label: string;
	value: string;
};

// Valor para copiar (ex.: endereço MCP) sobre fundo escuro: rótulo, código numa linha e botão
// branco "Copiar" que vira "Copiado" por um instante.
export function CopyableCode({ label, value }: Props) {
	const [copied, setCopied] = useState(false);
	const timeout = useRef<number | undefined>(undefined);

	useEffect(() => () => window.clearTimeout(timeout.current), []);

	async function copyValue() {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			return;
		}
		setCopied(true);
		window.clearTimeout(timeout.current);
		timeout.current = window.setTimeout(() => setCopied(false), 1800);
	}

	return (
		<div className="min-w-0">
			<p className="m-0 mb-2 text-xs font-semibold leading-[normal] text-white/55">{label}</p>
			<div className="flex items-center gap-2 rounded-[14px] border border-white/12 bg-white/8 py-1.5 pr-1.5 pl-4">
				<code className="min-w-0 flex-1 truncate font-mono text-[13px] leading-[normal] text-white sm:text-sm" title={value}>
					{value}
				</code>
				<button
					type="button"
					onClick={copyValue}
					className="inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-white px-3.5 text-[13px] font-semibold leading-[normal] text-[#0b1628] transition-colors hover:bg-[#e9eef5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
				>
					{copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
					<span aria-live="polite">{copied ? "Copiado" : "Copiar"}</span>
				</button>
			</div>
		</div>
	);
}

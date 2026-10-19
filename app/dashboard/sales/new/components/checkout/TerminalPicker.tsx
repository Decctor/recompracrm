"use client";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TPaymentTerminalListItem } from "@/lib/queries/payment-terminals";
import { Check, Smartphone, X } from "lucide-react";

type TerminalPickerProps = {
	terminals: TPaymentTerminalListItem[];
	value: string | null | undefined;
	onChange: (dispositivoId: string | null) => void;
	// Motivo pelo qual a atribuição não vale neste pagamento (split, método). Null = pode atribuir.
	blockedReason?: string | null;
	compact?: boolean;
};

export function TerminalOnlineDot({ online, className }: { online: boolean; className?: string }) {
	return (
		<span
			className={cn("inline-block h-2 w-2 shrink-0 rounded-full", online ? "bg-green-500" : "bg-muted-foreground/40", className)}
			aria-label={online ? "Terminal online" : "Terminal sem contato recente"}
		/>
	);
}

/**
 * Escolha da maquininha que vai cobrar o pagamento em cartão. A venda é confirmada com a transação
 * pendente e a aprovação no terminal a efetiva — o operador não digita nada na maquininha, só
 * reconhece a cobrança que aparece lá. Terminal sem heartbeat recente continua na lista, marcado:
 * esconder faria o operador procurar "por que a maquininha sumiu".
 */
export default function TerminalPicker({ terminals, value, onChange, blockedReason, compact }: TerminalPickerProps) {
	const selected = terminals.find((terminal) => terminal.id === value) ?? null;
	const label = selected ? `MAQUININHA: ${selected.nome}` : "COBRAR NA MAQUININHA";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						type="button"
						variant={selected ? "success-light" : "ghost"}
						size="sm"
						className={cn("h-8 gap-1.5 text-[0.7rem] min-w-0", compact && "px-2")}
						disabled={!!blockedReason && !selected}
						title={blockedReason ?? undefined}
					>
						<Smartphone className="w-3.5 h-3.5 shrink-0" />
						{selected ? <TerminalOnlineDot online={selected.online} /> : null}
						<span className="truncate max-w-[12rem] uppercase">{label}</span>
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="min-w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel>MAQUININHA</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				{blockedReason ? <p className="px-2 py-1.5 text-[11px] text-muted-foreground">{blockedReason}</p> : null}
				<DropdownMenuGroup>
					{terminals.map((terminal) => (
						<DropdownMenuItem key={terminal.id} disabled={!!blockedReason} onClick={() => onChange(terminal.id)}>
							<div className="flex items-center gap-2 w-full justify-between">
								<div className="flex items-center gap-2 min-w-0">
									<TerminalOnlineDot online={terminal.online} />
									<span className="truncate">{terminal.nome}</span>
									{!terminal.online ? <span className="text-[10px] uppercase text-muted-foreground">sem contato</span> : null}
								</div>
								{terminal.id === value ? <Check className="w-4 h-4 shrink-0" /> : null}
							</div>
						</DropdownMenuItem>
					))}
					{selected ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => onChange(null)}>
								<div className="flex items-center gap-2">
									<X className="w-4 h-4" />
									Não usar a maquininha
								</div>
							</DropdownMenuItem>
						</>
					) : null}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

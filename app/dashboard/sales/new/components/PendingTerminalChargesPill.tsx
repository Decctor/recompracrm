"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { usePendingTerminalCharges } from "@/lib/queries/payment-terminals";
import { cn } from "@/lib/utils";
import { ArrowRight, Loader2, Smartphone, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { describeTerminalCharge } from "./TerminalChargeStatus";

/**
 * Cobranças ainda abertas em maquininhas da organização. "NOVA VENDA" não bloqueia o operador, então
 * a cobrança do cliente anterior precisa continuar visível onde a venda acontece — a mesma lógica da
 * pill de orçamentos. Some sozinha quando não há pendência.
 */
export default function PendingTerminalChargesPill({ enabled = true }: { enabled?: boolean }) {
	const { data: pending = [] } = usePendingTerminalCharges({ enabled });
	if (pending.length === 0) return null;
	const uncertain = pending.some((attempt) => describeTerminalCharge(attempt).tone === "uncertain");
	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant={uncertain ? "ghost-destructive" : "warning-light"}
						size="sm"
						className="h-9 gap-1.5 text-xs"
						aria-label={`${pending.length} ${pending.length === 1 ? "cobrança pendente" : "cobranças pendentes"} na maquininha`}
					>
						{uncertain ? <TriangleAlert className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
						{pending.length} NA MAQUININHA
					</Button>
				}
			/>
			<PopoverContent align="end" className="w-80 p-0">
				<div className="border-b border-border px-3 py-2">
					<p className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Cobranças aguardando a maquininha</p>
				</div>
				<ul className="max-h-80 divide-y divide-border overflow-y-auto">
					{pending.map((attempt) => {
						const description = describeTerminalCharge(attempt);
						return (
							<li key={attempt.id} className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
								{description.tone === "uncertain" ? (
									<TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
								) : (
									<Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-600" aria-hidden="true" />
								)}
								<div className="min-w-0 flex-1">
									<p className="truncate font-bold">{attempt.venda.clienteNome ?? "Consumidor"}</p>
									<p className="truncate text-xs text-muted-foreground">
										{formatToMoney(attempt.valor)} · {attempt.dispositivoNome}
									</p>
									<p className={cn("mt-0.5 text-[11px]", description.tone === "uncertain" ? "font-semibold text-destructive" : "text-muted-foreground")}>{description.title}</p>
								</div>
								<Link
									href={appRoutes.sales.details(attempt.venda.id)}
									className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
									aria-label={`Abrir ${attempt.venda.identificacao}`}
								>
									<ArrowRight className="h-3.5 w-3.5" />
								</Link>
							</li>
						);
					})}
				</ul>
			</PopoverContent>
		</Popover>
	);
}

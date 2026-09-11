"use client";

import { cn } from "@/lib/utils";
import { ClipboardList, UserRound, UsersRound } from "lucide-react";
import type { ComponentType } from "react";

/**
 * A barra de abas do dashboard, logo abaixo da faixa de vendas.
 *
 * Ela fica **abaixo** da faixa de propósito. Dividir o dashboard inteiro em abas faria metade dos
 * usuários clicar antes de ver qualquer número; assim vendas, meta e risco estão sempre na tela e
 * só a área de detalhe troca.
 *
 * Uma aba que a organização não tem não é renderizada — não aparece desabilitada nem vazia. Numa
 * organização de CRM puro a barra tem duas abas, e nenhum espaço morto.
 */

export const DASHBOARD_TABS = ["relacionamento", "operacao", "equipe"] as const;
export type TDashboardTab = (typeof DASHBOARD_TABS)[number];

type TabDefinition = {
	id: TDashboardTab;
	label: string;
	Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

const TAB_DEFINITIONS: Record<TDashboardTab, TabDefinition> = {
	relacionamento: { id: "relacionamento", label: "RELACIONAMENTO", Icon: UsersRound },
	operacao: { id: "operacao", label: "OPERAÇÃO", Icon: ClipboardList },
	equipe: { id: "equipe", label: "EQUIPE", Icon: UserRound },
};

export type TabBadge = { count: number; tone: "default" | "destructive" };

type TabBarProps = {
	tabs: readonly TDashboardTab[];
	active: TDashboardTab;
	onSelect: (tab: TDashboardTab) => void;
	/** Contagem ao lado do rótulo. Ausente enquanto a consulta da aba não respondeu. */
	badges?: Partial<Record<TDashboardTab, TabBadge | undefined>>;
	/** Uma linha à direita resumindo o que a aba ativa está medindo. */
	hint?: string;
};

export function TabBar({ tabs, active, onSelect, badges, hint }: TabBarProps) {
	return (
		<div className="flex w-full items-end justify-between gap-4 border-border border-b">
			{/* `tablist` sem `tabpanel` associado seria uma promessa de teclado que não cumprimos; são
			    botões de navegação, e o conteúdo abaixo troca junto. */}
			<div className="-mb-px flex min-w-0 items-end gap-0.5 overflow-x-auto">
				{tabs.map((tab) => {
					const definition = TAB_DEFINITIONS[tab];
					const isActive = tab === active;
					const badge = badges?.[tab];
					return (
						<button
							key={tab}
							type="button"
							onClick={() => onSelect(tab)}
							aria-current={isActive ? "page" : undefined}
							className={cn(
								"flex h-10 shrink-0 items-center gap-2 border-b-2 px-3.5 font-bold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
							)}
						>
							<definition.Icon className="size-4" aria-hidden />
							{definition.label}
							{badge && badge.count > 0 ? (
								<span
									className={cn(
										"flex h-4.5 items-center rounded-full px-1.5 font-extrabold text-[0.6875rem]",
										badge.tone === "destructive" ? "bg-destructive-surface text-destructive-surface-foreground" : "bg-muted text-muted-foreground",
									)}
								>
									{badge.count}
								</span>
							) : null}
						</button>
					);
				})}
			</div>
			{hint ? <span className="text-micro hidden shrink-0 pb-2.5 font-normal text-muted-foreground sm:block">{hint}</span> : null}
		</div>
	);
}

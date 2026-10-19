"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Seção do relatório: âncora da navegação, título, descrição e ações à direita. */
export function ReportSection({
	id,
	icon: Icon,
	title,
	description,
	actions,
	children,
}: {
	id: string;
	icon: LucideIcon;
	title: string;
	description: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section id={id} className="flex scroll-mt-20 flex-col gap-3">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-1.5">
						<Icon className="text-muted-foreground size-4" />
						<h2 className="text-xs font-bold uppercase tracking-wide">{title}</h2>
					</div>
					<p className="text-muted-foreground text-xs">{description}</p>
				</div>
				{actions}
			</div>
			{children}
		</section>
	);
}

/** Cartão base dos relatórios (mesmo do resto do app: borda, raio 14px, sombra leve). */
export function ReportCard({ className, children }: { className?: string; children: ReactNode }) {
	return <div className={cn("bg-card border-border flex flex-col gap-3 rounded-xl border px-3 py-4 shadow-2xs", className)}>{children}</div>;
}

/** Cabeçalho de um cartão de gráfico: ícone + título em caixa alta, conteúdo extra à direita. */
export function ReportCardHeader({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<div className="flex items-center gap-2">
				<Icon className="size-4" />
				<h3 className="text-xs font-medium leading-none tracking-tight">{title}</h3>
			</div>
			{children}
		</div>
	);
}

/** Carregando / erro / vazio de uma seção. Cada seção tem a sua consulta e falha sozinha. */
export function ReportSectionState({
	isLoading,
	error,
	isEmpty,
	emptyMessage,
	skeletonClassName = "h-48",
	children,
}: {
	isLoading: boolean;
	error: unknown;
	isEmpty?: boolean;
	emptyMessage?: string;
	skeletonClassName?: string;
	children: ReactNode;
}) {
	if (isLoading) return <Skeleton className={cn("w-full rounded-xl", skeletonClassName)} />;
	if (error) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (isEmpty)
		return <div className="border-border text-muted-foreground rounded-xl border border-dashed px-3 py-6 text-center text-xs">{emptyMessage}</div>;
	return <>{children}</>;
}

/** Rótulo pequeno em caixa alta dos pares rótulo/valor. */
export function MetricLabel({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn("text-muted-foreground text-[0.6rem] font-semibold uppercase tracking-wide", className)}>{children}</span>;
}

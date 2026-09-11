import type React from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type StatCardProps = {
	className?: string;
	icon: React.ReactNode;
	iconWrapperClassName?: string;
	label: string;
	value: string | number | React.ReactNode;
	/** Quando informado, o cartão inteiro vira link (ex.: abrir a listagem já filtrada pelo recorte do indicador). */
	href?: string;
	title?: string;
};

export function StatCard({ className, icon, iconWrapperClassName, label, value, href, title }: StatCardProps) {
	const content = (
		<div className="flex w-full flex-col items-center justify-between gap-2 lg:flex-row">
			<div className="flex items-center justify-start gap-2">
				<div className={cn("flex h-7 w-7 p-1 items-center justify-center rounded-full", iconWrapperClassName)}>{icon}</div>
				<h1 className="text-xs font-medium leading-none tracking-tight">{label}</h1>
			</div>
			{typeof value === "string" || typeof value === "number" ? <h1 className="text-sm font-medium">{value}</h1> : <div>{value}</div>}
		</div>
	);
	// `text-numeric` no cartão inteiro, e não só no `value`: ele também aceita um ReactNode composto
	// (valor + variação, dois números lado a lado), e a herança cobre esses casos sem que cada
	// callsite precise lembrar da classe.
	const cardClassName = cn(
		"text-numeric bg-card border-border flex w-full flex-row items-center justify-between gap-1 rounded-xl border px-3 py-4 shadow-2xs",
		className,
	);

	if (href) {
		return (
			<Link href={href} title={title} className={cn(cardClassName, "transition-colors hover:bg-muted/60")}>
				{content}
			</Link>
		);
	}
	return <div className={cardClassName}>{content}</div>;
}

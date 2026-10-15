import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

export const TONE_CLASSES = {
	ok: "bg-green-500/10 text-green-700 dark:text-green-400",
	warn: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
	info: "bg-blue-500/10 text-blue-800 dark:text-blue-300",
	bad: "bg-destructive/10 text-destructive",
	mute: "bg-muted text-muted-foreground",
} as const;
export type TTone = keyof typeof TONE_CLASSES;

export const TONE_BORDER_CLASSES: Record<TTone, string> = {
	ok: "border-green-500/30",
	warn: "border-amber-500/30",
	info: "border-blue-500/30",
	bad: "border-destructive/30",
	mute: "border-border",
};

/** Marks a field filled by the document reading, until the operator changes it. */
export function ReadBadge({ show = true, label = "Lido da nota" }: { show?: boolean; label?: string }) {
	if (!show) return null;
	return (
		<span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tracking-normal", TONE_CLASSES.info)}>
			<Sparkles className="h-3 w-3" />
			{label}
		</span>
	);
}

export function StatusPill({ tone, icon: Icon, children }: { tone: TTone; icon: ComponentType<{ className?: string }>; children: ReactNode }) {
	return (
		<span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", TONE_CLASSES[tone])}>
			<Icon className="h-3 w-3" />
			{children}
		</span>
	);
}

/** Label row of a builder field, with room for the "Lido da nota" mark. */
export function FieldLabel({ children, read }: { children: ReactNode; read?: boolean }) {
	return (
		<span className="flex items-center gap-2 text-sm font-medium tracking-tight text-foreground/80">
			{children}
			<ReadBadge show={!!read} />
		</span>
	);
}

/** A read-only value shown with the same frame as an input. */
export function StaticField({ children, muted }: { children: ReactNode; muted?: boolean }) {
	return (
		<div
			className={cn(
				"flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-sm",
				muted ? "italic text-muted-foreground" : "text-foreground",
			)}
		>
			{children}
		</div>
	);
}

export function SectionLabel({ children }: { children: ReactNode }) {
	return <p className="text-xs font-bold uppercase tracking-tight">{children}</p>;
}

export function RadioCard({
	selected,
	onClick,
	title,
	description,
	icon: Icon,
	iconTone,
}: {
	selected: boolean;
	onClick: () => void;
	title: string;
	description: string;
	icon?: ComponentType<{ className?: string }>;
	iconTone?: TTone;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				"flex w-full flex-col gap-2 rounded-xl border p-3 text-left transition-colors",
				selected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/40",
			)}
		>
			<span className="flex w-full items-center justify-between gap-2">
				{Icon ? (
					<span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", TONE_CLASSES[iconTone ?? "mute"])}>
						<Icon className="h-4 w-4" />
					</span>
				) : null}
				<span
					className={cn(
						"h-4 w-4 shrink-0 rounded-full border",
						selected ? "border-[5px] border-primary" : "border-muted-foreground/40",
						!Icon && "order-first",
					)}
				/>
			</span>
			<span className="flex flex-col gap-0.5">
				<span className="text-[0.82rem] font-semibold">{title}</span>
				<span className="text-[0.7rem] leading-relaxed text-muted-foreground">{description}</span>
			</span>
		</button>
	);
}

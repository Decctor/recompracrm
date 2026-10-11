import { cn } from "@/lib/utils";
import { LayoutGrid, List } from "lucide-react";

export type ProductViewMode = "grid" | "list";

type ViewModeToggleProps = {
	value: ProductViewMode;
	onChange: (mode: ProductViewMode) => void;
};

export default function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
	const nextMode: ProductViewMode = value === "list" ? "grid" : "list";
	return (
		<>
			{/* No celular, um botão só que alterna: o segmento com os dois modos custa o dobro da largura
			    numa linha que divide espaço com a busca. O ícone mostra o modo para onde se vai. */}
			<button
				type="button"
				onClick={() => onChange(nextMode)}
				aria-label={nextMode === "grid" ? "Ver em grade" : "Ver em lista"}
				title={nextMode === "grid" ? "Ver em grade" : "Ver em lista"}
				className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-2xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:hidden"
			>
				{nextMode === "grid" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
			</button>
			<ViewModeSegment value={value} onChange={onChange} />
		</>
	);
}

function ViewModeSegment({ value, onChange }: ViewModeToggleProps) {
	return (
		<div className="hidden shrink-0 items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-2xs sm:flex">
			<ToggleButton active={value === "list"} label="Ver em lista" onClick={() => onChange("list")}>
				<List className="h-4 w-4" />
			</ToggleButton>
			<ToggleButton active={value === "grid"} label="Ver em grade" onClick={() => onChange("grid")}>
				<LayoutGrid className="h-4 w-4" />
			</ToggleButton>
		</div>
	);
}

type ToggleButtonProps = {
	active: boolean;
	label: string;
	onClick: () => void;
	children: React.ReactNode;
};

function ToggleButton({ active, label, onClick, children }: ToggleButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			aria-label={label}
			title={label}
			className={cn(
				"flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
				active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

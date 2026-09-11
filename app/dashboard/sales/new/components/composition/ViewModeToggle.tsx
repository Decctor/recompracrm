import { cn } from "@/lib/utils";
import { LayoutGrid, List } from "lucide-react";

export type ProductViewMode = "grid" | "list";

type ViewModeToggleProps = {
	value: ProductViewMode;
	onChange: (mode: ProductViewMode) => void;
};

export default function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
	return (
		<div className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-2xs">
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

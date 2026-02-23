import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

type SelectableCardProps = {
	selected: boolean;
	onSelect: () => void;
	icon?: ReactNode;
	label: string;
	description?: string;
	className?: string;
	children?: ReactNode;
};

export function SelectableCard({ selected, onSelect, icon, label, description, className, children }: SelectableCardProps) {
	return (
		<Button
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect();
				}
			}}
			variant="ghost"
			size={"fit"}
			className={cn(
				"flex flex-col relative cursor-pointer rounded-xl border-2 p-6 transition-all duration-300 ease-in-out",
				"hover:-translate-y-1 hover:shadow-lg",
				selected ? "border-[#FFB900] bg-[#FFB900]/5 shadow-md ring-1 ring-[#FFB900]/20" : "border-gray-100 bg-white hover:border-[#FFB900]/30",
				className,
			)}
		>
			{selected && (
				<div className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#FFB900] text-white shadow-sm animate-in fade-in zoom-in duration-200">
					<Check className="h-3.5 w-3.5" />
				</div>
			)}
			<div className={cn("flex flex-col items-center gap-4 text-center", className?.includes("text-left") && "items-start text-left")}>
				{icon && (
					<div
						className={cn(
							"flex h-12 w-12 items-center justify-center rounded-full text-2xl transition-colors duration-300",
							selected ? "bg-[#FFB900]/10 text-yellow-700" : "bg-gray-50 text-gray-400",
						)}
					>
						{icon}
					</div>
				)}
				<div className="flex flex-col gap-1.5">
					<span className={cn("font-semibold text-sm transition-colors", selected ? "text-yellow-700" : "text-gray-900")}>{label}</span>
					{description && <span className="text-xs text-muted-foreground leading-relaxed">{description}</span>}
				</div>
				{children}
			</div>
		</Button>
	);
}

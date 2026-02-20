"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatToMoney } from "@/lib/formatting";
import { useAutoScrollOnFocus } from "@/lib/hooks/use-auto-scroll-on-focus";
import { Plus, X } from "lucide-react";

const VALUE_HELPERS = [10, 25, 50, 100];

type SaleValueStepProps = {
	value: number;
	onChange: (value: number) => void;
	onSubmit: () => void;
};

export function SaleValueStep({ value, onChange, onSubmit }: SaleValueStepProps) {
	const handleScrollOnFocus = useAutoScrollOnFocus(300);

	return (
		<div className="space-y-8 short:space-y-2 animate-in fade-in slide-in-from-bottom-4">
			<div className="text-center space-y-2 short:space-y-0.5">
				<h2 className="text-xl short:text-lg font-black uppercase tracking-tight">Qual o valor da compra?</h2>
			</div>
			<div className="relative max-w-md mx-auto">
				<span className="absolute left-6 short:left-3 top-1/2 -translate-y-1/2 text-2xl short:text-lg font-black text-muted-foreground">R$</span>
				<Input
					type="number"
					value={value || ""}
					onChange={(e) => onChange(Number(e.target.value))}
					className="h-24 short:h-14 text-5xl short:text-3xl font-black text-center rounded-3xl short:rounded-xl border-4 short:border border-brand/20 focus:border-brand px-12 short:px-9"
					onFocus={handleScrollOnFocus}
					onSubmit={() => {
						onSubmit();
					}}
				/>
			</div>
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3 short:gap-1.5 max-w-xl mx-auto">
				{VALUE_HELPERS.map((h) => (
					<Button
						key={h}
						variant="secondary"
						onClick={() => onChange(value + h)}
						className="h-14 short:h-9 rounded-xl short:rounded-lg font-black text-lg short:text-base"
					>
						<Plus className="w-4 h-4 short:w-3 short:h-3 mr-1 text-brand" /> {formatToMoney(h)}
					</Button>
				))}
				<Button
					variant="ghost"
					onClick={() => onChange(0)}
					className="h-14 short:h-9 rounded-xl short:rounded-lg font-bold text-muted-foreground col-span-2 md:col-span-4 italic short:text-sm"
				>
					<X className="w-4 h-4 short:w-3 short:h-3 mr-1" /> LIMPAR VALOR
				</Button>
			</div>
		</div>
	);
}

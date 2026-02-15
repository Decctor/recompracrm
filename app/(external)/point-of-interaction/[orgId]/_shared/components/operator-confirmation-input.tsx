"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatToNumericPassword } from "@/lib/formatting";
import { useAutoScrollOnFocus } from "@/lib/hooks/use-auto-scroll-on-focus";

type OperatorConfirmationInputProps = {
	value: string;
	onChange: (value: string) => void;
};

export function OperatorConfirmationInput({ value, onChange }: OperatorConfirmationInputProps) {
	const handleScrollOnFocus = useAutoScrollOnFocus(300);

	return (
		<div className="space-y-4 short:space-y-1.5 max-w-md mx-auto">
			<Label className="block text-center font-black text-xs short:text-[0.7rem] text-muted-foreground uppercase tracking-widest italic">
				Senha do Operador
			</Label>
			<Input
				type="number"
				placeholder="*****"
				value={value}
				onChange={(e) => onChange(formatToNumericPassword(e.target.value))}
				className="h-16 short:h-11 text-2xl short:text-xl text-center rounded-2xl short:rounded-lg border-4 short:border border-brand/20 focus:border-green-500 transition-all font-bold"
				onFocus={handleScrollOnFocus}
			/>
		</div>
	);
}

"use client";

import { useId } from "react";

type RangeFieldProps = {
	label: string;
	display: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => void;
	hint?: string;
	size?: "md" | "lg";
};

/** Controle deslizante das ferramentas: rótulo e valor na mesma linha, dica opcional embaixo. */
export function RangeField({ label, display, value, min, max, step, onChange, hint, size = "lg" }: RangeFieldProps) {
	const id = useId();
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-baseline justify-between gap-3">
				<label htmlFor={id} className="text-[15px] font-medium text-[#2b3538]">
					{label}
				</label>
				<output
					htmlFor={id}
					className={
						size === "lg"
							? "text-[22px] font-semibold tracking-[-0.02em] whitespace-nowrap"
							: "text-[20px] font-semibold tracking-[-0.02em] whitespace-nowrap"
					}
				>
					{display}
				</output>
			</div>
			<input
				id={id}
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				aria-valuetext={display}
				aria-describedby={hint ? `${id}-hint` : undefined}
				onChange={(event) => onChange(Number(event.target.value))}
				className="m-0 h-1.5 w-full cursor-pointer accent-[#24549c]"
			/>
			{hint ? (
				<p id={`${id}-hint`} className="text-[13px] leading-[1.45] text-[#8a979c]">
					{hint}
				</p>
			) : null}
		</div>
	);
}

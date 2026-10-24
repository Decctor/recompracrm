"use client";

import { cn } from "@/lib/utils";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

type ScaledMockProps = {
	/** Largura real da tela no app, em px. A ilustração é desenhada nessa largura e reduzida para caber. */
	width: number;
	/** Descrição da ilustração para leitores de tela (a tela em si é decorativa). */
	label: string;
	children: ReactNode;
	className?: string;
};

// As telas do produto são desenhadas no tamanho real do app e encolhidas por `transform: scale`
// quando o container é mais estreito. A altura do container acompanha a escala, para não sobrar
// espaço em branco embaixo.
export function ScaledMock({ width, label, children, className }: ScaledMockProps) {
	const outerRef = useRef<HTMLDivElement>(null);
	const innerRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState<{ w: number; h: number } | null>(null);

	useLayoutEffect(() => {
		const outer = outerRef.current;
		const inner = innerRef.current;
		if (!outer || !inner) return;
		const measure = () => {
			const w = outer.clientWidth;
			const h = inner.offsetHeight;
			if (!w || !h) return;
			setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(outer);
		observer.observe(inner);
		document.fonts?.ready.then(measure).catch(() => {});
		return () => observer.disconnect();
	}, []);

	const scale = size ? Math.min(1, size.w / width) : 1;

	return (
		<div
			ref={outerRef}
			role="img"
			aria-label={label}
			className={cn("relative mx-auto w-full", !size && "overflow-hidden", className)}
			style={{ maxWidth: width, height: size ? Math.ceil(size.h * scale) : undefined }}
		>
			<div
				ref={innerRef}
				style={size ? { position: "absolute", left: 0, top: 0, width, transform: `scale(${scale})`, transformOrigin: "0 0" } : { width }}
			>
				{children}
			</div>
		</div>
	);
}

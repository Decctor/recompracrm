"use client";

import { cn } from "@/lib/utils";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

type SlidingSwapProps = {
	/** false → painel primário visível; true → painel secundário desliza da direita. */
	showSecondary: boolean;
	primary: ReactNode;
	secondary: ReactNode;
	className?: string;
};

const TRANSITION = "380ms cubic-bezier(0.22,0.61,0.36,1)";

/**
 * Empilha dois painéis na mesma célula de grid e desliza um sobre o outro, animando a altura do
 * contêiner para a do painel ativo — sem isso o bloco "pula" para a altura do maior dos dois.
 *
 * Um `ResizeObserver` acompanha o painel ativo porque o conteúdo muda de altura sozinho (busca
 * filtrando cartões, template selecionado, etc.), não só na troca de painel.
 */
export default function SlidingSwap({ showSecondary, primary, secondary, className }: SlidingSwapProps) {
	const primaryRef = useRef<HTMLDivElement>(null);
	const secondaryRef = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number | null>(null);
	// Só anima depois da primeira medição: sem isso o bloco faz uma transição de 0 → altura ao montar.
	const [hasMeasured, setHasMeasured] = useState(false);

	useLayoutEffect(() => {
		const activeElement = showSecondary ? secondaryRef.current : primaryRef.current;
		if (!activeElement) return;

		function measure(element: HTMLDivElement) {
			const measured = Math.ceil(element.getBoundingClientRect().height);
			if (measured > 0) {
				setHeight(measured);
				setHasMeasured(true);
			}
		}

		measure(activeElement);
		const observer = new ResizeObserver(() => measure(activeElement));
		observer.observe(activeElement);
		return () => observer.disconnect();
	}, [showSecondary]);

	// Fontes carregando depois da primeira medição mudam a altura do texto; remede uma vez.
	useEffect(() => {
		if (!("fonts" in document)) return;
		let cancelled = false;
		document.fonts.ready.then(() => {
			if (cancelled) return;
			const activeElement = showSecondary ? secondaryRef.current : primaryRef.current;
			if (activeElement) setHeight(Math.ceil(activeElement.getBoundingClientRect().height));
		});
		return () => {
			cancelled = true;
		};
	}, [showSecondary]);

	return (
		<div
			className={cn("grid grid-cols-1 items-start overflow-hidden motion-reduce:transition-none", className)}
			style={{
				height: height === null ? "auto" : `${height}px`,
				transition: hasMeasured ? `height ${TRANSITION}` : undefined,
			}}
		>
			<div
				ref={primaryRef}
				aria-hidden={showSecondary}
				className="col-start-1 row-start-1 motion-reduce:transition-none"
				style={{
					transition: `transform ${TRANSITION}, opacity 240ms ease`,
					transform: showSecondary ? "translateX(-4%)" : "translateX(0)",
					opacity: showSecondary ? 0 : 1,
					pointerEvents: showSecondary ? "none" : "auto",
				}}
			>
				{primary}
			</div>
			<div
				ref={secondaryRef}
				aria-hidden={!showSecondary}
				className="col-start-1 row-start-1 motion-reduce:transition-none"
				style={{
					transition: `transform ${TRANSITION}, opacity 240ms ease`,
					transform: showSecondary ? "translateX(0)" : "translateX(6%)",
					opacity: showSecondary ? 1 : 0,
					pointerEvents: showSecondary ? "auto" : "none",
				}}
			>
				{secondary}
			</div>
		</div>
	);
}

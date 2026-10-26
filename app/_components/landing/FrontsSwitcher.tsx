"use client";

import { cn } from "@/lib/utils";
import { CircleCheck, Coins, type LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Stage } from "./primitives";

type TFront = "fidelizacao" | "recuperacao";

const FRONTS: { id: TFront; eyebrow: string; title: string; text: string; icon: LucideIcon; requirement: string }[] = [
	{
		id: "fidelizacao",
		eyebrow: "Frente 1 · Fidelização",
		title: "Para quem ainda compra",
		text: "Cada compra gera cashback com validade. O saldo dá ao cliente um motivo concreto para voltar antes de expirar.",
		icon: Coins,
		requirement: "Usa o programa de cashback",
	},
	{
		id: "recuperacao",
		eyebrow: "Frente 2 · Recuperação",
		title: "Para quem parou de comprar",
		text: "A segmentação RFM aponta quem está sumindo e as campanhas chamam esse cliente de volta pelo WhatsApp da loja.",
		icon: CircleCheck,
		requirement: "Não precisa de cashback, só das suas vendas",
	},
];

type FrontsSwitcherProps = {
	/** Conteúdo do painel de cada frente (texto + recorte), renderizado no servidor. */
	panels: Record<TFront, ReactNode>;
};

export function FrontsSwitcher({ panels }: FrontsSwitcherProps) {
	const [front, setFront] = useState<TFront>("fidelizacao");

	return (
		<>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4" role="tablist" aria-label="Frentes do RecompraCRM">
				{FRONTS.map(({ id, eyebrow, title, text, icon: Icon, requirement }) => {
					const on = id === front;
					return (
						<button
							key={id}
							type="button"
							role="tab"
							aria-selected={on}
							aria-controls="frentes-painel"
							onClick={() => setFront(id)}
							className={cn(
								"flex w-full cursor-pointer flex-col items-start rounded-[20px] border p-7 text-left transition-[background-color,box-shadow,border-color] duration-[250ms]",
								on
									? "border-[rgba(14,18,20,0.08)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_20px_40px_-24px_rgba(16,24,40,0.3)]"
									: "border-transparent bg-[#f6f8fa] hover:bg-[#f1f4f7]",
							)}
						>
							<span className="flex w-full items-center justify-between gap-3">
								<span className="text-[12px] font-bold tracking-[0.08em] text-[#24549c] uppercase">{eyebrow}</span>
								<span
									aria-hidden
									className={cn(
										"h-4 w-4 shrink-0 rounded-full transition-[border] duration-200",
										on ? "border-[5px] border-[#24549c]" : "border-[1.5px] border-[#dfe4e6]",
									)}
								/>
							</span>
							<span className="mt-2.5 block text-[24px] font-semibold tracking-[-0.02em] text-[#0e1214]">{title}</span>
							<span className="mt-1.5 block text-[15px] leading-[1.55] text-[#5b6a70]">{text}</span>
							<span className="mt-4 flex items-center gap-2 text-[13px] text-[#2b3538]">
								<Icon className="h-3.5 w-3.5 text-[#24549c]" aria-hidden />
								{requirement}
							</span>
						</button>
					);
				})}
			</div>

			<div id="frentes-painel" role="tabpanel" className="mt-4">
				<Stage>{panels[front]}</Stage>
			</div>
		</>
	);
}

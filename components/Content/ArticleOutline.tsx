"use client";

import { useEffect, useState } from "react";

type ArticleOutlineProps = {
	items: { id: string; label: string }[];
};

// Sumário lateral. Os links são âncoras simples (funcionam sem JavaScript e são lidos por buscadores);
// o JavaScript só acende a seção em leitura: o último título `[data-outline]` que já passou de 160px
// do topo — a mesma regra do "Lendo · <seção>" do Dock, para os dois nunca discordarem.
export function ArticleOutline({ items }: ArticleOutlineProps) {
	const [active, setActive] = useState<string | null>(null);

	useEffect(() => {
		const onScroll = () => {
			let current: string | null = null;
			for (const el of document.querySelectorAll("[data-outline]")) {
				if (el.getBoundingClientRect().top <= 160) current = el.id;
			}
			setActive(current);
		};
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);
		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
		};
	}, []);

	if (items.length < 3) return null;
	return (
		<nav aria-label="Neste artigo" className="sticky top-28">
			<p className="m-0 mb-4 text-[13px] font-semibold text-[#8a979c]">Neste artigo</p>
			<ol className="m-0 flex list-none flex-col border-l border-[#e3e8ea] p-0">
				{items.map((item) => {
					const on = item.id === active;
					return (
						<li key={item.id}>
							<a
								href={`#${item.id}`}
								aria-current={on ? "location" : undefined}
								className={`-ml-px block border-l py-[7px] pl-4 text-sm leading-[1.4] transition-[color,border-color] duration-200 ${
									on ? "border-[#0e1214] font-medium text-[#0e1214]" : "border-transparent text-[#687a80] hover:text-[#0e1214]"
								}`}
							>
								{item.label}
							</a>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}

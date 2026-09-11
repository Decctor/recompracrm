"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * Barra de categorias do PDV.
 *
 * Não rola. A versão anterior era um `overflow-x-auto`, e o scrollbar horizontal é chrome
 * permanente comunicando um estado transitório: ocupava ~14px fixos de uma tela de altura travada
 * (`h-[calc(100vh-8rem)]`) e cortava os rótulos no meio da palavra. Aqui a linha tem altura fixa e
 * o que não cabe vai para um popover com contagem explícita — nada fica escondido sem aviso.
 *
 * Três regras sustentam isso:
 *
 * 1. O rótulo é dado autoral da loja ("Gelatos - O Mais Pedido 😋"), de comprimento ilimitado.
 *    Truncar em `16ch` converte isso em largura previsível: ~6 pills por linha em vez de ~4,5. O
 *    nome inteiro segue no `title` e, sem truncagem, na lista do popover.
 * 2. A categoria ativa é sempre promovida para a linha visível, no último slot antes do `+N`.
 *    Filtro ativo invisível é o pior desfecho possível de uma barra que esconde itens.
 * 3. A ordem é a que `/api/pos/groups` devolve (a ordem curada do canal), então o corte não é
 *    arbitrário: o que sobra para o popover é a cauda de menor prioridade definida pela loja.
 *
 * A medição acontece numa linha espelho invisível, não na linha visível: assim a linha visível só
 * renderiza uma contagem já correta, sem passar por um frame de pills cortados.
 */

/** `gap-1.5` em px. A medição precisa do mesmo valor que o CSS aplica, ou o corte erra por item. */
const GAP_PX = 6;

const PILL_CLASS = "shrink-0 rounded-full text-xs font-bold";
/**
 * `truncate` (que traz `overflow: hidden`) é o que faz o `min-width: auto` do flex item resolver
 * para 0 — sem ele o span não encolhe e o `max-w` do pai não tem efeito nenhum.
 */
const PILL_LABEL_CLASS = "max-w-[16ch] truncate";

/**
 * Quantas categorias cabem na linha, na ordem do canal.
 *
 * `selectedIndex` é o índice da categoria ativa, ou -1. Quando ela cai fora do corte natural, a
 * largura dela é reservada antes de qualquer categoria posterior ocupar espaço: é o que garante
 * que a promoção da regra 2 sempre tenha para onde ir.
 *
 * `canPin: false` é a válvula de escape para uma linha estreita demais até para "Todos + ativa +
 * `+N`". Ali a promoção é abandonada de propósito: promover mesmo assim estouraria a linha e o
 * `overflow-hidden` cortaria justamente o `+N`, deixando a cauda inalcançável.
 */
type TCategoriesBarMetrics = {
	available: number;
	allWidth: number;
	groupWidths: number[];
	overflowWidth: number;
};

function computeFit({ available, allWidth, groupWidths, overflowWidth, selectedIndex }: TCategoriesBarMetrics & { selectedIndex: number }) {
	// Cabe tudo: o `+N` não existe, e portanto não reserva espaço.
	const fullWidth = groupWidths.reduce((sum, width) => sum + GAP_PX + width, allWidth);
	if (fullWidth <= available) return { count: groupWidths.length, canPin: true };

	const pinWidth = selectedIndex >= 0 ? GAP_PX + groupWidths[selectedIndex]! : 0;
	const canPin = allWidth + pinWidth + GAP_PX + overflowWidth <= available;

	let remaining = available - allWidth - GAP_PX - overflowWidth;
	let count = 0;
	for (let index = 0; index < groupWidths.length; index++) {
		const pinReserve = canPin && selectedIndex > index ? pinWidth : 0;
		if (remaining - GAP_PX - groupWidths[index]! - pinReserve < 0) break;
		remaining -= GAP_PX + groupWidths[index]!;
		count++;
	}
	return { count, canPin };
}

type CategoriesBarProps = {
	groups: string[];
	selectedGroup: string | null;
	onGroupSelect: (group: string | null) => void;
	/** Carregando a lista de categorias: reserva a altura da linha com skeleton, sem empurrar a grade. */
	isLoadingGroups?: boolean;
	/**
	 * A grade de produtos está recarregando por causa do filtro. Não desabilita os pills — quem
	 * está no balcão precisa poder corrigir um clique errado no mesmo instante, e o estado de
	 * carregamento já é comunicado pelo skeleton da grade.
	 */
	isFilteringProducts?: boolean;
};

export default function CategoriesBar({ groups, selectedGroup, onGroupSelect, isLoadingGroups, isFilteringProducts }: CategoriesBarProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mirrorRef = useRef<HTMLDivElement>(null);
	const [metrics, setMetrics] = useState<TCategoriesBarMetrics | null>(null);
	const [isOverflowOpen, setIsOverflowOpen] = useState(false);

	/**
	 * O estado guarda só o que vem do DOM. O corte em si é derivado no render, porque trocar de
	 * categoria não muda largura de nada: se `selectedGroup` entrasse aqui, cada clique no balcão
	 * destruiria e recriaria o ResizeObserver e releria a caixa de 2N+2 nós para chegar no mesmo
	 * número. Medir é efeito; cortar é cálculo.
	 */
	useEffect(() => {
		const container = containerRef.current;
		const mirror = mirrorRef.current;
		if (!container || !mirror) return;

		const measure = () => {
			const allNode = mirror.querySelector<HTMLElement>('[data-measure="all"]');
			const overflowNode = mirror.querySelector<HTMLElement>('[data-measure="overflow"]');
			if (!allNode || !overflowNode) return;

			setMetrics({
				available: container.clientWidth,
				allWidth: Math.ceil(allNode.getBoundingClientRect().width),
				groupWidths: Array.from(mirror.querySelectorAll<HTMLElement>('[data-measure="group"]'), (node) => Math.ceil(node.getBoundingClientRect().width)),
				overflowWidth: Math.ceil(overflowNode.getBoundingClientRect().width),
			});
		};

		measure();

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", measure);
			return () => window.removeEventListener("resize", measure);
		}

		const observer = new ResizeObserver(measure);
		observer.observe(container);
		// O espelho também, não só o container: quando a fonte termina de carregar, os pills mudam
		// de largura sem que o container mude de tamanho. Observando só o container, o corte ficaria
		// congelado nas larguras da fonte de fallback.
		observer.observe(mirror);
		return () => observer.disconnect();
	}, [groups]);

	if (isLoadingGroups) {
		return (
			<div aria-hidden className="flex h-9 items-center gap-1.5">
				<Skeleton className="h-9 w-20 rounded-full" />
				<Skeleton className="h-9 w-32 rounded-full" />
				<Skeleton className="h-9 w-28 rounded-full" />
				<Skeleton className="h-9 w-36 rounded-full" />
			</div>
		);
	}

	// Organização sem nenhum grupo vendável no canal: um "Todos" solitário não filtra nada.
	if (groups.length === 0) return null;

	// Antes da primeira medição a linha renderiza tudo e o `overflow-hidden` segura: é um único
	// frame, e nenhum estado intermediário consegue empurrar a grade porque a altura é fixa.
	const fit = metrics ? computeFit({ ...metrics, selectedIndex: selectedGroup ? groups.indexOf(selectedGroup) : -1 }) : null;
	const visibleGroups = fit ? groups.slice(0, fit.count) : groups;
	const pinnedGroup = fit?.canPin && selectedGroup && groups.includes(selectedGroup) && !visibleGroups.includes(selectedGroup) ? selectedGroup : null;
	const overflowGroups = fit ? groups.slice(fit.count).filter((group) => group !== pinnedGroup) : [];

	const renderPill = (group: string) => (
		<Button
			key={group}
			type="button"
			variant={selectedGroup === group ? "brand" : "outline"}
			onClick={() => onGroupSelect(group)}
			className={PILL_CLASS}
			aria-pressed={selectedGroup === group}
			title={group}
		>
			<span className={PILL_LABEL_CLASS}>{group}</span>
		</Button>
	);

	return (
		<div ref={containerRef} className="relative h-9 w-full min-w-0">
			{/* Linha espelho: mede as larguras reais (truncagem inclusa) sem nunca ser vista nem
			    focada. `visibility: hidden` mantém a caixa de layout, ao contrário de `display: none`. */}
			<div aria-hidden ref={mirrorRef} className="pointer-events-none invisible absolute top-0 left-0 flex w-max items-center gap-1.5">
				<Button type="button" tabIndex={-1} variant="outline" className={PILL_CLASS} data-measure="all">
					Todos os grupos
				</Button>
				{groups.map((group) => (
					<Button key={group} type="button" tabIndex={-1} variant="outline" className={PILL_CLASS} data-measure="group">
						<span className={PILL_LABEL_CLASS}>{group}</span>
					</Button>
				))}
				<Button type="button" tabIndex={-1} variant="outline" className={PILL_CLASS} data-measure="overflow">
					+99
				</Button>
			</div>

			<div
				role="group"
				aria-label="Filtrar produtos por categoria"
				aria-busy={isFilteringProducts}
				className={cn("flex h-9 items-center gap-1.5 overflow-hidden", isFilteringProducts && "[&_button]:cursor-progress")}
			>
				<Button
					type="button"
					variant={selectedGroup === null ? "brand" : "outline"}
					onClick={() => onGroupSelect(null)}
					className={PILL_CLASS}
					aria-pressed={selectedGroup === null}
				>
					Todos os grupos
				</Button>

				{visibleGroups.map(renderPill)}
				{pinnedGroup ? renderPill(pinnedGroup) : null}

				{overflowGroups.length > 0 ? (
					<Popover open={isOverflowOpen} onOpenChange={setIsOverflowOpen}>
						<PopoverTrigger
							render={
								<Button
									type="button"
									variant="outline"
									className={cn(PILL_CLASS, "ml-auto tabular-nums")}
									aria-label={`Ver mais ${overflowGroups.length} categorias`}
								>
									+{overflowGroups.length}
								</Button>
							}
						/>
						<PopoverContent align="end" className="w-64 gap-1 p-2">
							<p className="px-2 pt-1 text-label text-muted-foreground">Mais categorias</p>
							{/* Vertical e dentro de um popover é onde uma rolagem é honesta: só aparece quando a
							    cauda é longa, e não rouba altura da grade de produtos. */}
							<div className="scrollbar-subtle flex max-h-72 flex-col gap-0.5 overflow-y-auto">
								{overflowGroups.map((group) => (
									<button
										key={group}
										type="button"
										onClick={() => {
											onGroupSelect(group);
											setIsOverflowOpen(false);
										}}
										className="rounded-xl px-2 py-2 text-left text-xs font-bold transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
									>
										{group}
									</button>
								))}
							</div>
						</PopoverContent>
					</Popover>
				) : null}
			</div>
		</div>
	);
}

"use client";

import type { TGetSalesFulfillmentOutputDefault, TSalesFulfillmentCard } from "@/app/api/sales/fulfillment/route";
import { formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import { useDroppable } from "@dnd-kit/core";
import dayjs from "dayjs";
import { ArrowUpRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import { ATTENDANCE_COLUMN_META, DELIVERED_STATUS, DELIVERY_MODE_META } from "./config";

type TDelivered = TGetSalesFulfillmentOutputDefault["delivered"];

/**
 * Hora do relogio, porque e assim que o operador se lembra do que acabou de fazer ("foi umas duas e
 * pouco"). O relativo so aparece nos primeiros minutos, onde ele e mais preciso que o relogio para
 * responder a unica pergunta do bloco: isso acabou de sair daqui?
 */
function formatDeliveredMoment(value: Date | string | null) {
	if (!value) return "--:--";
	const moment = dayjs(value);
	const minutes = dayjs().diff(moment, "minute");
	if (minutes < 1) return "agora";
	if (minutes < 5) return `há ${minutes} min`;
	return moment.format("HH:mm");
}

/**
 * Unico ponto de cor do bloco, e por isso restrito ao que esta de fato errado: entrega feita com
 * pagamento em atraso, ou nota que voltou rejeitada/com erro. Pendencias normais (parcela a vencer,
 * nota ainda processando) nao entram — um comprovante que alerta sobre tudo nao alerta sobre nada.
 */
function resolveDeliveredIssue(card: TSalesFulfillmentCard): string | null {
	if (card.financeiro === "EM_ATRASO") return "Pagamento em atraso";
	if (card.fiscal === "REJEITADO") return "Nota rejeitada";
	if (card.fiscal === "ERRO") return "Erro fiscal";
	return null;
}

function DeliveredRow({ card, onViewDetails }: { card: TSalesFulfillmentCard; onViewDetails: (saleId: string) => void }) {
	const issue = resolveDeliveredIssue(card);
	const modalidade = card.entregaModalidade ? DELIVERY_MODE_META[card.entregaModalidade]?.label : null;
	const nome = card.cliente?.nome ?? "Ao consumidor";

	return (
		<button
			type="button"
			id={`sale-details-trigger-${card.id}`}
			onClick={() => onViewDetails(card.id)}
			aria-label={`Ver detalhes do pedido de ${nome}, ${formatToMoney(card.valorTotal)}${issue ? `, ${issue}` : ""}`}
			className={cn(
				"group/row flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
				"hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15",
				"animate-in fade-in-0 slide-in-from-top-1 duration-300 motion-reduce:animate-none",
			)}
		>
			<span className="flex w-full items-baseline gap-2">
				<span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">{nome}</span>
				<span className="shrink-0 text-xs font-bold tabular-nums tracking-tight">{formatToMoney(card.valorTotal)}</span>
			</span>
			<span className="flex w-full items-center gap-1.5 text-[10px] text-muted-foreground">
				<span className="shrink-0 tabular-nums">{formatDeliveredMoment(card.statusAtendimentoData)}</span>
				{modalidade ? (
					<>
						<span aria-hidden className="text-muted-foreground/40">
							·
						</span>
						<span className="truncate">{modalidade}</span>
					</>
				) : null}
				{issue ? <span className="ml-auto shrink-0 font-bold text-destructive">{issue}</span> : null}
			</span>
		</button>
	);
}

/**
 * ENTREGUE renderizado pelo que ele e: um comprovante, nao uma fila.
 *
 * A etapa e terminal — recebe cards e nunca devolve nenhum —, entao dar a ela uma coluna de trabalho
 * inteira, com cards arrastaveis identicos aos do fluxo, faz o quadro gritar sobre o que ja acabou.
 * Aqui ela vira uma trilha estreita de linhas: o trabalho concluido recua, e as etapas que ainda
 * pedem acao ficam com a atencao e com o espaco.
 *
 * Continua sendo alvo de arraste (e o destino de "concluir"), so que o realce de drop e o unico
 * momento em que o bloco pesa na tela.
 */
export function DeliveredBuffer({ delivered, onViewDetails }: { delivered: TDelivered; onViewDetails: (saleId: string) => void }) {
	const { setNodeRef, isOver } = useDroppable({ id: DELIVERED_STATUS });
	const meta = ATTENDANCE_COLUMN_META[DELIVERED_STATUS];
	const cards = delivered.cards;
	// O teto do SQL e invisivel para o operador; o que ele precisa saber e quantos ficaram de fora.
	const hiddenCount = Math.max(0, delivered.total - cards.length);

	return (
		<section
			ref={setNodeRef}
			aria-label={`${meta.label}, concluídos nas últimas ${delivered.windowHours} horas`}
			className="flex h-full min-h-0 shrink-0 snap-start flex-col gap-2 border-l border-border pl-3"
			style={{ width: 252 }}
		>
			<div className="flex shrink-0 items-baseline gap-1.5 px-1.5">
				<CircleCheck className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" />
				<span className="truncate text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Concluídos</span>
				<span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">últimas {delivered.windowHours}h</span>
			</div>

			<div
				className={cn(
					"flex min-h-0 grow flex-col rounded-xl border p-1 transition-colors",
					isOver ? "border-solid border-primary bg-primary/10" : "border-transparent bg-secondary/40",
				)}
			>
				{isOver ? (
					<div className="flex grow items-center justify-center px-3 text-center text-[11px] font-extrabold uppercase tracking-wide text-primary">
						Concluir pedido
					</div>
				) : cards.length === 0 ? (
					<div className="flex grow items-center justify-center px-3 py-8 text-center text-[11px] text-muted-foreground/60">
						Nada concluído nas últimas {delivered.windowHours}h.
					</div>
				) : (
					<div className="scrollbar-subtle flex min-h-0 grow flex-col divide-y divide-border/50 overflow-y-auto">
						{cards.map((card) => (
							<DeliveredRow key={card.id} card={card} onViewDetails={onViewDetails} />
						))}
					</div>
				)}
			</div>

			<div className="flex shrink-0 items-center gap-1.5 px-1.5 pb-0.5 text-[10px] text-muted-foreground">
				{hiddenCount > 0 ? <span className="truncate">{`+${hiddenCount} concluído(s) na janela`}</span> : null}
				<Link
					href={appRoutes.sales.root()}
					className="ml-auto inline-flex shrink-0 items-center gap-0.5 font-bold text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 rounded-sm"
				>
					Ver em Vendas
					<ArrowUpRight className="h-3 w-3" />
				</Link>
			</div>
		</section>
	);
}

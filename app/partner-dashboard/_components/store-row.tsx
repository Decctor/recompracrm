"use client";

import type { TGetPlatformPartnerDashboardOutput } from "@/app/api/platform-partner/dashboard/route";
import { formatPartnerDate, getLocalDaysUntil } from "@/lib/platform-partnerships/earnings";
import { PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS } from "@/lib/platform-partnerships/constants";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Initials, Money } from "./partner-ui";

export type TPartnerStoreSummary = TGetPlatformPartnerDashboardOutput["data"]["lojas"][number];

/** Frase curta de situação da loja, com o tom que a acompanha. */
export function describeStore(
	store: TPartnerStoreSummary,
	now = new Date(),
): { text: string; tone: "bonus" | "muted" | "info" | "warning" | "danger" } {
	const next = store.proximaMensalidade;
	switch (store.situacao) {
		case "EM_TESTE":
			return { text: store.testeFim ? `Em teste até ${formatPartnerDate(store.testeFim, { short: true })}` : "Em teste", tone: "info" };
		case "EM_ATRASO":
			return { text: "Fatura em atraso", tone: "warning" };
		case "CANCELADA":
			return { text: "Assinatura cancelada", tone: "danger" };
		case "EXCLUIDA":
			return { text: "Loja excluída", tone: "muted" };
		case "SEM_ASSINATURA":
			return { text: "Ainda sem assinatura", tone: "muted" };
		default:
			break;
	}
	if (store.periodicidade === "ANUAL")
		return { text: `Plano anual · ${store.faturasPagas} ${store.faturasPagas === 1 ? "fatura" : "faturas"}`, tone: "muted" };
	if (next?.dataFatura && next.percentualComissaoBps === PLATFORM_PARTNER_MONTHLY_FIRST_INVOICE_BPS && next.numero > 1) {
		const days = getLocalDaysUntil(next.dataFatura, now);
		return {
			text: days > 0 ? `${next.numero}ª mensalidade em ${days} ${days === 1 ? "dia" : "dias"}` : `${next.numero}ª mensalidade prevista`,
			tone: "bonus",
		};
	}
	return { text: `Recorrente · ${store.faturasPagas} ${store.faturasPagas === 1 ? "fatura" : "faturas"}`, tone: "muted" };
}

const NOTE_TONES = {
	bonus: "text-warning-surface-foreground",
	muted: "text-muted-foreground",
	info: "text-primary",
	warning: "text-warning-surface-foreground",
	danger: "text-destructive-surface-foreground",
};

/**
 * As quatro primeiras mensalidades em miniatura: ouro para as de 100%, azul para as de 20%,
 * tracejado para a próxima e cinza para o resto. É a mesma leitura da trilha do detalhe.
 */
export function StoreSegments({ store }: { store: TPartnerStoreSummary }) {
	const count = 4;
	return (
		<div className="flex gap-[3px]" aria-hidden>
			{Array.from({ length: count }, (_, index) => {
				const numero = index + 1;
				const paid = numero <= store.faturasPagas;
				const isNext = store.proximaMensalidade?.numero === numero;
				const bonus = store.periodicidade !== "ANUAL" && (numero === 1 || numero === 3);
				return (
					<span
						key={numero}
						className={cn(
							"h-1.5 w-[18px] rounded-full",
							paid && (bonus ? "bg-warning" : "bg-primary"),
							!paid && isNext && store.proximaMensalidade?.situacao === "EM_ATRASO" && "border-[1.5px] border-warning bg-warning-surface",
							!paid && isNext && store.proximaMensalidade?.situacao === "PROXIMA" && "border-[1.5px] border-dashed border-chart-3",
							!paid && !isNext && "bg-border",
						)}
					/>
				);
			})}
		</div>
	);
}

export function StoreRow({ store, first }: { store: TPartnerStoreSummary; first?: boolean }) {
	const note = describeStore(store);
	return (
		<Link
			href={`/partner-dashboard/stores/${store.id}`}
			className={cn("flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/60", !first && "border-t border-border")}
		>
			<Initials>{store.iniciais}</Initials>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<div className="flex justify-between gap-2">
					<span className="truncate text-sm font-bold">{store.nome}</span>
					<span className="text-sm font-extrabold whitespace-nowrap">
						<Money centavos={store.valorGanhoCentavos} />
					</span>
				</div>
				<div className="flex items-center gap-2">
					<StoreSegments store={store} />
					<span className={cn("truncate text-xs font-semibold", NOTE_TONES[note.tone])}>{note.text}</span>
				</div>
			</div>
			<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
		</Link>
	);
}

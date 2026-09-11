import { SessionMetaRow } from "@/components/Modals/Internal/SalesSessions/Blocks/SessionMetaRow";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { MONEY_TOLERANCE, sumMoney, type TSessionMethodComposition, type TSessionMovement } from "@/lib/sales-sessions/session-method-lines";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { ChevronDown } from "lucide-react";

type SessionCompositionRowProps = {
	label: string;
	value: number;
	movimentos: TSessionMovement[];
	/** Exibida apenas quando os movimentos listados não explicam o total sozinhos. */
	footnote?: string;
};

/**
 * Linha da composição. Vira um disclosure quando há movimentos individuais por trás do total;
 * caso contrário fica igual às demais linhas, sem prometer um detalhe que não existe.
 */
function SessionCompositionRow({ label, value, movimentos, footnote }: SessionCompositionRowProps) {
	if (movimentos.length === 0) return <SessionMetaRow label={label} value={formatToMoney(value)} />;
	const listado = sumMoney(movimentos.map((movimento) => movimento.valor));
	return (
		<Collapsible>
			<CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-md text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
				<span className="flex items-center gap-1 text-muted-foreground transition-colors group-hover:text-foreground">
					{label}
					<ChevronDown className="h-3 w-3 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
				</span>
				<span className="font-semibold tabular-nums">{formatToMoney(value)}</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mt-1.5 flex flex-col rounded-lg bg-background/70 px-2.5 py-1">
					{movimentos.map((movimento) => (
						<div
							key={movimento.id}
							className="flex items-start justify-between gap-3 py-1.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/50"
						>
							<div className="flex min-w-0 flex-col gap-0.5">
								<span className="truncate font-medium text-xs">{movimento.titulo}</span>
								{movimento.observacoes ? <span className="text-[11px] leading-snug text-foreground/75">{movimento.observacoes}</span> : null}
								<span className="text-[11px] text-muted-foreground">
									{formatDateAsLocale(movimento.data, true)}
									{movimento.autorNome ? ` · ${movimento.autorNome}` : ""}
								</span>
							</div>
							<span className="shrink-0 font-semibold text-xs tabular-nums">{formatToMoney(movimento.valor)}</span>
						</div>
					))}
					{footnote && Math.abs(listado - value) > MONEY_TOLERANCE ? <p className="py-1.5 text-[11px] text-muted-foreground">{footnote}</p> : null}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

type SessionDrawerCompositionProps = {
	composicao: TSessionMethodComposition;
	metodo: TPaymentMethodEnum;
	movimentos: TSessionMovement[];
};

/** Como o esperado da gaveta se formou: fundo + entradas − troco − outras saídas. */
export function SessionDrawerComposition({ composicao, metodo, movimentos }: SessionDrawerCompositionProps) {
	const doMetodo = movimentos.filter((movimento) => movimento.metodo === metodo);
	const entradas = doMetodo.filter((movimento) => movimento.tipo === "ENTRADA");
	const saidas = doMetodo.filter((movimento) => movimento.tipo === "SAIDA");
	return (
		<div className="flex flex-col gap-2 py-2">
			<SessionMetaRow label="Fundo de troco na abertura" value={formatToMoney(composicao.saldoInicial)} />
			<SessionCompositionRow
				label="(+) Entradas em dinheiro"
				value={composicao.entradas}
				movimentos={entradas}
				footnote="O restante vem dos recebimentos em dinheiro das vendas do turno."
			/>
			<SessionMetaRow label="(−) Troco entregue" value={formatToMoney(composicao.troco)} />
			<SessionCompositionRow label="(−) Outras saídas" value={composicao.outrasSaidas} movimentos={saidas} />
			<p className="text-xs text-muted-foreground">Entradas incluem suprimentos. Outras saídas incluem sangrias e estornos.</p>
		</div>
	);
}

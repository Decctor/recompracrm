import { formatSessionDifference, sessionDifferenceClass } from "@/components/Modals/Internal/SalesSessions/Blocks/session-difference";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatToMoney } from "@/lib/formatting";
import { hasNonSaleDrawerMovement, type TDrawerMovementKind } from "@/lib/sales-sessions/drawer-movements";
import {
	sumMoney,
	sumSessionComposition,
	type TSessionCashSaleReceipt,
	type TSessionMethodComposition,
	type TSessionMovement,
} from "@/lib/sales-sessions/session-method-lines";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

type Sign = "+" | "−";

// Uma sangria feita até 2 minutos antes do fechamento é a retirada do turno, não um pagamento no meio dele.
const CLOSING_WITHDRAWAL_WINDOW_MS = 2 * 60 * 1000;

function formatTime(value: string | Date | null | undefined) {
	return value ? dayjs(value).format("HH:mm") : "—";
}

function SignedMoney({ sign, value, className }: { sign?: Sign; value: number; className?: string }) {
	return (
		<span className={cn("shrink-0 font-semibold tabular-nums", className)}>
			{sign ? `${sign} ` : ""}
			{formatToMoney(value)}
		</span>
	);
}

type LedgerRowProps = {
	sign?: Sign;
	label: string;
	count?: number;
	value: number;
	hint?: string;
	children?: ReactNode;
};

/** Linha do extrato. Abre o detalhe quando há itens por trás do total; sem itens, é uma linha simples. */
function LedgerRow({ sign, label, count, value, hint, children }: LedgerRowProps) {
	const labelNode = (
		<span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
			<span className="flex items-center gap-1.5 text-xs">
				<span className="w-3 shrink-0 text-center font-bold text-muted-foreground" aria-hidden>
					{sign ?? ""}
				</span>
				<span className="text-foreground/90">{label}</span>
				{count !== undefined ? (
					<span className="rounded-full bg-background px-1.5 font-semibold text-[10px] text-muted-foreground tabular-nums">{count}</span>
				) : null}
				{children ? (
					<ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
				) : null}
			</span>
			{hint ? <span className="pl-[18px] text-[11px] text-muted-foreground">{hint}</span> : null}
		</span>
	);
	const valueNode = <SignedMoney sign={sign} value={value} className="text-xs" />;
	if (!children) {
		return (
			<div className="flex items-start justify-between gap-3 px-3 py-1.5">
				{labelNode}
				{valueNode}
			</div>
		);
	}
	return (
		<Collapsible>
			<CollapsibleTrigger className="group flex w-full items-start justify-between gap-3 px-3 py-1.5 outline-none transition-colors hover:bg-background/50 focus-visible:bg-background/60">
				{labelNode}
				{valueNode}
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="mx-3 mb-1.5 flex flex-col rounded-lg bg-background/80 px-2.5 py-1 sm:ml-[30px]">{children}</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

function SubtotalRow({ label, value, hint, strong }: { label: string; value: number; hint?: string; strong?: boolean }) {
	return (
		<div className={cn("flex items-start justify-between gap-3 border-y border-border/60 px-3 py-2", strong ? "bg-background" : "bg-background/40")}>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className={cn("flex items-center gap-1.5", strong ? "font-bold text-sm" : "font-semibold text-xs")}>
					<span className="w-3 shrink-0 text-center text-muted-foreground" aria-hidden>
						=
					</span>
					{label}
				</span>
				{hint ? <span className="pl-[18px] text-[11px] text-muted-foreground">{hint}</span> : null}
			</span>
			<SignedMoney value={value} className={strong ? "font-black text-sm" : "text-xs"} />
		</div>
	);
}

function DetailItem({ title, meta, value, extra }: { title: string; meta: string; value: number; extra?: ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-3 py-1.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/50">
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate font-medium text-xs">{title}</span>
				<span className="text-[11px] text-muted-foreground">{meta}</span>
				{extra}
			</div>
			<span className="shrink-0 font-semibold text-xs tabular-nums">{formatToMoney(value)}</span>
		</div>
	);
}

const MISSING_ACCOUNT_LABEL: Partial<Record<TDrawerMovementKind, string>> = {
	SANGRIA: "Sem conta de destino",
	SUPRIMENTO: "Sem conta de origem",
	DESPESA: "Sem conta financeira",
};

/** Para onde foi (ou de onde veio) o dinheiro de um movimento, ou o aviso de que isso não ficou registrado. */
function CounterpartTag({ movimento }: { movimento: TSessionMovement }) {
	if (movimento.contrapartida) {
		const Icon = movimento.natureza === "SUPRIMENTO" ? ArrowLeft : ArrowRight;
		return (
			<span className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
				<Icon className="h-2.5 w-2.5" aria-hidden />
				{movimento.contrapartida.nome}
			</span>
		);
	}
	const missing = movimento.contaFinanceiraId === null ? MISSING_ACCOUNT_LABEL[movimento.natureza] : undefined;
	if (!missing) return null;
	return (
		<span className="inline-flex w-fit items-center gap-1 rounded-full bg-warning-surface px-1.5 py-0.5 font-medium text-[10px] text-warning-surface-foreground">
			<AlertTriangle className="h-2.5 w-2.5" aria-hidden />
			{missing}
		</span>
	);
}

function capitalize(value: string) {
	const trimmed = value.trim();
	return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function MovementItems({ movimentos, fechamento }: { movimentos: TSessionMovement[]; fechamento?: string | Date | null }) {
	const closedAt = fechamento ? new Date(fechamento).getTime() : null;
	return movimentos.map((movimento) => {
		const at = movimento.data ? new Date(movimento.data).getTime() : null;
		const atClosing =
			movimento.natureza === "SANGRIA" && closedAt !== null && at !== null && closedAt - at >= 0 && closedAt - at <= CLOSING_WITHDRAWAL_WINDOW_MS;
		return (
			<DetailItem
				key={movimento.id}
				title={movimento.observacoes ? capitalize(movimento.observacoes) : movimento.titulo}
				meta={[formatTime(movimento.data), movimento.autorNome, atClosing ? "no fechamento" : null].filter(Boolean).join(" · ")}
				value={movimento.valor}
				extra={<CounterpartTag movimento={movimento} />}
			/>
		);
	});
}

export type SessionDrawerLedgerProps = {
	composicao: TSessionMethodComposition;
	/** Movimentos da sessão (todos os métodos); o extrato usa só os do método da gaveta. */
	movimentos: TSessionMovement[];
	recebimentos: TSessionCashSaleReceipt[];
	mode: "aberto" | "detalhe" | "fechamento";
	fechamento?: string | Date | null;
	contado?: number | null;
	diferenca?: number | null;
	/** No fechamento, o campo de contagem entra no lugar do contado. */
	countSlot?: ReactNode;
};

/**
 * Extrato da gaveta: fundo → vendas → troco → (= ficou das vendas) → suprimentos, sangrias,
 * despesas, estornos → (= esperado) → contado → diferença.
 *
 * O subtotal "ficou das vendas" é o mesmo número que o "Ficou" do Dinheiro em Resultados ›
 * Operacional: é a ponte entre as duas telas, que medem coisas diferentes (vendas × gaveta).
 */
export function SessionDrawerLedger({
	composicao,
	movimentos,
	recebimentos,
	mode,
	fechamento,
	contado = null,
	diferenca = null,
	countSlot,
}: SessionDrawerLedgerProps) {
	const { detalhamento } = composicao;
	const doMetodo = movimentos.filter((movimento) => movimento.metodo === "DINHEIRO");
	const byKind = (natureza: TDrawerMovementKind) => doMetodo.filter((movimento) => movimento.natureza === natureza);
	const recebimentosSemVenda = byKind("VENDA");
	const comTroco = recebimentos.filter((recebimento) => recebimento.troco > 0);
	const trocoDeOutrosMetodos = sumMoney(comTroco.map((recebimento) => Math.max(0, recebimento.troco - recebimento.recebido)));
	const ficouVendas = sumMoney([detalhamento.vendas, -detalhamento.troco]);
	const esperado = sumSessionComposition(composicao);
	const temMovimentosForaDeVendas = hasNonSaleDrawerMovement(detalhamento);

	const manualRows: { natureza: TDrawerMovementKind; sign: Sign; label: string; value: number }[] = [
		{ natureza: "SUPRIMENTO", sign: "+", label: "Suprimentos", value: detalhamento.suprimentos },
		{ natureza: "DEMAIS_ENTRADAS", sign: "+", label: "Outras entradas", value: detalhamento.demaisEntradas },
		{ natureza: "SANGRIA", sign: "−", label: "Sangrias", value: detalhamento.sangrias },
		{ natureza: "DESPESA", sign: "−", label: "Despesas pagas com o caixa", value: detalhamento.despesas },
		{ natureza: "ESTORNO", sign: "−", label: "Estornos em dinheiro", value: detalhamento.estornos },
		{ natureza: "DEMAIS_SAIDAS", sign: "−", label: "Outras saídas", value: detalhamento.demaisSaidas },
	];

	return (
		<div className="flex flex-col overflow-hidden rounded-xl bg-muted/50">
			<div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
				<span className="font-bold text-sm">Dinheiro</span>
				<span className="text-[11px] text-muted-foreground">{mode === "aberto" ? "ATÉ AGORA" : "EXTRATO DA GAVETA"}</span>
			</div>

			<div className="flex flex-col py-1">
				<LedgerRow label="Fundo de troco na abertura" value={composicao.saldoInicial} />
				<LedgerRow sign="+" label="Vendas recebidas em dinheiro" count={recebimentos.length + recebimentosSemVenda.length} value={detalhamento.vendas}>
					{recebimentos.length + recebimentosSemVenda.length > 0 ? (
						<>
							{recebimentos.map((recebimento) => (
								<DetailItem
									key={recebimento.vendaId}
									title={recebimento.clienteNome || "AO CONSUMIDOR"}
									meta={
										recebimento.troco > 0 && recebimento.recebido > 0
											? `${formatTime(recebimento.data)} · venda de ${formatToMoney(recebimento.valorVenda)}, pagou ${formatToMoney(recebimento.recebido)}`
											: formatTime(recebimento.data)
									}
									value={recebimento.recebido}
								/>
							))}
							<MovementItems movimentos={recebimentosSemVenda} />
						</>
					) : null}
				</LedgerRow>
				{detalhamento.troco > 0 ? (
					<LedgerRow
						sign="−"
						label="Troco entregue"
						count={comTroco.length}
						value={detalhamento.troco}
						hint={trocoDeOutrosMetodos > 0 ? `inclui ${formatToMoney(trocoDeOutrosMetodos)} de vendas pagas em outro método` : undefined}
					>
						{comTroco.length > 0
							? comTroco.map((recebimento) => (
									<DetailItem
										key={recebimento.vendaId}
										title={recebimento.clienteNome || "AO CONSUMIDOR"}
										meta={
											recebimento.recebido > 0
												? `${formatTime(recebimento.data)} · pagou ${formatToMoney(recebimento.recebido)}`
												: `${formatTime(recebimento.data)} · paga em outro método`
										}
										value={recebimento.troco}
									/>
								))
							: null}
					</LedgerRow>
				) : null}
			</div>

			{temMovimentosForaDeVendas ? (
				<>
					<SubtotalRow label="Ficou das vendas" value={ficouVendas} hint="É o “Ficou” do Dinheiro em Resultados › Operacional." />
					<div className="flex flex-col py-1">
						{manualRows
							.filter((row) => row.value !== 0)
							.map((row) => {
								const itens = byKind(row.natureza);
								return (
									<LedgerRow key={row.natureza} sign={row.sign} label={row.label} count={itens.length} value={row.value}>
										{itens.length > 0 ? <MovementItems movimentos={itens} fechamento={fechamento} /> : null}
									</LedgerRow>
								);
							})}
					</div>
				</>
			) : null}

			<SubtotalRow strong label={mode === "aberto" ? "Esperado na gaveta agora" : "Esperado na gaveta"} value={esperado} />

			{mode === "aberto" ? (
				<p className="px-3 py-2.5 text-[11px] text-muted-foreground">A contagem física é feita no fechamento do caixa.</p>
			) : countSlot ? (
				<div className="flex flex-col gap-2 px-3 py-3">{countSlot}</div>
			) : contado !== null ? (
				<div className="flex flex-col gap-1 px-3 py-2.5">
					<div className="flex items-center justify-between text-xs">
						<span className="pl-[18px] text-muted-foreground">Contado</span>
						<SignedMoney value={contado} className="text-xs" />
					</div>
					{diferenca !== null ? <SessionDifferenceRow diferenca={diferenca} /> : null}
				</div>
			) : (
				<p className="px-3 py-2.5 text-[11px] text-muted-foreground">Contagem física registrada apenas no fechamento do caixa.</p>
			)}
		</div>
	);
}

export function SessionDifferenceRow({ diferenca }: { diferenca: number }) {
	return (
		<div className="flex items-center justify-between text-sm" aria-live="polite">
			<span className="pl-[18px] font-bold">{diferenca === 0 ? "Sem diferença" : diferenca > 0 ? "Sobra" : "Falta"}</span>
			<span className={cn("font-black tabular-nums", sessionDifferenceClass(diferenca))}>{formatSessionDifference(diferenca)}</span>
		</div>
	);
}

/**
 * Sangrias e suprimentos antigos foram gravados sem conta financeira: a gaveta fecha, mas o
 * Financeiro não acompanha. Aviso único, para quem confere entender a diferença de saldo.
 */
export function SessionMissingAccountNotice({ movimentos }: { movimentos: TSessionMovement[] }) {
	const semConta = movimentos.filter(
		(movimento) =>
			movimento.metodo === "DINHEIRO" && movimento.contaFinanceiraId === null && !movimento.contrapartida && MISSING_ACCOUNT_LABEL[movimento.natureza],
	);
	if (semConta.length === 0) return null;
	const entradas = sumMoney(semConta.filter((movimento) => movimento.tipo === "ENTRADA").map((movimento) => movimento.valor));
	const saidas = sumMoney(semConta.filter((movimento) => movimento.tipo !== "ENTRADA").map((movimento) => movimento.valor));
	const desvio = sumMoney([saidas, -entradas]);
	return (
		<div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-surface p-3">
			<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-surface-foreground" aria-hidden />
			<p className="text-xs leading-relaxed text-foreground/80">
				<span className="font-semibold">
					{semConta.length} {semConta.length === 1 ? "movimento foi registrado" : "movimentos foram registrados"} sem conta financeira.
				</span>{" "}
				A gaveta fecha, mas o Financeiro não sabe de onde veio nem para onde foi esse dinheiro
				{desvio !== 0
					? `: o saldo da conta do caixa fica ${formatToMoney(Math.abs(desvio))} ${desvio > 0 ? "acima" : "abaixo"} do que está na gaveta`
					: ""}
				.
			</p>
		</div>
	);
}

"use client";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { HoverOrPopover } from "@/components/ui/hover-or-popover";
import { formatCashbackValue, formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { ArrowUpRight, Gift, History, TrendingDown, TrendingUp, Undo2, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { createContext, use, type ReactElement, type ReactNode } from "react";

/**
 * Linha de transação de cashback, em partes compostas.
 *
 * A mesma transação aparece em lugares com necessidades diferentes: o bloco de saldo do cliente
 * (mobile, compacto, sem nome do cliente), a lista de transações do programa (com cliente, operador
 * e prêmio) e o histórico do ponto de interação. Em vez de um componente com booleanos para cada
 * caso, o Provider resolve a apresentação (tom, ícone, sinal, ciclo de vida) uma vez, e cada tela
 * compõe só as partes que precisa. As variantes explícitas no fim do arquivo são as composições
 * de referência.
 *
 * Duas decisões de desenho valem para todas as composições:
 * - A linha é uma linha, não um card: ela já vive dentro de um card (o bloco do cliente, a seção
 *   da lista), e card dentro de card só rouba espaço. `List` separa as linhas por fio.
 * - O sinal vem do próprio `valor`, que é persistido com sinal (expiração e estorno são
 *   negativos). Derivar do `tipo` era o que fazia uma expiração aparecer como "+ R$ 14,50".
 */

export type TCashbackTransactionCardData = {
	id: string;
	tipo: "ACÚMULO" | "RESGATE" | "EXPIRAÇÃO" | "CANCELAMENTO";
	status: "ATIVO" | "CONSUMIDO" | "EXPIRADO";
	valor: number;
	dataInsercao: Date | string;
	expiracaoData: Date | string | null;
	saldoValorPosterior?: number;
	cliente?: { id: string; nome: string } | null;
	operadorVendedor?: { id: string; nome: string } | null;
	resgateRecompensa?: { id: string; titulo: string; imagemCapaUrl: string | null } | null;
	venda?: {
		id: string;
		valorTotal: number;
		canal: string | null;
		vendedor?: { id: string; nome: string } | null;
	} | null;
};

/** Tom visual do tipo. Só existe em código, então fica em inglês. */
type TTone = "positive" | "redeem" | "loss" | "neutral";

/**
 * Ciclo de vida de um acúmulo. `expires` é o estado normal; `expired` e `consumed` são finais e
 * mudam a leitura do valor (ele não está mais no saldo).
 */
type TLifecycle = "none" | "expires" | "expired" | "consumed";

const TONE_BY_TYPE: Record<TCashbackTransactionCardData["tipo"], TTone> = {
	ACÚMULO: "positive",
	RESGATE: "redeem",
	EXPIRAÇÃO: "loss",
	CANCELAMENTO: "neutral",
};

const TYPE_LABEL: Record<TCashbackTransactionCardData["tipo"], string> = {
	ACÚMULO: "Acúmulo",
	RESGATE: "Resgate",
	EXPIRAÇÃO: "Expiração",
	CANCELAMENTO: "Estorno",
};

// Paleta fechada do DESIGN.md: sucesso para o ganho, azul primário para o resgate, destrutivo
// suave para a perda e neutro para o estorno. Cor só nos estados vivos; o que já liquidou é cinza.
const TONE_SURFACE: Record<TTone, string> = {
	positive: "border-success/20 bg-success/10 text-success-strong",
	redeem: "border-primary/20 bg-primary/10 text-primary",
	loss: "border-destructive/20 bg-destructive/10 text-destructive",
	neutral: "border-border bg-muted text-muted-foreground",
};

const TONE_TEXT: Record<TTone, string> = {
	positive: "text-success-strong",
	redeem: "text-primary",
	loss: "text-destructive",
	neutral: "text-muted-foreground",
};

const TONE_ICON: Record<TTone, React.ElementType> = {
	positive: TrendingUp,
	redeem: TrendingDown,
	loss: History,
	neutral: Undo2,
};

type TPresentation = {
	tone: TTone;
	lifecycle: TLifecycle;
	/** Um acúmulo que já saiu do saldo (expirou ou foi todo usado). */
	isSettled: boolean;
	sign: "+" | "−";
	amount: string;
	typeLabel: string;
	dataInsercao: Date;
	expiracaoData: Date | null;
};

function resolvePresentation(transaction: TCashbackTransactionCardData, terminology: TCashbackProgramTerminologyEnum): TPresentation {
	const expiracaoData = transaction.expiracaoData ? new Date(transaction.expiracaoData) : null;
	const lifecycle: TLifecycle =
		transaction.tipo !== "ACÚMULO"
			? "none"
			: transaction.status === "EXPIRADO"
				? "expired"
				: transaction.status === "CONSUMIDO"
					? "consumed"
					: expiracaoData
						? "expires"
						: "none";
	return {
		tone: TONE_BY_TYPE[transaction.tipo],
		lifecycle,
		isSettled: lifecycle === "expired" || lifecycle === "consumed",
		sign: transaction.valor < 0 ? "−" : "+",
		amount: formatCashbackValue(Math.abs(transaction.valor), terminology),
		typeLabel: TYPE_LABEL[transaction.tipo],
		dataInsercao: new Date(transaction.dataInsercao),
		expiracaoData,
	};
}

type TCashbackTransactionContext = {
	transaction: TCashbackTransactionCardData;
	terminology: TCashbackProgramTerminologyEnum;
	presentation: TPresentation;
};

const CashbackTransactionContext = createContext<TCashbackTransactionContext | null>(null);

/** `Details` liga isto para a `Row` virar um alvo de teclado e toque; sem `Details`, a linha é só leitura. */
const InteractiveContext = createContext(false);

function useCashbackTransaction() {
	const context = use(CashbackTransactionContext);
	if (!context) throw new Error("CashbackTransaction.* precisa estar dentro de CashbackTransaction.Provider.");
	return context;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

type ProviderProps = {
	transaction: TCashbackTransactionCardData;
	terminology: TCashbackProgramTerminologyEnum;
	children: ReactNode;
};

function Provider({ transaction, terminology, children }: ProviderProps) {
	const presentation = resolvePresentation(transaction, terminology);
	return <CashbackTransactionContext value={{ transaction, terminology, presentation }}>{children}</CashbackTransactionContext>;
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

/** Pilha de linhas separadas por fio. É o container esperado por `Row`. */
function List({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="cashback-transaction-list" className={cn("flex flex-col divide-y divide-border/70", className)} {...props} />;
}

/**
 * A linha. Expõe `data-tone` e `data-lifecycle` para o consumidor estilizar por estado sem props
 * novas. Um acúmulo já liquidado fica esmaecido. Dentro de `Details` ganha papel de botão,
 * foco visível e o lavado de hover; fora, é só leitura.
 */
function Row({ className, ...props }: React.ComponentProps<"div">) {
	const { presentation } = useCashbackTransaction();
	const interactive = use(InteractiveContext);
	return (
		<div
			data-slot="cashback-transaction"
			data-tone={presentation.tone}
			data-lifecycle={presentation.lifecycle}
			role={interactive ? "button" : undefined}
			tabIndex={interactive ? 0 : undefined}
			className={cn(
				"group/transaction flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150",
				"data-[lifecycle=expired]:opacity-80",
				interactive && "cursor-pointer outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-muted/60",
				className,
			)}
			{...props}
		/>
	);
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

const ICON_SIZE = {
	sm: { box: "size-8", glyph: "size-4" },
	md: { box: "size-10", glyph: "size-5" },
} as const;

/** Glifo do tipo; um resgate de prêmio com imagem mostra a imagem do prêmio no lugar do glifo. */
function Icon({ size = "sm", className }: { size?: keyof typeof ICON_SIZE; className?: string }) {
	const { transaction, presentation } = useCashbackTransaction();
	const Glyph = transaction.tipo === "RESGATE" && transaction.resgateRecompensa ? Gift : TONE_ICON[presentation.tone];
	const prizeImage = transaction.tipo === "RESGATE" ? transaction.resgateRecompensa?.imagemCapaUrl : null;
	return (
		<span
			aria-hidden
			className={cn(
				"relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border",
				ICON_SIZE[size].box,
				presentation.isSettled ? "border-border bg-muted text-muted-foreground" : TONE_SURFACE[presentation.tone],
				className,
			)}
		>
			{prizeImage ? <Image src={prizeImage} alt="" fill className="object-cover" /> : <Glyph className={ICON_SIZE[size].glyph} />}
		</span>
	);
}

function Body({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex min-w-0 flex-1 flex-col gap-1", className)} {...props} />;
}

/** Primeira linha do corpo: tipo, título e o que mais couber, lado a lado. */
function Header({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1", className)} {...props} />;
}

/** Chip do tipo (ACÚMULO, RESGATE…). Um acúmulo liquidado perde a cor: o estado vem em `Status`. */
function Type({ className }: { className?: string }) {
	const { presentation } = useCashbackTransaction();
	return (
		<Chip.Root
			size="xs"
			shape="pill"
			variant="outline"
			className={cn(
				"border px-2 py-0.5 tracking-wide",
				presentation.isSettled ? "border-border bg-muted text-muted-foreground" : TONE_SURFACE[presentation.tone],
				className,
			)}
		>
			<Chip.Label caps weight="bold">
				{presentation.typeLabel}
			</Chip.Label>
		</Chip.Root>
	);
}

/** O tipo como texto corrido (para composições sem chip). */
function TypeLabel({ className }: { className?: string }) {
	const { presentation } = useCashbackTransaction();
	return (
		<span className={cn("text-sm font-semibold leading-tight", presentation.isSettled ? "text-muted-foreground" : "text-foreground", className)}>
			{presentation.typeLabel}
		</span>
	);
}

function Title({ className, children }: { className?: string; children: ReactNode }) {
	return <span className={cn("truncate text-sm font-semibold leading-tight text-foreground", className)}>{children}</span>;
}

/**
 * Linha de metadados: micro (11px, 600) esmaecido. O separador "·" nasce por CSS entre irmãos
 * renderizados, então uma parte que devolve `null` (prazo de um resgate) não deixa ponto sobrando.
 */
function Meta({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0 text-[11px] font-medium leading-tight text-muted-foreground tabular-nums",
				"[&>*+*]:before:mr-1.5 [&>*+*]:before:text-muted-foreground/50 [&>*+*]:before:content-['·']",
				className,
			)}
			{...props}
		/>
	);
}

function MetaDate({ format = "datetime", className }: { format?: "date" | "datetime"; className?: string }) {
	const { presentation } = useCashbackTransaction();
	return <span className={cn("shrink-0", className)}>{formatDateAsLocale(presentation.dataInsercao, format === "datetime")}</span>;
}

function Operator({ className }: { className?: string }) {
	const { transaction } = useCashbackTransaction();
	return (
		<span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
			<UserRound aria-hidden className="size-3 shrink-0" />
			<span className="truncate">{transaction.operadorVendedor?.nome ?? "Sistema"}</span>
		</span>
	);
}

/**
 * Situação do acúmulo, em texto: "Expira dd/mm" enquanto vale, "Expirou dd/mm" depois, "Utilizado"
 * quando foi todo consumido em resgates. É o único portador do estado na linha (não há segundo
 * chip), por isso o expirado fala em destrutivo. Os outros tipos não têm situação e não renderizam.
 */
function Status({ format = "date", className }: { format?: "date" | "datetime"; className?: string }) {
	const { presentation } = useCashbackTransaction();
	const { lifecycle, expiracaoData } = presentation;
	if (lifecycle === "none") return null;
	const base = "shrink-0 text-[11px] font-medium leading-tight tabular-nums";
	if (lifecycle === "consumed") return <span className={cn(base, "text-muted-foreground", className)}>Utilizado</span>;
	if (!expiracaoData) return null;
	const date = formatDateAsLocale(expiracaoData, format === "datetime");
	if (lifecycle === "expired") return <span className={cn(base, "text-destructive", className)}>Expirou {date}</span>;
	return <span className={cn(base, "text-muted-foreground", className)}>Expira {date}</span>;
}

const AMOUNT_SIZE = {
	sm: "text-sm",
	md: "text-base",
} as const;

/** Valor com sinal. Um acúmulo liquidado fica esmaecido e riscado: ele não conta mais no saldo. */
function Amount({ size = "sm", className }: { size?: keyof typeof AMOUNT_SIZE; className?: string }) {
	const { presentation } = useCashbackTransaction();
	return (
		<span
			className={cn(
				"shrink-0 font-bold tabular-nums leading-none",
				AMOUNT_SIZE[size],
				presentation.isSettled ? "text-muted-foreground line-through decoration-muted-foreground/50" : TONE_TEXT[presentation.tone],
				className,
			)}
		>
			{presentation.sign} {presentation.amount}
		</span>
	);
}

/** Coluna da direita: valor em cima, o que vier abaixo (prazo, saldo). */
function Trailing({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("flex shrink-0 flex-col items-end gap-1 text-right", className)} {...props} />;
}

function Balance({ className }: { className?: string }) {
	const { transaction, terminology } = useCashbackTransaction();
	if (transaction.saldoValorPosterior === undefined) return null;
	return (
		<span className={cn("text-[11px] font-medium leading-tight text-muted-foreground tabular-nums", className)}>
			Saldo {formatCashbackValue(transaction.saldoValorPosterior, terminology)}
		</span>
	);
}

// ---------------------------------------------------------------------------
// Details (hover no desktop, toque no mobile)
// ---------------------------------------------------------------------------

function DetailsRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="shrink-0 text-xs text-muted-foreground">{label}</span>
			<span className="min-w-0 truncate text-right text-xs font-medium">{children}</span>
		</div>
	);
}

/** Conteúdo do detalhe: cabeçalho da transação, os campos existentes e o atalho para a venda. */
function DetailsSheet() {
	const { transaction, presentation } = useCashbackTransaction();
	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex items-center gap-3">
				<Icon size="md" />
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="text-sm font-bold">{presentation.typeLabel}</span>
					<span className="text-xs text-muted-foreground">{formatDateAsLocale(presentation.dataInsercao, true)}</span>
				</div>
				<Amount />
			</div>
			<div className="flex w-full flex-col gap-1.5 border-t pt-3">
				{transaction.cliente ? <DetailsRow label="Cliente">{transaction.cliente.nome}</DetailsRow> : null}
				{transaction.operadorVendedor ? <DetailsRow label="Operador">{transaction.operadorVendedor.nome}</DetailsRow> : null}
				{presentation.lifecycle !== "none" ? (
					<DetailsRow label={presentation.lifecycle === "expired" ? "Expirou em" : presentation.lifecycle === "consumed" ? "Situação" : "Expira em"}>
						{presentation.lifecycle === "consumed"
							? "Utilizado em resgates"
							: presentation.expiracaoData
								? formatDateAsLocale(presentation.expiracaoData, true)
								: "Sem prazo"}
					</DetailsRow>
				) : null}
				{transaction.resgateRecompensa ? <DetailsRow label="Prêmio">{transaction.resgateRecompensa.titulo}</DetailsRow> : null}
				{transaction.venda ? (
					<>
						<DetailsRow label="Venda">#{transaction.venda.id.slice(0, 8)}</DetailsRow>
						<DetailsRow label="Valor da venda">{formatToMoney(transaction.venda.valorTotal)}</DetailsRow>
						{transaction.venda.canal ? <DetailsRow label="Canal">{transaction.venda.canal}</DetailsRow> : null}
						{transaction.venda.vendedor ? <DetailsRow label="Vendedor">{transaction.venda.vendedor.nome}</DetailsRow> : null}
					</>
				) : null}
			</div>
			{transaction.venda ? (
				<Button size="sm" variant="ghost" className="w-full" asChild>
					<Link href={appRoutes.sales.details(transaction.venda.id)}>
						Ver venda
						<ArrowUpRight />
					</Link>
				</Button>
			) : null}
		</div>
	);
}

/**
 * Envolve a linha com o detalhe: hover card em ponteiro fino, popover por toque no mobile (hover
 * não existe lá, e o detalhe era inalcançável). A linha filha vira o gatilho.
 */
function Details({ children }: { children: ReactElement }) {
	return (
		<InteractiveContext value>
			<HoverOrPopover trigger={children} nativeButton={false} align="start" className="w-80 max-w-[calc(100vw-2rem)] p-4" hoverOpenDelay={250}>
				<DetailsSheet />
			</HoverOrPopover>
		</InteractiveContext>
	);
}

export const CashbackTransaction = {
	Provider,
	List,
	Row,
	Icon,
	Body,
	Header,
	Type,
	TypeLabel,
	Title,
	Meta,
	Date: MetaDate,
	Operator,
	Status,
	Trailing,
	Amount,
	Balance,
	Details,
	DetailsSheet,
};

// ---------------------------------------------------------------------------
// Variantes explícitas
// ---------------------------------------------------------------------------

type VariantProps = {
	transaction: TCashbackTransactionCardData;
	terminology: TCashbackProgramTerminologyEnum;
};

/**
 * Bloco de saldo do cliente: a tela já é dele, então não repete o nome. Duas linhas sempre, em
 * duas colunas — à esquerda o que e quando (tipo, data), à direita quanto e a situação (valor,
 * "Expira", "Expirou", "Utilizado"). Um chip só: o estado é texto sob o valor, não um segundo pill.
 * Em 390px "data · prazo" numa linha só não cabe; dividir por coluna resolve sem quebra. A hora
 * fica no detalhe.
 */
export function ClientCashbackTransactionRow({ transaction, terminology }: VariantProps) {
	return (
		<CashbackTransaction.Provider transaction={transaction} terminology={terminology}>
			<CashbackTransaction.Details>
				{/* O bloco tem padding; a linha invade 8px dele para o lavado de hover alinhar com o título. */}
				<CashbackTransaction.Row className="-mx-2">
					<CashbackTransaction.Icon />
					<CashbackTransaction.Body>
						<CashbackTransaction.Header>
							<CashbackTransaction.Type />
						</CashbackTransaction.Header>
						<CashbackTransaction.Meta>
							<CashbackTransaction.Date format="date" />
						</CashbackTransaction.Meta>
					</CashbackTransaction.Body>
					<CashbackTransaction.Trailing>
						<CashbackTransaction.Amount />
						<CashbackTransaction.Status />
					</CashbackTransaction.Trailing>
				</CashbackTransaction.Row>
			</CashbackTransaction.Details>
		</CashbackTransaction.Provider>
	);
}

/**
 * Lista de transações do programa: quem, por quem, quando. O prêmio resgatado aparece no ícone;
 * a situação fica sob o valor, como no bloco do cliente, para as duas telas lerem igual.
 */
export function ProgramCashbackTransactionRow({ transaction, terminology }: VariantProps) {
	return (
		<CashbackTransaction.Provider transaction={transaction} terminology={terminology}>
			<CashbackTransaction.Details>
				<CashbackTransaction.Row className="py-3">
					<CashbackTransaction.Icon size="md" />
					<CashbackTransaction.Body>
						<CashbackTransaction.Header>
							<CashbackTransaction.Title>{transaction.cliente?.nome ?? "Cliente"}</CashbackTransaction.Title>
							<CashbackTransaction.Type />
						</CashbackTransaction.Header>
						<CashbackTransaction.Meta>
							<CashbackTransaction.Operator />
							<CashbackTransaction.Date />
						</CashbackTransaction.Meta>
					</CashbackTransaction.Body>
					<CashbackTransaction.Trailing>
						<CashbackTransaction.Amount />
						<CashbackTransaction.Status format="datetime" />
					</CashbackTransaction.Trailing>
				</CashbackTransaction.Row>
			</CashbackTransaction.Details>
		</CashbackTransaction.Provider>
	);
}

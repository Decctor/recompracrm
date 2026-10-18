import type { TGetProductStockTransactionsOutputDefault } from "@/app/api/products/stock-transactions/route";
import type { TStockMovementTypeEnum } from "@/schemas/enums";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import {
	ArrowDownRight,
	ArrowUpRight,
	Code,
	Factory,
	Hand,
	Layers,
	MoveRight,
	PackagePlus,
	RotateCcw,
	ShoppingBag,
	ShoppingCart,
	SlidersHorizontal,
	Trash2,
	UserRound,
} from "lucide-react";
import Image from "next/image";

type StockTransaction = TGetProductStockTransactionsOutputDefault["transactions"][number];

// Cada tipo carrega um rótulo humano, um ícone e o tom de superfície do chip.
// A direção (entrada/saída) vem do campo `direcao` derivado no backend a partir do saldo.
const MOVEMENT_TYPE_CONFIG: Record<TStockMovementTypeEnum, { label: string; icon: typeof ShoppingCart; chip: string }> = {
	ENTRADA_AQUISICAO: { label: "AQUISIÇÃO", icon: ShoppingCart, chip: "bg-primary/10 text-primary" },
	ENTRADA_DEVOLUCAO: { label: "DEVOLUÇÃO", icon: RotateCcw, chip: "bg-primary/10 text-primary" },
	ENTRADA_PRODUCAO: { label: "PRODUÇÃO", icon: PackagePlus, chip: "bg-primary/10 text-primary" },
	SAIDA: { label: "VENDA / SAÍDA", icon: ShoppingBag, chip: "bg-muted text-foreground/70" },
	SAIDA_PRODUCAO: { label: "CONSUMO EM PRODUÇÃO", icon: Factory, chip: "bg-muted text-foreground/70" },
	AJUSTE: { label: "AJUSTE MANUAL", icon: SlidersHorizontal, chip: "bg-[#ffb900]/15 text-[#8a6400] dark:text-[#ffb900]" },
	DESCARTE: { label: "DESCARTE", icon: Trash2, chip: "bg-destructive/10 text-destructive" },
};

function getDirectionTone(direcao: StockTransaction["direcao"]) {
	if (direcao === "ENTRADA") return { text: "text-green-600", sign: "+", icon: ArrowUpRight };
	if (direcao === "SAIDA") return { text: "text-red-600", sign: "-", icon: ArrowDownRight };
	return { text: "text-muted-foreground", sign: "", icon: MoveRight };
}

function OriginBadge({ icon: Icon, label }: { icon: typeof Layers; label: string }) {
	return (
		<span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold">
			<Icon className="h-3 w-3 min-h-3 min-w-3" />
			{label}
		</span>
	);
}

type StockTransactionRowProps = {
	transaction: StockTransaction;
	/** Oculta a identidade do produto quando a lista já está no contexto de um produto. */
	hideProduct?: boolean;
};

export default function StockTransactionRow({ transaction, hideProduct }: StockTransactionRowProps) {
	const isManual = transaction.origem === "MANUAL";
	const baseConfig = MOVEMENT_TYPE_CONFIG[transaction.tipo as TStockMovementTypeEnum] ?? MOVEMENT_TYPE_CONFIG.AJUSTE;
	// SAIDA manual nunca é venda: é o uso/consumo lançado pelo usuário.
	const config = isManual && transaction.tipo === "SAIDA" ? { ...baseConfig, label: "USO / CONSUMO" } : baseConfig;
	const TypeIcon = config.icon;
	const direction = getDirectionTone(transaction.direcao);
	const DirectionIcon = direction.icon;

	const unidade = transaction.produto?.unidade ?? "un";
	const productName = transaction.produtoVariante?.nome ?? transaction.produto?.nome ?? "Produto removido";
	const productCode = transaction.produtoVariante?.codigo ?? transaction.produto?.codigo ?? null;
	const imageUrl = transaction.produtoVariante?.imagemCapaUrl ?? transaction.produto?.imagemCapaUrl ?? null;

	const saldoAnterior = transaction.saldoAnterior;
	const saldoPosterior = transaction.saldoPosterior;
	const custoMovimentado = transaction.custoUnitarioMovimentado;

	return (
		<div className="group bg-card border-border hover:border-primary/40 flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs transition-colors duration-200 lg:flex-row lg:items-center">
			{/* Identidade do produto */}
			{!hideProduct ? (
				<div className="flex min-w-0 items-center gap-3 lg:w-64 lg:shrink-0">
					<div className="relative h-11 w-11 min-h-11 min-w-11 overflow-hidden rounded-lg">
						{imageUrl ? (
							<Image src={imageUrl} alt={productName} fill className="object-cover" />
						) : (
							<div className="bg-primary/10 text-primary flex h-full w-full items-center justify-center">
								<ShoppingCart className="h-4 w-4" />
							</div>
						)}
					</div>
					<div className="min-w-0">
						<h3 className="truncate text-sm font-bold tracking-tight">{productName}</h3>
						{productCode ? (
							<span className="text-foreground/60 mt-0.5 inline-flex items-center gap-1 text-[0.65rem] font-medium">
								<Code className="h-3 w-3 min-h-3 min-w-3" />
								{productCode}
							</span>
						) : null}
					</div>
				</div>
			) : null}

			{/* Natureza + rastreabilidade */}
			<div className="flex min-w-0 grow flex-col gap-1.5">
				<div className="flex flex-wrap items-center gap-1.5">
					<span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold tracking-tight", config.chip)}>
						<TypeIcon className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
						{config.label}
					</span>
					{isManual ? <OriginBadge icon={Hand} label="Manual" /> : null}
					{transaction.compra ? <OriginBadge icon={ShoppingCart} label={`Compra · ${transaction.compra.titulo}`} /> : null}
					{transaction.venda ? <OriginBadge icon={ShoppingBag} label={`Venda · ${transaction.venda.idExterno}`} /> : null}
					{transaction.producao ? <OriginBadge icon={Factory} label={`Produção · ${transaction.producao.titulo}`} /> : null}
					{transaction.lote ? <OriginBadge icon={Layers} label={`Lote · ${transaction.lote.codigoLote ?? "s/ código"}`} /> : null}
				</div>
				{transaction.motivo ? <p className="text-foreground/70 line-clamp-1 text-xs">{transaction.motivo}</p> : null}
				<div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.65rem] font-medium">
					<span className="inline-flex items-center gap-1">
						<UserRound className="h-3 w-3 min-h-3 min-w-3" />
						{transaction.operador?.nome ?? "Sistema"}
					</span>
					<span className="tabular-nums">{formatDateAsLocale(transaction.dataInsercao, true)}</span>
				</div>
			</div>

			{/* Impacto no saldo — o coração da auditoria */}
			<div className="flex shrink-0 items-center justify-between gap-4 lg:justify-end">
				<div className="flex flex-col items-end gap-0.5">
					<span className="text-muted-foreground text-[0.6rem] font-semibold uppercase tracking-wide">Saldo</span>
					<span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
						<span className="text-muted-foreground">{saldoAnterior != null ? formatDecimalPlaces(saldoAnterior) : "—"}</span>
						<MoveRight className="text-muted-foreground/60 h-3 w-3 min-h-3 min-w-3" />
						<span>
							{saldoPosterior != null ? formatDecimalPlaces(saldoPosterior) : "—"} {unidade}
						</span>
					</span>
				</div>

				{custoMovimentado != null ? (
					<div className="hidden flex-col items-end gap-0.5 sm:flex">
						<span className="text-muted-foreground text-[0.6rem] font-semibold uppercase tracking-wide">Custo un.</span>
						<span className="text-xs font-semibold tabular-nums">{formatToMoney(custoMovimentado)}</span>
					</div>
				) : null}

				<div className="flex flex-col items-end gap-0.5">
					<span className="text-muted-foreground text-[0.6rem] font-semibold uppercase tracking-wide">Movimento</span>
					<span className={cn("inline-flex items-center gap-1 text-base font-bold tabular-nums", direction.text)}>
						<DirectionIcon className="h-4 w-4 min-h-4 min-w-4" />
						{direction.sign}
						{formatDecimalPlaces(transaction.quantidade)}
					</span>
				</div>
			</div>
		</div>
	);
}

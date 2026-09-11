import type { TGetCrossSellOutput } from "@/app/api/pos/cross-sell/route";
import type { TGetClientContextOutput } from "@/app/api/clients/context/route";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCashbackValue, formatToMoney, formatToPhone } from "@/lib/formatting";
import { useClientCashbackBalance } from "@/lib/queries/cashback-programs";
import { useClientContext } from "@/lib/queries/clients/context";
import { usePOSCrossSellProducts } from "@/lib/queries/pos";
import { cn } from "@/lib/utils";
import type { TCashbackProgramEntity } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { Coins, MapPin, Package, PencilLine, Plus, ReceiptText, Sparkles, TriangleAlert } from "lucide-react";
import Image from "next/image";
import { useMemo } from "react";
import RFMBadge from "../RFMBadge";

export type TCrossSellProduct = TGetCrossSellOutput["data"]["products"][number];

type ClientContextContentProps = {
	clientId: string;
	fallbackName: string;
	fallbackPhone: string;
	basketProductIds: string[];
	organizationCashbackProgram: TCashbackProgramEntity | null;
	onSelectProduct: (product: TCrossSellProduct) => void;
	/** Abre a edição do cliente vinculado. Omitido quando o consumidor do painel não oferece edição. */
	onEditClient?: () => void;
};

function formatRelativeDay(date: Date | string | null): string {
	if (!date) return "Sem registro";
	const days = dayjs().startOf("day").diff(dayjs(date).startOf("day"), "day");
	if (days <= 0) return "Hoje";
	if (days === 1) return "Ontem";
	if (days < 30) return `Há ${days} dias`;
	if (days < 365) {
		const months = Math.round(days / 30);
		return months <= 1 ? "Há 1 mês" : `Há ${months} meses`;
	}
	const years = Math.round(days / 365);
	return years <= 1 ? "Há 1 ano" : `Há ${years} anos`;
}

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<span className="whitespace-nowrap text-[10px] font-extrabold uppercase leading-none tracking-wide text-muted-foreground">{label}</span>
			<span className="truncate text-sm font-bold tabular-nums text-foreground">{value}</span>
			{hint ? <span className="truncate text-[10px] font-medium text-muted-foreground">{hint}</span> : null}
		</div>
	);
}

export default function ClientContextContent({
	clientId,
	fallbackName,
	fallbackPhone,
	basketProductIds,
	organizationCashbackProgram,
	onSelectProduct,
	onEditClient,
}: ClientContextContentProps) {
	const { data: context, isLoading: isContextLoading, isError: isContextError } = useClientContext({ clientId });
	const { data: cashbackBalance } = useClientCashbackBalance({ clienteId: clientId });
	const { data: crossSell, isLoading: isCrossSellLoading, isError: isCrossSellError } = usePOSCrossSellProducts({ clientId, basketProductIds });

	const cliente = context?.cliente;
	const nome = cliente?.nome ?? fallbackName;
	const telefone = cliente?.telefone ?? fallbackPhone;
	const localizacao = [cliente?.localizacaoCidade, cliente?.localizacaoEstado].filter(Boolean).join(" / ");
	const cashbackProgramAtivo = !!organizationCashbackProgram?.ativo;
	const cashbackDisponivel = cashbackBalance?.saldoValorDisponivel ?? 0;
	const terminology = organizationCashbackProgram?.terminologia ?? "DINHEIRO";
	const formattedCashbackDisponivel = useMemo(() => formatCashbackValue(cashbackDisponivel, terminology), [cashbackDisponivel, terminology]);
	return (
		<div className="flex h-full w-full flex-col">
			{/* Identity header */}
			<div className="flex flex-col gap-3 border-b border-brand/15 px-4 pb-4 pt-4">
				<div className="flex items-start gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<p className="truncate text-sm font-bold leading-tight text-foreground">{nome}</p>
							{cliente?.analiseRFMTitulo ? <RFMBadge titulo={cliente.analiseRFMTitulo} /> : null}
						</div>
						<p className="truncate text-xs text-muted-foreground">{telefone ? formatToPhone(telefone) : "Sem telefone"}</p>
						{cliente?.email ? <p className="truncate text-xs text-muted-foreground">{cliente.email}</p> : null}
						{localizacao ? (
							<p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
								<MapPin className="h-3 w-3 shrink-0" /> {localizacao}
							</p>
						) : null}
					</div>
					{onEditClient ? (
						<Button type="button" variant="ghost" size="sm" onClick={onEditClient} className="-mt-1 shrink-0 text-[11px] font-bold text-muted-foreground">
							<PencilLine className="h-3.5 w-3.5" /> Editar
						</Button>
					) : null}
				</div>

				{/* Cashback — the single amber moment in the panel */}
				{cashbackProgramAtivo ? (
					<div className="flex items-center justify-between rounded-lg border border-brand/35 bg-brand/15 px-3 py-2">
						<span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-foreground/80">
							<Coins className="h-3.5 w-3.5 text-brand" /> Cashback
						</span>
						<span className="text-sm font-extrabold tabular-nums text-foreground">{formattedCashbackDisponivel}</span>
					</div>
				) : null}
			</div>

			{/* Summary stats */}
			<div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.75fr)] gap-2 border-b border-brand/10 px-4 py-3">
				{isContextLoading ? (
					<>
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
					</>
				) : (
					<>
						<StatCell label="Última compra" value={formatRelativeDay(context?.historico.ultimaCompraData ?? null)} />
						<StatCell label="Ticket médio" value={formatToMoney(context?.historico.ticketMedio ?? 0)} />
						<StatCell label="Compras" value={String(context?.historico.qtdeCompras ?? 0)} />
					</>
				)}
			</div>

			{/* Tabs */}
			<Tabs defaultValue="cross-sell" className="flex min-h-0 flex-1 flex-col gap-0">
				<div className="px-4 pt-3">
					<TabsList className="w-full">
						<TabsTrigger value="cross-sell" className="flex-1 gap-1.5">
							<Sparkles className="h-3.5 w-3.5" /> Sugestões
						</TabsTrigger>
						<TabsTrigger value="history" className="flex-1 gap-1.5">
							<ReceiptText className="h-3.5 w-3.5" /> Últimas compras
						</TabsTrigger>
					</TabsList>
				</div>

				{/* Cross-sell */}
				<TabsContent value="cross-sell" className="min-h-0 flex-1 overflow-y-auto px-4 py-3 scrollbar-thin scrollbar-thumb-primary/20">
					{isCrossSellLoading && !crossSell ? (
						<div className="flex flex-col gap-2">
							{Array.from({ length: 4 }).map((_, index) => (
								<Skeleton key={index} className="h-14 w-full" />
							))}
						</div>
					) : isCrossSellError ? (
						<EmptyHint icon={<TriangleAlert className="h-5 w-5" />} text="Não foi possível carregar sugestões." />
					) : crossSell && crossSell.products.length > 0 ? (
						<div className="flex flex-col gap-2">
							{crossSell.origem === "MAIS_VENDIDOS" ? (
								<p className="px-0.5 text-[11px] font-medium text-muted-foreground">Sem histórico ainda — mostrando os mais vendidos da loja.</p>
							) : null}
							{crossSell.products.map((product) => (
								<CrossSellRow key={product.id} product={product} onSelect={() => onSelectProduct(product)} />
							))}
						</div>
					) : (
						<EmptyHint icon={<Sparkles className="h-5 w-5" />} text="Nenhuma sugestão disponível para esta cesta." />
					)}
				</TabsContent>

				{/* Last purchases */}
				<TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto px-4 py-3 scrollbar-thin scrollbar-thumb-primary/20">
					{isContextLoading ? (
						<div className="flex flex-col gap-2">
							{Array.from({ length: 3 }).map((_, index) => (
								<Skeleton key={index} className="h-16 w-full" />
							))}
						</div>
					) : isContextError ? (
						<EmptyHint icon={<TriangleAlert className="h-5 w-5" />} text="Não foi possível carregar o histórico." />
					) : context && context.ultimasCompras.length > 0 ? (
						<div className="flex flex-col gap-2">
							{context.ultimasCompras.map((purchase) => (
								<PurchaseRow key={purchase.id} purchase={purchase} />
							))}
						</div>
					) : (
						<EmptyHint icon={<Package className="h-5 w-5" />} text="Primeira compra deste cliente." />
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}

function EmptyHint({ icon, text }: { icon: React.ReactNode; text: string }) {
	return (
		<div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted-foreground">
			<div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60">{icon}</div>
			<p className="text-xs font-medium">{text}</p>
		</div>
	);
}

function ProductThumb({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
	return (
		<div className={cn("relative shrink-0 overflow-hidden rounded-lg bg-secondary/50", className)}>
			{src ? (
				<Image src={src} alt={alt} fill className="object-cover" sizes="40px" />
			) : (
				<div className="flex h-full w-full items-center justify-center">
					<Package className="h-4 w-4 text-muted-foreground" />
				</div>
			)}
		</div>
	);
}

function CrossSellRow({ product, onSelect }: { product: TCrossSellProduct; onSelect: () => void }) {
	const hasVariants = product.variantes.length > 0;
	const precoBase = hasVariants ? Math.min(...product.variantes.map((variant) => variant.precoVenda)) : (product.precoVenda ?? 0);
	return (
		<button
			type="button"
			onClick={onSelect}
			className="group flex w-full items-center gap-2.5 rounded-xl border border-border bg-card p-2 text-left shadow-2xs transition-colors hover:border-primary/40 hover:bg-primary/5"
		>
			<ProductThumb src={product.imagemCapaUrl} alt={product.nome} className="h-9 w-9" />
			<div className="min-w-0 flex-1">
				<p className="truncate text-xs font-bold leading-tight text-foreground">{product.nome}</p>
				<p className="truncate text-[10px] font-medium text-muted-foreground">{product.crossSellMotivo}</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<span className="text-xs font-extrabold tabular-nums text-foreground">
					{hasVariants ? <span className="text-[9px] font-bold text-muted-foreground">A partir de </span> : null}
					{formatToMoney(precoBase)}
				</span>
				<span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
					<Plus className="h-3.5 w-3.5" />
				</span>
			</div>
		</button>
	);
}

function PurchaseRow({ purchase }: { purchase: TGetClientContextOutput["data"]["ultimasCompras"][number] }) {
	const itemNames = purchase.itens.map((item) => item.produtoNome).join(", ");
	return (
		<div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2.5 shadow-2xs">
			<div className="flex items-center justify-between gap-2">
				<span className="text-[11px] font-bold text-foreground">{formatRelativeDay(purchase.dataVenda)}</span>
				<span className="text-xs font-extrabold tabular-nums text-foreground">{formatToMoney(purchase.valorTotal)}</span>
			</div>
			<p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
				{purchase.itens.length > 0 ? `${purchase.itens.length} ${purchase.itens.length === 1 ? "item" : "itens"} · ${itemNames}` : "Sem itens"}
			</p>
		</div>
	);
}

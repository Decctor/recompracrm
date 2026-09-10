import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCashbackValue, formatToMoney, formatToPhone } from "@/lib/formatting";
import { useClientCashbackBalance } from "@/lib/queries/cashback-programs";
import { useClientContext } from "@/lib/queries/clients/context";
import { cn } from "@/lib/utils";
import type { TCashbackProgramEntity } from "@/services/drizzle/schema";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import { Coins, HatGlasses, PanelRightOpen, User, UserRound, X } from "lucide-react";
import RFMBadge from "../RFMBadge";

type ClientSectionProps = {
	saleState: TUseSaleState;
	organizationCashbackProgram: TCashbackProgramEntity | null;
	onOpenVinculationMenu: () => void;
	onPreloadVinculationMenu?: () => void;
	onOpenContext?: () => void;
	// Modo edição: o cliente da venda é imutável (benefícios, atribuição e acúmulos já apontam para ele).
	locked?: boolean;
};

function CardStat({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<span className="whitespace-nowrap text-[10px] font-extrabold uppercase leading-none tracking-wide text-muted-foreground">{label}</span>
			<span className="flex items-center gap-1 truncate text-sm font-extrabold tabular-nums text-foreground">{value}</span>
		</div>
	);
}

export default function ClientSection({
	saleState,
	organizationCashbackProgram,
	onOpenVinculationMenu,
	onPreloadVinculationMenu,
	onOpenContext,
	locked,
}: ClientSectionProps) {
	// Mesmas queries (e mesmo cache) do painel de contexto: o card mostra o resumo sem custo extra
	// e o painel abre já quente quando o operador quiser a visão completa.
	const linkedClientId = saleState.state.modoCliente === "VINCULADO" ? (saleState.state.cliente?.id ?? null) : null;
	const { data: context, isLoading: isContextLoading } = useClientContext({ clientId: linkedClientId });
	const { data: cashbackBalance } = useClientCashbackBalance({ clienteId: linkedClientId });
	const cashbackAtivo = !!organizationCashbackProgram?.ativo;
	const terminology = organizationCashbackProgram?.terminologia ?? "DINHEIRO";

	return (
		<div className="bg-card border-border flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<UserRound className="w-4 h-4 text-foreground" />
					<h3 className="font-bold text-xs tracking-wide">CLIENTE</h3>
				</div>
				{!locked ? (
					<div className="flex items-center gap-1">
						<Button
							type="button"
							size="fit"
							className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
							variant={saleState.state.modoCliente === "CONSUMIDOR" ? "brand" : "ghost"}
							onClick={() => saleState.setModoCliente("CONSUMIDOR")}
						>
							<HatGlasses className="w-3 h-3" /> AO CONSUMIDOR
						</Button>
						<Button
							type="button"
							size="fit"
							className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
							variant={saleState.state.modoCliente === "VINCULADO" ? "brand" : "ghost"}
							onPointerEnter={onPreloadVinculationMenu}
							onFocus={onPreloadVinculationMenu}
							onClick={() => {
								saleState.setModoCliente("VINCULADO");
								onOpenVinculationMenu();
							}}
						>
							<User className="w-3 h-3" /> VINCULAR
						</Button>
					</div>
				) : null}
			</div>

			{saleState.state.modoCliente === "VINCULADO" && saleState.state.cliente ? (
				// O card inteiro abre o contexto (o botão de painel continua existindo para teclado):
				// é a área grande que o operador realmente mira no balcão, não o ícone de 24px.
				<div
					onClick={onOpenContext}
					title={onOpenContext ? "Abrir contexto do cliente" : undefined}
					className={cn("flex w-full flex-col gap-2 rounded-lg bg-primary/10 px-2.5 py-2", onOpenContext && "cursor-pointer")}
				>
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0">
							<div className="flex items-center gap-1.5">
								<p className="truncate text-sm font-semibold leading-none">{saleState.state.cliente.nome}</p>
								{context?.cliente.analiseRFMTitulo ? <RFMBadge titulo={context.cliente.analiseRFMTitulo} /> : null}
							</div>
							<p className="mt-0.5 text-xs text-muted-foreground">{formatToPhone(saleState.state.cliente.telefone)}</p>
						</div>
						<div className="flex shrink-0 items-center gap-1">
							{onOpenContext ? (
								<Button
									type="button"
									size="icon"
									variant="ghost"
									className="h-6 w-6"
									aria-label="Abrir contexto do cliente"
									onClick={(event) => {
										event.stopPropagation();
										onOpenContext();
									}}
								>
									<PanelRightOpen className="w-3.5 h-3.5" />
								</Button>
							) : null}
							{!locked ? (
								<Button
									type="button"
									size="icon"
									variant="ghost"
									className="h-6 w-6"
									aria-label="Desvincular cliente"
									onClick={(event) => {
										event.stopPropagation();
										saleState.clearCliente();
									}}
								>
									<X className="w-3 h-3" />
								</Button>
							) : null}
						</div>
					</div>

					{/* Resumo do vínculo: o suficiente para o operador falar com o cliente sem abrir o painel. */}
					{isContextLoading ? (
						<div className={cn("grid gap-2 border-t border-primary/20 pt-2", cashbackAtivo ? "grid-cols-3" : "grid-cols-2")}>
							<Skeleton className="h-7 w-full" />
							<Skeleton className="h-7 w-full" />
							{cashbackAtivo ? <Skeleton className="h-7 w-full" /> : null}
						</div>
					) : context ? (
						<div className={cn("grid gap-2 border-t border-primary/20 pt-2", cashbackAtivo ? "grid-cols-3" : "grid-cols-2")}>
							<CardStat label="Total comprado" value={formatToMoney(context.historico.valorTotalCompras)} />
							<CardStat label="Compras" value={String(context.historico.qtdeCompras)} />
							{cashbackAtivo ? (
								<CardStat
									label="Cashback"
									value={
										<>
											<Coins className="h-3 w-3 shrink-0 text-brand" />
											{formatCashbackValue(cashbackBalance?.saldoValorDisponivel ?? 0, terminology)}
										</>
									}
								/>
							) : null}
						</div>
					) : null}
				</div>
			) : null}
			{locked && saleState.state.modoCliente === "CONSUMIDOR" ? (
				<div className="w-full rounded-lg bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">Venda ao consumidor.</div>
			) : null}
			{locked ? <p className="text-[11px] text-muted-foreground">O cliente não pode ser alterado na edição da venda.</p> : null}
		</div>
	);
}

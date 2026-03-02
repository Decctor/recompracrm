import ClientVinculationMenu from "@/components/Clients/ClientVinculationMenu";
import SelectInput from "@/components/Inputs/SelectInput";
import { NewClientLocation } from "@/components/Modals/Clients/Locations/NewClientLocation";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatToMoney, formatToPhone } from "@/lib/formatting";
import { useCashbackProgram, useClientCashbackBalance } from "@/lib/queries/cashback-programs";
import { useClientLocations } from "@/lib/queries/clients/locations";
import { useSellersSimplified } from "@/lib/queries/sellers";
import { cn } from "@/lib/utils";
import type { TDeliveryModeEnum, TPaymentMethodEnum } from "@/schemas/enums";
import type { TCashbackProgramEntity } from "@/services/drizzle/schema";
import type { TUseSaleState } from "@/state-hooks/use-sale-state";
import {
	Banknote,
	Check,
	ClipboardIcon,
	CreditCard,
	DollarSign,
	HatGlasses,
	MapPin,
	Minus,
	Package,
	Plus,
	QrCode,
	ShoppingCart,
	Store,
	Trash2,
	TruckIcon,
	User,
	UserRound,
	Wallet,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import CartItemRow from "./CartItemRow";

const DELIVERY_MODES: { value: TDeliveryModeEnum; label: string; icon: ReactNode }[] = [
	{ value: "PRESENCIAL", label: "PRESENCIAL", icon: <Store className="w-4 h-4" /> },
	{ value: "RETIRADA", label: "RETIRADA", icon: <Package className="w-4 h-4" /> },
	{ value: "ENTREGA", label: "ENTREGA", icon: <MapPin className="w-4 h-4" /> },
	{ value: "COMANDA", label: "COMANDA", icon: <ClipboardIcon className="w-4 h-4" /> },
];

const PAYMENT_METHODS: { value: TPaymentMethodEnum; label: string; icon: ReactNode }[] = [
	{ value: "DINHEIRO", label: "DINHEIRO", icon: <Banknote className="w-4 h-4" /> },
	{ value: "PIX", label: "PIX", icon: <QrCode className="w-4 h-4" /> },
	{ value: "CARTAO_CREDITO", label: "CARTÃO DE CRÉDITO", icon: <CreditCard className="w-4 h-4" /> },
	{ value: "CARTAO_DEBITO", label: "CARTÃO DE DÉBITO", icon: <CreditCard className="w-4 h-4" /> },
	{ value: "TRANSFERENCIA", label: "TRANSFERÊNCIA", icon: <Wallet className="w-4 h-4" /> },
	{ value: "OUTRO", label: "OUTRO", icon: <Wallet className="w-4 h-4" /> },
];

type CashbackRedemptionBlockProps = {
	saleState: TUseSaleState;
	saleClientId: string;
	programRedemptionLimitType: TCashbackProgramEntity["resgateLimiteTipo"] | null;
	programRedemptionLimitValue: TCashbackProgramEntity["resgateLimiteValor"] | null;
	programAllowsDiscounts: TCashbackProgramEntity["modalidadeDescontosPermitida"];
};

function CashbackRedemptionBlock({
	saleState,
	saleClientId,
	programRedemptionLimitType,
	programRedemptionLimitValue,
	programAllowsDiscounts,
}: CashbackRedemptionBlockProps) {
	const { data: clientCashbackBalance, isLoading: isCashbackBalanceLoading } = useClientCashbackBalance({
		clienteId: saleClientId,
	});
	console.log(clientCashbackBalance);

	const cashbackSaldoDisponivel = clientCashbackBalance?.saldoValorDisponivel ?? 0;
	const cashbackMaxByRule = (() => {
		if (!programRedemptionLimitType || programRedemptionLimitValue === null) {
			return Number.POSITIVE_INFINITY;
		}
		if (programRedemptionLimitType === "FIXO") {
			return Math.max(0, programRedemptionLimitValue);
		}
		return Math.max(0, (saleState.valorFinal * programRedemptionLimitValue) / 100);
	})();
	const cashbackResgateMaximo = Math.max(0, Math.min(cashbackSaldoDisponivel, cashbackMaxByRule, saleState.valorFinal));
	const cashbackDisabledReason = !saleState.state.cliente
		? null
		: !programAllowsDiscounts
			? "Este programa não permite resgate por desconto."
			: cashbackSaldoDisponivel <= 0
				? "Cliente sem saldo de cashback disponível."
				: cashbackResgateMaximo <= 0
					? "Não há valor disponível para resgate nesta venda."
					: null;
	const isCashbackLoading = isCashbackBalanceLoading;
	const isCashbackDisabled = isCashbackLoading || !!cashbackDisabledReason;
	return (
		<div className="w-full flex flex-col gap-1.5 rounded-lg border border-brand/35 bg-brand/20 px-2 py-2">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<Wallet className="w-3 h-3 text-brand" />
					<span className="text-xs font-semibold text-brand">CASHBACK</span>
				</div>
				<span className="text-[11px] font-semibold text-brand">MAX: {formatToMoney(cashbackResgateMaximo)}</span>
			</div>
			<div className="flex items-center justify-between gap-2">
				<Input
					type="number"
					placeholder="Resgate"
					className="w-28 text-xs font-bold border-brand/50 text-brand"
					value={saleState.state.cashbackResgate}
					disabled={isCashbackDisabled}
					onChange={(event) => {
						const inputValue = Number(event.target.value);
						const safeValue = Number.isFinite(inputValue) ? inputValue : 0;
						saleState.setCashbackResgate(Math.min(Math.max(0, safeValue), cashbackResgateMaximo));
					}}
				/>
				<Button
					type="button"
					size="sm"
					variant="ghost-brand"
					disabled={isCashbackDisabled || cashbackResgateMaximo <= 0}
					onClick={() => saleState.setCashbackResgate(cashbackResgateMaximo)}
				>
					USAR MÁXIMO
				</Button>
			</div>
			{cashbackDisabledReason ? <p className="text-[11px] text-brand/90">{cashbackDisabledReason}</p> : null}
			{!cashbackDisabledReason && isCashbackLoading ? <p className="text-[11px] text-brand/90">Carregando saldo de cashback...</p> : null}
		</div>
	);
}

type CartPaneProps = {
	organizationId: string;
	organizationCashbackProgram: TCashbackProgramEntity | null;
	saleState: TUseSaleState;
	onCreateDraft: () => void;
	onFinalizeSale: () => void;
	isCreatingDraft?: boolean;
	isFinalizingSale?: boolean;
};
export default function CartPane({
	organizationId,
	organizationCashbackProgram,
	saleState,
	onCreateDraft,
	onFinalizeSale,
	isCreatingDraft,
	isFinalizingSale,
}: CartPaneProps) {
	const [isVinculationMenuOpen, setIsVinculationMenuOpen] = useState(false);
	const [isNewLocationOpen, setIsNewLocationOpen] = useState(false);
	const { data: sellers } = useSellersSimplified();
	const { data: clientLocations = [], refetch: refetchClientLocations } = useClientLocations({ clienteId: saleState.state.cliente?.id ?? null });
	const { data: clientCashbackBalance, isLoading: isCashbackBalanceLoading } = useClientCashbackBalance({
		clienteId: saleState.state.cliente?.id ?? null,
	});

	const sellerOptions =
		sellers?.map((seller) => ({
			id: seller.id,
			value: seller.id,
			label: seller.nome,
		})) ?? [];

	const locationOptions = clientLocations.map((location) => ({
		id: location.id,
		value: location.id,
		label: `${location.titulo} - ${[location.localizacaoCidade, location.localizacaoEstado].filter(Boolean).join("/") || "Sem cidade/UF"}`,
	}));

	useEffect(() => {
		if (saleState.state.entregaModalidade !== "ENTREGA") return;
		const firstLocationId = clientLocations[0]?.id ?? null;
		saleState.ensureEntregaLocation(firstLocationId);
	}, [clientLocations, saleState.state.entregaModalidade, saleState.ensureEntregaLocation]);

	return (
		<>
			<div className="flex flex-col h-full gap-3">
				<div className="flex items-center gap-2">
					<div className="p-2 bg-primary/10 rounded-lg">
						<ShoppingCart className="w-5 h-5 text-primary" />
					</div>
					<div>
						<h2 className="font-black text-lg">CHECKOUT</h2>
						<p className="text-xs text-muted-foreground">
							{saleState.itemCount} {saleState.itemCount === 1 ? "ITEM" : "ITENS"}
						</p>
					</div>
				</div>
				<SelectInput
					label="VENDEDOR"
					value={saleState.state.vendedorId}
					options={sellerOptions}
					handleChange={(value) => {
						const seller = sellers?.find((item) => item.id === value);
						saleState.setVendedor(value, seller?.nome ?? null);
					}}
					onReset={() => saleState.setVendedor(null, null)}
					resetOptionLabel="Selecionar vendedor"
				/>
				<div className="bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5">
							<UserRound className="w-4 h-4 text-primary" />
							<h3 className="font-bold text-xs tracking-wide">CLIENTE</h3>
						</div>
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
								onClick={() => {
									saleState.setModoCliente("VINCULADO");
									setIsVinculationMenuOpen(true);
								}}
							>
								<User className="w-3 h-3" /> VINCULAR
							</Button>
						</div>
					</div>

					{saleState.state.modoCliente === "VINCULADO" && saleState.state.cliente ? (
						<div className="w-full flex items-center justify-between rounded-lg bg-primary/10 px-2 py-1.5">
							<div>
								<p className="text-sm font-semibold leading-none">{saleState.state.cliente.nome}</p>
								<p className="text-xs text-muted-foreground">{formatToPhone(saleState.state.cliente.telefone)}</p>
							</div>
							<Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => saleState.clearCliente()}>
								<X className="w-3 h-3" />
							</Button>
						</div>
					) : null}
				</div>

				<div className="bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5">
							<ShoppingCart className="w-4 h-4 text-primary" />
							<h3 className="font-bold text-xs tracking-wide">ITENS</h3>
						</div>
						{saleState.state.itens.length > 0 ? (
							<Button type="button" variant="ghost" size="sm" className="gap-1 text-destructive" onClick={saleState.clearCart}>
								<Trash2 className="w-3 h-3" /> LIMPAR
							</Button>
						) : null}
					</div>
					<ScrollArea className="max-h-[200px]">
						<div className="flex flex-col gap-2 pr-3">
							{saleState.state.itens.map((item) => (
								<CartItemRow key={item.tempId} item={item} onUpdateQuantity={saleState.updateItemQuantity} onRemove={saleState.removeItem} />
							))}
							{saleState.state.itens.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum item no carrinho.</p> : null}
						</div>
					</ScrollArea>
				</div>

				<div className="bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs">
					<div className="flex items-center gap-1.5">
						<TruckIcon className="w-4 h-4 text-primary" />
						<h3 className="font-bold text-xs tracking-wide">ENTREGA</h3>
					</div>
					<div className="w-full flex items-center flex-wrap gap-1.5 justify-center">
						{DELIVERY_MODES.map((mode) => {
							const isEntregaBlocked = mode.value === "ENTREGA" && saleState.state.modoCliente === "CONSUMIDOR";
							return (
								<Button
									key={mode.value}
									type="button"
									size="fit"
									className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
									variant={saleState.state.entregaModalidade === mode.value ? "brand" : "ghost"}
									disabled={isEntregaBlocked}
									onClick={() => saleState.setEntregaModalidade(mode.value)}
								>
									{mode.icon}
									{mode.label}
								</Button>
							);
						})}
					</div>

					{saleState.state.entregaModalidade === "ENTREGA" ? (
						<>
							<SelectInput
								label="Local de entrega"
								value={saleState.state.entregaLocalizacaoId}
								options={locationOptions}
								handleChange={(value) => saleState.setEntregaLocalizacaoId(value)}
								onReset={() => saleState.setEntregaLocalizacaoId(null)}
								resetOptionLabel="Selecione um endereço"
							/>
							<Button type="button" variant="outline" size="sm" disabled={!saleState.state.cliente} onClick={() => setIsNewLocationOpen(true)}>
								<Plus className="w-3 h-3 mr-1" /> NOVA LOCALIZAÇÃO
							</Button>
						</>
					) : null}

					{saleState.state.entregaModalidade === "COMANDA" ? (
						<Input
							placeholder="Número da comanda"
							value={saleState.state.comandaNumero ?? ""}
							onChange={(e) => saleState.setComandaNumero(e.target.value || null)}
						/>
					) : null}
				</div>

				<div className="bg-card border-primary/20 flex w-full flex-col gap-3 rounded-xl border px-3 py-3 shadow-2xs">
					<div className="flex items-center gap-1.5 justify-between">
						<div className="flex items-center gap-1.5">
							<Wallet className="w-4 h-4 text-primary" />
							<h3 className="font-bold text-xs tracking-wide">PAGAMENTO</h3>
						</div>
						<Button
							type="button"
							size="fit"
							className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
							variant="ghost-brand"
							onClick={() => saleState.addPagamento()}
						>
							<Plus className="w-4 h-4" /> ADICIONAR
						</Button>
					</div>

					{saleState.state.pagamentos.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum pagamento adicionado.</p> : null}
					{saleState.state.pagamentos.map((payment) => (
						<div key={payment.id} className="rounded-lg border px-2 py-2 flex items-center gap-1.5 justify-between">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="sm" className="gap-1 uppercase">
										{PAYMENT_METHODS.find((method) => method.value === payment.metodo)?.icon ?? <Wallet className="w-4 h-4" />}
										{PAYMENT_METHODS.find((method) => method.value === payment.metodo)?.label ?? payment.metodo}
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent>
									<DropdownMenuLabel>MÉTODO</DropdownMenuLabel>
									<DropdownMenuSeparator />
									{PAYMENT_METHODS.map((method) => (
										<DropdownMenuItem key={method.value} onClick={() => saleState.updatePagamento(payment.id, { metodo: method.value })}>
											<div className="flex items-center gap-2 w-full justify-between">
												<div className="flex items-center gap-2">
													{method.icon}
													{method.label}
												</div>
												{method.value === payment.metodo ? <Check className="w-4 h-4" /> : null}
											</div>
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
							<div className="flex items-center gap-1.5">
								<Input
									type="number"
									className="w-24 max-w-full text-xs"
									value={payment.valor}
									onChange={(event) => saleState.updatePagamento(payment.id, { valor: Number(event.target.value) || 0 })}
								/>
								<Button type="button" variant="ghost-destructive" size="icon" className="h-8 w-8" onClick={() => saleState.removePagamento(payment.id)}>
									<X className="w-3 h-3" />
								</Button>
							</div>
						</div>
					))}
				</div>

				<div className="bg-card border-primary/20 flex w-full flex-col gap-2 rounded-xl border px-3 py-3 shadow-2xs">
					<div className="flex items-center gap-1.5">
						<DollarSign className="w-4 h-4 text-primary" />
						<h3 className="font-bold text-xs uppercase tracking-wide">Resumo</h3>
					</div>
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">Subtotal itens</span>
						<span>{formatToMoney(saleState.totalItens)}</span>
					</div>
					<div className="flex flex-col gap-1.5">
						{saleState.state.cliente ? (
							<CashbackRedemptionBlock
								saleState={saleState}
								saleClientId={saleState.state.cliente.id}
								programRedemptionLimitType={organizationCashbackProgram?.resgateLimiteTipo ?? null}
								programRedemptionLimitValue={organizationCashbackProgram?.resgateLimiteValor ?? null}
								programAllowsDiscounts={organizationCashbackProgram?.modalidadeDescontosPermitida ?? false}
							/>
						) : null}
						<div className="w-full flex items-center justify-between px-2 py-1 rounded-lg bg-red-200">
							<div className="flex items-center gap-1.5">
								<Minus className="w-3 h-3 text-red-600" />
								<span className="text-xs text-red-600">DESCONTOS</span>
							</div>
							<Input
								type="number"
								placeholder="Desconto"
								className="w-24 text-xs font-bold border border-red-600 text-red-600"
								value={saleState.state.descontoGeral}
								onChange={(event) => saleState.setDescontoGeral(Number(event.target.value) || 0)}
							/>
						</div>
						<div className="w-full flex items-center justify-between px-2 py-1 rounded-lg bg-green-200">
							<div className="flex items-center gap-1.5">
								<Plus className="w-3 h-3 text-green-600" />
								<span className="text-xs text-green-600">ACRÉSCIMOS</span>
							</div>
							<Input
								type="number"
								placeholder="Acréscimo"
								className="w-24 text-xs font-bold border border-green-600 text-green-600"
								value={saleState.state.acrescimoGeral}
								onChange={(event) => saleState.setAcrescimoGeral(Number(event.target.value) || 0)}
							/>
						</div>
					</div>
					<Input
						placeholder="Defina, se aplicável, observações da venda aqui..."
						value={saleState.state.observacoes}
						onChange={(event) => saleState.setObservacoes(event.target.value)}
					/>
					<Separator />
					<div className="flex items-center justify-between text-sm font-semibold">
						<span>TOTAL FINAL</span>
						<span>{formatToMoney(saleState.valorFinal)}</span>
					</div>
					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<span>PAGAMENTOS</span>
						<span>{formatToMoney(saleState.totalPagamentos)}</span>
					</div>
					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<span>RESTANTE</span>
						<span>{formatToMoney(saleState.valorRestante)}</span>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-2">
					<Button
						variant="ghost"
						className={cn("w-full", !saleState.isReadyForDraft && "opacity-50")}
						onClick={onCreateDraft}
						disabled={!saleState.isReadyForDraft || isCreatingDraft || isFinalizingSale}
					>
						{isCreatingDraft ? "CRIANDO ORÇAMENTO..." : "CRIAR COMO ORÇAMENTO"}
					</Button>
					<Button
						className={cn("w-full", !saleState.isReadyForFinalize && "opacity-50")}
						onClick={onFinalizeSale}
						disabled={!saleState.isReadyForFinalize || isCreatingDraft || isFinalizingSale}
					>
						{isFinalizingSale ? "FINALIZANDO VENDA..." : "FINALIZAR VENDA"}
					</Button>
				</div>
			</div>

			{isVinculationMenuOpen ? (
				<ClientVinculationMenu
					closeModal={() => setIsVinculationMenuOpen(false)}
					onSelectClient={(client) => {
						saleState.setModoCliente("VINCULADO");
						saleState.setCliente(client);
						setIsVinculationMenuOpen(false);
					}}
				/>
			) : null}

			{isNewLocationOpen && saleState.state.cliente ? (
				<NewClientLocation
					clienteId={saleState.state.cliente.id}
					closeModal={() => setIsNewLocationOpen(false)}
					callbacks={{
						onSuccess: async () => {
							const response = await refetchClientLocations();
							const firstLocationId = response.data?.[0]?.id ?? null;
							saleState.ensureEntregaLocation(firstLocationId);
						},
					}}
				/>
			) : null}
		</>
	);
}

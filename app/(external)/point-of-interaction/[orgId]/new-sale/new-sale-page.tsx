"use client";

import type { TCreatePointOfInteractionTransactionOutput } from "@/app/api/point-of-interaction/new-transaction/route";
import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";
import { formatToCPForCNPJ, formatToMoney, formatToNumericPassword, formatToPhone } from "@/lib/formatting";
import { createPointOfInteractionSale } from "@/lib/mutations/sales";
import { useClientByLookup } from "@/lib/queries/clients";
import { cn } from "@/lib/utils";
import type { TClientByLookupOutput } from "@/pages/api/clients/lookup";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { usePointOfInteractionNewSaleState } from "@/state-hooks/use-point-of-interaction-new-sale-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	BadgePercent,
	Check,
	CheckCircle2,
	CreditCard,
	Loader2,
	Lock,
	PartyPopper,
	Plus,
	ShoppingCart,
	Tag,
	UserPlus,
	UserRound,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { toast } from "sonner";
import useSound from "use-sound";

type NewSaleContentProps = {
	org: {
		id: TOrganizationEntity["id"];
		cnpj: TOrganizationEntity["cnpj"];
		nome: TOrganizationEntity["nome"];
		logoUrl: TOrganizationEntity["logoUrl"];
		telefone: TOrganizationEntity["telefone"];
	};
	clientId?: string;
};
export default function NewSaleContent({ org, clientId }: NewSaleContentProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { state, updateClient, updateSale, updateCashback, updateOperatorIdentifier, resetState } = usePointOfInteractionNewSaleState(org.id);

	const [currentStep, setCurrentStep] = React.useState<number>(1);
	const [successData, setSuccessData] = React.useState<TCreatePointOfInteractionTransactionOutput["data"] | null>(null);
	const {
		data: client,
		queryKey,
		isLoading: isLoadingClient,
		isSuccess: isSuccessClient,
		params,
		updateParams,
	} = useClientByLookup({ initialParams: { orgId: org.id, phone: "", clientId: clientId } });

	const [playAction] = useSound("/sounds/action-completed.mp3");
	const [playSuccess] = useSound("/sounds/success.mp3");

	useEffect(() => {
		if (client) {
			updateClient({
				id: client.id,
				nome: client.nome,
				telefone: client.telefone,
				cpfCnpj: null,
			});
			playAction();
		}
	}, [client, updateClient, playAction]);

	const handleNextStep = () => {
		if (currentStep === 1) {
			// Must have either an existing client or new client data
			if (!state.client.id && (!state.client.nome || !state.client.telefone)) {
				return toast.error("Complete os dados do cliente.");
			}
		}
		if (currentStep === 2 && state.sale.valor <= 0) {
			return toast.error("Digite o valor da venda.");
		}
		playAction();
		setCurrentStep((prev) => Math.min(prev + 1, 4));
	};

	const getAvailableCashback = () => client?.saldos?.[0]?.saldoValorDisponivel ?? 0;
	const getRedemptionLimitConfig = () => {
		const programa = client?.saldos?.[0]?.programa;
		return {
			tipo: programa?.resgateLimiteTipo ?? null,
			valor: programa?.resgateLimiteValor ?? null,
		};
	};
	const getMaxCashbackToUse = () => {
		const available = getAvailableCashback();
		const saleValue = state.sale.valor;
		const limitConfig = getRedemptionLimitConfig();

		let maxByLimit = saleValue; // Default: limited by sale value
		if (limitConfig.tipo && limitConfig.valor !== null) {
			if (limitConfig.tipo === "FIXO") {
				maxByLimit = limitConfig.valor;
			} else if (limitConfig.tipo === "PERCENTUAL") {
				maxByLimit = (saleValue * limitConfig.valor) / 100;
			}
		}

		return Math.min(available, saleValue, maxByLimit);
	};
	const getFinalValue = () => Math.max(0, state.sale.valor - (state.sale.cashback.aplicar ? state.sale.cashback.valor : 0));

	const { mutate: createSaleMutation, isPending: isCreatingSale } = useMutation({
		mutationFn: createPointOfInteractionSale,
		onSuccess: (data) => {
			const visualAccumulatedCashbackValue = data.data.visualClientAccumulatedCashbackValue ?? data.data.clientAccumulatedCashbackValue;
			playSuccess();
			toast.success(`Venda finalizada! Saldo: ${formatToMoney(visualAccumulatedCashbackValue)}`);
			setSuccessData(data.data);
			setCurrentStep(5);
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	const handleReset = () => {
		resetState();
		updateParams({ phone: "" });
		setSuccessData(null);
		setCurrentStep(1);
	};

	async function handleCancelRedirect() {
		await queryClient.cancelQueries({ queryKey });
		await queryClient.invalidateQueries({ queryKey });
		updateParams({ phone: "", clientId: null });
	}

	const maximumCashbackAllowed = getMaxCashbackToUse();
	const isAttemptingToUseMoreCashbackThanAllowed = state.sale.cashback.aplicar && state.sale.cashback.valor > maximumCashbackAllowed;
	return (
		<div className="w-full min-h-screen p-6 md:p-10 flex flex-col items-center">
			<div className="w-full max-w-4xl flex flex-col gap-6">
				{/* Header com Navegação */}
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="fit" asChild className="rounded-full hover:bg-brand/10 flex items-center gap-1 px-2 py-2">
						<Link href={`/point-of-interaction/${org.id}`} className="flex items-center gap-1">
							<ArrowLeft className="w-5 h-5" />
							VOLTAR
						</Link>
					</Button>
					<div className="flex items-center gap-3">
						<div className="p-3 bg-brand rounded-2xl text-brand-foreground shadow-lg">
							<ShoppingCart className="w-6 h-6 md:w-8 md:h-8" />
						</div>
						<div>
							<h1 className="text-2xl md:text-3xl font-black tracking-tighter">NOVA VENDA</h1>
							<p className="text-[0.6rem] md:text-xs text-muted-foreground font-bold uppercase tracking-widest opacity-70">Passo {currentStep} de 4</p>
						</div>
					</div>
				</div>

				{/* Wrapper de Estágios (Mantido conforme preferência) */}
				<div className="bg-card rounded-3xl shadow-xl overflow-hidden border border-brand/20">
					{currentStep < 5 && (
						<div className="flex border-b">
							{[
								{ id: 1, label: "CLIENTE", icon: UserRound },
								{ id: 2, label: "VENDA", icon: Tag },
								{ id: 3, label: "CASHBACK", icon: BadgePercent },
								{ id: 4, label: "CONFIRMAÇÃO", icon: Lock },
							].map((step) => (
								<div
									key={step.id}
									className={cn(
										"flex-1 flex flex-col lg:flex-row items-center justify-center gap-2 py-4 transition-all border-b-4",
										currentStep === step.id ? "border-brand text-brand bg-brand/5" : "border-transparent text-muted-foreground",
									)}
								>
									<step.icon className="w-4 h-4" />
									<span className="text-[0.6rem] lg:text-xs font-black tracking-widest">{step.label}</span>
								</div>
							))}
						</div>
					)}

					<div className="p-6 md:p-10">
						{currentStep === 1 && (
							<ClientStep
								isLoadingClient={isLoadingClient}
								isSuccessClient={isSuccessClient}
								client={client ?? null}
								phone={params.phone}
								onPhoneChange={(v) => updateParams({ phone: formatToPhone(v) })}
								onCancelSearch={handleCancelRedirect}
								newClientData={state.client}
								onNewClientChange={updateClient}
								onSubmit={handleNextStep}
							/>
						)}
						{currentStep === 2 && (
							<SaleValueStep
								value={state.sale.valor}
								partnerCode={state.sale.partnerCode ?? ""}
								onChange={(v) => updateSale({ valor: v })}
								onPartnerCodeChange={(v) => updateSale({ partnerCode: v })}
								onSubmit={handleNextStep}
							/>
						)}
						{currentStep === 3 && (
							<CashbackStep
								available={getAvailableCashback()}
								maxAllowed={maximumCashbackAllowed}
								saleValue={state.sale.valor}
								applied={state.sale.cashback.aplicar}
								amount={state.sale.cashback.valor}
								isAttemptingToUseMoreCashbackThanAllowed={isAttemptingToUseMoreCashbackThanAllowed}
								finalValue={getFinalValue()}
								redemptionLimit={getRedemptionLimitConfig()}
								onToggle={(v) =>
									updateCashback({
										aplicar: v,
										valor: v ? getMaxCashbackToUse() : 0,
									})
								}
								onAmountChange={(v) => updateCashback({ valor: v })}
								onSubmit={handleNextStep}
							/>
						)}
						{currentStep === 4 && (
							<ConfirmationStep
								clientName={state.client.nome || client?.nome || ""}
								finalValue={getFinalValue()}
								operatorIdentifier={state.operatorIdentifier}
								onOperatorIdentifierChange={updateOperatorIdentifier}
								onSubmit={() => createSaleMutation(state)}
							/>
						)}
						{currentStep === 5 && successData && (
							<SuccessStep
								cashbackEarned={successData.visualClientAccumulatedCashbackValue ?? successData.clientAccumulatedCashbackValue}
								newBalance={successData.visualClientNewOverallAvailableBalance ?? successData.clientNewOverallAvailableBalance ?? 0}
								onReset={handleReset}
								onGoHome={() => router.push(`/point-of-interaction/${org.id}`)}
							/>
						)}

						{/* Botões de Ação */}
						{currentStep < 5 && !(currentStep === 1 && client) && (
							<div className="flex gap-4 mt-10">
								{currentStep > 1 && (
									<Button onClick={() => setCurrentStep((p) => p - 1)} variant="outline" size="lg" className="flex-1 rounded-2xl h-16 text-lg font-bold">
										VOLTAR
									</Button>
								)}
								<Button
									onClick={currentStep === 4 ? () => createSaleMutation(state) : handleNextStep}
									size="lg"
									disabled={isCreatingSale || isAttemptingToUseMoreCashbackThanAllowed}
									className={cn(
										"flex-1 rounded-2xl h-16 text-lg font-bold shadow-lg shadow-brand/20 uppercase tracking-widest",
										currentStep === 4 && "bg-green-600 hover:bg-green-700",
									)}
								>
									{currentStep === 4 ? (isCreatingSale ? "PROCESSANDO..." : "FINALIZAR") : "PRÓXIMO"}
									{currentStep === 4 ? <Check className="ml-2 w-6 h-6" /> : <ArrowRight className="ml-2 w-6 h-6" />}
								</Button>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function SuccessStep({
	cashbackEarned,
	newBalance,
	onReset,
	onGoHome,
}: {
	cashbackEarned: number;
	newBalance: number;
	onReset: () => void;
	onGoHome: () => void;
}) {
	return (
		<div className="flex flex-col items-center text-center space-y-8 animate-in zoom-in duration-500">
			<div className="relative">
				<div className="absolute inset-0 bg-green-500/20 blur-3xl rounded-full scale-150 animate-pulse" />
				<div className="relative bg-green-600 p-8 rounded-full text-white shadow-2xl shadow-green-600/30">
					<CheckCircle2 className="w-20 h-20" />
				</div>
				<div className="absolute -top-4 -right-4 bg-yellow-400 p-3 rounded-2xl text-yellow-900 shadow-lg animate-bounce">
					<PartyPopper className="w-6 h-6" />
				</div>
			</div>

			<div className="space-y-2">
				<h2 className="text-4xl font-black uppercase tracking-tighter text-green-700">VENDA REALIZADA!</h2>
				<p className="text-muted-foreground font-medium text-lg">A operação foi processada com sucesso.</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-xl">
				<div className="bg-green-50 border-2 border-green-200 rounded-3xl p-6 shadow-sm">
					<p className="text-[0.7rem] font-black text-green-600 uppercase tracking-widest mb-1">CASHBACK GERADO</p>
					<p className="text-4xl font-black text-green-700">{formatToMoney(cashbackEarned)}</p>
				</div>
				<div className="bg-brand/5 border-2 border-brand/20 rounded-3xl p-6 shadow-sm">
					<p className="text-[0.7rem] font-black text-brand uppercase tracking-widest mb-1">NOVO SALDO TOTAL</p>
					<p className="text-4xl font-black text-brand">{formatToMoney(newBalance)}</p>
				</div>
			</div>

			<div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
				<Button onClick={onReset} size="lg" className="flex-1 rounded-2xl h-20 text-xl font-black shadow-xl uppercase tracking-wider">
					NOVA VENDA
				</Button>
				<Button
					onClick={onGoHome}
					variant="outline"
					size="lg"
					className="flex-1 rounded-2xl h-20 text-xl font-black border-4 hover:bg-muted uppercase tracking-wider"
				>
					VOLTAR AO INÍCIO
				</Button>
			</div>
		</div>
	);
}

// --- Sub-componentes Refatorados ---

function ClientStep({
	client,
	phone,
	onPhoneChange,
	newClientData,
	onNewClientChange,
	isLoadingClient,
	isSuccessClient,
	onSubmit,
	onCancelSearch,
}: {
	client: TClientByLookupOutput["data"];
	phone: string;
	onPhoneChange: (phone: string) => void;
	newClientData: { id?: string | null; nome: string; cpfCnpj?: string | null; telefone: string };
	onNewClientChange: (data: Partial<typeof newClientData>) => void;
	isLoadingClient: boolean;
	isSuccessClient: boolean;
	onSubmit: () => void;
	onCancelSearch: () => void;
}) {
	// Auto-advance timer state
	const ADVANCE_COUNTDOWN_SECONDS = 3;
	const [countdown, setCountdown] = React.useState<number | null>(null);
	const [isAdvancing, setIsAdvancing] = React.useState(false);
	const [wasCancelled, setWasCancelled] = React.useState(false);
	const [playAction] = useSound("/sounds/action-completed.mp3");

	// Reset wasCancelled when user starts typing a new phone number
	React.useEffect(() => {
		if (phone && wasCancelled) {
			setWasCancelled(false);
		}
	}, [phone, wasCancelled]);

	// Start countdown when client is found
	React.useEffect(() => {
		if (isSuccessClient && client && countdown === null && !isAdvancing && !wasCancelled) {
			playAction();
			setCountdown(ADVANCE_COUNTDOWN_SECONDS);
		}
	}, [isSuccessClient, client, countdown, isAdvancing, wasCancelled, playAction]);

	// Handle countdown timer and auto-advance
	React.useEffect(() => {
		if (countdown === null || countdown < 0) return;

		if (countdown === 0) {
			setIsAdvancing(true);
			onSubmit();
			return;
		}

		const timer = setTimeout(() => {
			setCountdown((prev) => (prev !== null ? prev - 1 : null));
		}, 1000);

		return () => clearTimeout(timer);
	}, [countdown, onSubmit]);

	// Cancel auto-advance and reset search
	function handleCancelAdvance() {
		setCountdown(null);
		setIsAdvancing(false);
		setWasCancelled(true);
		onCancelSearch();
	}

	React.useEffect(() => {
		// Keep phone in sync with lookup
		if (phone && phone !== newClientData.telefone) {
			onNewClientChange({ telefone: phone });
		}
	}, [phone, newClientData.telefone, onNewClientChange]);

	// Show found client card with auto-advance
	const showFoundClientCard = isSuccessClient && client && !isAdvancing && !wasCancelled;
	// Show input only when not found or cancelled
	const showInput = !showFoundClientCard && !isAdvancing;

	return (
		<form
			className="space-y-8 animate-in fade-in slide-in-from-bottom-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			<div className="text-center space-y-2">
				<h2 className="text-xl font-black uppercase tracking-tight">Quem é o cliente?</h2>
				<p className="text-muted-foreground">Digite o número de telefone para localizar o perfil.</p>
			</div>

			{showInput ? (
				<>
					<div className="max-w-md mx-auto">
						<TextInput
							label="TELEFONE"
							inputType="tel"
							placeholder="(00) 00000-0000"
							value={phone}
							handleChange={onPhoneChange}
							onFocus={(e) => {
								setTimeout(() => {
									e.target.scrollIntoView({ behavior: "smooth", block: "center" });
								}, 300);
							}}
						/>
					</div>
					{isLoadingClient ? (
						<div className="w-full flex items-center justify-center gap-1.5">
							<Loader2 className="w-4 h-4 animate-spin" />
							<p className="text-sm text-muted-foreground">Buscando registros...</p>
						</div>
					) : null}
				</>
			) : null}

			{showFoundClientCard && client ? (
				<div className="bg-green-50 border-2 border-green-200 rounded-3xl p-6 flex flex-col items-center gap-4 animate-in zoom-in">
					<div className="text-center">
						<p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">✓ Perfil Encontrado</p>
						<p className="text-green-900 font-black text-2xl uppercase italic">{client.nome}</p>
						<p className="text-green-600 font-bold">{formatToPhone(client.telefone)}</p>
					</div>
					<div className="bg-green-600 w-full rounded-2xl p-4 text-center text-white shadow-md">
						<p className="text-[0.6rem] font-bold opacity-80 uppercase tracking-widest">Saldo Disponível</p>
						<p className="text-3xl font-black">{formatToMoney(client.saldos[0]?.saldoValorDisponivel ?? 0)}</p>
					</div>

					{/* Progress bar and countdown */}
					<div className="w-full flex flex-col gap-2">
						<div className="w-full h-2 bg-green-200 rounded-full overflow-hidden">
							<div
								className="h-full bg-green-600 transition-all duration-1000 ease-linear"
								style={{ width: `${((countdown ?? 0) / ADVANCE_COUNTDOWN_SECONDS) * 100}%` }}
							/>
						</div>
						<p className="text-sm text-green-700 text-center font-medium">
							Avançando em {countdown} segundo{countdown !== 1 ? "s" : ""}...
						</p>
					</div>

					<Button
						type="button"
						variant="outline"
						size="fit"
						className="w-full p-4 font-black border-green-300 text-green-700 hover:bg-green-100"
						onClick={handleCancelAdvance}
					>
						CANCELAR
					</Button>
				</div>
			) : null}

			{isAdvancing ? (
				<div className="w-full flex flex-col items-center justify-center gap-3 py-8">
					<Loader2 className="w-8 h-8 text-green-600 animate-spin" />
					<p className="text-sm text-muted-foreground font-medium">Avançando...</p>
				</div>
			) : null}

			{isSuccessClient && !client && showInput ? (
				<div className="bg-blue-50 border-2 border-blue-200 rounded-3xl p-6 animate-in zoom-in">
					<div className="flex items-center gap-3 mb-4">
						<div className="p-2 bg-blue-600 rounded-lg text-white">
							<UserPlus className="w-5 h-5" />
						</div>
						<div>
							<h3 className="font-black uppercase text-blue-900">NOVO CLIENTE</h3>
							<p className="text-xs text-blue-600">Complete os dados para criar o seu cadastro !</p>
						</div>
					</div>
					<div className="w-full flex flex-col gap-1.5">
						<TextInput
							label="NOME COMPLETO"
							placeholder="Digite o nome do cliente"
							value={newClientData.nome}
							handleChange={(value) => onNewClientChange({ nome: value })}
							onFocus={(e) => {
								setTimeout(() => {
									e.target.scrollIntoView({ behavior: "smooth", block: "center" });
								}, 300);
							}}
							width="100%"
						/>
						<TextInput
							label="CPF/CNPJ"
							inputType="tel"
							placeholder="Digite o CPF/CNPJ do cliente"
							value={newClientData.cpfCnpj || ""}
							handleChange={(value) => onNewClientChange({ cpfCnpj: formatToCPForCNPJ(value) })}
							onFocus={(e) => {
								setTimeout(() => {
									e.target.scrollIntoView({ behavior: "smooth", block: "center" });
								}, 300);
							}}
							width="100%"
						/>
					</div>
				</div>
			) : null}
		</form>
	);
}

function SaleValueStep({
	value,
	partnerCode,
	onChange,
	onPartnerCodeChange,
	onSubmit,
}: {
	value: number;
	partnerCode: string;
	onChange: (value: number) => void;
	onPartnerCodeChange: (code: string) => void;
	onSubmit: () => void;
}) {
	const helpers = [10, 25, 50, 100];
	return (
		<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
			<div className="text-center space-y-2">
				<h2 className="text-xl font-black uppercase tracking-tight">Qual o valor da compra?</h2>
			</div>
			<div className="relative max-w-md mx-auto">
				<span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-muted-foreground">R$</span>
				<Input
					type="number"
					value={value || ""}
					onChange={(e) => onChange(Number(e.target.value))}
					className="h-24 text-5xl font-black text-center rounded-3xl border-4 border-brand/20 focus:border-brand px-12"
					onFocus={(e) => {
						setTimeout(() => {
							e.target.scrollIntoView({ behavior: "smooth", block: "center" });
						}, 300);
					}}
				/>
			</div>
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-xl mx-auto">
				{helpers.map((h) => (
					<Button key={h} variant="secondary" onClick={() => onChange(value + h)} className="h-14 rounded-xl font-black text-lg">
						<Plus className="w-4 h-4 mr-1 text-brand" /> {h}
					</Button>
				))}
				<Button variant="ghost" onClick={() => onChange(0)} className="h-14 rounded-xl font-bold text-muted-foreground col-span-2 md:col-span-4 italic">
					<X className="w-4 h-4 mr-1" /> LIMPAR VALOR
				</Button>
			</div>
			<div className="max-w-md mx-auto">
				<TextInput
					label="CÓDIGO DO PARCEIRO (OPCIONAL)"
					placeholder="Digite o código de afiliação"
					value={partnerCode}
					handleChange={(v) => onPartnerCodeChange(v.toUpperCase())}
					width="100%"
				/>
			</div>
		</div>
	);
}

function CashbackStep({
	available,
	maxAllowed,
	applied,
	amount,
	isAttemptingToUseMoreCashbackThanAllowed,
	onToggle,
	onAmountChange,
	saleValue,
	finalValue,
	redemptionLimit,
	onSubmit,
}: {
	available: number;
	maxAllowed: number;
	applied: boolean;
	amount: number;
	isAttemptingToUseMoreCashbackThanAllowed: boolean;
	onToggle: (applied: boolean) => void;
	onAmountChange: (amount: number) => void;
	saleValue: number;
	finalValue: number;
	redemptionLimit: { tipo: string | null; valor: number | null };
	onSubmit: () => void;
}) {
	const getLimitDescription = () => {
		if (!redemptionLimit.tipo || redemptionLimit.valor === null) return null;
		if (redemptionLimit.tipo === "FIXO") {
			return `Limite máximo: ${formatToMoney(redemptionLimit.valor)}`;
		}
		return `Limite máximo: ${redemptionLimit.valor}% do valor da compra`;
	};
	return (
		<form
			className="space-y-6 animate-in fade-in slide-in-from-bottom-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			<div className="bg-brand/5 rounded-3xl p-6 border-2 border-dashed border-brand/20">
				<div className="flex justify-between items-center mb-4">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-green-100 rounded-lg text-green-600">
							<CreditCard className="w-5 h-5" />
						</div>
						<h3 className="font-black uppercase italic">Usar Cashback?</h3>
					</div>
					<Switch checked={applied} onCheckedChange={onToggle} disabled={available === 0} className="scale-125" />
				</div>
				<div className="grid grid-cols-2 gap-4">
					<div className="bg-white p-4 rounded-2xl shadow-sm border border-brand/20">
						<p className="text-[0.6rem] font-bold text-muted-foreground uppercase">Seu Saldo</p>
						<p className="text-xl font-black text-green-600">{formatToMoney(available)}</p>
					</div>
					<div className="bg-white p-4 rounded-2xl shadow-sm border border-brand/20">
						<p className="text-[0.6rem] font-bold text-muted-foreground uppercase">Limite p/ esta compra</p>
						<p className="text-xl font-black text-brand">{formatToMoney(maxAllowed)}</p>
					</div>
				</div>
				{getLimitDescription() && <p className="text-[0.65rem] font-medium text-muted-foreground text-center mt-2 italic">{getLimitDescription()}</p>}
			</div>

			{applied && (
				<div className="space-y-2 max-w-xs mx-auto text-center animate-in zoom-in">
					<Label className="font-bold text-xs text-muted-foreground uppercase tracking-widest">Valor a Resgatar</Label>
					<Input
						type="number"
						max={maxAllowed}
						value={amount}
						onChange={(e) => onAmountChange(Number(e.target.value))}
						className="h-16 text-3xl font-black text-center rounded-2xl border-2 border-green-200 bg-green-50/30"
						onFocus={(e) => {
							setTimeout(() => {
								e.target.scrollIntoView({ behavior: "smooth", block: "center" });
							}, 300);
						}}
					/>
				</div>
			)}

			<div className="bg-brand rounded-3xl p-8 text-brand-foreground shadow-2xl relative overflow-hidden">
				<div className="relative z-10 flex flex-col gap-4">
					<div className="flex justify-between items-center opacity-60">
						<span className="text-sm font-bold uppercase tracking-widest">Subtotal</span>
						<span className="font-bold">{formatToMoney(saleValue)}</span>
					</div>
					{applied && (
						<div className="flex justify-between items-center text-green-400">
							<span className="text-sm font-bold uppercase tracking-widest">Desconto Cashback</span>
							<span className="font-bold">- {formatToMoney(amount)}</span>
						</div>
					)}
					<div className="h-px bg-background my-2" />
					<div className="flex justify-between items-end">
						<span className="text-lg font-black uppercase italic">Total a Pagar</span>
						<span className="text-4xl font-black text-brand-foreground">{formatToMoney(finalValue)}</span>
					</div>
				</div>
				<BadgePercent className="absolute -right-4 -bottom-4 w-32 h-32 text-white/5 rotate-12" />
			</div>
			{isAttemptingToUseMoreCashbackThanAllowed && (
				<div className="w-full flex items-center justify-center">
					<div className="w-fit self-center flex items-center justify-center px-2 py-1 bg-red-200 text-red-600 rounded-2xl gap-1.5">
						<AlertTriangle className="w-4 h-4" />
						<p className="text-[0.65rem] font-medium text-center italic">O valor do cashback não pode ser maior que o valor máximo permitido.</p>
					</div>
				</div>
			)}
		</form>
	);
}

function ConfirmationStep({
	clientName,
	finalValue,
	operatorIdentifier,
	onOperatorIdentifierChange,
	onSubmit,
}: {
	clientName: string;
	finalValue: number;
	operatorIdentifier: string;
	onOperatorIdentifierChange: (identifier: string) => void;
	onSubmit: () => void;
}) {
	return (
		<form
			className="space-y-8 animate-in fade-in slide-in-from-bottom-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			<div className="text-center space-y-2">
				<h2 className="text-xl font-black uppercase tracking-tight">Finalizar Operação</h2>
				<p className="text-muted-foreground">Confira os dados e digite o usuário do operador.</p>
			</div>

			<div className="bg-brand/5 rounded-3xl p-6 space-y-3 border border-brand/20">
				<div className="flex justify-between">
					<span className="text-muted-foreground font-bold text-xs uppercase">Cliente</span>
					<span className="font-black text-brand">{clientName}</span>
				</div>
				<div className="flex justify-between">
					<span className="text-muted-foreground font-bold text-xs uppercase">Valor Final</span>
					<span className="font-black text-brand text-xl">{formatToMoney(finalValue)}</span>
				</div>
			</div>

			<div className="space-y-4 max-w-md mx-auto">
				<Label className="block text-center font-black text-xs text-muted-foreground uppercase tracking-widest italic">Senha do Operador</Label>
				<Input
					type="number"
					placeholder="*****"
					value={operatorIdentifier}
					onChange={(e) => onOperatorIdentifierChange(formatToNumericPassword(e.target.value))}
					className="h-16 text-2xl text-center rounded-2xl border-4 border-brand/20 focus:border-green-500 transition-all font-bold"
					onFocus={(e) => {
						setTimeout(() => {
							e.target.scrollIntoView({ behavior: "smooth", block: "center" });
						}, 300);
					}}
				/>
			</div>
		</form>
	);
}

"use client";

import type {
	TCreateCashbackProgramRedemptionInput,
	TCreateCashbackProgramRedemptionOutput,
} from "@/app/api/cashback-programs/transactions/redemption/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney, formatToNumericPassword, formatToPhone } from "@/lib/formatting";
import { createCashbackProgramRedemption } from "@/lib/mutations/cashback-programs";
import { createClientViaPointOfInteraction } from "@/lib/mutations/clients";
import { useClientByLookup } from "@/lib/queries/clients";
import { cn } from "@/lib/utils";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { usePointOfInteractionCashbackRedemptionState } from "@/state-hooks/use-point-of-interaction-cashback-redemption-state";
import { ClientStep } from "../_shared/components/client-step";
import { StepProgressHeader } from "../_shared/components/step-progress-header";
import { SuccessCelebration } from "../_shared/components/success-celebration";
import type { TStepDefinition } from "../_shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	Check,
	Lock,
	PartyPopper,
	Plus,
	ShoppingCart,
	Tag,
	UserPlus,
	UserRound,
	Wallet,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { toast } from "sonner";
import useSound from "use-sound";

const REDEMPTION_STEPS: TStepDefinition[] = [
	{ id: 1, label: "CLIENTE", icon: UserRound },
	{ id: 2, label: "VENDA", icon: Tag },
	{ id: 3, label: "RESGATE", icon: Wallet },
	{ id: 4, label: "CONFIRMAÇÃO", icon: Lock },
];

type NewCashbackRedemptionContentProps = {
	org: {
		id: TOrganizationEntity["id"];
		cnpj: TOrganizationEntity["cnpj"];
		nome: TOrganizationEntity["nome"];
		logoUrl: TOrganizationEntity["logoUrl"];
		telefone: TOrganizationEntity["telefone"];
	};
	clientId?: string;
	redemptionLimit: {
		tipo: string | null;
		valor: number | null;
	} | null;
};

export default function NewCashbackRedemptionContent({ org, clientId, redemptionLimit }: NewCashbackRedemptionContentProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { state, updateClient, updateSaleValue, updateRedemptionValue, updateOperatorIdentifier, resetState } =
		usePointOfInteractionCashbackRedemptionState(org.id);

	const [currentStep, setCurrentStep] = React.useState<number>(1);
	const [successData, setSuccessData] = React.useState<Awaited<TCreateCashbackProgramRedemptionOutput>["data"] | null>(null);
	const [isNewClientSignup, setIsNewClientSignup] = React.useState(false);
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
		if (currentStep === 2 && state.saleValue <= 0) {
			return toast.error("Digite o valor da venda.");
		}
		if (currentStep === 3) {
			if (state.redemptionValue <= 0) {
				return toast.error("Digite o valor do resgate.");
			}
			// Only check balance if client exists
			if (state.client.id) {
				if (state.redemptionValue > getAvailableCashback()) {
					return toast.error("Saldo insuficiente para este resgate.");
				}
			}
			if (state.redemptionValue > getMaxCashbackToRedeem()) {
				return toast.error("Valor excede o limite permitido para resgate.");
			}
		}
		playAction();
		setCurrentStep((prev) => Math.min(prev + 1, 4));
	};

	const getAvailableCashback = () => client?.saldos?.[0]?.saldoValorDisponivel ?? 0;

	const getMaxCashbackToRedeem = () => {
		// For new clients (no ID yet), they can't redeem since they have no balance
		if (!state.client.id) {
			return 0;
		}

		const available = getAvailableCashback();
		const saleValue = state.saleValue;

		let maxByLimit = available; // Default: limited by available balance
		if (redemptionLimit?.tipo && redemptionLimit.valor !== null) {
			if (redemptionLimit.tipo === "FIXO") {
				maxByLimit = redemptionLimit.valor;
			} else if (redemptionLimit.tipo === "PERCENTUAL") {
				maxByLimit = (saleValue * redemptionLimit.valor) / 100;
			}
		}

		return Math.min(available, saleValue, maxByLimit);
	};

	const { mutate: createClientMutation, isPending: isCreatingClient } = useMutation({
		mutationFn: createClientViaPointOfInteraction,
		onSuccess: (data) => {
			playSuccess();
			toast.success("Cadastro criado com sucesso!");
			setIsNewClientSignup(true);
			setCurrentStep(5);
		},
		onError: (error: unknown) => {
			const errorMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Erro ao criar cadastro.";
			toast.error(errorMessage);
		},
	});

	const { mutate: createRedemptionMutation, isPending: isCreatingRedemption } = useMutation({
		mutationFn: createCashbackProgramRedemption,
		onSuccess: (data) => {
			playSuccess();
			toast.success(`Resgate realizado! Novo saldo: ${formatToMoney(data.data.newBalance)}`);
			setIsNewClientSignup(false);
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
		setIsNewClientSignup(false);
		setCurrentStep(1);
	};

	async function handleCancelRedirect() {
		await queryClient.cancelQueries({ queryKey });
		await queryClient.invalidateQueries({ queryKey });
		updateParams({ phone: "", clientId: null });
	}

	const maximumCashbackAllowed = getMaxCashbackToRedeem();
	const isAttemptingToRedeemMoreThanAllowed = state.redemptionValue > maximumCashbackAllowed;

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
							<Wallet className="w-6 h-6 md:w-8 md:h-8" />
						</div>
						<div>
							<h1 className="text-2xl md:text-3xl font-black tracking-tighter">NOVO RESGATE</h1>
							<p className="text-[0.6rem] md:text-xs text-muted-foreground font-bold uppercase tracking-widest opacity-70">Passo {currentStep} de 4</p>
						</div>
					</div>
				</div>

				{/* Wrapper de Estágios */}
				<div className="bg-card rounded-3xl shadow-xl overflow-hidden border border-brand/20">
					{currentStep < 5 && <StepProgressHeader steps={REDEMPTION_STEPS} currentStep={currentStep} />}

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
								newClientAction={{
									label: "CRIAR CADASTRO",
									loadingLabel: "CRIANDO CADASTRO...",
									onSubmit: () => {
										createClientMutation({
											orgId: org.id,
											client: {
												nome: state.client.nome,
												telefone: state.client.telefone,
												cpfCnpj: state.client.cpfCnpj || null,
											},
										});
									},
									isPending: isCreatingClient,
								}}
							/>
						)}
						{currentStep === 2 && <SaleValueStep value={state.saleValue} onChange={updateSaleValue} onSubmit={handleNextStep} />}
						{currentStep === 3 && (
							<RedemptionStep
								available={getAvailableCashback()}
								maxAllowed={maximumCashbackAllowed}
								saleValue={state.saleValue}
								amount={state.redemptionValue}
								isAttemptingToRedeemMoreThanAllowed={isAttemptingToRedeemMoreThanAllowed}
								redemptionLimit={redemptionLimit}
								isNewClient={!state.client.id}
								onAmountChange={updateRedemptionValue}
								onSubmit={handleNextStep}
							/>
						)}
						{currentStep === 4 && (
							<ConfirmationStep
								clientName={state.client.nome || client?.nome || ""}
								redemptionValue={state.redemptionValue}
								operatorIdentifier={state.operatorIdentifier}
								onOperatorIdentifierChange={updateOperatorIdentifier}
								onSubmit={() =>
									createRedemptionMutation({
										orgId: org.id,
										clientId: state.client.id as string,
										saleValue: state.saleValue,
										redemptionValue: state.redemptionValue,
										operatorIdentifier: state.operatorIdentifier,
									})
								}
							/>
						)}
						{currentStep === 5 && isNewClientSignup && (
							<NewClientSuccessStep
								clientName={state.client.nome}
								onReset={handleReset}
								onGoHome={() => router.push(`/point-of-interaction/${org.id}`)}
								onNewSale={() => router.push(`/point-of-interaction/${org.id}/new-sale`)}
							/>
						)}
						{currentStep === 5 && !isNewClientSignup && successData && (
							<SuccessCelebration
								title="RESGATE REALIZADO!"
								subtitle="O saldo foi baixado com sucesso."
								stats={[
									{ label: "VALOR RESGATADO", value: state.redemptionValue, variant: "green" },
									{ label: "NOVO SALDO TOTAL", value: successData.newBalance, variant: "brand" },
								]}
								primaryAction={{ label: "NOVO RESGATE", onClick: handleReset }}
								secondaryAction={{ label: "VOLTAR AO INÍCIO", onClick: () => router.push(`/point-of-interaction/${org.id}`) }}
							/>
						)}

						{/* Botões de Ação */}
						{currentStep < 5 && !(currentStep === 1 && client) && !(isSuccessClient && !client) ? (
							<div className="flex gap-4 mt-10">
								{currentStep > 1 && (
									<Button onClick={() => setCurrentStep((p) => p - 1)} variant="outline" size="lg" className="flex-1 rounded-2xl h-16 text-lg font-bold">
										VOLTAR
									</Button>
								)}
								<Button
									onClick={
										currentStep === 4
											? () =>
													createRedemptionMutation({
														orgId: org.id,
														clientId: state.client.id as string,
														saleValue: state.saleValue,
														redemptionValue: state.redemptionValue,
														operatorIdentifier: state.operatorIdentifier,
													})
											: handleNextStep
									}
									size="lg"
									disabled={isCreatingRedemption || isAttemptingToRedeemMoreThanAllowed}
									className={cn(
										"flex-1 rounded-2xl h-16 text-lg font-bold shadow-lg shadow-brand/20 uppercase tracking-widest",
										currentStep === 4 && "bg-green-600 hover:bg-green-700",
									)}
								>
									{currentStep === 4 ? (isCreatingRedemption ? "PROCESSANDO..." : "FINALIZAR") : "PRÓXIMO"}
									{currentStep === 4 ? <Check className="ml-2 w-6 h-6" /> : <ArrowRight className="ml-2 w-6 h-6" />}
								</Button>
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

function NewClientSuccessStep({
	clientName,
	onReset,
	onGoHome,
	onNewSale,
}: {
	clientName: string;
	onReset: () => void;
	onGoHome: () => void;
	onNewSale: () => void;
}) {
	return (
		<div className="flex flex-col items-center text-center space-y-8 animate-in zoom-in duration-500">
			<div className="relative">
				<div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full scale-150 animate-pulse" />
				<div className="relative bg-blue-600 p-8 rounded-full text-white shadow-2xl shadow-blue-600/30">
					<UserPlus className="w-20 h-20" />
				</div>
				<div className="absolute -top-4 -right-4 bg-yellow-400 p-3 rounded-2xl text-yellow-900 shadow-lg animate-bounce">
					<PartyPopper className="w-6 h-6" />
				</div>
			</div>

			<div className="space-y-3">
				<h2 className="text-4xl font-black uppercase tracking-tighter text-blue-700">BEM-VINDO!</h2>
				<p className="text-2xl font-bold text-foreground">{clientName}</p>
				<p className="text-muted-foreground font-medium text-lg max-w-md">Seu cadastro foi criado com sucesso!</p>
			</div>

			<div className="bg-linear-to-br from-blue-50 to-brand/5 border-2 border-blue-200 rounded-3xl p-8 shadow-lg max-w-xl w-full">
				<div className="space-y-4">
					<div className="flex items-start gap-4">
						<div className="p-3 bg-brand rounded-xl text-brand-foreground">
							<Wallet className="w-6 h-6" />
						</div>
						<div className="flex-1 text-left">
							<h3 className="font-black text-lg uppercase tracking-tight mb-2">COMECE A ACUMULAR CASHBACK!</h3>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Agora você faz parte do nosso programa de recompensas! A cada compra, você acumula cashback que pode ser usado em futuras transações.
							</p>
						</div>
					</div>
					<div className="bg-brand/10 rounded-2xl p-4 border-2 border-dashed border-brand/30">
						<p className="text-sm font-bold text-brand text-center">💰 Faça sua primeira compra e comece a ganhar benefícios!</p>
					</div>
				</div>
			</div>

			<div className="flex flex-col sm:flex-row gap-4 w-full max-w-xl">
				<Button
					onClick={onGoHome}
					variant="outline"
					size="lg"
					className="flex-1 rounded-2xl h-20 text-xl font-black border-4 hover:bg-muted uppercase tracking-wider"
				>
					VOLTAR AO INÍCIO
				</Button>
			</div>

			<button type="button" onClick={onReset} className="text-sm text-muted-foreground hover:text-foreground underline transition-colors">
				Cadastrar outro cliente
			</button>
		</div>
	);
}

// --- Sub-componentes ---

function SaleValueStep({ value, onChange, onSubmit }: { value: number; onChange: (value: number) => void; onSubmit: () => void }) {
	const helpers = [10, 25, 50, 100];
	return (
		<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
			<div className="text-center space-y-2">
				<h2 className="text-xl font-black uppercase tracking-tight">Qual o valor da compra?</h2>
				<p className="text-muted-foreground text-sm">Informe o valor total da compra para calcular o limite de resgate.</p>
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
		</div>
	);
}

function RedemptionStep({
	available,
	maxAllowed,
	amount,
	isAttemptingToRedeemMoreThanAllowed,
	onAmountChange,
	saleValue,
	redemptionLimit,
	isNewClient,
	onSubmit,
}: {
	available: number;
	maxAllowed: number;
	amount: number;
	isAttemptingToRedeemMoreThanAllowed: boolean;
	onAmountChange: (amount: number) => void;
	saleValue: number;
	redemptionLimit: { tipo: string | null; valor: number | null } | null;
	isNewClient: boolean;
	onSubmit: () => void;
}) {
	const getLimitDescription = () => {
		if (!redemptionLimit?.tipo || redemptionLimit.valor === null) return null;
		if (redemptionLimit.tipo === "FIXO") {
			return `Limite máximo: ${formatToMoney(redemptionLimit.valor)}`;
		}
		return `Limite máximo: ${redemptionLimit.valor}% do valor da compra`;
	};

	const helpers = [10, 25, 50, 100];
	const isOverBalance = amount > available;
	const isOverLimit = amount > maxAllowed;

	return (
		<form
			className="space-y-4 animate-in fade-in slide-in-from-bottom-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			<div className="text-center space-y-2">
				<h2 className="text-xl font-black uppercase tracking-tight">Qual o valor do resgate?</h2>
			</div>

			{isNewClient && (
				<div className="bg-blue-50 border-2 border-blue-200 rounded-3xl p-4 animate-in zoom-in">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-blue-600 rounded-lg text-white">
							<UserPlus className="w-5 h-5" />
						</div>
						<div>
							<h3 className="font-black uppercase text-blue-900 text-sm">NOVO CLIENTE</h3>
							<p className="text-xs text-blue-600">Este é um cliente novo. Após criar o cadastro, o saldo estará disponível em futuras transações.</p>
						</div>
					</div>
				</div>
			)}

			<div className="relative max-w-md mx-auto">
				<span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-muted-foreground">R$</span>
				<Input
					type="number"
					value={amount || ""}
					onChange={(e) => onAmountChange(Number(e.target.value))}
					className="h-16 text-3xl font-black text-center rounded-3xl border-4 border-brand/20 focus:border-brand px-12"
					onFocus={(e) => {
						setTimeout(() => {
							e.target.scrollIntoView({ behavior: "smooth", block: "center" });
						}, 300);
					}}
				/>
			</div>

			<div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-xl mx-auto">
				{helpers.map((h) => (
					<Button
						key={h}
						type="button"
						variant="secondary"
						onClick={() => onAmountChange(Math.min(amount + h, available, maxAllowed))}
						className="h-14 rounded-xl font-black text-lg"
					>
						<Plus className="w-4 h-4 mr-1 text-brand" /> {h}
					</Button>
				))}
				<Button
					type="button"
					variant="ghost"
					onClick={() => onAmountChange(0)}
					className="h-10 rounded-xl font-bold text-muted-foreground col-span-2 md:col-span-4 italic"
				>
					<X className="w-4 h-4 mr-1" /> LIMPAR VALOR
				</Button>
			</div>

			{isOverBalance ? (
				<div className="w-full flex items-center justify-center flex-col px-1.5 py-3 bg-red-200 text-red-600 rounded-2xl gap-1.5">
					<div className="w-fit self-center flex items-center justify-center gap-1.5">
						<AlertTriangle className="w-4 h-4" />
						<p className="text-xs font-medium text-center italic">Oops, saldo insuficiente para este resgate :(</p>
					</div>
					<button type="button" onClick={() => onAmountChange(available)} className="px-2 py-1 rounded-xl bg-red-600 text-white text-xs font-medium">
						USAR SALDO DISPONÍVEL
					</button>
				</div>
			) : isOverLimit ? (
				<div className="w-full flex items-center justify-center flex-col px-1.5 py-3 bg-red-200 text-red-600 rounded-2xl gap-1.5">
					<div className="w-fit self-center flex items-center justify-center gap-1.5">
						<AlertTriangle className="w-4 h-4" />
						<p className="text-xs font-medium text-center italic">O valor do resgate não pode ser maior que o limite permitido.</p>
					</div>
					<button type="button" onClick={() => onAmountChange(maxAllowed)} className="px-2 py-1 rounded-xl bg-red-600 text-white text-xs font-medium">
						USAR VALOR MÁXIMO
					</button>
				</div>
			) : null}

			{getLimitDescription() && (
				<p className="text-[0.65rem] font-medium text-muted-foreground text-center italic">
					{getLimitDescription()}
					{saleValue > 0 && redemptionLimit?.tipo === "PERCENTUAL" && <> (Máx: {formatToMoney(maxAllowed)})</>}
				</p>
			)}
		</form>
	);
}

function ConfirmationStep({
	clientName,
	redemptionValue,
	operatorIdentifier,
	onOperatorIdentifierChange,
	onSubmit,
}: {
	clientName: string;
	redemptionValue: number;
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
				<h2 className="text-xl font-black uppercase tracking-tight">Finalizar Resgate</h2>
				<p className="text-muted-foreground">Confira os dados e digite a senha do operador.</p>
			</div>

			<div className="bg-brand/5 rounded-3xl p-6 space-y-3 border border-brand/20">
				<div className="flex justify-between">
					<span className="text-muted-foreground font-bold text-xs uppercase">Cliente</span>
					<span className="font-black text-brand">{clientName}</span>
				</div>
				<div className="flex justify-between">
					<span className="text-muted-foreground font-bold text-xs uppercase">Valor do Resgate</span>
					<span className="font-black text-green-600 text-xl">{formatToMoney(redemptionValue)}</span>
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

"use client";

import type { TCreatePointOfInteractionTransactionOutput } from "@/app/api/point-of-interaction/new-transaction/route";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney, formatToPhone } from "@/lib/formatting";
import { createPointOfInteractionSale } from "@/lib/mutations/sales";
import { useClientByLookup } from "@/lib/queries/clients";
import { cn } from "@/lib/utils";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { usePointOfInteractionNewSaleState } from "@/state-hooks/use-point-of-interaction-new-sale-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BadgePercent, Check, Gift, Lock, ShoppingCart, Tag, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo } from "react";
import { toast } from "sonner";
import useSound from "use-sound";
import { ClientStep } from "../_shared/components/client-step";
import { StepProgressHeader } from "../_shared/components/step-progress-header";
import { SuccessCelebration } from "../_shared/components/success-celebration";
import { getAvailableCashback, getFinalValue, getMaxCashbackToUse, getRedemptionLimitConfig } from "../_shared/helpers/cashback-calculations";
import type { TPrize, TStepDefinition } from "../_shared/types";
import { CashbackStep } from "./components/cashback-step";
import { ConfirmationStep } from "./components/confirmation-step";
import { ModeSelectionStep } from "./components/mode-selection-step";
import { PrizeConfirmationStep } from "./components/prize-confirmation-step";
import { PrizeSelectionStep } from "./components/prize-selection-step";
import { SaleValueStep } from "./components/sale-value-step";

const DISCOUNT_STEPS: TStepDefinition[] = [
	{ id: 1, label: "CLIENTE", icon: UserRound },
	{ id: 2, label: "VENDA", icon: Tag },
	{ id: 3, label: "CASHBACK", icon: BadgePercent },
	{ id: 4, label: "CONFIRMAÇÃO", icon: Lock },
];

const PRIZE_STEPS: TStepDefinition[] = [
	{ id: 1, label: "CLIENTE", icon: UserRound },
	{ id: 2, label: "RECOMPENSA", icon: Gift },
	{ id: 3, label: "CONFIRMAÇÃO", icon: Lock },
];

type NewSaleContentProps = {
	org: {
		id: TOrganizationEntity["id"];
		cnpj: TOrganizationEntity["cnpj"];
		nome: TOrganizationEntity["nome"];
		logoUrl: TOrganizationEntity["logoUrl"];
		telefone: TOrganizationEntity["telefone"];
		modalidadeDescontosPermitida: boolean;
		modalidadeRecompensasPermitida: boolean;
	};
	clientId?: string;
	prizes: TPrize[];
};
export default function NewSaleContent({ org, clientId, prizes }: NewSaleContentProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { state, updateClient, updateSale, updateCashback, updatePrizeRedemption, updateOperatorIdentifier, resetState } =
		usePointOfInteractionNewSaleState(org.id);

	const [currentStep, setCurrentStep] = React.useState<number>(1);
	const [successData, setSuccessData] = React.useState<TCreatePointOfInteractionTransactionOutput["data"] | null>(null);

	// Prize flow state
	const [flowMode, setFlowMode] = React.useState<"discount" | "prize" | null>(null);
	const [showModeSelection, setShowModeSelection] = React.useState(false);
	const [selectedPrize, setSelectedPrize] = React.useState<TPrize | null>(null);

	const hasPrizes = prizes.length > 0;
	const isDiscountModeAllowed = org.modalidadeDescontosPermitida;
	const isPrizeModeAllowed = org.modalidadeRecompensasPermitida && hasPrizes;
	const shouldShowFlowModeSelection = isDiscountModeAllowed && isPrizeModeAllowed;
	const effectiveFlowMode: "discount" | "prize" = shouldShowFlowModeSelection ? (flowMode ?? "discount") : isPrizeModeAllowed ? "prize" : "discount";
	const isPrizeMode = effectiveFlowMode === "prize";
	const totalSteps = isPrizeMode ? 3 : 4;
	const successStep = isPrizeMode ? 4 : 5;

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

	// Memoized cashback calculations
	const availableCashback = useMemo(() => getAvailableCashback(client?.saldos), [client?.saldos]);
	const redemptionLimitConfig = useMemo(() => getRedemptionLimitConfig(client?.saldos), [client?.saldos]);
	const maximumCashbackAllowed = useMemo(
		() => getMaxCashbackToUse(availableCashback, state.sale.valor, redemptionLimitConfig),
		[availableCashback, state.sale.valor, redemptionLimitConfig],
	);
	const finalValue = useMemo(() => getFinalValue(state.sale.valor, state.sale.cashback), [state.sale.valor, state.sale.cashback]);

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
			if (!state.client.id && (!state.client.nome || !state.client.telefone)) {
				return toast.error("Complete os dados do cliente.");
			}
			if (shouldShowFlowModeSelection && flowMode === null) {
				setShowModeSelection(true);
				return;
			}
		}
		if (!isPrizeMode && currentStep === 2 && state.sale.valor <= 0) {
			return toast.error("Digite o valor da venda.");
		}
		if (!isPrizeMode && currentStep === 2) {
			updateCashback({
				aplicar: maximumCashbackAllowed > 0,
				valor: maximumCashbackAllowed,
			});
		}
		playAction();
		setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
	};

	const handleSelectFlowMode = (mode: "discount" | "prize") => {
		if ((mode === "discount" && !isDiscountModeAllowed) || (mode === "prize" && !isPrizeModeAllowed)) {
			return;
		}
		setFlowMode(mode);
		setShowModeSelection(false);
		playAction();
		setCurrentStep(2);
	};

	const handleSelectPrize = (prize: TPrize) => {
		if (availableCashback < prize.valor) return;
		setSelectedPrize(prize);
		updateSale({ valor: prize.valor });
		updateCashback({ aplicar: true, valor: prize.valor });
		updatePrizeRedemption({ prizeId: prize.id, prizeValue: prize.valor });
		playAction();
		setCurrentStep(3);
	};

	const isAttemptingToUseMoreCashbackThanAllowed = state.sale.cashback.aplicar && state.sale.cashback.valor > maximumCashbackAllowed;

	const { mutate: createSaleMutation, isPending: isCreatingSale } = useMutation({
		mutationFn: createPointOfInteractionSale,
		onSuccess: (data) => {
			const visualAccumulatedCashbackValue = data.data.visualClientAccumulatedCashbackValue ?? data.data.clientAccumulatedCashbackValue;
			playSuccess();
			toast.success(`Venda finalizada! Saldo: ${formatToMoney(visualAccumulatedCashbackValue)}`);
			setSuccessData(data.data);
			setCurrentStep(successStep);
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
		setFlowMode(null);
		setShowModeSelection(false);
		setSelectedPrize(null);
	};

	async function handleCancelRedirect() {
		await queryClient.cancelQueries({ queryKey });
		await queryClient.invalidateQueries({ queryKey });
		updateParams({ phone: "", clientId: null });
	}

	const headerSteps = isPrizeMode ? PRIZE_STEPS : DISCOUNT_STEPS;
	const confirmationStep = isPrizeMode ? 3 : 4;

	return (
		<div className="w-full min-h-screen p-6 md:p-10 short:p-3 short:min-h-0 flex flex-col items-center">
			<div className="w-full max-w-4xl flex flex-col gap-6 short:gap-3">
				{/* Header com Navegação */}
				<div className="flex items-center gap-4 short:gap-1.5">
					<Button
						variant="ghost"
						size="fit"
						asChild
						className="rounded-full hover:bg-brand/10 flex items-center gap-1 px-2 py-2 short:px-1.5 short:py-0.5"
					>
						<Link href={`/point-of-interaction/${org.id}`} className="flex items-center gap-1">
							<ArrowLeft className="w-5 h-5 short:w-3.5 short:h-3.5" />
							<span className="short:text-xs">VOLTAR</span>
						</Link>
					</Button>
					<div className="flex items-center gap-3 short:gap-1.5">
						<div className="p-3 short:p-1.5 bg-brand rounded-2xl short:rounded-lg text-brand-foreground shadow-lg">
							<ShoppingCart className="w-6 h-6 md:w-8 md:h-8 short:w-4 short:h-4" />
						</div>
						<div>
							<h1 className="text-2xl md:text-3xl short:text-base font-black tracking-tighter">NOVA VENDA</h1>
							<p className="text-[0.6rem] md:text-xs short:text-[0.6rem] text-muted-foreground font-bold uppercase tracking-widest opacity-70">
								{showModeSelection ? "Escolha o modo" : `Passo ${currentStep} de ${totalSteps}`}
							</p>
						</div>
					</div>
				</div>

				{/* Wrapper de Estágios */}
				<div className="bg-card rounded-3xl short:rounded-xl shadow-xl overflow-hidden border border-brand/20">
					{currentStep < successStep && !showModeSelection && <StepProgressHeader steps={headerSteps} currentStep={currentStep} />}

					<div className="p-6 md:p-10 short:p-3">
						{/* Mode Selection Screen */}
						{showModeSelection && <ModeSelectionStep onSelectMode={handleSelectFlowMode} />}

						{/* Step 1: Client */}
						{!showModeSelection && currentStep === 1 && (
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

						{/* Discount mode steps */}
						{!showModeSelection && !isPrizeMode && currentStep === 2 && (
							<SaleValueStep value={state.sale.valor} onChange={(v) => updateSale({ valor: v })} onSubmit={handleNextStep} />
						)}
						{!showModeSelection && !isPrizeMode && currentStep === 3 && (
							<CashbackStep
								available={availableCashback}
								maxAllowed={maximumCashbackAllowed}
								saleValue={state.sale.valor}
								applied={state.sale.cashback.aplicar}
								amount={state.sale.cashback.valor}
								isAttemptingToUseMoreCashbackThanAllowed={isAttemptingToUseMoreCashbackThanAllowed}
								finalValue={finalValue}
								redemptionLimit={redemptionLimitConfig}
								onToggle={(v) =>
									updateCashback({
										aplicar: v,
										valor: v ? maximumCashbackAllowed : 0,
									})
								}
								onAmountChange={(v) => updateCashback({ valor: v })}
								onSubmit={handleNextStep}
							/>
						)}
						{!showModeSelection && !isPrizeMode && currentStep === 4 && (
							<ConfirmationStep
								clientName={state.client.nome || client?.nome || ""}
								finalValue={finalValue}
								operatorIdentifier={state.operatorIdentifier}
								onOperatorIdentifierChange={updateOperatorIdentifier}
								onSubmit={() => createSaleMutation(state)}
							/>
						)}

						{/* Prize mode steps */}
						{!showModeSelection && isPrizeMode && currentStep === 2 && (
							<PrizeSelectionStep prizes={prizes} availableBalance={availableCashback} onSelectPrize={handleSelectPrize} />
						)}
						{!showModeSelection && isPrizeMode && currentStep === 3 && (
							<PrizeConfirmationStep
								clientName={state.client.nome || client?.nome || ""}
								selectedPrize={selectedPrize}
								availableBalance={availableCashback}
								operatorIdentifier={state.operatorIdentifier}
								onOperatorIdentifierChange={updateOperatorIdentifier}
								onSubmit={() => createSaleMutation(state)}
							/>
						)}

						{/* Discount mode success */}
						{!showModeSelection && !isPrizeMode && currentStep === 5 && successData && (
							<SuccessCelebration
								title="VENDA REALIZADA!"
								subtitle="A operação foi processada com sucesso."
								stats={[
									{
										label: "CASHBACK GERADO",
										value: successData.visualClientAccumulatedCashbackValue ?? successData.clientAccumulatedCashbackValue,
										variant: "green",
									},
									{
										label: "NOVO SALDO TOTAL",
										value: successData.visualClientNewOverallAvailableBalance ?? successData.clientNewOverallAvailableBalance ?? 0,
										variant: "brand",
									},
									{
										label: "VALOR DA COMPRA",
										value: state.sale.valor,
										variant: "brand",
									},
									...(state.sale.cashback.aplicar
										? [
												{
													label: "VALOR COM DESCONTO",
													value: state.sale.valor - state.sale.cashback.valor,
													variant: "green" as const,
												},
											]
										: []),
								]}
								primaryAction={{ label: "NOVA VENDA", onClick: handleReset }}
								secondaryAction={{ label: "VOLTAR AO INÍCIO", onClick: () => router.push(`/point-of-interaction/${org.id}`) }}
							/>
						)}

						{/* Prize mode success */}
						{!showModeSelection && isPrizeMode && currentStep === 4 && successData && (
							<SuccessCelebration
								title="RESGATE REALIZADO!"
								subtitle="A recompensa foi resgatada com sucesso."
								stats={[
									{
										label: "CASHBACK GERADO",
										value: successData.visualClientAccumulatedCashbackValue ?? successData.clientAccumulatedCashbackValue,
										variant: "green",
									},
									{
										label: "NOVO SALDO TOTAL",
										value: successData.visualClientNewOverallAvailableBalance ?? successData.clientNewOverallAvailableBalance ?? 0,
										variant: "brand",
									},
								]}
								primaryAction={{ label: "NOVA VENDA", onClick: handleReset }}
								secondaryAction={{ label: "VOLTAR AO INÍCIO", onClick: () => router.push(`/point-of-interaction/${org.id}`) }}
							>
								{selectedPrize && (
									<div className="bg-amber-50 border-2 short:border border-amber-200 rounded-3xl short:rounded-xl p-4 short:p-2 flex items-center gap-4 short:gap-2 w-full max-w-xl">
										<div className="relative w-14 h-14 short:w-10 short:h-10 min-w-14 short:min-w-10 rounded-xl short:rounded-lg overflow-hidden">
											{selectedPrize.imagemCapaUrl ? (
												<Image src={selectedPrize.imagemCapaUrl} alt={selectedPrize.titulo} fill className="object-cover" />
											) : (
												<div className="flex h-full w-full items-center justify-center bg-amber-200 text-amber-700">
													<Gift className="w-6 h-6 short:w-4 short:h-4" />
												</div>
											)}
										</div>
										<div className="flex-1 min-w-0 text-left">
											<h3 className="font-black text-sm short:text-xs uppercase tracking-tight truncate">{selectedPrize.titulo}</h3>
											<p className="font-black text-lg short:text-base text-amber-700">{formatToMoney(selectedPrize.valor)}</p>
										</div>
									</div>
								)}
							</SuccessCelebration>
						)}

						{/* Action Buttons */}
						{!showModeSelection && currentStep < successStep && !(currentStep === 1 && client) && (
							<div className="flex gap-4 short:gap-3 mt-10 short:mt-4">
								{currentStep > 1 && (
									<Button
										onClick={() => {
											if (isPrizeMode && currentStep === 3) {
												setSelectedPrize(null);
												updatePrizeRedemption(null);
												updateSale({ valor: 0 });
												updateCashback({ aplicar: false, valor: 0 });
											}
											setCurrentStep((p) => p - 1);
										}}
										variant="outline"
										size="lg"
										className="flex-1 rounded-2xl short:rounded-lg h-16 short:h-11 text-lg short:text-base font-bold"
									>
										VOLTAR
									</Button>
								)}
								{!(isPrizeMode && currentStep === 2) && (
									<Button
										onClick={currentStep === confirmationStep ? () => createSaleMutation(state) : handleNextStep}
										size="lg"
										disabled={isCreatingSale || (!isPrizeMode && isAttemptingToUseMoreCashbackThanAllowed)}
										className={cn(
											"flex-1 rounded-2xl short:rounded-lg h-16 short:h-11 text-lg short:text-base font-bold shadow-lg shadow-brand/20 uppercase tracking-widest",
											currentStep === confirmationStep && "bg-green-600 hover:bg-green-700",
										)}
									>
										{currentStep === confirmationStep ? (isCreatingSale ? "PROCESSANDO..." : "FINALIZAR") : "PRÓXIMO"}
										{currentStep === confirmationStep ? (
											<Check className="ml-2 w-6 h-6 short:w-5 short:h-5" />
										) : (
											<ArrowRight className="ml-2 w-6 h-6 short:w-5 short:h-5" />
										)}
									</Button>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

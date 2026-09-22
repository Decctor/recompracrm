"use client";

import type { TCreatePointOfInteractionTransactionOutput } from "@/app/api/point-of-interaction/new-transaction/route";
import { Button } from "@/components/ui/button";
import { captureClientEvent } from "@/lib/analytics/posthog-client";
import { getErrorMessage } from "@/lib/errors";
import { formatCashbackValue } from "@/lib/formatting";
import { createPoiTransactionRequest } from "@/lib/mutations/poi-transaction-requests";
import { createPointOfInteractionSale } from "@/lib/mutations/sales";
import { sumPoiPrizeSaleValue, sumPoiPrizeValue } from "@/lib/point-of-interaction/prize-lines";
import {
	getPoiSaleValueForConfirmation,
	poiSaleRequiresValueConfirmation,
	saleValuesMatch,
} from "@/lib/point-of-interaction/sale-value-confirmation";
import { useClientByLookup } from "@/lib/queries/clients";
import { type TPoiAvailableCoupon, usePoiAvailableCoupons } from "@/lib/queries/coupons";
import { cn } from "@/lib/utils";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import {
	usePointOfInteractionNewSaleState,
	type TPointOfInteractionNewSaleState,
} from "@/state-hooks/use-point-of-interaction-new-public-transaction-request";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BadgePercent, Check, Gift, Lock, ShoppingCart, Tag } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo } from "react";
import { toast } from "sonner";
import useSound from "use-sound";
import { StepProgressHeader } from "../_shared/components/step-progress-header";
import { SuccessCelebration } from "../_shared/components/success-celebration";
import {
	getAvailableCashback,
	getCashbackAccumulationConfig,
	getFinalValue,
	getMaxCashbackToUse,
	getRedemptionLimitConfig,
} from "../_shared/helpers/cashback-calculations";
import type { TPrize, TSelectedPrize, TStepDefinition } from "../_shared/types";
import { CouponSelectionBlock } from "./components/coupon-selection-block";
import { CashbackStep } from "./components/kiosk/cashback-step";
import { ConfirmationStep as KioskConfirmationStep } from "./components/kiosk/confirmation-step";
import { ModeSelectionStep } from "./components/kiosk/mode-selection-step";
import { PrizeConfirmationStep as KioskPrizeConfirmationStep } from "./components/kiosk/prize-confirmation-step";
import { PrizeSelectionStep } from "./components/kiosk/prize-selection-step";
import { SaleValueStep } from "./components/kiosk/sale-value-step";
import { MobilePrizeConfirmationStep } from "./components/mobile/prize-confirmation-step";
import { MobileWaitingStep } from "./components/mobile/waiting-step";

// Steps without the CLIENT step - client is now identified on the hub
const DISCOUNT_STEPS: TStepDefinition[] = [
	{ id: 1, label: "VENDA", icon: Tag },
	{ id: 2, label: "CASHBACK", icon: BadgePercent },
	{ id: 3, label: "CONFIRMAÇÃO", icon: Lock },
];

const DISCOUNT_STEPS_MOBILE: TStepDefinition[] = [
	{ id: 1, label: "VENDA", icon: Tag },
	{ id: 2, label: "CASHBACK", icon: BadgePercent },
];

const PRIZE_STEPS: TStepDefinition[] = [
	{ id: 1, label: "RECOMPENSAS", icon: Gift },
	{ id: 2, label: "CONFIRMAÇÃO", icon: Lock },
];

// Mobile: a cesta é montada no passo 1 e revisada no passo 2 antes de virar solicitação.
const PRIZE_STEPS_MOBILE: TStepDefinition[] = [
	{ id: 1, label: "RECOMPENSAS", icon: Gift },
	{ id: 2, label: "CONFIRMAR", icon: Check },
];

const PRIZE_SALE_ONLY_STEPS: TStepDefinition[] = [
	{ id: 1, label: "RECOMPENSAS", icon: Gift },
	{ id: 2, label: "VENDA", icon: Tag },
	{ id: 3, label: "CONFIRMAÇÃO", icon: Lock },
];

const PRIZE_SALE_ONLY_STEPS_MOBILE: TStepDefinition[] = [
	{ id: 1, label: "RECOMPENSAS", icon: Gift },
	{ id: 2, label: "VENDA", icon: Tag },
];

// Tolerância de ponto flutuante ao comparar o valor da recompensa com o saldo restante.
const BALANCE_EPSILON = 0.0001;

type NewSaleContentProps = {
	org: {
		id: TOrganizationEntity["id"];
		cnpj: TOrganizationEntity["cnpj"];
		nome: TOrganizationEntity["nome"];
		logoUrl: TOrganizationEntity["logoUrl"];
		telefone: TOrganizationEntity["telefone"];
		terminologia: TCashbackProgramTerminologyEnum;
		modalidadeDescontosPermitida: boolean;
		modalidadeRecompensasPermitida: boolean;
		acumuloPermitirViaPontoIntegracao: boolean;
		resgatePermitirViaPontoIntegracao: boolean;
		poiConfirmacaoValorObrigatoria: boolean;
	};
	clientId: string;
	prizes: TPrize[];
	initialOperatorPassword?: string;
	mode: "kiosk" | "mobile";
	// Intenção vinda do hub quando as duas ações estavam visíveis lá.
	intent?: "pontuar" | "resgatar" | null;
};
export default function NewSaleContent({ org, clientId, prizes, initialOperatorPassword, mode, intent = null }: NewSaleContentProps) {
	const router = useRouter();
	const {
		state,
		updateClient,
		updateSale,
		updateCashback,
		updatePrizeRedemptions,
		addPrizeRedemption,
		setPrizeRedemptionQuantity,
		updateCoupon,
		updateOperatorIdentifier,
		updateOperatorConfirmedSaleValue,
		updateWatchTransactionRequest,
		redefineState,
	} = usePointOfInteractionNewSaleState(org.id, mode);

	const hasPrizes = prizes.length > 0;
	// Gate de resgate pelo POI. O caminho mobile cria uma SOLICITAÇÃO (não passa pelo 403 da API de
	// transação na hora do envio), então a UI precisa ser a barreira: sem resgate liberado não existe
	// modo recompensa nem opção de aplicar saldo — resta o caminho de puro acúmulo.
	const isRedemptionAllowedViaPoi = org.resgatePermitirViaPontoIntegracao;
	const isDiscountModeAllowed = org.modalidadeDescontosPermitida;
	const isPrizeModeAllowed = org.modalidadeRecompensasPermitida && hasPrizes && isRedemptionAllowedViaPoi;
	const shouldShowFlowModeSelection = isDiscountModeAllowed && isPrizeModeAllowed;

	// Programa só de recompensas (descontos desligados): `effectiveFlowMode` força o modo prêmio e
	// ignoraria o `intent=pontuar` do hub — o cliente cairia na vitrine de recompensas quando pediu
	// para registrar uma venda. O acúmulo puro vive no ramo "apenas pontuar" do fluxo de prêmio, então
	// a intenção nasce nele, já no passo VENDA. Condicionado ao acúmulo via POI: a intenção nunca
	// destrava algo que as flags do programa não permitam.
	const startsInPrizeSaleOnly = intent === "pontuar" && !isDiscountModeAllowed && isPrizeModeAllowed && org.acumuloPermitirViaPontoIntegracao;

	const [currentStep, setCurrentStep] = React.useState<number>(startsInPrizeSaleOnly ? 2 : 1);
	const [successData, setSuccessData] = React.useState<TCreatePointOfInteractionTransactionOutput["data"] | null>(null);

	// Prize flow state — a intenção do hub já nasce escolhida, pulando a tela de seleção de modo.
	// Só tem efeito quando a seleção de modo existiria (ambas as modalidades liberadas); fora disso
	// `effectiveFlowMode` ignora este estado e resolve pelas flags do programa.
	const [flowMode, setFlowMode] = React.useState<"discount" | "prize" | null>(() => {
		if (intent === "resgatar") return "prize";
		if (intent === "pontuar") return "discount";
		return null;
	});
	const [showModeSelection, setShowModeSelection] = React.useState(false);
	const [prizeFlowIntent, setPrizeFlowIntent] = React.useState<"redeem" | "sale-only" | null>(startsInPrizeSaleOnly ? "sale-only" : null);

	// Coupon flow state (display info; the payload holds only cupomId + valorDesconto)
	const [selectedCoupon, setSelectedCoupon] = React.useState<TPoiAvailableCoupon | null>(null);

	const effectiveFlowMode: "discount" | "prize" = shouldShowFlowModeSelection ? (flowMode ?? "discount") : isPrizeModeAllowed ? "prize" : "discount";
	const isPrizeMode = effectiveFlowMode === "prize";
	const isPrizeSaleOnlyFlow = isPrizeMode && prizeFlowIntent === "sale-only";
	const isPrizeRedeemFlow = isPrizeMode && !isPrizeSaleOnlyFlow;
	const isMobileMode = mode === "mobile";
	const baseTotalSteps = isPrizeMode ? (isPrizeSaleOnlyFlow ? 3 : 2) : 3;
	// No mobile o passo de confirmação do operador não existe (a solicitação vai para a fila da loja),
	// exceto no resgate de recompensas: o passo 2 é a revisão da cesta antes do envio.
	const totalSteps = isMobileMode && !isPrizeRedeemFlow ? baseTotalSteps - 1 : baseTotalSteps;
	const isMobilePrizeReviewStep = isMobileMode && isPrizeRedeemFlow && currentStep === 2;
	const successStep = totalSteps + 1;
	const waitingStep = totalSteps + 1;
	const finalSuccessStep = mode === "mobile" ? waitingStep + 1 : successStep;

	// Load client data by ID (already validated on server)
	const { data: client } = useClientByLookup({ initialParams: { orgId: org.id, phone: "", clientId: clientId } });

	const [playAction] = useSound("/sounds/action-completed.mp3");
	const [playSuccess] = useSound("/sounds/success.mp3");

	useEffect(() => {
		captureClientEvent({
			event: "view_point_of_interaction_new_sale",
			properties: {
				organization_id: org.id,
				has_client_id: true,
				mode: mode,
			},
		});
	}, [org.id, mode]);

	// Memoized cashback calculations
	const availableCashback = useMemo(() => getAvailableCashback(client?.saldos), [client?.saldos]);

	// Cesta de recompensas: as linhas vivem no estado (uma por recompensa distinta, com quantidade);
	// a UI resolve cada linha contra o catálogo recebido pela página.
	const prizeLines = state.sale.prizeRedemptions;
	const prizesById = useMemo(() => new Map(prizes.map((prize) => [prize.id, prize])), [prizes]);
	const selectedPrizes = useMemo<TSelectedPrize[]>(
		() =>
			prizeLines.flatMap((line) => {
				const prize = prizesById.get(line.prizeId);
				return prize ? [{ prize, quantity: line.quantity }] : [];
			}),
		[prizeLines, prizesById],
	);
	const selectedPrizeDebit = useMemo(() => sumPoiPrizeValue(prizeLines), [prizeLines]);
	// A elegibilidade de "mais uma" é sempre contra o saldo RESTANTE, nunca contra o saldo cheio.
	const remainingCashback = availableCashback - selectedPrizeDebit;

	const cashbackAccumulationConfig = useMemo(
		() => getCashbackAccumulationConfig(client?.saldos, org.acumuloPermitirViaPontoIntegracao),
		[client?.saldos, org.acumuloPermitirViaPontoIntegracao],
	);
	const redemptionLimitConfig = useMemo(() => getRedemptionLimitConfig(client?.saldos), [client?.saldos]);
	// Coupons available for the identified client (discount flow only; evaluated against the informed sale value)
	const { data: availableCoupons, isLoading: isLoadingCoupons } = usePoiAvailableCoupons({
		orgId: org.id,
		clienteId: clientId,
		valorVenda: state.sale.valor,
		entregaModalidade: state.sale.entregaModalidade,
	});
	const couponDiscount = useMemo(() => {
		if (!state.sale.coupon) return 0;
		return state.sale.coupon.valorDesconto ?? 0;
	}, [state.sale.coupon]);

	const maximumCashbackAllowed = useMemo(
		() =>
			isRedemptionAllowedViaPoi ? getMaxCashbackToUse(availableCashback, Math.max(0, state.sale.valor - couponDiscount), redemptionLimitConfig) : 0,
		[isRedemptionAllowedViaPoi, availableCashback, state.sale.valor, couponDiscount, redemptionLimitConfig],
	);
	const finalValue = useMemo(
		() => Math.max(0, getFinalValue(state.sale.valor, state.sale.cashback) - couponDiscount),
		[state.sale.valor, state.sale.cashback, couponDiscount],
	);

	// Mantém o desconto do cupom AUTOMATICA em sincronia com o valor da venda (o servidor é o autoritativo);
	// remove a seleção quando o cupom deixa de ser elegível.
	useEffect(() => {
		if (!selectedCoupon || !availableCoupons) return;
		const freshCoupon = availableCoupons.find((coupon) => coupon.id === selectedCoupon.id);
		if (!freshCoupon || freshCoupon.avaliacao?.elegivel === false || (freshCoupon.validacaoModo === "AUTOMATICA" && !freshCoupon.avaliacao)) {
			setSelectedCoupon(null);
			updateCoupon(null);
			return;
		}
		if (!freshCoupon.avaliacao?.elegivel || freshCoupon.validacaoModo !== "AUTOMATICA") return;
		const freshDiscountValue = freshCoupon.avaliacao.valorDesconto;
		if (Math.abs((state.sale.coupon?.valorDesconto ?? 0) - freshDiscountValue) > 0.01) {
			updateCoupon({ cupomId: freshCoupon.id, valorDesconto: freshDiscountValue });
		}
	}, [selectedCoupon, availableCoupons, state.sale.coupon?.valorDesconto, updateCoupon]);

	const handleSelectCoupon = (coupon: TPoiAvailableCoupon) => {
		playAction();
		setSelectedCoupon(coupon);
		updateCoupon({
			cupomId: coupon.id,
			valorDesconto: coupon.validacaoModo === "AUTOMATICA" && coupon.avaliacao?.elegivel ? coupon.avaliacao.valorDesconto : null,
		});
	};

	const handleClearCoupon = () => {
		setSelectedCoupon(null);
		updateCoupon(null);
	};

	// Espelha os totais da cesta em `valor` (soma comercial) e `cashback` (soma dos débitos) a cada
	// mudança. O servidor deriva a verdade a partir das linhas, mas `getPoiSaleValueForConfirmation`/
	// `saleValuesMatch` e a tela de sucesso leem esses campos. Só no ramo de resgate: no "apenas
	// pontuar" o `valor` é digitado pelo cliente e não pode ser sobrescrito.
	useEffect(() => {
		if (prizeFlowIntent !== "redeem") return;
		const nextSaleValue = sumPoiPrizeSaleValue(prizeLines);
		const nextDebit = sumPoiPrizeValue(prizeLines);
		const nextApply = prizeLines.length > 0;
		if (!saleValuesMatch(state.sale.valor, nextSaleValue)) updateSale({ valor: nextSaleValue });
		if (state.sale.cashback.aplicar !== nextApply || !saleValuesMatch(state.sale.cashback.valor, nextDebit)) {
			updateCashback({ aplicar: nextApply, valor: nextDebit });
		}
	}, [prizeFlowIntent, prizeLines, state.sale.valor, state.sale.cashback.aplicar, state.sale.cashback.valor, updateSale, updateCashback]);

	// Auto-populate client state when data loads
	useEffect(() => {
		if (client) {
			updateClient({
				id: client.id,
				nome: client.nome,
				telefone: client.telefone,
				cpfCnpj: null,
			});
		}
	}, [client, updateClient]);

	// Show mode selection on mount if both modes are available
	useEffect(() => {
		if (shouldShowFlowModeSelection && flowMode === null && !showModeSelection) {
			setShowModeSelection(true);
		}
	}, [shouldShowFlowModeSelection, flowMode, showModeSelection]);

	useEffect(() => {
		if (!initialOperatorPassword) return;
		if (state.operatorIdentifier) return;
		updateOperatorIdentifier(initialOperatorPassword);
	}, [initialOperatorPassword, state.operatorIdentifier, updateOperatorIdentifier]);

	const handleNextStep = () => {
		// Discount: step 1 = sale value
		if (!isPrizeMode && currentStep === 1 && state.sale.valor <= 0) {
			return toast.error("Digite o valor da venda.");
		}
		// Prize sale-only: step 2 = sale value
		if (isPrizeSaleOnlyFlow && currentStep === 2 && state.sale.valor <= 0) {
			return toast.error("Digite o valor da venda.");
		}
		// After sale value in discount mode, pre-fill cashback
		if (!isPrizeMode && currentStep === 1) {
			updateCashback({
				aplicar: maximumCashbackAllowed > 0,
				valor: maximumCashbackAllowed,
			});
		}
		// Prize sale-only after sale value step
		if (isPrizeSaleOnlyFlow && currentStep === 2) {
			updateCashback({ aplicar: false, valor: 0 });
			updatePrizeRedemptions([]);
		}
		playAction();
		if (isMobileMode && currentStep === totalSteps) {
			if (isPrizeSaleOnlyFlow && currentStep === 2) {
				const payload: TPointOfInteractionNewSaleState = {
					...state,
					sale: {
						...state.sale,
						cashback: { aplicar: false, valor: 0 },
						prizeRedemptions: [],
					},
				};
				submitTransaction(payload);
				return;
			}
			submitTransaction();
			return;
		}
		setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
	};

	const handleSelectFlowMode = (mode: "discount" | "prize") => {
		if ((mode === "discount" && !isDiscountModeAllowed) || (mode === "prize" && !isPrizeModeAllowed)) {
			return;
		}

		captureClientEvent({
			event: mode === "discount" ? "select_point_of_interaction_discount_mode" : "select_point_of_interaction_prize_mode",
			properties: {
				organization_id: org.id,
			},
		});

		setFlowMode(mode);
		setPrizeFlowIntent(null);
		updatePrizeRedemptions([]);
		updateCashback({ aplicar: false, valor: 0 });
		updateSale({ valor: 0 });
		setSelectedCoupon(null);
		updateCoupon(null);
		setShowModeSelection(false);
		playAction();
		setCurrentStep(1);
	};

	// Toque numa recompensa = mais uma unidade na cesta (a mesma recompensa repetida é UMA linha com
	// quantidade). Recusa quando o saldo restante não cobre mais uma unidade.
	const handleAddPrize = (prize: TPrize) => {
		if (prize.valor > remainingCashback + BALANCE_EPSILON) return;
		setPrizeFlowIntent("redeem");
		addPrizeRedemption({ id: prize.id, valor: prize.valor, valorVenda: prize.valorVenda });
		playAction();
	};

	const handleSetPrizeQuantity = (prizeId: string, quantity: number) => {
		const currentLine = prizeLines.find((line) => line.prizeId === prizeId);
		const currentQuantity = currentLine?.quantity ?? 0;
		if (quantity > currentQuantity) {
			const prize = prizesById.get(prizeId);
			if (!prize) return;
			const additionalDebit = prize.valor * (quantity - currentQuantity);
			if (additionalDebit > remainingCashback + BALANCE_EPSILON) return;
		}
		setPrizeFlowIntent("redeem");
		setPrizeRedemptionQuantity(prizeId, quantity);
	};

	// Cesta fechada: totem vai para a confirmação do operador; mobile vai para a revisão antes do envio.
	const handleContinueWithPrizes = () => {
		if (selectedPrizes.length === 0) return toast.error("Selecione ao menos uma recompensa.");
		if (remainingCashback < -BALANCE_EPSILON) return toast.error("O saldo disponível não cobre as recompensas selecionadas.");
		setPrizeFlowIntent("redeem");
		playAction();
		setCurrentStep(2);
	};

	const handleContinueWithoutPrize = () => {
		setPrizeFlowIntent("sale-only");
		updatePrizeRedemptions([]);
		updateCashback({ aplicar: false, valor: 0 });
		updateSale({ valor: 0 });
		playAction();
		setCurrentStep(2);
	};

	const isAttemptingToUseMoreCashbackThanAllowed = state.sale.cashback.aplicar && state.sale.cashback.valor > maximumCashbackAllowed;

	const { mutate: createSaleMutation, isPending: isCreatingSale } = useMutation({
		mutationFn: createPointOfInteractionSale,
		onSuccess: (data) => {
			const visualAccumulatedCashbackValue = data.data.visualClientAccumulatedCashbackValue ?? data.data.clientAccumulatedCashbackValue;
			playSuccess();
			toast.success(`Venda finalizada! Saldo: ${formatCashbackValue(visualAccumulatedCashbackValue, org.terminologia)}`);
			setSuccessData(data.data);
			setCurrentStep(finalSuccessStep);
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	const { mutate: createRequestMutation, isPending: isCreatingRequest } = useMutation({
		mutationFn: createPoiTransactionRequest,
		onSuccess: (data) => {
			updateWatchTransactionRequest({ token: data.data.tokenPublico, status: data.data.status });
			toast.success("Solicitação enviada para aprovação.");
			setCurrentStep(waitingStep);
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	const submitTransaction = (payloadOverride?: TPointOfInteractionNewSaleState) => {
		const payload = payloadOverride ?? state;
		if (isMobileMode) {
			if (payloadOverride) {
				redefineState(payloadOverride);
			}
			createRequestMutation({ payload });
			return;
		}
		if (poiSaleRequiresValueConfirmation(org.poiConfirmacaoValorObrigatoria, payload.sale)) {
			if (payload.operatorConfirmedSaleValue == null) {
				toast.error("Confirme o valor final da venda.");
				return;
			}
			if (!saleValuesMatch(payload.operatorConfirmedSaleValue, getPoiSaleValueForConfirmation(payload.sale))) {
				toast.error("O valor confirmado não corresponde ao valor da venda.");
				return;
			}
		}
		// Cupom MANUAL no totem: o operador precisa informar o valor do desconto na confirmação.
		if (payload.sale.coupon && selectedCoupon?.validacaoModo === "MANUAL") {
			const couponDiscountValue = payload.sale.coupon.valorDesconto ?? 0;
			if (couponDiscountValue <= 0) {
				toast.error("Informe o valor do desconto do cupom (validação do operador).");
				return;
			}
			if (couponDiscountValue > payload.sale.valor) {
				toast.error("O desconto do cupom não pode superar o valor da venda.");
				return;
			}
		}

		createSaleMutation(payload);
	};

	const handleGoToHub = () => {
		router.push(`/point-of-interaction/${org.id}${isMobileMode ? "?mode=mobile" : ""}`);
	};

	const handleReset = () => {
		handleGoToHub();
	};

	const headerSteps = isMobileMode
		? isPrizeMode
			? isPrizeSaleOnlyFlow
				? PRIZE_SALE_ONLY_STEPS_MOBILE
				: PRIZE_STEPS_MOBILE
			: DISCOUNT_STEPS_MOBILE
		: isPrizeMode
			? isPrizeSaleOnlyFlow
				? PRIZE_SALE_ONLY_STEPS
				: PRIZE_STEPS
			: DISCOUNT_STEPS;
	const confirmationStep = isMobileMode ? totalSteps : isPrizeMode ? (isPrizeSaleOnlyFlow ? 3 : 2) : 3;
	const isSubmitting = isCreatingSale || isCreatingRequest;

	return (
		<div className={cn("w-full min-h-screen flex flex-col items-center", isMobileMode ? "px-4 py-5" : "p-6 md:p-10 short:p-3 short:min-h-0")}>
			<div className={cn("w-full flex flex-col gap-6 short:gap-3", isMobileMode ? "max-w-md" : "max-w-4xl")}>
				{/* Header com Navegação */}
				<div className="flex items-center gap-4 short:gap-1.5">
					<Button
						variant="ghost"
						size="fit"
						asChild
						className="rounded-full hover:bg-brand/10 flex items-center gap-1 px-2 py-2 short:px-1.5 short:py-0.5"
					>
						<Link href={`/point-of-interaction/${org.id}${isMobileMode ? "?mode=mobile" : ""}`} className="flex items-center gap-1">
							<ArrowLeft className="w-5 h-5 short:w-3.5 short:h-3.5" />
							<span className="short:text-xs">VOLTAR</span>
						</Link>
					</Button>
					<div className="flex items-center gap-3 short:gap-1.5">
						<div className="p-3 short:p-1.5 bg-brand rounded-2xl short:rounded-lg text-brand-foreground shadow-sm">
							<ShoppingCart className="w-6 h-6 md:w-8 md:h-8 short:w-4 short:h-4" />
						</div>
						<div>
							<h1 className="text-2xl md:text-3xl short:text-base font-extrabold tracking-tight">Nova venda</h1>
							<p className="text-[0.6rem] md:text-xs short:text-[0.6rem] text-muted-foreground font-bold uppercase tracking-widest opacity-70">
								{showModeSelection
									? "Escolha o modo"
									: isMobileMode && currentStep === waitingStep
										? "Aguardando aprovação"
										: `Passo ${Math.min(currentStep, totalSteps)} de ${totalSteps}`}
							</p>
						</div>
					</div>
				</div>

				{/* Wrapper de Estágios — `overflow-clip` (não `hidden`): recorta os cantos sem virar contexto de
				    rolagem, senão o rodapé `sticky` da cesta de recompensas não gruda na base da tela. */}
				<div className="bg-card rounded-3xl short:rounded-xl shadow-sm overflow-clip border border-brand/20">
					{currentStep <= confirmationStep && !showModeSelection && <StepProgressHeader steps={headerSteps} currentStep={currentStep} />}

					<div className="p-6 md:p-10 short:p-3">
						{/* Mode Selection Screen */}
						{showModeSelection && <ModeSelectionStep onSelectMode={handleSelectFlowMode} />}

						{/* Discount mode steps */}
						{/* Step 1: Sale Value */}
						{!showModeSelection && !isPrizeMode && currentStep === 1 && (
							<SaleValueStep value={state.sale.valor} onChange={(v) => updateSale({ valor: v })} onSubmit={handleNextStep} mode={mode} />
						)}
						{/* Step 2: Cashback (+ cupons disponíveis) */}
						{!showModeSelection && !isPrizeMode && currentStep === 2 && (
							<div className="flex flex-col gap-6 short:gap-3">
								<CouponSelectionBlock
									coupons={availableCoupons ?? []}
									isLoading={isLoadingCoupons}
									selectedCouponId={selectedCoupon?.id ?? null}
									onSelect={handleSelectCoupon}
									onClear={handleClearCoupon}
								/>
								<CashbackStep
									redemptionAllowed={isRedemptionAllowedViaPoi}
									available={availableCashback}
									maxAllowed={maximumCashbackAllowed}
									saleValue={state.sale.valor}
									applied={state.sale.cashback.aplicar}
									amount={state.sale.cashback.valor}
									isAttemptingToUseMoreCashbackThanAllowed={isAttemptingToUseMoreCashbackThanAllowed}
									finalValue={finalValue}
									redemptionLimit={{ ...redemptionLimitConfig, terminologia: org.terminologia }}
									onToggle={(v) =>
										updateCashback({
											aplicar: v,
											valor: v ? maximumCashbackAllowed : 0,
										})
									}
									onAmountChange={(v) => updateCashback({ valor: v })}
									onSubmit={handleNextStep}
									mode={mode}
								/>
							</div>
						)}
						{/* Step 3: Confirmation (totem apenas; no mobile a solicitação é enviada no último passo de dados) */}
						{!showModeSelection && !isPrizeMode && currentStep === 3 && !isMobileMode && (
							<KioskConfirmationStep
								clientName={state.client.nome || client?.nome || ""}
								finalValue={finalValue}
								operatorIdentifier={state.operatorIdentifier}
								onOperatorIdentifierChange={updateOperatorIdentifier}
								requiresSaleValueConfirmation={org.poiConfirmacaoValorObrigatoria}
								operatorConfirmedSaleValue={state.operatorConfirmedSaleValue}
								onOperatorConfirmedSaleValueChange={updateOperatorConfirmedSaleValue}
								appliedCoupon={
									selectedCoupon
										? {
												codigo: selectedCoupon.codigo,
												titulo: selectedCoupon.titulo,
												validacaoModo: selectedCoupon.validacaoModo,
												condicoesTexto: selectedCoupon.condicoesTexto,
												valorDesconto: state.sale.coupon?.valorDesconto ?? null,
											}
										: null
								}
								onCouponDiscountChange={(value) => {
									if (!state.sale.coupon) return;
									updateCoupon({ ...state.sale.coupon, valorDesconto: value });
								}}
								onSubmit={submitTransaction}
							/>
						)}

						{/* Prize mode steps */}
						{/* Step 1: Prize Selection */}
						{!showModeSelection && isPrizeMode && currentStep === 1 && (
							<PrizeSelectionStep
								programAllowsAccumulationViaPOI={cashbackAccumulationConfig.acumuloPermitirViaPontoIntegracao}
								prizes={prizes}
								selectedLines={prizeLines}
								availableBalance={availableCashback}
								terminology={org.terminologia}
								onAddPrize={handleAddPrize}
								onSetQuantity={handleSetPrizeQuantity}
								onContinue={handleContinueWithPrizes}
								onContinueWithoutPrize={handleContinueWithoutPrize}
							/>
						)}
						{/* Prize sale-only: Step 2 = Sale Value */}
						{!showModeSelection && isPrizeSaleOnlyFlow && currentStep === 2 && (
							<SaleValueStep value={state.sale.valor} onChange={(v) => updateSale({ valor: v })} onSubmit={handleNextStep} mode={mode} />
						)}
						{/* Prize redeem: Step 2 = Confirmation (totem) */}
						{!showModeSelection && isPrizeRedeemFlow && currentStep === 2 && !isMobileMode && (
							<KioskPrizeConfirmationStep
								clientName={state.client.nome || client?.nome || ""}
								selectedPrizes={selectedPrizes}
								availableBalance={availableCashback}
								terminology={org.terminologia}
								operatorIdentifier={state.operatorIdentifier}
								onOperatorIdentifierChange={updateOperatorIdentifier}
								requiresSaleValueConfirmation={false}
								operatorConfirmedSaleValue={state.operatorConfirmedSaleValue}
								onOperatorConfirmedSaleValueChange={updateOperatorConfirmedSaleValue}
								onSubmit={submitTransaction}
							/>
						)}
						{/* Prize redeem: Step 2 = Revisão da cesta (mobile); o envio vira solicitação para o operador */}
						{!showModeSelection && isMobilePrizeReviewStep && (
							<MobilePrizeConfirmationStep
								clientName={state.client.nome || client?.nome || ""}
								selectedPrizes={selectedPrizes}
								availableBalance={availableCashback}
								terminology={org.terminologia}
								isSubmitting={isSubmitting}
								onSubmit={() => submitTransaction()}
							/>
						)}
						{/* Prize sale-only: Step 3 = Confirmation (totem apenas) */}
						{!showModeSelection && isPrizeSaleOnlyFlow && currentStep === 3 && !isMobileMode && (
							<KioskConfirmationStep
								clientName={state.client.nome || client?.nome || ""}
								finalValue={state.sale.valor}
								operatorIdentifier={state.operatorIdentifier}
								onOperatorIdentifierChange={updateOperatorIdentifier}
								requiresSaleValueConfirmation={org.poiConfirmacaoValorObrigatoria}
								operatorConfirmedSaleValue={state.operatorConfirmedSaleValue}
								onOperatorConfirmedSaleValueChange={updateOperatorConfirmedSaleValue}
								onSubmit={submitTransaction}
							/>
						)}

						{/* Mobile waiting step */}
						{!showModeSelection && isMobileMode && currentStep === waitingStep && state.watchTransactionRequestToken && (
							<MobileWaitingStep
								token={state.watchTransactionRequestToken}
								onApproved={(requestStatus) => {
									if (!requestStatus.resultadoProcessamento) return;
									updateWatchTransactionRequest({ status: "APROVADO" });
									playSuccess();
									setSuccessData(requestStatus.resultadoProcessamento);
									setCurrentStep(finalSuccessStep);
								}}
								onRejected={() => {
									if (state.watchTransactionRequestStatus === "REJEITADO") return;
									updateWatchTransactionRequest({ status: "REJEITADO" });
									toast.error("Sua solicitação não foi aprovada pelo operador.");
								}}
								onErrored={() => {
									if (state.watchTransactionRequestStatus === "ERRO") return;
									updateWatchTransactionRequest({ status: "ERRO" });
									toast.error("Não foi possível processar a solicitação.");
								}}
								onReset={handleReset}
							/>
						)}

						{/* Discount mode success */}
						{!showModeSelection && !isPrizeMode && currentStep === finalSuccessStep && successData && (
							<SuccessCelebration
								title="Venda realizada!"
								subtitle="A operação foi processada com sucesso."
								stats={[
									{
										label: "CASHBACK GERADO",
										value: successData.visualClientAccumulatedCashbackValue ?? successData.clientAccumulatedCashbackValue,
										variant: "green",
										formatValue: (value) => formatCashbackValue(value, org.terminologia),
									},
									{
										label: "NOVO SALDO TOTAL",
										value: successData.visualClientNewOverallAvailableBalance ?? successData.clientNewOverallAvailableBalance ?? 0,
										variant: "brand",
										formatValue: (value) => formatCashbackValue(value, org.terminologia),
									},
									{
										label: "VALOR DA COMPRA",
										value: state.sale.valor,
										variant: "brand",
									},
									...(state.sale.coupon && couponDiscount > 0
										? [
												{
													label: `CUPOM ${selectedCoupon?.codigo ?? ""}`,
													value: -couponDiscount,
													variant: "green" as const,
												},
											]
										: []),
									...(state.sale.cashback.aplicar || couponDiscount > 0
										? [
												{
													label: "VALOR COM DESCONTO",
													value: Math.max(0, state.sale.valor - state.sale.cashback.valor - couponDiscount),
													variant: "green" as const,
												},
											]
										: []),
								]}
								primaryAction={{ label: "Nova venda", onClick: handleReset }}
								secondaryAction={{
									label: "Voltar ao início",
									onClick: handleGoToHub,
								}}
							/>
						)}

						{/* Prize mode success */}
						{!showModeSelection && isPrizeMode && currentStep === finalSuccessStep && successData && (
							<SuccessCelebration
								title={selectedPrizes.length > 0 ? "Resgate realizado!" : "Venda registrada!"}
								subtitle={
									selectedPrizes.length > 0
										? selectedPrizes.length === 1 && selectedPrizes[0].quantity === 1
											? "A recompensa foi resgatada com sucesso."
											: "As recompensas foram resgatadas com sucesso."
										: "A venda foi registrada com sucesso para pontuação."
								}
								stats={[
									{
										label: "CASHBACK GERADO",
										value: successData.visualClientAccumulatedCashbackValue ?? successData.clientAccumulatedCashbackValue,
										variant: "green",
										formatValue: (value) => formatCashbackValue(value, org.terminologia),
									},
									{
										label: "NOVO SALDO TOTAL",
										value: successData.visualClientNewOverallAvailableBalance ?? successData.clientNewOverallAvailableBalance ?? 0,
										variant: "brand",
										formatValue: (value) => formatCashbackValue(value, org.terminologia),
									},
									...(selectedPrizes.length > 0
										? []
										: [
												{
													label: "VALOR DA VENDA",
													value: state.sale.valor,
													variant: "brand" as const,
												},
											]),
								]}
								primaryAction={{ label: "Nova venda", onClick: handleReset }}
								secondaryAction={{
									label: "Voltar ao início",
									onClick: handleGoToHub,
								}}
							>
								{selectedPrizes.length > 0 && (
									<div className="bg-brand-secondary/5 border border-brand-secondary/20 rounded-2xl short:rounded-xl w-full max-w-xl divide-y divide-brand-secondary/15">
										{selectedPrizes.map(({ prize, quantity }) => (
											<div key={prize.id} className="p-4 short:p-2 flex items-center gap-4 short:gap-2">
												<div className="relative w-14 h-14 short:w-10 short:h-10 min-w-14 short:min-w-10 rounded-xl short:rounded-lg overflow-hidden">
													{prize.imagemCapaUrl ? (
														<Image src={prize.imagemCapaUrl} alt={prize.titulo} fill className="object-cover" />
													) : (
														<div className="flex h-full w-full items-center justify-center bg-brand-secondary text-brand-secondary-foreground">
															<Gift className="w-6 h-6 short:w-4 short:h-4" />
														</div>
													)}
												</div>
												<div className="flex-1 min-w-0 text-left">
													<h3 className="font-bold text-sm short:text-xs tracking-tight truncate">
														{prize.titulo}
														{quantity > 1 && <span className="ml-2 text-brand-secondary font-black">×{quantity}</span>}
													</h3>
													<p className="font-black text-lg short:text-base text-brand-secondary">
														{formatCashbackValue(prize.valor * quantity, org.terminologia)}
													</p>
													<p className="text-xs short:text-[0.65rem] text-muted-foreground">
														Valor comercial: {(prize.valorVenda * quantity).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
													</p>
												</div>
											</div>
										))}
										<div className="p-4 short:p-2 flex items-center justify-between gap-4 short:gap-2">
											<span className="text-[0.7rem] short:text-[0.6rem] font-black uppercase tracking-widest text-muted-foreground">Total resgatado</span>
											<span className="font-black text-lg short:text-base text-brand-secondary">
												{formatCashbackValue(sumPoiPrizeValue(prizeLines), org.terminologia)}
											</span>
										</div>
									</div>
								)}
							</SuccessCelebration>
						)}

						{/* Action Buttons */}
						{!showModeSelection && currentStep <= totalSteps && (
							<div className="flex gap-4 short:gap-3 mt-10 short:mt-4">
								{currentStep > 1 && (
									<Button
										onClick={() => {
											// Voltar da confirmação do resgate mantém a cesta: o cliente volta para ajustar
											// quantidades, não para começar do zero (a seleção tem seu próprio −/+).
											if (isPrizeSaleOnlyFlow && currentStep === 3) {
												updateCashback({ aplicar: false, valor: 0 });
												updatePrizeRedemptions([]);
											}
											if (isPrizeSaleOnlyFlow && currentStep === 2) {
												setPrizeFlowIntent(null);
												updateSale({ valor: 0 });
											}
											setCurrentStep((p) => p - 1);
										}}
										variant="outline"
										size="lg"
										className="flex-1 rounded-2xl short:rounded-lg h-11 text-sm font-bold"
									>
										Voltar
									</Button>
								)}
								{/* Passo 1 do prêmio tem o CONTINUAR no rodapé da cesta; a revisão mobile tem o próprio botão de envio. */}
								{!(isPrizeMode && currentStep === 1) && !isMobilePrizeReviewStep && (
									<Button
										onClick={currentStep === confirmationStep ? (isMobileMode ? handleNextStep : () => submitTransaction()) : handleNextStep}
										size="lg"
										disabled={isSubmitting || (!isPrizeMode && isAttemptingToUseMoreCashbackThanAllowed)}
										className={cn(
											"flex-1 rounded-2xl short:rounded-lg h-12 short:h-11 text-base font-bold shadow-sm",
											currentStep === confirmationStep && !isMobileMode && "bg-green-600 hover:bg-green-700",
										)}
									>
										{currentStep === confirmationStep ? (isSubmitting ? "Processando..." : isMobileMode ? "Próximo" : "Finalizar") : "Próximo"}
										{currentStep === confirmationStep && !isMobileMode ? (
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

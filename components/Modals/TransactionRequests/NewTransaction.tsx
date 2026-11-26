import {
	getAvailableCashback,
	getFinalValue,
	getMaxCashbackToUse,
	getRedemptionLimitConfig,
} from "@/app/(external)/point-of-interaction/[orgId]/_shared/helpers/cashback-calculations";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { LoadingButton } from "@/components/loading-button";
import type { TPoiOperationKind } from "@/components/PointOfInteraction/operation-kinds";
import { Button } from "@/components/ui/button";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { ResponsiveMenuAnimatedBody } from "@/components/Utils/ResponsiveMenuAnimatedBody";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { isCashbackRedemptionAllowedOnSurface } from "@/lib/cashback/redemption-policy";
import { getErrorMessage } from "@/lib/errors";
import { formatCashbackValue, formatToMoney, formatToPhone } from "@/lib/formatting";
import { createPointOfInteractionSale } from "@/lib/mutations/sales";
import {
	getFreeFormRewardBlockReason,
	isFreeFormRewardAllowed,
	normalizeFreeFormRewardDescription,
} from "@/lib/point-of-interaction/free-form-reward";
import {
	addPoiPrizeLine,
	setPoiPrizeLineQuantity,
	sumPoiPrizeSaleValue,
	sumPoiPrizeValue,
	type TPoiPrizeLine,
} from "@/lib/point-of-interaction/prize-lines";
import {
	getPoiSaleValueForConfirmation,
	poiSaleRequiresValueConfirmation,
	saleValuesMatch,
} from "@/lib/point-of-interaction/sale-value-confirmation";
import { useCashbackProgram } from "@/lib/queries/cashback-programs";
import { useClientByLookup } from "@/lib/queries/clients";
import { MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE } from "@/lib/sales/sale-reward-snapshot";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { usePointOfInteractionNewInternalTransactionRequestState } from "@/state-hooks/use-point-of-interaction-new-internal-transaction-request";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CLIENT_PHONE_COMPLETE_LENGTH, NewTransactionClient } from "./Blocks/NewTransactionClient";
import { NewTransactionFreeFormReward } from "./Blocks/NewTransactionFreeFormReward";
import {
	NEW_TRANSACTION_OPERATION_ORDER,
	NewTransactionClientStrip,
	NewTransactionOperation,
	type TNewTransactionOperationOption,
} from "./Blocks/NewTransactionOperation";
import { NewTransactionPrizes, type TNewTransactionPrize } from "./Blocks/NewTransactionPrizes";
import { NewTransactionReview, OPERATOR_PASSWORD_LENGTH, type TNewTransactionReviewLine } from "./Blocks/NewTransactionReview";
import { NewTransactionSaleDetails } from "./Blocks/NewTransactionSaleDetails";
import { NEW_TRANSACTION_STEPS, NewTransactionSteps, type TNewTransactionStep } from "./Blocks/NewTransactionSteps";
import { SaleSellerPicker } from "@/app/(external)/point-of-interaction/[orgId]/_shared/components/sale-seller-picker";

// Tolerância de ponto flutuante ao comparar débitos com o saldo.
const BALANCE_EPSILON = 0.0001;

type NewTransactionProps = {
	sessionOrgId: string;
	sessionUser: TAuthUserSession["user"];
	poiConfirmacaoValorObrigatoria: boolean;
	/** Pergunta quem fez a venda, à parte do operador (`poiConfiguracao.vendas.coletaVendedor`). */
	poiColetaVendedor: boolean;
	closeMenu: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

/**
 * Nova transação do ponto de interação, lançada pelo painel. Quatro etapas — cliente, operação,
 * detalhes e conferência — no lugar do formulário corrido: cada etapa só deixa avançar quando o que
 * ela pede está certo, e a conferência mostra o efeito no saldo antes da senha do operador.
 */
export function NewTransaction({
	sessionOrgId,
	sessionUser,
	poiConfirmacaoValorObrigatoria,
	poiColetaVendedor,
	closeMenu,
	callbacks,
}: NewTransactionProps) {
	const queryClient = useQueryClient();
	const {
		state,
		updateClient,
		resetClient,
		updateSale,
		updateCashback,
		addPrizeRedemption,
		setPrizeRedemptionQuantity,
		updateFreeFormReward,
		updateMarketingConsent,
		updateOperatorIdentifier,
		updateOperatorConfirmedSaleValue,
		resetState,
	} = usePointOfInteractionNewInternalTransactionRequestState();
	const {
		data: cashbackProgram,
		isLoading: isLoadingCashbackProgram,
		error: cashbackProgramError,
		queryKey: cashbackProgramQueryKey,
	} = useCashbackProgram();
	const [step, setStep] = useState<TNewTransactionStep>(1);
	const [operation, setOperation] = useState<TPoiOperationKind | null>(null);

	const terminology: TCashbackProgramTerminologyEnum = cashbackProgram?.terminologia ?? "DINHEIRO";
	const prizes = useMemo<TNewTransactionPrize[]>(
		() =>
			cashbackProgram?.recompensas
				?.filter((prize) => prize.ativo)
				.map((prize) => ({
					id: prize.id,
					titulo: prize.titulo,
					descricao: prize.descricao,
					imagemCapaUrl: prize.imagemCapaUrl,
					valor: prize.valor,
					valorVenda: prize.produtoVariante?.precoVenda ?? prize.produto?.precoVenda ?? 0,
					produto: prize.produto ? { grupo: prize.produto.grupo } : null,
				})) ?? [],
		[cashbackProgram?.recompensas],
	);

	// --- Cliente ---
	const {
		data: lookupData,
		isFetching: isFetchingClient,
		queryKey: clientLookupQueryKey,
		updateParams: updateClientLookupParams,
	} = useClientByLookup({ initialParams: { orgId: sessionOrgId, phone: state.client.telefone } });
	useEffect(() => {
		updateClientLookupParams({ orgId: sessionOrgId, phone: state.client.telefone });
	}, [sessionOrgId, state.client.telefone, updateClientLookupParams]);
	const isPhoneComplete = state.client.telefone.length === CLIENT_PHONE_COMPLETE_LENGTH;
	// A busca usa o telefone com debounce: enquanto ele não alcança o digitado, o resultado é do número anterior.
	const lookupIsCurrent = (clientLookupQueryKey[1] as { phone: string }).phone === state.client.telefone;
	const isLookingUpClient = isPhoneComplete && (!lookupIsCurrent || isFetchingClient);
	const clientData = isPhoneComplete && lookupIsCurrent ? lookupData : null;
	const isNewClient = isPhoneComplete && !isLookingUpClient && !clientData;

	useEffect(() => {
		if (!clientData) return;
		// O telefone fica como foi digitado: é ele que mantém a busca apontando para este cliente.
		updateClient({ id: clientData.id, nome: clientData.nome });
	}, [clientData, updateClient]);

	const availableCashback = useMemo(() => getAvailableCashback(clientData?.saldos), [clientData?.saldos]);
	const redemptionLimit = useMemo(() => getRedemptionLimitConfig(clientData?.saldos), [clientData?.saldos]);

	// --- Operação ---
	const operationOptions = useMemo<TNewTransactionOperationOption[]>(() => {
		const programAccumulates = cashbackProgram?.acumuloPermitirViaPontoIntegracao ?? false;
		const redemptionAllowedHere = cashbackProgram ? isCashbackRedemptionAllowedOnSurface(cashbackProgram, "PONTO_INTERACAO") : false;
		const noBalance = availableCashback <= BALANCE_EPSILON;
		const redemptionReason = (modeAllowed: boolean, extra?: string | null) => {
			if (!redemptionAllowedHere) return "Resgates pelo ponto de interação estão desativados no programa.";
			if (!modeAllowed) return "Desativada nas regras do programa.";
			if (extra) return extra;
			if (noBalance) return isNewClient ? "Cliente novo começa sem saldo." : "Cliente sem saldo disponível.";
			return null;
		};
		const options: Record<TPoiOperationKind, TNewTransactionOperationOption> = {
			"sale-only": {
				kind: "sale-only",
				description: programAccumulates ? "Registra a compra e acumula saldo. Não usa nada agora." : "Registra a compra, sem usar saldo.",
				unavailableReason: null,
			},
			discount: {
				kind: "discount",
				description: "Usa o saldo para abater o valor desta compra.",
				unavailableReason: redemptionReason(cashbackProgram?.modalidadeDescontosPermitida ?? true),
			},
			prize: {
				kind: "prize",
				description: "Escolhe itens cadastrados no programa.",
				unavailableReason: redemptionReason(
					cashbackProgram?.modalidadeRecompensasPermitida ?? false,
					prizes.length === 0 ? "Nenhuma recompensa ativa no catálogo." : null,
				),
			},
			"free-form": {
				kind: "free-form",
				description: "Item fora do catálogo, descrito na hora. Sem venda.",
				unavailableReason: redemptionReason(cashbackProgram ? isFreeFormRewardAllowed(cashbackProgram) : false),
			},
		};
		return NEW_TRANSACTION_OPERATION_ORDER.map((kind) => options[kind]);
	}, [availableCashback, cashbackProgram, isNewClient, prizes.length]);

	// Uma operação que deixou de valer (outro cliente, sem saldo) não pode continuar escolhida.
	useEffect(() => {
		if (!operation) return;
		const option = operationOptions.find((item) => item.kind === operation);
		if (option?.unavailableReason) setOperation(null);
	}, [operation, operationOptions]);

	function handleSelectOperation(kind: TPoiOperationKind) {
		if (kind === operation) return;
		setOperation(kind);
		// Trocar de operação descarta os detalhes da anterior: valores de desconto e cesta não se misturam.
		// Na cesta, `sale.valor` é a soma das recompensas, não um valor digitado — entrando ou saindo dela, zera.
		const resetsSaleValue = kind === "prize" || operation === "prize";
		updateCashback({ aplicar: false, valor: 0 });
		updateSale({ prizeRedemptions: [], freeFormReward: { descricao: "", valor: null }, ...(resetsSaleValue ? { valor: 0 } : {}) });
	}

	// --- Detalhes ---
	const selectedLines = state.sale.prizeRedemptions;
	const maximumCashbackAllowed = useMemo(
		() => getMaxCashbackToUse(availableCashback, state.sale.valor, redemptionLimit),
		[availableCashback, redemptionLimit, state.sale.valor],
	);
	const maximumCashbackReason =
		redemptionLimit.tipo && redemptionLimit.valor !== null && maximumCashbackAllowed < Math.min(availableCashback, state.sale.valor) - BALANCE_EPSILON
			? redemptionLimit.tipo === "PERCENTUAL"
				? `limite de ${redemptionLimit.valor}% do programa`
				: `limite de ${formatCashbackValue(redemptionLimit.valor, terminology)} por venda`
			: null;
	const isAttemptingToUseMoreCashbackThanAllowed = state.sale.cashback.aplicar && state.sale.cashback.valor > maximumCashbackAllowed + BALANCE_EPSILON;
	const finalValue = getFinalValue(state.sale.valor, state.sale.cashback);

	// Espelha as somas das linhas em `sale.valor` (valor comercial) e `sale.cashback` (débito), como o servidor espera.
	function mirrorPrizeLines(next: TPoiPrizeLine[]) {
		updateSale({ valor: sumPoiPrizeSaleValue(next) });
		updateCashback({ aplicar: next.length > 0, valor: sumPoiPrizeValue(next) });
	}
	function handleAddPrize(prize: TNewTransactionPrize) {
		if (prize.valorVenda <= 0) return toast.error("Esta recompensa não possui valor comercial configurado.");
		const currentLine = selectedLines.find((line) => line.prizeId === prize.id);
		if (currentLine && currentLine.quantity >= MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE) {
			return toast.error(`Quantidade máxima por recompensa é ${MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE}.`);
		}
		if (availableCashback - sumPoiPrizeValue(selectedLines) < prize.valor)
			return toast.error("Saldo restante insuficiente para adicionar esta recompensa.");
		addPrizeRedemption(prize);
		mirrorPrizeLines(addPoiPrizeLine(selectedLines, prize));
	}
	function handleSetPrizeQuantity(prizeId: string, quantity: number) {
		const prize = prizes.find((item) => item.id === prizeId);
		const currentLine = selectedLines.find((line) => line.prizeId === prizeId);
		if (!prize || !currentLine) return;
		if (quantity > MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE)
			return toast.error(`Quantidade máxima por recompensa é ${MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE}.`);
		const remaining = availableCashback - sumPoiPrizeValue(selectedLines);
		if (quantity > currentLine.quantity && remaining < prize.valor * (quantity - currentLine.quantity)) {
			return toast.error("Saldo restante insuficiente para adicionar esta recompensa.");
		}
		setPrizeRedemptionQuantity(prizeId, quantity);
		mirrorPrizeLines(setPoiPrizeLineQuantity(selectedLines, prizeId, quantity));
	}

	// --- Conferência ---
	const isFreeForm = operation === "free-form";
	const requiresSaleValueConfirmation = !isFreeForm && poiSaleRequiresValueConfirmation(poiConfirmacaoValorObrigatoria, state.sale);
	const balanceDebit = isFreeForm ? (state.sale.freeFormReward.valor ?? 0) : state.sale.cashback.aplicar ? state.sale.cashback.valor : 0;

	/** Motivo que impede sair da etapa, ou `null`. */
	function getStepBlockReason(target: TNewTransactionStep): string | null {
		if (target === 1) {
			if (!isPhoneComplete) return "Informe o telefone completo do cliente.";
			if (isLookingUpClient) return "Aguarde a busca do cliente.";
			if (!clientData && !state.client.nome.trim()) return "Informe o nome do cliente.";
			return null;
		}
		if (target === 2) {
			if (!operation) return "Escolha a operação.";
			const option = operationOptions.find((item) => item.kind === operation);
			return option?.unavailableReason ?? null;
		}
		if (target === 3) {
			if (operation === "free-form") {
				return getFreeFormRewardBlockReason({
					descricao: state.sale.freeFormReward.descricao,
					valor: state.sale.freeFormReward.valor,
					availableBalance: availableCashback,
				});
			}
			if (operation === "prize") return selectedLines.length === 0 ? "Selecione ao menos uma recompensa." : null;
			if (state.sale.valor <= 0) return "Informe o valor da venda.";
			if (operation === "discount" && isAttemptingToUseMoreCashbackThanAllowed) return "O cashback aplicado passa do máximo permitido para esta venda.";
			return null;
		}
		if (state.operatorIdentifier.length !== OPERATOR_PASSWORD_LENGTH) return `Informe os ${OPERATOR_PASSWORD_LENGTH} dígitos da senha do operador.`;
		if (requiresSaleValueConfirmation) {
			if (state.operatorConfirmedSaleValue == null) return "Confirme o valor final da venda.";
			if (!saleValuesMatch(state.operatorConfirmedSaleValue, getPoiSaleValueForConfirmation(state.sale)))
				return "O valor confirmado não corresponde ao valor da venda.";
		}
		return null;
	}

	function goToStep(target: TNewTransactionStep) {
		// Só volta livremente; para avançar, todas as etapas anteriores precisam estar válidas.
		if (target <= step) return setStep(target);
		for (let current = step; current < target; current++) {
			const reason = getStepBlockReason(current as TNewTransactionStep);
			if (reason) {
				setStep(current as TNewTransactionStep);
				return toast.error(reason);
			}
		}
		setStep(target);
	}

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-point-of-interaction-internal-transaction"],
		mutationFn: createPointOfInteractionSale,
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: ["sales"] });
			queryClient.invalidateQueries({ queryKey: cashbackProgramQueryKey });
			resetState();
			closeMenu();
		},
		onError: (error) => {
			callbacks?.onError?.();
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	function handleSubmit() {
		for (const target of [1, 2, 3, 4] as const) {
			const reason = getStepBlockReason(target);
			if (reason) {
				setStep(target);
				return toast.error(reason);
			}
		}
		const { dataNascimento, ...clientFields } = state.client;
		const client = { ...clientFields, dataNascimento: dataNascimento ? new Date(`${dataNascimento}T12:00:00`) : null };
		mutate({
			orgId: sessionOrgId,
			client,
			marketingConsent: isNewClient ? state.marketingConsent : null,
			sale: isFreeForm
				? {
						valor: 0,
						cashback: { aplicar: false, valor: 0 },
						partnerCode: state.sale.partnerCode,
						prizeRedemptions: [],
						freeFormReward: {
							descricao: normalizeFreeFormRewardDescription(state.sale.freeFormReward.descricao),
							valor: state.sale.freeFormReward.valor,
						},
					}
				: {
						valor: state.sale.valor,
						cashback: operation === "sale-only" ? { aplicar: false, valor: 0 } : state.sale.cashback,
						partnerCode: state.sale.partnerCode,
						prizeRedemptions: operation === "prize" ? state.sale.prizeRedemptions : [],
						vendedorId: poiColetaVendedor ? state.sale.vendedorId : null,
					},
			operatorIdentifier: state.operatorIdentifier,
			operatorConfirmedSaleValue: requiresSaleValueConfirmation ? state.operatorConfirmedSaleValue : undefined,
		});
	}

	const clientName = clientData?.nome ?? state.client.nome;
	const reviewLines = buildReviewLines({
		operation,
		clientName,
		isNewClient,
		state,
		prizes,
		finalValue,
		terminology,
	});
	const primaryLabel = step < 3 ? "CONTINUAR" : step === 3 ? "CONFERIR" : getSubmitLabel(operation, balanceDebit, terminology);

	return (
		<ResponsiveMenu.Root
			open
			onOpenChange={(open) => {
				if (!open) closeMenu();
			}}
		>
			<ResponsiveMenu.Content dialogVariant="md" drawerVariant="lg">
				<ResponsiveMenu.Header>
					<ResponsiveMenu.Title>NOVA TRANSAÇÃO</ResponsiveMenu.Title>
					<ResponsiveMenu.Description>
						Registre uma transação interna.{sessionUser.nome ? ` Operador logado: ${sessionUser.nome}.` : ""}
					</ResponsiveMenu.Description>
				</ResponsiveMenu.Header>
				{isLoadingCashbackProgram ? (
					<LoadingComponent />
				) : cashbackProgramError ? (
					<ErrorComponent msg={getErrorMessage(cashbackProgramError)} />
				) : (
					<ResponsiveMenuAnimatedBody stateKey={`step-${step}`} className="gap-4">
						<form
							className="flex flex-col gap-4"
							onSubmit={(event) => {
								event.preventDefault();
								if (step < 4) goToStep((step + 1) as TNewTransactionStep);
								else handleSubmit();
							}}
						>
							<NewTransactionSteps current={step} onGoTo={goToStep} />
							{step > 2 && operation ? (
								<NewTransactionClientStrip
									clientName={clientName}
									clientPhone={state.client.telefone}
									availableCashback={availableCashback}
									terminology={terminology}
								/>
							) : null}
							{step === 1 ? (
								<NewTransactionClient
									client={state.client}
									updateClient={updateClient}
									resetClient={resetClient}
									marketingConsent={state.marketingConsent}
									updateMarketingConsent={updateMarketingConsent}
									clientData={clientData}
									isLookingUp={isLookingUpClient}
									availableCashback={availableCashback}
									redemptionLimit={redemptionLimit}
									terminology={terminology}
								/>
							) : null}
							{step === 2 ? (
								<NewTransactionOperation
									clientName={clientName}
									clientPhone={state.client.telefone}
									availableCashback={availableCashback}
									terminology={terminology}
									options={operationOptions}
									selected={operation}
									onSelect={handleSelectOperation}
									onChangeClient={() => setStep(1)}
								/>
							) : null}
							{step === 3 && (operation === "sale-only" || operation === "discount") ? (
								<NewTransactionSaleDetails
									sale={state.sale}
									updateSale={updateSale}
									updateCashback={updateCashback}
									allowCashback={operation === "discount"}
									availableCashback={availableCashback}
									maximumCashbackAllowed={maximumCashbackAllowed}
									maximumCashbackReason={maximumCashbackReason}
									isAttemptingToUseMoreCashbackThanAllowed={isAttemptingToUseMoreCashbackThanAllowed}
									finalValue={operation === "discount" ? finalValue : state.sale.valor}
									terminology={terminology}
								/>
							) : null}
							{step === 3 && operation === "prize" ? (
								<NewTransactionPrizes
									prizes={prizes}
									selectedLines={selectedLines}
									availableCashback={availableCashback}
									terminology={terminology}
									onAddPrize={handleAddPrize}
									onSetPrizeQuantity={handleSetPrizeQuantity}
								/>
							) : null}
							{step === 3 && operation === "free-form" ? (
								<NewTransactionFreeFormReward
									freeFormReward={state.sale.freeFormReward}
									updateFreeFormReward={updateFreeFormReward}
									availableCashback={availableCashback}
									terminology={terminology}
								/>
							) : null}
							{step === 4 && operation ? (
								<NewTransactionReview
									kind={operation}
									programAccumulates={cashbackProgram?.acumuloPermitirViaPontoIntegracao ?? false}
									lines={reviewLines}
									balanceBefore={availableCashback}
									balanceAfter={availableCashback - balanceDebit}
									terminology={terminology}
									onEdit={goToStep}
									requiresSaleValueConfirmation={requiresSaleValueConfirmation}
									operatorConfirmedSaleValue={state.operatorConfirmedSaleValue}
									onOperatorConfirmedSaleValueChange={updateOperatorConfirmedSaleValue}
									operatorIdentifier={state.operatorIdentifier}
									onOperatorIdentifierChange={updateOperatorIdentifier}
									sellerPicker={
										poiColetaVendedor && !isFreeForm ? (
											<SaleSellerPicker orgId={sessionOrgId} value={state.sale.vendedorId} onChange={(vendedorId) => updateSale({ vendedorId })} />
										) : null
									}
								/>
							) : null}
							{/* Enter avança a etapa. `sr-only`, não `hidden`: alguns navegadores não submetem por um botão oculto. */}
							<button type="submit" className="sr-only" aria-hidden tabIndex={-1} />
						</form>
					</ResponsiveMenuAnimatedBody>
				)}
				<ResponsiveMenu.Footer>
					{step === 1 ? (
						<ResponsiveMenu.Close variant="outline">CANCELAR</ResponsiveMenu.Close>
					) : (
						<Button type="button" variant="outline" onClick={() => setStep((step - 1) as TNewTransactionStep)} disabled={isPending}>
							<ArrowLeft />
							VOLTAR
						</Button>
					)}
					{step < NEW_TRANSACTION_STEPS.length ? (
						<Button type="button" onClick={() => goToStep((step + 1) as TNewTransactionStep)} disabled={isLoadingCashbackProgram}>
							{primaryLabel}
							<ArrowRight />
						</Button>
					) : (
						<LoadingButton loading={isPending} onClick={handleSubmit}>
							<Check />
							{primaryLabel}
						</LoadingButton>
					)}
				</ResponsiveMenu.Footer>
			</ResponsiveMenu.Content>
		</ResponsiveMenu.Root>
	);
}

function getSubmitLabel(operation: TPoiOperationKind | null, balanceDebit: number, terminology: TCashbackProgramTerminologyEnum) {
	if (operation === "free-form" || operation === "prize") return `LANÇAR RESGATE DE ${formatCashbackValue(balanceDebit, terminology)}`;
	return "REGISTRAR VENDA";
}

function buildReviewLines({
	operation,
	clientName,
	isNewClient,
	state,
	prizes,
	finalValue,
	terminology,
}: {
	operation: TPoiOperationKind | null;
	clientName: string;
	isNewClient: boolean;
	state: ReturnType<typeof usePointOfInteractionNewInternalTransactionRequestState>["state"];
	prizes: TNewTransactionPrize[];
	finalValue: number;
	terminology: TCashbackProgramTerminologyEnum;
}): TNewTransactionReviewLine[] {
	const clientLine: TNewTransactionReviewLine = {
		label: "CLIENTE",
		value: `${clientName || "Não informado"}${isNewClient ? " (novo)" : ""} · ${formatToPhone(state.client.telefone)}`,
		editStep: 1,
	};
	if (operation === "free-form") {
		return [
			clientLine,
			{ label: "RECOMPENSA", value: state.sale.freeFormReward.descricao, editStep: 3 },
			{ label: "DÉBITO", value: `− ${formatCashbackValue(state.sale.freeFormReward.valor ?? 0, terminology)}`, editStep: 3, emphasis: "debit" },
		];
	}
	if (operation === "prize") {
		const prizeById = new Map(prizes.map((prize) => [prize.id, prize]));
		return [
			clientLine,
			...state.sale.prizeRedemptions.map<TNewTransactionReviewLine>((line) => ({
				label: `${prizeById.get(line.prizeId)?.titulo ?? "Recompensa"} ×${line.quantity}`.toUpperCase(),
				value: `− ${formatCashbackValue(line.prizeValue * line.quantity, terminology)}`,
				editStep: 3,
			})),
			{ label: "VALOR COMERCIAL", value: formatToMoney(sumPoiPrizeSaleValue(state.sale.prizeRedemptions)) },
			{ label: "DÉBITO", value: `− ${formatCashbackValue(sumPoiPrizeValue(state.sale.prizeRedemptions), terminology)}`, emphasis: "debit" },
		];
	}
	const lines: TNewTransactionReviewLine[] = [clientLine, { label: "VALOR DA VENDA", value: formatToMoney(state.sale.valor), editStep: 3 }];
	if (operation === "discount" && state.sale.cashback.aplicar) {
		lines.push({
			label: "DESCONTO COM SALDO",
			value: `− ${formatCashbackValue(state.sale.cashback.valor, terminology)}`,
			editStep: 3,
			emphasis: "debit",
		});
	}
	lines.push({ label: "CLIENTE PAGA", value: formatToMoney(operation === "discount" ? finalValue : state.sale.valor), emphasis: "total" });
	return lines;
}

"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { cancelSaleDraft, confirmSale, updateSaleDraft } from "@/lib/mutations/pos";
import { useSaleDraft } from "@/lib/queries/pos";
import { useCheckoutState } from "@/state-hooks/use-checkout-state";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import CheckoutSteps from "./components/CheckoutSteps";
import ConfirmationStep from "./components/ConfirmationStep";
import DeliveryStep from "./components/DeliveryStep";
import PaymentStep from "./components/PaymentStep";
import ReviewStep from "./components/ReviewStep";

type CheckoutPageProps = {
	user: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
	saleId: string;
};

export default function CheckoutPage({ user, membership, saleId }: CheckoutPageProps) {
	const router = useRouter();

	// Load draft sale from DB
	const { data: sale, isLoading, isError, error } = useSaleDraft({ saleId });

	// Checkout state
	const checkoutState = useCheckoutState({
		valorTotal: sale?.valorTotal ?? 0,
		initialState: {
			vendedorId: sale?.vendedorId,
			vendedorNome: sale?.vendedorNome,
		},
	});

	// Hydrate checkout state when sale loads
	useEffect(() => {
		if (sale) {
			checkoutState.resetState({
				step: 1,
				vendedorId: sale.vendedorId ?? null,
				vendedorNome: sale.vendedorNome ?? null,
				descontoGeral: sale.descontosTotal ?? 0,
				acrescimoGeral: sale.acrescimosTotal ?? 0,
				observacoes: sale.observacoes ?? "",
				entregaModalidade: sale.entregaModalidade ?? "PRESENCIAL",
				entregaLocalizacaoId: sale.entregaLocalizacaoId ?? null,
				comandaNumero: sale.comandaNumero ?? null,
				pagamentos: [],
				cashbackResgate: 0,
				cashbackProgramaId: null,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sale?.id]);

	// Confirm mutation
	const { mutate: confirm, isPending: isConfirming } = useMutation({
		mutationKey: ["confirm-sale", saleId],
		mutationFn: confirmSale,
		onSuccess: (data) => {
			toast.success(data.message);
			router.push("/dashboard/commercial/sales/new-sale");
		},
		onError: (err) => {
			toast.error(getErrorMessage(err));
		},
	});

	// Cancel mutation
	const { mutate: cancel, isPending: isCancelling } = useMutation({
		mutationKey: ["cancel-sale", saleId],
		mutationFn: () => cancelSaleDraft(saleId),
		onSuccess: () => {
			toast.success("Rascunho cancelado.");
			router.push("/dashboard/commercial/sales/new-sale");
		},
		onError: (err) => {
			toast.error(getErrorMessage(err));
		},
	});

	// Save draft updates before moving between steps
	const saveDraftUpdates = async () => {
		try {
			await updateSaleDraft({
				id: saleId,
				vendedorId: checkoutState.state.vendedorId,
				vendedorNome: checkoutState.state.vendedorNome,
				entregaModalidade: checkoutState.state.entregaModalidade,
				entregaLocalizacaoId: checkoutState.state.entregaLocalizacaoId,
				comandaNumero: checkoutState.state.comandaNumero,
				observacoes: checkoutState.state.observacoes,
				descontosTotal: checkoutState.state.descontoGeral > 0 ? checkoutState.state.descontoGeral : null,
				acrescimosTotal: checkoutState.state.acrescimoGeral > 0 ? checkoutState.state.acrescimoGeral : null,
			});
		} catch {
			// Silent - draft update failure shouldn't block navigation
		}
	};

	const handleNextStep = async () => {
		if (!checkoutState.canProceedFromStep(checkoutState.state.step)) {
			toast.error("Complete os campos obrigatórios antes de prosseguir.");
			return;
		}
		await saveDraftUpdates();
		checkoutState.nextStep();
	};

	const handleConfirm = () => {
		if (!sale) return;
		// TODO: contaDebitoId and contaCreditoId should come from org settings
		// For now, these are required in the API but we'll need a config UI
		confirm({
			id: saleId,
			clienteId: sale.cliente?.id ?? null,
			pagamentos: checkoutState.state.pagamentos.map((p) => ({
				metodo: p.metodo,
				valor: p.valor,
				parcela: p.parcela,
				totalParcelas: p.totalParcelas,
			})),
			cashbackResgate: checkoutState.state.cashbackResgate,
			cashbackProgramaId: checkoutState.state.cashbackProgramaId,
			contaDebitoId: "TODO_CONTA_DEBITO",
			contaCreditoId: "TODO_CONTA_CREDITO",
		});
	};

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!sale) return <ErrorComponent msg="Venda não encontrada." />;

	if (sale.status !== "ORCAMENTO") {
		return <ErrorComponent msg={`Esta venda não está em modo rascunho (status: ${sale.status}).`} />;
	}

	const STEP_LABELS = ["Revisão", "Entrega", "Pagamento", "Confirmação"];

	return (
		<div className="w-full min-h-[calc(100vh-4rem)] flex flex-col p-4 gap-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/commercial/sales/new-sale")}>
						<ArrowLeft className="w-5 h-5" />
					</Button>
					<div>
						<h1 className="text-xl font-black">CHECKOUT</h1>
						<p className="text-sm text-muted-foreground">Venda #{sale.idExterno}</p>
					</div>
				</div>

				<Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => cancel()} disabled={isCancelling}>
					<X className="w-4 h-4 mr-1" />
					Cancelar Venda
				</Button>
			</div>

			{/* Step Indicator */}
			<CheckoutSteps currentStep={checkoutState.state.step} stepLabels={STEP_LABELS} />

			{/* Step Content */}
			<div className="flex-1 max-w-4xl mx-auto w-full">
				{checkoutState.state.step === 1 && <ReviewStep sale={sale} checkoutState={checkoutState} />}

				{checkoutState.state.step === 2 && <DeliveryStep sale={sale} checkoutState={checkoutState} />}

				{checkoutState.state.step === 3 && (
					<PaymentStep sale={{ valorTotal: sale.valorTotal, clienteId: sale.clienteId }} checkoutState={checkoutState} />
				)}

				{checkoutState.state.step === 4 && <ConfirmationStep sale={sale} checkoutState={checkoutState} />}
			</div>

			{/* Navigation Footer */}
			<div className="max-w-4xl mx-auto w-full flex items-center justify-between gap-4 pt-4 border-t">
				<Button variant="outline" size="lg" onClick={() => checkoutState.prevStep()} disabled={checkoutState.state.step === 1} className="gap-2">
					<ChevronLeft className="w-4 h-4" />
					Voltar
				</Button>

				{checkoutState.state.step < 4 ? (
					<Button size="lg" onClick={handleNextStep} className="gap-2">
						Próximo
						<ChevronRight className="w-4 h-4" />
					</Button>
				) : (
					<Button
						size="lg"
						onClick={handleConfirm}
						disabled={isConfirming || !checkoutState.pagamentoCompleto}
						className="gap-2 bg-green-600 hover:bg-green-700"
					>
						<Check className="w-4 h-4" />
						{isConfirming ? "PROCESSANDO..." : "CONFIRMAR VENDA"}
					</Button>
				)}
			</div>
		</div>
	);
}

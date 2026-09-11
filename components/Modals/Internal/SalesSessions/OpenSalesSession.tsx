import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { openSalesSession } from "@/lib/mutations/sales-sessions";
import { useFinancesAccounts } from "@/lib/queries/finances";
import { useSellersSimplified } from "@/lib/queries/sellers";
import { useInternalSalesSessionState } from "@/state-hooks/use-internal-sales-session-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type OpenSalesSessionProps = {
	closeModal: () => void;
	requireOpeningFloat?: boolean;
	callbacks?: { onMutate?: () => void; onSuccess?: () => void; onError?: () => void; onSettled?: () => void };
};

export default function OpenSalesSession({ closeModal, requireOpeningFloat, callbacks }: OpenSalesSessionProps) {
	const queryClient = useQueryClient();
	const { state, updateOpenInput } = useInternalSalesSessionState();
	const { data: sellers } = useSellersSimplified();
	const { data: accountsData } = useFinancesAccounts({ initialFilters: { stats: false } });
	const sellerOptions = (sellers ?? []).map((seller) => ({ id: seller.id, value: seller.id, label: seller.nome }));
	const accountOptions = (accountsData?.accounts ?? [])
		.filter((account) => account.tipo === "CAIXA")
		.map((account) => ({ id: account.id, value: account.id, label: account.nome }));

	const { mutate, isPending } = useMutation({
		mutationKey: ["open-sales-session"],
		mutationFn: openSalesSession,
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			void queryClient.invalidateQueries({ queryKey: ["sales-sessions"] });
			void queryClient.invalidateQueries({ queryKey: ["open-sales-sessions"] });
			callbacks?.onSuccess?.();
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => {
			callbacks?.onError?.();
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	function handleSubmit() {
		if (state.openInput.politica === "VENDEDOR_UNICO" && !state.openInput.vendedorPadraoId) return toast.error("Selecione o vendedor desta sessão.");
		if (requireOpeningFloat && state.openInput.saldoInicial <= 0) return toast.error("Informe o fundo de troco para abrir o caixa.");
		mutate(state.openInput);
	}

	return (
		<ResponsiveMenu
			menuTitle="ABRIR CAIXA"
			menuDescription="Defina como os vendedores poderão usar esta sessão."
			menuActionButtonText="ABRIR CAIXA"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="sm"
		>
			<div className="flex w-full flex-col gap-3">
				<SelectInput
					label="POLÍTICA DE VENDEDORES"
					value={state.openInput.politica}
					options={[
						{ id: "VENDEDORES_MULTIPLOS", value: "VENDEDORES_MULTIPLOS", label: "VENDEDORES MÚLTIPLOS" },
						{ id: "VENDEDOR_UNICO", value: "VENDEDOR_UNICO", label: "VENDEDOR ÚNICO" },
					]}
					handleChange={(value) => updateOpenInput({ politica: value as typeof state.openInput.politica })}
					resetOptionLabel="Selecione a política"
					onReset={() => updateOpenInput({ politica: "VENDEDORES_MULTIPLOS" })}
					required
				/>
				<SelectInput
					label={state.openInput.politica === "VENDEDOR_UNICO" ? "VENDEDOR" : "VENDEDOR PADRÃO"}
					value={state.openInput.vendedorPadraoId ?? null}
					options={sellerOptions}
					handleChange={(value) => updateOpenInput({ vendedorPadraoId: value })}
					resetOptionLabel={state.openInput.politica === "VENDEDOR_UNICO" ? "Selecione o vendedor" : "Nenhum"}
					onReset={() => updateOpenInput({ vendedorPadraoId: null })}
					required={state.openInput.politica === "VENDEDOR_UNICO"}
				/>
				{state.openInput.politica === "VENDEDORES_MULTIPLOS" ? (
					<p className="text-xs text-muted-foreground">O vendedor padrão apenas preenche vendas novas e pode ser alterado em cada venda.</p>
				) : null}
				<SelectInput
					label="CONTA CAIXA"
					value={state.openInput.contaFinanceiraId ?? null}
					options={accountOptions}
					handleChange={(value) => updateOpenInput({ contaFinanceiraId: value })}
					resetOptionLabel="Nenhuma"
					onReset={() => updateOpenInput({ contaFinanceiraId: null })}
				/>
				<NumberInput
					label={requireOpeningFloat ? "FUNDO DE TROCO (OBRIGATORIO)" : "FUNDO DE TROCO"}
					value={state.openInput.saldoInicial}
					handleChange={(value) => updateOpenInput({ saldoInicial: value })}
					placeholder="0,00"
				/>
				<TextareaInput
					label="OBSERVAÇÕES DA ABERTURA"
					value={state.openInput.observacoesAbertura ?? ""}
					handleChange={(value) => updateOpenInput({ observacoesAbertura: value || null })}
					placeholder="Observações da abertura (opcional)..."
				/>
			</div>
		</ResponsiveMenu>
	);
}

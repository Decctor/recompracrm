"use client";
import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSet, FieldLegend } from "@/components/ui/field";
import { getErrorMessage } from "@/lib/errors";
import { getFiscalCreditCompetence } from "@/lib/fiscal/simples-credit";
import { createFiscalCreditRates } from "@/lib/mutations/fiscal-credit-rates";
import { useFiscalTaxGroups } from "@/lib/queries/fiscal";
import { useFiscalCreditRates } from "@/lib/queries/fiscal-credit-rates";
import { useInternalFiscalCreditRateState } from "@/state-hooks/use-internal-fiscal-credit-rate-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function NewFiscalCreditRate({ closeModal }: { closeModal: () => void }) {
	const { state, updateRate, toggleGroup } = useInternalFiscalCreditRateState();
	const groups = useFiscalTaxGroups();
	const history = useFiscalCreditRates(true);
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: createFiscalCreditRates,
		onSuccess: async (response) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["fiscal-credit-rates"] }),
				queryClient.invalidateQueries({ queryKey: ["pos-fiscal-preview"] }),
			]);
			toast.success(response.message);
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});
	const previousMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(state.competencia)
		? getFiscalCreditCompetence(new Date(Date.UTC(Number(state.competencia.slice(0, 4)), Number(state.competencia.slice(5)) - 2, 15, 12)))
		: "";
	const copyPrevious = () => {
		const matches = history.data?.filter((row) => row.competencia === previousMonth && state.groupIds.includes(row.grupoTributarioId)) ?? [];
		const latest = [...new Map([...matches].reverse().map((row) => [row.grupoTributarioId, row])).values()];
		if (!latest.length || new Set(latest.map((row) => row.percentual)).size !== 1)
			return toast.error("Selecione grupos com o mesmo percentual na competência anterior.");
		updateRate({ percentual: latest[0].percentual, observacao: `Copiado de ${previousMonth}. Confirme a orientação contábil para esta competência.` });
	};
	return (
		<ResponsiveMenu
			menuTitle="CADASTRAR PERCENTUAL DE CRÉDITO"
			menuDescription="Cadastre o percentual informado pela contabilidade. Cada salvamento cria uma revisão no histórico."
			menuActionButtonText="SALVAR PERCENTUAL"
			menuCancelButtonText="VOLTAR"
			closeMenu={closeModal}
			actionFunction={() => mutation.mutate(state)}
			actionIsLoading={mutation.isPending}
			stateIsLoading={groups.isLoading}
			stateError={groups.isError ? getErrorMessage(groups.error) : null}
			menuActionButtonDisabled={
				!state.groupIds.length || state.percentual <= 0 || state.percentual > 100 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(state.competencia)
			}
		>
			<FieldGroup>
				<TextInput
					label="COMPETÊNCIA (AAAA-MM)"
					value={state.competencia}
					placeholder="2026-11"
					handleChange={(competencia) => updateRate({ competencia })}
				/>
				<NumberInput
					label="PERCENTUAL DE CRÉDITO (%)"
					value={state.percentual}
					placeholder="Informe o percentual da contabilidade"
					handleChange={(percentual) => updateRate({ percentual })}
				/>
				<FieldSet>
					<FieldLegend>Aplicar aos grupos</FieldLegend>
					{groups.data
						?.filter((group) => group.ativo)
						.map((group) => (
							<CheckboxInput
								key={group.id}
								checked={state.groupIds.includes(group.id)}
								labelTrue={group.nome}
								labelFalse={group.nome}
								handleChange={() => toggleGroup(group.id)}
							/>
						))}
				</FieldSet>
				<Button
					type="button"
					variant="outline"
					onClick={copyPrevious}
					disabled={!/^\d{4}-(0[1-9]|1[0-2])$/.test(state.competencia) || !state.groupIds.length || !history.data}
				>
					Copiar percentual da competência anterior
				</Button>
				<TextareaInput
					label="ORIENTAÇÃO CONTÁBIL (OPCIONAL)"
					value={state.observacao ?? ""}
					placeholder="Referência da orientação recebida do escritório"
					handleChange={(observacao) => updateRate({ observacao })}
				/>
			</FieldGroup>
		</ResponsiveMenu>
	);
}

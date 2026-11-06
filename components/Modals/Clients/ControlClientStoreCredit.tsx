"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import type { TGetClientStoreCreditOutput, TUpdateClientStoreCreditInput } from "@/app/api/clients/store-credit/route";
import NumberInput from "@/components/Inputs/NumberInput";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { updateClientStoreCredit } from "@/lib/mutations/store-credit";
import { useClientStoreCredit } from "@/lib/queries/store-credit";
import { cn } from "@/lib/utils";

type ControlClientStoreCreditProps = {
	clientId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdateClientStoreCreditInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/**
 * Decisão de crédito de um cliente: liberado ou não, e com que teto. O teto é sobre o saldo EM
 * ABERTO (lib/finances/store-credit/policy.ts), por isso o menu mostra o que ele já deve.
 */
export function ControlClientStoreCredit({ clientId, closeModal, callbacks }: ControlClientStoreCreditProps) {
	const { data, isLoading, isError, error } = useClientStoreCredit({ clientId });

	if (!data) {
		return (
			<ResponsiveMenu
				menuTitle="LIBERAÇÃO DE FIADO"
				menuDescription="Carregando a liberação de fiado do cliente."
				menuActionButtonText="SALVAR"
				menuCancelButtonText="CANCELAR"
				actionFunction={() => undefined}
				actionIsLoading={false}
				menuActionButtonDisabled
				stateIsLoading={isLoading}
				stateError={isError ? getErrorMessage(error) : null}
				closeMenu={closeModal}
			>
				{null}
			</ResponsiveMenu>
		);
	}

	return <LoadedControlClientStoreCredit clientId={clientId} storeCredit={data} closeModal={closeModal} callbacks={callbacks} />;
}

type TLimitMode = "COM_LIMITE" | "SEM_LIMITE";

function LoadedControlClientStoreCredit({
	clientId,
	storeCredit,
	closeModal,
	callbacks,
}: ControlClientStoreCreditProps & { storeCredit: TGetClientStoreCreditOutput["data"] }) {
	const queryClient = useQueryClient();
	const { position, exigeLiberacao } = storeCredit;
	const switchId = useId();
	const radioId = useId();

	// Estado inicial direto do cadastro: o menu só monta com os dados já carregados, então não há
	// hidratação em efeito para disputar com a digitação.
	const [fiadoLiberado, setFiadoLiberado] = useState(position.fiadoLiberado);
	const [limitMode, setLimitMode] = useState<TLimitMode>(position.fiadoLiberado && position.fiadoLimite === null ? "SEM_LIMITE" : "COM_LIMITE");
	const [fiadoLimite, setFiadoLimite] = useState<number | null>(position.fiadoLimite);

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-client-store-credit", clientId],
		mutationFn: updateClientStoreCredit,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: async (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			await queryClient.invalidateQueries({ queryKey: ["client-store-credit", clientId] });
			closeModal();
		},
		onError: (err) => {
			callbacks?.onError?.(err);
			toast.error(getErrorMessage(err));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	const comLimite = fiadoLiberado && limitMode === "COM_LIMITE";
	const limiteInvalido = comLimite && (fiadoLimite === null || fiadoLimite <= 0);
	// Avisa, não bloqueia: baixar o limite de quem deve muito é uma decisão legítima de cobrança.
	const limiteAbaixoDoAberto = comLimite && !limiteInvalido && fiadoLimite !== null && fiadoLimite <= position.saldoEmAberto;

	function handleSubmit() {
		if (limiteInvalido) return toast.error("Informe um limite maior que zero, ou escolha sem limite.");
		mutate({ clientId, fiadoLiberado, fiadoLimite: comLimite ? fiadoLimite : null });
	}

	return (
		<ResponsiveMenu
			menuTitle="LIBERAÇÃO DE FIADO"
			menuDescription={`${position.clienteNome} tem ${formatToMoney(position.saldoEmAberto)} em aberto no fiado.`}
			menuActionButtonText="SALVAR"
			menuCancelButtonText="CANCELAR"
			menuActionButtonDisabled={limiteInvalido}
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<ResponsiveMenuSection title="CRÉDITO DO CLIENTE" icon={<ShieldCheck className="h-4 w-4 min-h-4 min-w-4" />}>
				<div className="flex w-full items-start justify-between gap-3 rounded-lg border border-border p-3">
					<div className="flex min-w-0 flex-col gap-0.5">
						<Label htmlFor={switchId} className="text-sm font-medium">
							Liberar fiado
						</Label>
						<p className="text-xs text-muted-foreground">
							{fiadoLiberado
								? "O cliente compra fiado no balcão sem precisar de aprovação, dentro do limite."
								: "Fiado para este cliente só com a aprovação de um gestor. O que ele já deve continua em aberto."}
						</p>
					</div>
					<Switch id={switchId} checked={fiadoLiberado} onCheckedChange={setFiadoLiberado} className="mt-0.5" />
				</div>

				{fiadoLiberado ? (
					<RadioGroup
						value={limitMode}
						onValueChange={(value) => setLimitMode(value as TLimitMode)}
						aria-label="Limite de fiado"
						className="grid-cols-1 gap-2 sm:grid-cols-2"
					>
						<LimitModeOption
							id={`${radioId}-com`}
							value="COM_LIMITE"
							checked={limitMode === "COM_LIMITE"}
							title="Com limite"
							description="Teto para o total em aberto."
						/>
						<LimitModeOption
							id={`${radioId}-sem`}
							value="SEM_LIMITE"
							checked={limitMode === "SEM_LIMITE"}
							title="Sem limite"
							description="Compra fiado de qualquer valor."
						/>
					</RadioGroup>
				) : null}

				{comLimite ? (
					<div className="flex flex-col gap-1.5">
						<NumberInput label="LIMITE DE FIADO (R$)" placeholder="0,00" value={fiadoLimite} handleChange={setFiadoLimite} required />
						<p className="text-xs text-muted-foreground">
							O limite vale para a soma do que está em aberto, não para cada venda.
							{fiadoLimite !== null && fiadoLimite > position.saldoEmAberto
								? ` Com ele, o cliente ainda pode levar ${formatToMoney(fiadoLimite - position.saldoEmAberto)} fiado.`
								: ""}
						</p>
					</div>
				) : null}

				{limiteAbaixoDoAberto ? (
					<div role="status" className="flex items-start gap-2 rounded-lg bg-warning-surface p-3 text-warning-surface-foreground">
						<AlertTriangle className="mt-0.5 h-4 w-4 min-h-4 min-w-4" />
						<p className="text-xs">
							O limite não passa do que o cliente já deve ({formatToMoney(position.saldoEmAberto)}). Novas vendas fiado ficam bloqueadas até o saldo em
							aberto baixar.
						</p>
					</div>
				) : null}

				{!exigeLiberacao ? (
					<p className="text-xs text-muted-foreground">
						Sua organização não exige liberação de fiado hoje: esta decisão fica guardada e passa a valer quando a exigência for ligada na aba Fiados.
					</p>
				) : null}
			</ResponsiveMenuSection>
		</ResponsiveMenu>
	);
}

function LimitModeOption({
	id,
	value,
	checked,
	title,
	description,
}: {
	id: string;
	value: TLimitMode;
	checked: boolean;
	title: string;
	description: string;
}) {
	return (
		<Label
			htmlFor={id}
			className={cn(
				"flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 transition-colors",
				checked ? "border-primary bg-primary/5" : "hover:bg-muted/50",
			)}
		>
			<RadioGroupItem id={id} value={value} className="mt-0.5" />
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="text-sm font-medium">{title}</span>
				<span className="text-xs font-normal text-muted-foreground">{description}</span>
			</span>
		</Label>
	);
}

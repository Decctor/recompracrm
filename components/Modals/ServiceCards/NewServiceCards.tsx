import type { TCreateServiceCardsOutput } from "@/app/api/service-cards/route";
import NumberInput from "@/components/Inputs/NumberInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createServiceCards } from "@/lib/mutations/tabs";
import { generateServiceCardCodes, SERVICE_CARD_MAX_BATCH_SIZE, type TServiceCardCodeRange } from "@/lib/tabs/service-card-codes";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ServiceCardFileActions } from "./ServiceCardFileActions";

type NewServiceCardsProps = {
	logoUrl?: string | null;
	closeModal: () => void;
	callbacks?: {
		onSuccess?: () => void;
	};
};

export function NewServiceCards({ logoUrl, closeModal, callbacks }: NewServiceCardsProps) {
	const [range, setRange] = useState<TServiceCardCodeRange>({ inicio: 1, fim: 100, digitos: 3, prefixo: null });
	// Apos criar, o proximo passo natural e baixar o arquivo da grafica do lote recem-criado.
	const [created, setCreated] = useState<TCreateServiceCardsOutput["data"]["created"] | null>(null);

	const codes = useMemo(() => generateServiceCardCodes(range), [range]);
	const rangeError =
		range.fim < range.inicio
			? "O número final deve ser maior ou igual ao inicial."
			: codes.length > SERVICE_CARD_MAX_BATCH_SIZE
				? `Gere no máximo ${SERVICE_CARD_MAX_BATCH_SIZE} comandas por vez.`
				: null;

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-service-cards"],
		mutationFn: createServiceCards,
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			if (data.data.created.length === 0) return;
			setCreated(data.data.created);
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	if (created) {
		return (
			<ResponsiveMenu
				mode="read-only"
				menuTitle="COMANDAS CRIADAS"
				menuDescription="Baixe o arquivo para a gráfica. Ele pode ser gerado de novo a qualquer momento em Comandas."
				menuCancelButtonText="CONCLUIR"
				stateIsLoading={false}
				stateError={null}
				closeMenu={closeModal}
			>
				<div className="flex flex-col gap-3 p-1">
					<p className="text-sm">
						<span className="font-bold">{created.length}</span> comanda(s): {created[0].codigo}
						{created.length > 1 ? ` a ${created[created.length - 1].codigo}` : ""}.
					</p>
					<ServiceCardFileActions cards={created} logoUrl={logoUrl} />
				</div>
			</ResponsiveMenu>
		);
	}

	return (
		<ResponsiveMenu
			menuTitle="GERAR COMANDAS"
			menuDescription="Cadastre uma sequência de comandas numeradas. Números já cadastrados são ignorados."
			menuActionButtonText="GERAR"
			menuActionButtonDisabled={!!rangeError || codes.length === 0}
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate({ codes })}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<div className="flex flex-col gap-3 p-1">
				<div className="grid grid-cols-2 gap-3">
					<NumberInput
						label="DO NÚMERO"
						value={range.inicio}
						placeholder="Ex: 1"
						handleChange={(value) => setRange((prev) => ({ ...prev, inicio: Math.max(0, Math.trunc(value)) }))}
					/>
					<NumberInput
						label="ATÉ O NÚMERO"
						value={range.fim}
						placeholder="Ex: 200"
						handleChange={(value) => setRange((prev) => ({ ...prev, fim: Math.max(0, Math.trunc(value)) }))}
					/>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<NumberInput
						label="DÍGITOS (ZEROS À ESQUERDA)"
						value={range.digitos}
						placeholder="Ex: 3 → 001"
						handleChange={(value) => setRange((prev) => ({ ...prev, digitos: Math.min(6, Math.max(0, Math.trunc(value))) }))}
					/>
					<TextInput
						label="PREFIXO"
						value={range.prefixo ?? ""}
						placeholder="Opcional. Ex: A"
						handleChange={(value) => setRange((prev) => ({ ...prev, prefixo: value.replace(/[^A-Za-z-]/g, "").toUpperCase() || null }))}
					/>
				</div>
				<div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm">
					{rangeError ? (
						<span className="text-destructive">{rangeError}</span>
					) : codes.length > 0 ? (
						<span>
							<span className="font-bold">{codes.length}</span> comanda(s): <span className="font-bold">{codes[0]}</span>
							{codes.length > 1 ? (
								<>
									{" "}
									a <span className="font-bold">{codes[codes.length - 1]}</span>
								</>
							) : null}
						</span>
					) : (
						<span className="text-muted-foreground">Informe o intervalo.</span>
					)}
				</div>
			</div>
		</ResponsiveMenu>
	);
}

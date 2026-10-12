import type { TCreateTabInput, TCreateTabOutput } from "@/app/api/tabs/route";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { useBarcodeScanner } from "@/lib/hooks/use-barcode-scanner";
import { createTab } from "@/lib/mutations/tabs";
import { fetchServiceCardLookup, useServiceCardLookup, useServicePoints, useServiceSettings } from "@/lib/queries/tabs";
import { extractServiceCardToken, SERVICE_CARD_SCAN_MAX_LENGTH } from "@/lib/tabs/service-card-codes";
import { cn } from "@/lib/utils";
import { tabUsesCode } from "@/schemas/service-settings";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

type NewTabProps = {
	// Pre-seleciona o ponto (clique num ponto livre do board).
	initialServicePointId?: string | null;
	// Pre-preenche a comanda (leitura do QR do cartao no board).
	initialCodigo?: string | null;
	closeModal: () => void;
	callbacks?: {
		onSuccess?: (data: TCreateTabOutput) => void;
		/** A comanda informada ja tem conta aberta: o operador vai para ela em vez de abrir outra. */
		onOpenExisting?: (tabId: string) => void;
	};
};

export function NewTab({ initialServicePointId, initialCodigo, closeModal, callbacks }: NewTabProps) {
	const { data: settings, isLoading: settingsLoading, isError: settingsError, error } = useServiceSettings();
	const { data: servicePoints } = useServicePoints({ activeOnly: true });
	const ownerRef = useRef<HTMLDivElement>(null);

	const [state, setState] = useState<TCreateTabInput>({
		servicePointId: initialServicePointId ?? null,
		codigo: initialCodigo ?? null,
		clienteId: null,
		responsavelVendedorId: null,
		observacoes: null,
	});

	const showPointSelect = settings?.pontos.habilitados ?? false;
	const showCodeInput = settings ? tabUsesCode(settings.contas) : false;
	const registeredCards = settings?.contas.identificacao === "COMANDA_CADASTRADA";

	const lookup = useServiceCardLookup({ codigo: state.codigo ?? "", enabled: registeredCards });
	const card = lookup.data?.card ?? null;
	const openTabId = lookup.data?.tabAberta?.id ?? null;
	const lookupSettled = !!state.codigo?.trim() && !lookup.isDebouncing && !lookup.isFetching && !!lookup.data;
	const cardStatus: "LIVRE" | "EM_USO" | "DESATIVADA" | "NAO_CADASTRADA" | null = !lookupSettled
		? null
		: !card
			? "NAO_CADASTRADA"
			: !card.ativo
				? "DESATIVADA"
				: openTabId
					? "EM_USO"
					: "LIVRE";

	// Leitura do QR do cartao com o modal aberto preenche o numero (o dono da leitura e este dialog).
	useBarcodeScanner({
		enabled: registeredCards,
		ownerRef,
		maxLength: SERVICE_CARD_SCAN_MAX_LENGTH,
		onScan: async (code) => {
			const token = extractServiceCardToken(code);
			if (!token) return; // Codigo de barras de produto: nao e deste formulario.
			try {
				const result = await fetchServiceCardLookup({ token });
				if (!result.card) {
					toast.error("QR de comanda não reconhecido nesta organização.");
					return;
				}
				setState((prev) => ({ ...prev, codigo: result.card?.codigo ?? prev.codigo }));
			} catch (scanError) {
				toast.error(getErrorMessage(scanError));
			}
		},
	});

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-tab"],
		mutationFn: createTab,
		onSuccess: (data) => {
			callbacks?.onSuccess?.(data);
			toast.success(data.message);
			closeModal();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVA CONTA"
			menuDescription="Abra uma conta de atendimento para acumular pedidos até o fechamento."
			menuActionButtonText="ABRIR CONTA"
			menuActionButtonDisabled={registeredCards && cardStatus !== "LIVRE"}
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate({ ...state, serviceCardId: registeredCards ? (card?.id ?? null) : null })}
			actionIsLoading={isPending}
			stateIsLoading={settingsLoading}
			stateError={settingsError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
		>
			<div ref={ownerRef} className="flex flex-col gap-3 p-1">
				{showPointSelect ? (
					<SelectInput
						label="PONTO DE ATENDIMENTO"
						value={state.servicePointId}
						options={(servicePoints ?? []).map((point) => ({ id: point.id, value: point.id, label: point.rotulo }))}
						resetOptionLabel="NENHUM"
						handleChange={(value) => setState((prev) => ({ ...prev, servicePointId: value }))}
						onReset={() => setState((prev) => ({ ...prev, servicePointId: null }))}
					/>
				) : null}
				{showCodeInput ? (
					<div className="flex flex-col gap-1.5">
						<TextInput
							label={registeredCards ? "NÚMERO DA COMANDA" : "CÓDIGO DA COMANDA"}
							value={state.codigo ?? ""}
							placeholder={registeredCards ? "Digite o número ou leia o QR do cartão" : "Ex: 15"}
							handleChange={(value) => setState((prev) => ({ ...prev, codigo: value || null }))}
						/>
						{registeredCards && cardStatus ? (
							<div
								className={cn(
									"flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium",
									cardStatus === "LIVRE" ? "bg-success-surface text-success" : "bg-destructive/10 text-destructive",
								)}
							>
								<span>
									{cardStatus === "LIVRE" && `Comanda ${card?.codigo} livre.`}
									{cardStatus === "EM_USO" && `Comanda ${card?.codigo} já está em uso.`}
									{cardStatus === "DESATIVADA" && `Comanda ${card?.codigo} desativada.`}
									{cardStatus === "NAO_CADASTRADA" && `Comanda ${state.codigo?.trim()} não cadastrada.`}
								</span>
								{cardStatus === "EM_USO" && openTabId && callbacks?.onOpenExisting ? (
									<Button
										size="sm"
										variant="outline"
										className="h-7 text-xs"
										onClick={() => {
											callbacks.onOpenExisting?.(openTabId);
											closeModal();
										}}
									>
										VER CONTA
									</Button>
								) : null}
							</div>
						) : null}
					</div>
				) : null}
				<TextInput
					label="OBSERVAÇÕES"
					value={state.observacoes ?? ""}
					placeholder="Observações da conta (opcional)"
					handleChange={(value) => setState((prev) => ({ ...prev, observacoes: value || null }))}
				/>
			</div>
		</ResponsiveMenu>
	);
}

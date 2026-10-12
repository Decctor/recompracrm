import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { useBarcodeScanner } from "@/lib/hooks/use-barcode-scanner";
import { transferTab } from "@/lib/mutations/tabs";
import { fetchServiceCardLookup, useServiceCardLookup } from "@/lib/queries/tabs";
import { extractServiceCardToken, SERVICE_CARD_SCAN_MAX_LENGTH } from "@/lib/tabs/service-card-codes";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

type ChangeTabServiceCardProps = {
	tabId: string;
	currentCodigo: string | null;
	closeModal: () => void;
	callbacks?: {
		onSuccess?: () => void;
	};
};

/**
 * Troca a comanda fixa de uma conta aberta (cartao perdido ou trocado). Pedidos e consumo
 * seguem na mesma conta; depois, desative o cartao perdido em Comandas.
 */
export function ChangeTabServiceCard({ tabId, currentCodigo, closeModal, callbacks }: ChangeTabServiceCardProps) {
	const ownerRef = useRef<HTMLDivElement>(null);
	const [codigo, setCodigo] = useState("");
	const lookup = useServiceCardLookup({ codigo });
	const card = lookup.data?.card ?? null;
	const settled = !!codigo.trim() && !lookup.isDebouncing && !lookup.isFetching && !!lookup.data;
	const problem = !settled
		? null
		: !card
			? `Comanda ${codigo.trim()} não cadastrada.`
			: !card.ativo
				? `Comanda ${card.codigo} desativada.`
				: lookup.data?.tabAberta
					? lookup.data.tabAberta.id === tabId
						? "Esta conta já está nesta comanda."
						: `Comanda ${card.codigo} já está em uso.`
					: null;

	useBarcodeScanner({
		ownerRef,
		maxLength: SERVICE_CARD_SCAN_MAX_LENGTH,
		onScan: async (code) => {
			const token = extractServiceCardToken(code);
			if (!token) return;
			try {
				const result = await fetchServiceCardLookup({ token });
				if (!result.card) {
					toast.error("QR de comanda não reconhecido nesta organização.");
					return;
				}
				setCodigo(result.card.codigo);
			} catch (scanError) {
				toast.error(getErrorMessage(scanError));
			}
		},
	});

	const { mutate, isPending } = useMutation({
		mutationKey: ["change-tab-service-card", tabId],
		mutationFn: transferTab,
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	return (
		<ResponsiveMenu
			menuTitle="TROCAR COMANDA"
			menuDescription={`A conta${currentCodigo ? ` da comanda ${currentCodigo}` : ""} passa para o novo cartão com todos os pedidos.`}
			menuActionButtonText="TROCAR"
			menuActionButtonDisabled={!settled || !!problem || !card}
			menuCancelButtonText="CANCELAR"
			actionFunction={() => card && mutate({ tabId, serviceCardDestinoId: card.id, motivo: null })}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<div ref={ownerRef} className="flex flex-col gap-1.5 p-1">
				<TextInput label="NOVA COMANDA" value={codigo} placeholder="Digite o número ou leia o QR do cartão" handleChange={setCodigo} />
				{settled ? (
					<span
						className={cn(
							"rounded-lg px-2.5 py-1.5 text-xs font-medium",
							problem ? "bg-destructive/10 text-destructive" : "bg-success-surface text-success",
						)}
					>
						{problem ?? `Comanda ${card?.codigo} livre.`}
					</span>
				) : null}
				<span className="text-[11px] text-muted-foreground">Cartão perdido? Depois da troca, desative-o em Comandas para invalidar o QR.</span>
			</div>
		</ResponsiveMenu>
	);
}

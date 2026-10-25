"use client";

import type { TPurchaseById } from "@/app/dashboard/purchases/_module/detail/helpers/hydrate";
import DateInput from "@/components/Inputs/DateInput";
import NumberInput from "@/components/Inputs/NumberInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { formatDateForInputValue, formatDateOnInputChange, formatToMoney } from "@/lib/formatting";
import { createPurchaseReturn } from "@/lib/mutations/purchases";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PackageMinus, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ReturnPurchaseItemsProps = {
	purchase: TPurchaseById;
	closeModal: () => void;
};

/**
 * Devolução ao fornecedor (ADR-0002, Fase 8): saída de estoque ao custo da entrada e crédito com o
 * fornecedor, na proporção do item. A NF-e de devolução é emitida à parte, referenciando a nota de origem.
 */
export default function ReturnPurchaseItems({ purchase, closeModal }: ReturnPurchaseItemsProps) {
	const queryClient = useQueryClient();
	const returnedSoFar = new Map<string, number>();
	for (const previous of purchase.devolucoes?.devolucoes ?? [])
		for (const item of previous.itens) returnedSoFar.set(item.itemId, (returnedSoFar.get(item.itemId) ?? 0) + item.quantidade);
	const candidates = purchase.itens.filter(
		(item) => item.destinacao !== "ATIVO_IMOBILIZADO" && item.quantidade - (returnedSoFar.get(item.id) ?? 0) > 0,
	);
	const [quantities, setQuantities] = useState<Record<string, number>>({});
	const [motivo, setMotivo] = useState("");
	const [data, setData] = useState(new Date());

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-purchase-return", purchase.id],
		mutationFn: createPurchaseReturn,
		onSuccess: async (response) => {
			toast.success(response.message);
			await queryClient.invalidateQueries({ queryKey: ["purchase-by-id", purchase.id] });
			await queryClient.invalidateQueries({ queryKey: ["purchases"] });
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const selected = candidates.filter((item) => (quantities[item.id] ?? 0) > 0);
	const estimatedCredit = selected.reduce(
		(total, item) => total + (item.valorUnitarioLiquido ?? item.valorUnitarioBruto) * (quantities[item.id] ?? 0),
		0,
	);

	return (
		<ResponsiveMenu
			menuTitle="DEVOLVER AO FORNECEDOR"
			menuDescription="Os itens saem do estoque ao custo da entrada e viram crédito com o fornecedor. A NF-e de devolução é emitida à parte."
			menuActionButtonText="REGISTRAR DEVOLUÇÃO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() =>
				mutate({
					purchaseId: purchase.id,
					data: data.toISOString(),
					motivo,
					itens: selected.map((item) => ({ itemId: item.id, quantidade: quantities[item.id] ?? 0 })),
				})
			}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="lg"
		>
			<ResponsiveMenuSection title="ITENS DEVOLVIDOS" icon={<PackageMinus className="h-4 w-4" />}>
				{candidates.length === 0 ? <p className="text-xs text-muted-foreground">Nada mais a devolver nesta compra.</p> : null}
				{candidates.map((item) => {
					const available = item.quantidade - (returnedSoFar.get(item.id) ?? 0);
					return (
						<div key={item.id} className="grid grid-cols-1 items-end gap-2 rounded-lg border border-border px-3 py-2 md:grid-cols-[minmax(0,1fr)_140px]">
							<div className="flex min-w-0 flex-col">
								<span className="truncate text-sm font-semibold">{item.snapshotProdutoDescricao}</span>
								<span className="text-xs text-muted-foreground">
									Disponível {available} {item.produto?.unidade ?? "UN"} · {formatToMoney(item.valorUnitarioLiquido ?? item.valorUnitarioBruto)} / un.
								</span>
							</div>
							<NumberInput
								label="DEVOLVER"
								placeholder="0"
								value={quantities[item.id] ?? 0}
								handleChange={(value) => setQuantities((prev) => ({ ...prev, [item.id]: Math.min(available, Math.max(0, value)) }))}
							/>
						</div>
					);
				})}
			</ResponsiveMenuSection>
			<ResponsiveMenuSection title="DEVOLUÇÃO" icon={<Undo2 className="h-4 w-4" />}>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<DateInput
						label="DATA"
						value={formatDateForInputValue(data)}
						handleChange={(value) => setData(formatDateOnInputChange(value, "date") ?? data)}
						required
					/>
					<TextInput label="MOTIVO" placeholder="Ex.: avaria no transporte, item errado" value={motivo} handleChange={setMotivo} required />
				</div>
				<p className="text-xs text-muted-foreground">
					Crédito estimado com o fornecedor: <strong className="text-foreground">{formatToMoney(estimatedCredit)}</strong>. O valor exato segue a
					composição de cada item (desconto, frete, tributos).
				</p>
			</ResponsiveMenuSection>
		</ResponsiveMenu>
	);
}

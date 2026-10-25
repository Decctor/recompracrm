import NumberInput from "@/components/Inputs/NumberInput";
import SelectProductWithVariants from "@/components/Inputs/SelectProductWithVariants";
import { Input } from "@/components/ui/input";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { formatToMoney } from "@/lib/formatting";
import { Minus, Plus } from "lucide-react";
import { TUsePurchaseState } from "@/state-hooks/use-purchase-state";
import { useState } from "react";
import { toast } from "sonner";

type NewPurchaseItemProps = {
	addPurchaseItem: TUsePurchaseState["addPurchaseItem"];
	closeMenu: () => void;
};
type TPurchaseItemState = TUsePurchaseState["state"]["purchaseItems"][number];

function roundTo2(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateInferableValues(item: Partial<TPurchaseItemState>) {
	const quantidade = Number(item.quantidade) || 0;
	const valorUnitarioBruto = Number(item.valorUnitarioBruto) || 0;
	const descontosTotal = Number(item.descontosTotal) || 0;
	const acrescimosTotal = Number(item.acrescimosTotal) || 0;

	const valorTotalBruto = roundTo2(quantidade * valorUnitarioBruto);
	const valorTotalLiquido = roundTo2(valorTotalBruto - descontosTotal + acrescimosTotal);
	const valorUnitarioLiquido = quantidade > 0 ? roundTo2(valorTotalLiquido / quantidade) : 0;

	return {
		valorTotalBruto,
		valorTotalLiquido,
		valorUnitarioLiquido,
	};
}

export default function NewPurchaseItem({ addPurchaseItem, closeMenu }: NewPurchaseItemProps) {
	const [infoHolder, setInfoHolder] = useState<TPurchaseItemState>({
		produtoId: "",
		destinacao: "REVENDA",
		snapshotProdutoDescricao: "",
		snapshotProdutoCodigo: "",
		produto: {
			nome: "",
			codigo: "",
			unidade: "",
			imagemCapaUrl: null,
		},
		quantidade: 0,
		valorUnitarioBruto: 0,
		valorTotalBruto: 0,
		valorUnitarioLiquido: 0,
		valorTotalLiquido: 0,
		descontosTotal: 0,
		acrescimosTotal: 0,
		dataValidade: null,
	});
	function updateInfoHolder(updates: Partial<TPurchaseItemState>) {
		setInfoHolder((prev) => {
			const nextState = {
				...prev,
				...updates,
			};
			return {
				...nextState,
				...calculateInferableValues(nextState),
			};
		});
	}

	function validateAndAddItem(info: TUsePurchaseState["state"]["purchaseItems"][number]) {
		if (!info.produtoId) return toast.error("Produto não informado.");
		if (!info.quantidade) return toast.error("Quantidade não informada.");
		if (!info.valorUnitarioBruto) return toast.error("Valor unitário bruto não informado.");
		if (!info.valorTotalBruto) return toast.error("Valor total bruto não informado.");
		if (!info.valorUnitarioLiquido) return toast.error("Valor unitário líquido não informado.");
		if (!info.valorTotalLiquido) return toast.error("Valor total líquido não informado.");
		return addPurchaseItem(info);
	}
	return (
		<ResponsiveMenu
			menuTitle="NOVO ITEM"
			menuDescription="Preencha os campos abaixo para criar um novo item"
			menuActionButtonText="ADICIONAR ITEM"
			menuCancelButtonText="FECHAR"
			actionFunction={() => validateAndAddItem(infoHolder)}
			actionIsLoading={false}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
		>
			<SelectProductWithVariants
				label="PRODUTO"
				value={{
					productId: infoHolder.produtoId,
					productVariantId: infoHolder.produtoVarianteId,
				}}
				handleChange={(value) =>
					updateInfoHolder({
						produtoId: value?.product?.id ?? "",
						produtoVarianteId: value?.productVariant?.id ?? null,
						snapshotProdutoDescricao: value?.productVariant?.nome ?? value?.product?.nome ?? "",
						snapshotProdutoCodigo: value?.productVariant?.codigo ?? value?.product?.codigo ?? "",
						produto: value?.product
							? {
									nome: value?.product?.nome ?? "",
									codigo: value?.product?.codigo ?? "",
									unidade: value?.product?.unidade ?? "",
									imagemCapaUrl: value?.product?.imagemCapaUrl ?? null,
								}
							: undefined,
						produtoVariante: value?.productVariant
							? {
									nome: value?.productVariant?.nome ?? "",
									codigo: value?.productVariant?.codigo ?? "",
									imagemCapaUrl: value?.productVariant?.imagemCapaUrl ?? null,
								}
							: undefined,
					})
				}
				onReset={() => updateInfoHolder({ produtoId: "", produtoVarianteId: null })}
				resetOptionLabel="SELECIONE UM PRODUTO"
			/>
			<NumberInput
				label="QUANTIDADE"
				placeholder="Digite a quantidade do item"
				value={infoHolder.quantidade}
				handleChange={(value) => updateInfoHolder({ quantidade: value })}
			/>
			<NumberInput
				label="VALOR UNITÁRIO BRUTO"
				placeholder="Digite o valor unitário bruto do item"
				value={infoHolder.valorUnitarioBruto}
				handleChange={(value) => updateInfoHolder({ valorUnitarioBruto: value })}
			/>
			<div className="w-full flex items-center justify-between px-2 py-1 rounded-lg bg-red-200">
				<div className="flex items-center gap-1.5">
					<Minus className="w-3 h-3 text-red-600" />
					<span className="text-xs text-red-600">DESCONTOS</span>
				</div>
				<Input
					type="number"
					placeholder="Desconto"
					className="w-24 text-xs font-bold border border-red-600 text-red-600"
					value={infoHolder.descontosTotal || ""}
					onChange={(event) => updateInfoHolder({ descontosTotal: Number(event.target.value) || 0 })}
				/>
			</div>
			<div className="w-full flex items-center justify-between px-2 py-1 rounded-lg bg-green-200">
				<div className="flex items-center gap-1.5">
					<Plus className="w-3 h-3 text-green-600" />
					<span className="text-xs text-green-600">ACRÉSCIMOS</span>
				</div>
				<Input
					type="number"
					placeholder="Acréscimo"
					className="w-24 text-xs font-bold border border-green-600 text-green-600"
					value={infoHolder.acrescimosTotal || ""}
					onChange={(event) => updateInfoHolder({ acrescimosTotal: Number(event.target.value) || 0 })}
				/>
			</div>
			<div className="w-full rounded-lg border bg-muted/40 px-3 py-2">
				<div className="flex items-center justify-between gap-4 py-1">
					<span className="text-xs font-medium text-muted-foreground">VALOR TOTAL BRUTO</span>
					<span className="w-36 h-8 text-right text-xs font-semibold bg-secondary px-1.5 py-0.5 rounded-full flex items-center justify-center">
						{formatToMoney(infoHolder.valorTotalBruto || 0)}
					</span>
				</div>
				<div className="flex items-center justify-between gap-4 py-1">
					<span className="text-xs font-medium text-muted-foreground">VALOR TOTAL LÍQUIDO</span>
					<span className="w-36 h-8 text-right text-xs font-semibold bg-secondary px-1.5 py-0.5 rounded-full flex items-center justify-center">
						{formatToMoney(infoHolder.valorTotalLiquido || 0)}
					</span>
				</div>
			</div>
		</ResponsiveMenu>
	);
}

import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import SelectProductWithVariants from "@/components/Inputs/SelectProductWithVariants";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { useProductGroups } from "@/lib/queries/products";
import type { TUseInternalCouponState } from "@/state-hooks/use-internal-coupon-state";
import { CouponTargetOperatorOptions, CouponTargetRoleOptions } from "@/utils/select-options";
import { Package, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

type CouponTargetsBlockProps = {
	coupon: TUseInternalCouponState["state"]["coupon"];
	couponTargets: TUseInternalCouponState["state"]["couponTargets"];
	updateCoupon: TUseInternalCouponState["updateCoupon"];
	addCouponTarget: TUseInternalCouponState["addCouponTarget"];
	updateCouponTarget: TUseInternalCouponState["updateCouponTarget"];
	removeCouponTarget: TUseInternalCouponState["removeCouponTarget"];
	// Quando fornecido, a seção ganha um controle para recolher/remover as condições
	// (usado no builder guiado, onde produtos e condições são opcionais).
	onRemoveConditions?: () => void;
};
export default function CouponTargetsBlock({
	coupon,
	couponTargets,
	updateCoupon,
	addCouponTarget,
	updateCouponTarget,
	removeCouponTarget,
	onRemoveConditions,
}: CouponTargetsBlockProps) {
	return (
		<ResponsiveMenuSection
			title="PRODUTOS E CONDIÇÕES"
			icon={<Package className="h-4 min-h-4 w-4 min-w-4" />}
			action={
				onRemoveConditions ? (
					<Button
						variant="ghost"
						size="sm"
						onClick={onRemoveConditions}
						className="h-7 gap-1.5 px-2 text-xs font-semibold text-muted-foreground hover:text-destructive"
					>
						<X className="h-3.5 w-3.5" />
						<span className="hidden sm:inline">REMOVER</span>
					</Button>
				) : undefined
			}
		>
			<div className="w-full flex flex-col gap-1">
				<p className="text-sm font-medium text-muted-foreground">
					Sem produtos, o cupom vale para qualquer compra. Marque um produto como “ativa o cupom” para exigir que ele esteja no carrinho, ou “ganha o
					desconto” para que o benefício incida só sobre ele.
				</p>
			</div>
			<div className="w-full flex items-center gap-2 flex-col lg:flex-row">
				<div className="w-full lg:w-1/3">
					<NumberInput
						value={coupon.condicaoValorMinimoVenda}
						label="VALOR MÍNIMO DE VENDA (R$)"
						placeholder="Opcional..."
						handleChange={(value) => updateCoupon({ condicaoValorMinimoVenda: value })}
					/>
				</div>
				<div className="w-full lg:w-1/3">
					<NumberInput
						value={coupon.condicaoQuantidadeMinimaItens}
						label="QTDE MÍNIMA DE ITENS"
						placeholder="Opcional..."
						handleChange={(value) => updateCoupon({ condicaoQuantidadeMinimaItens: value })}
					/>
				</div>
				<div className="w-full lg:w-1/3">
					<SelectInput
						value={coupon.condicaoAlvosOperador}
						label="COMO COMBINAR OS PRODUTOS"
						resetOptionLabel="BASTA UM DOS PRODUTOS"
						handleChange={(value) => updateCoupon({ condicaoAlvosOperador: value as TUseInternalCouponState["state"]["coupon"]["condicaoAlvosOperador"] })}
						options={CouponTargetOperatorOptions}
						onReset={() => updateCoupon({ condicaoAlvosOperador: "QUALQUER" })}
					/>
				</div>
			</div>
			<CouponTargetForm addCouponTarget={addCouponTarget} />
			<div className="w-full flex flex-col gap-1.5">
				{couponTargets.map((target, index) =>
					target.deletar ? null : (
						<div
							key={`${target.produtoId ?? target.produtoVarianteId ?? target.grupo}-${index}`}
							className="w-full flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2"
						>
							<div className="flex flex-col">
								<h3 className="text-xs font-bold tracking-tight uppercase">
									{target.grupo ? `GRUPO: ${target.grupo}` : (target.produtoNome ?? "PRODUTO")}
									{target.produtoVarianteNome ? ` — ${target.produtoVarianteNome}` : ""}
								</h3>
								<p className="text-xs text-muted-foreground uppercase">
									{CouponTargetRoleOptions.find((option) => option.value === target.papel)?.label} · QTDE MÍNIMA: {target.quantidadeMinima}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<SelectInput
									value={target.papel}
									label="PAPEL"
									showLabel={false}
									resetOptionLabel="ATIVA O CUPOM"
									handleChange={(value) => updateCouponTarget(index, { papel: value as TUseInternalCouponState["state"]["couponTargets"][number]["papel"] })}
									options={CouponTargetRoleOptions}
									onReset={() => updateCouponTarget(index, { papel: "ELEGIVEL" })}
								/>
								<Button variant="ghost" size="icon" onClick={() => removeCouponTarget(index)}>
									<Trash2 className="w-4 h-4 min-w-4 min-h-4 text-destructive" />
								</Button>
							</div>
						</div>
					),
				)}
			</div>
		</ResponsiveMenuSection>
	);
}

function CouponTargetForm({ addCouponTarget }: { addCouponTarget: TUseInternalCouponState["addCouponTarget"] }) {
	// Cadastro inteiro, não o catálogo do PDV: um cupom pode mirar um grupo que hoje não está na
	// vitrine de nenhum canal.
	const { data: groupsResult } = useProductGroups();
	const groups = groupsResult ?? [];
	const [mode, setMode] = useState<"PRODUTO" | "GRUPO">("PRODUTO");
	const [selectedProduct, setSelectedProduct] = useState<{
		produtoId: string;
		produtoVarianteId: string | null;
		nome: string;
		varianteNome: string | null;
	} | null>(null);
	const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
	const [minQuantity, setMinQuantity] = useState<number>(1);

	function handleAdd() {
		if (mode === "PRODUTO" && selectedProduct) {
			addCouponTarget({
				papel: "ELEGIVEL",
				produtoId: selectedProduct.produtoVarianteId ? null : selectedProduct.produtoId,
				produtoVarianteId: selectedProduct.produtoVarianteId,
				grupo: null,
				quantidadeMinima: minQuantity || 1,
				produtoNome: selectedProduct.nome,
				produtoVarianteNome: selectedProduct.varianteNome,
			});
			setSelectedProduct(null);
		}
		if (mode === "GRUPO" && selectedGroup) {
			addCouponTarget({
				papel: "ELEGIVEL",
				produtoId: null,
				produtoVarianteId: null,
				grupo: selectedGroup,
				quantidadeMinima: minQuantity || 1,
			});
			setSelectedGroup(null);
		}
		setMinQuantity(1);
	}

	return (
		<div className="w-full flex flex-col gap-2 rounded-xl border border-border bg-card/50 px-3 py-2">
			<div className="w-full flex items-center gap-2">
				<Button variant={mode === "PRODUTO" ? "default" : "ghost"} size="sm" onClick={() => setMode("PRODUTO")}>
					POR PRODUTO
				</Button>
				<Button variant={mode === "GRUPO" ? "default" : "ghost"} size="sm" onClick={() => setMode("GRUPO")}>
					POR GRUPO
				</Button>
			</div>
			<div className="w-full flex items-end gap-2 flex-col lg:flex-row">
				<div className="w-full lg:w-1/2">
					{mode === "PRODUTO" ? (
						<SelectProductWithVariants
							label="PRODUTO"
							resetOptionLabel="NENHUM"
							value={selectedProduct ? { productId: selectedProduct.produtoId, productVariantId: selectedProduct.produtoVarianteId } : null}
							handleChange={(value) => {
								if (!value) return setSelectedProduct(null);
								setSelectedProduct({
									produtoId: value.product.id,
									produtoVarianteId: value.productVariant?.id ?? null,
									nome: value.product.nome,
									varianteNome: value.productVariant?.nome ?? null,
								});
							}}
							onReset={() => setSelectedProduct(null)}
						/>
					) : (
						<SelectInput
							value={selectedGroup}
							label="GRUPO DE PRODUTOS"
							resetOptionLabel="NENHUM"
							handleChange={(value) => setSelectedGroup(value)}
							options={groups.map((group, index) => ({ id: index, value: group, label: group }))}
							onReset={() => setSelectedGroup(null)}
						/>
					)}
				</div>
				<div className="w-full lg:w-1/4">
					<NumberInput value={minQuantity} label="QTDE MÍNIMA" placeholder="1" handleChange={(value) => setMinQuantity(value)} />
				</div>
				<Button
					className="flex items-center gap-2 w-full lg:w-1/4"
					size="sm"
					onClick={handleAdd}
					disabled={mode === "PRODUTO" ? !selectedProduct : !selectedGroup}
				>
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					ADICIONAR PRODUTO
				</Button>
			</div>
		</div>
	);
}

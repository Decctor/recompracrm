"use client";

import SelectInput from "@/components/Inputs/SelectInput";
import SelectProductWithVariants from "@/components/Inputs/SelectProductWithVariants";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { FIXED_ASSET_STATUS_LABELS, type TFixedAssetStatusEnum } from "@/schemas/enums";
import type { TUseInternalFixedAssetState } from "@/state-hooks/use-internal-fixed-asset-state";
import { Landmark } from "lucide-react";

const STATUS_OPTIONS = (["EM_USO", "EM_MANUTENCAO"] as const satisfies readonly TFixedAssetStatusEnum[]).map((status, index) => ({
	id: index + 1,
	value: status,
	label: FIXED_ASSET_STATUS_LABELS[status].toUpperCase(),
}));

type FixedAssetGeneralBlockProps = {
	asset: TUseInternalFixedAssetState["state"]["asset"];
	updateAsset: TUseInternalFixedAssetState["updateAsset"];
	/** Bem nascido de uma compra: o produto é o da compra e não muda aqui. */
	productEditable?: boolean;
	editable?: boolean;
};

export default function FixedAssetGeneralBlock({ asset, updateAsset, productEditable = true, editable = true }: FixedAssetGeneralBlockProps) {
	return (
		<ResponsiveMenuSection title="IDENTIFICAÇÃO" icon={<Landmark className="h-4 w-4" />}>
			{productEditable ? (
				<SelectProductWithVariants
					label="PRODUTO (CATÁLOGO)"
					value={asset.produtoId ? { productId: asset.produtoId, productVariantId: asset.produtoVarianteId ?? null } : null}
					selectedLabel={asset.produtoNome ?? undefined}
					editable={editable}
					resetOptionLabel="Sem produto do catálogo"
					handleChange={(selected) => {
						if (!selected) return;
						updateAsset({
							produtoId: selected.product.id,
							produtoVarianteId: selected.productVariant?.id ?? null,
							produtoNome: selected.product.nome,
							descricao: asset.descricao || selected.product.nome,
						});
					}}
					onReset={() => updateAsset({ produtoId: null, produtoVarianteId: null, produtoNome: null })}
				/>
			) : asset.produtoNome ? (
				<p className="text-xs text-muted-foreground">
					Produto: <span className="font-medium text-foreground">{asset.produtoNome}</span>
				</p>
			) : null}
			<TextInput
				label="DESCRIÇÃO"
				placeholder="Ex.: Cadeira giratória preta..."
				value={asset.descricao}
				handleChange={(value) => updateAsset({ descricao: value })}
				required
				editable={editable}
			/>
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				<TextInput
					label="CÓDIGO DE PATRIMÔNIO (PLAQUETA)"
					placeholder="Ex.: PAT-0001"
					value={asset.codigoPatrimonio ?? ""}
					handleChange={(value) => updateAsset({ codigoPatrimonio: value || null })}
					editable={editable}
				/>
				<TextInput
					label="NÚMERO DE SÉRIE"
					placeholder="Quando o bem tem um"
					value={asset.numeroSerie ?? ""}
					handleChange={(value) => updateAsset({ numeroSerie: value || null })}
					editable={editable}
				/>
				<TextInput
					label="LOCALIZAÇÃO"
					placeholder="Ex.: Loja centro, cozinha"
					value={asset.localizacao ?? ""}
					handleChange={(value) => updateAsset({ localizacao: value || null })}
					editable={editable}
				/>
				<SelectInput
					label="SITUAÇÃO"
					value={asset.status}
					options={STATUS_OPTIONS}
					resetOptionLabel="Em uso"
					editable={editable}
					handleChange={(value) => updateAsset({ status: value as TFixedAssetStatusEnum })}
					onReset={() => updateAsset({ status: "EM_USO" })}
				/>
			</div>
			<TextareaInput
				label="ANOTAÇÕES"
				placeholder="Observações sobre o bem..."
				value={asset.anotacoes ?? ""}
				handleChange={(value) => updateAsset({ anotacoes: value || null })}
				editable={editable}
			/>
		</ResponsiveMenuSection>
	);
}

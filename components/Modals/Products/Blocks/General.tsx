import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import SelectProductGroup from "@/components/Inputs/SelectProductGroup";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import { ProductActiveToggle, ProductInactiveHint } from "@/components/Products/Shared/ProductActiveStatus";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { normalizeGtin } from "@/lib/products/gtin";
import type { TProductContentUnitEnum } from "@/schemas/enums";
import type { TProductCoreState, TUseProductCoreState } from "@/state-hooks/use-product-state";
import { ProductContentUnitOptions, UnitsOfMeasurementOptions } from "@/utils/select-options";
import { ImageIcon, LayoutGrid } from "lucide-react";
import Image from "next/image";
import { useId } from "react";

type ProductStateGeneralBlockProps = {
	product: TProductCoreState;
	updateProduct: TUseProductCoreState["updateProduct"];
	updateProductImageHolder: TUseProductCoreState["updateProductImageHolder"];
	showPricing?: boolean;
	embedded?: boolean;
};

export default function ProductStateGeneralBlock({
	product,
	updateProduct,
	updateProductImageHolder,
	showPricing = true,
	embedded = false,
}: ProductStateGeneralBlockProps) {
	const imageInputId = useId();
	const formContent = (
		<div className="w-full flex items-center flex-col  gap-2">
			<ProductGeneralBlockImage
				imageUrl={product.imagemCapaUrl}
				imageHolder={product.imagemCapaHolder}
				updateImageHolder={updateProductImageHolder}
				inputId={imageInputId}
			/>
			<div className="h-full w-full lg:grow flex flex-col items-center gap-2">
				<div className="w-full flex flex-col items-center gap-2 pb-1">
					<ProductActiveToggle ativo={product.ativo} onChange={(ativo) => updateProduct({ ativo })} />
					{product.ativo ? null : <ProductInactiveHint />}
				</div>
				<TextInput
					label="NOME"
					value={product.nome}
					placeholder="Preencha aqui o nome do produto."
					handleChange={(value) => updateProduct({ nome: value })}
				/>
				<TextareaInput
					label="DESCRIÇÃO"
					value={product.descricao ?? ""}
					placeholder="Texto exibido no cardápio ou na loja (opcional)."
					handleChange={(value) => updateProduct({ descricao: value.trim() ? value : null })}
				/>
				<div className="w-full flex items-center gap-2 lg:flex-row">
					<div className="w-full lg:w-1/2">
						<TextInput
							label="CÓDIGO"
							value={product.codigo}
							placeholder="Preencha aqui o código do produto."
							handleChange={(value) => updateProduct({ codigo: value })}
						/>
					</div>
					<div className="w-full lg:w-1/2">
						<SelectInput
							label="UNIDADE"
							value={product.unidade}
							resetOptionLabel="SELECIONE A UNIDADE"
							handleChange={(value) => updateProduct({ unidade: value })}
							options={UnitsOfMeasurementOptions}
							onReset={() => updateProduct({ unidade: "UN" })}
						/>
					</div>
				</div>
				<div className="w-full flex flex-col gap-1">
					<TextInput
						label="CÓDIGO DE BARRAS (EAN/GTIN)"
						value={product.codigoBarras ?? ""}
						placeholder="Ex.: 7891234567895"
						handleChange={(value) => updateProduct({ codigoBarras: value.trim() ? value : null })}
					/>
					{product.codigoBarras && !normalizeGtin(product.codigoBarras) ? (
						<p className="text-[0.6rem] text-destructive tracking-tight">Código inválido: use 8, 12, 13 ou 14 dígitos, com o dígito verificador correto.</p>
					) : null}
				</div>
				<div className="w-full flex items-center gap-2 lg:flex-row">
					<div className="w-full lg:w-1/2">
						<NumberInput
							label="CONTEÚDO DA EMBALAGEM"
							value={product.conteudoQuantidade ?? null}
							placeholder="Ex.: 200"
							handleChange={(value) => updateProduct({ conteudoQuantidade: value > 0 ? value : null })}
						/>
					</div>
					<div className="w-full lg:w-1/2">
						<SelectInput
							label="UNIDADE DO CONTEÚDO"
							value={product.conteudoUnidade ?? null}
							resetOptionLabel="SEM CONTEÚDO"
							handleChange={(value) => updateProduct({ conteudoUnidade: value as TProductContentUnitEnum })}
							options={ProductContentUnitOptions}
							onReset={() => updateProduct({ conteudoUnidade: null })}
						/>
					</div>
				</div>
				<SelectProductGroup value={product.grupo} handleChange={(grupo) => updateProduct({ grupo })} />
				<div className="w-full flex flex-col items-center gap-1">
					<CheckboxInput
						checked={product.vendavel}
						labelTrue="PRODUTO VENDÁVEL"
						labelFalse="PRODUTO VENDÁVEL"
						handleChange={(value) => updateProduct({ vendavel: value })}
					/>
					{product.vendavel ? null : (
						<p className="text-center text-[0.6rem] text-primary/60 tracking-tight">
							Matéria-prima ou item interno: não aparece no PDV, na loja digital nem nas comandas.
						</p>
					)}
				</div>

				{showPricing ? (
					<div className="w-full flex items-center gap-2 lg:flex-row">
						<div className="w-full lg:w-1/2">
							<NumberInput
								label="PREÇO DE CUSTO"
								value={product.precoCusto ?? null}
								placeholder="Preencha aqui o preço de custo do produto."
								handleChange={(value) => updateProduct({ precoCusto: value })}
							/>
						</div>
						<div className="w-full lg:w-1/2">
							<NumberInput
								label="PREÇO DE VENDA"
								value={product.precoVenda ?? null}
								placeholder="Preencha aqui o preço de venda do produto."
								handleChange={(value) => updateProduct({ precoVenda: value })}
							/>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);

	if (embedded) return formContent;

	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="h-4 min-h-4 w-4 min-w-4" />}>
			{formContent}
		</ResponsiveMenuSection>
	);
}

function ProductGeneralBlockImage({
	imageUrl,
	imageHolder,
	updateImageHolder,
	inputId,
}: {
	imageUrl: TProductCoreState["imagemCapaUrl"];
	imageHolder: TProductCoreState["imagemCapaHolder"];
	updateImageHolder: TUseProductCoreState["updateProductImageHolder"];
	inputId: string;
}) {
	return (
		<div className="flex items-center justify-center min-h-[250px] min-w-[250px]">
			<label className="relative aspect-square w-full max-w-[250px] cursor-pointer overflow-hidden rounded-lg" htmlFor={inputId}>
				<UsersGeneralBlockAvatarPreview imageHolder={imageHolder} imageUrl={imageUrl} />
				<input
					accept=".png,.jpeg,.jpg"
					className="absolute h-full w-full cursor-pointer opacity-0"
					id={inputId}
					multiple={false}
					onChange={(e) => {
						const file = e.target.files?.[0] ?? null;
						updateImageHolder({
							file,
							previewUrl: file ? URL.createObjectURL(file) : null,
						});
					}}
					tabIndex={-1}
					type="file"
				/>
			</label>
		</div>
	);
}

function UsersGeneralBlockAvatarPreview({
	imageUrl,
	imageHolder,
}: {
	imageUrl: TProductCoreState["imagemCapaUrl"];
	imageHolder: TProductCoreState["imagemCapaHolder"];
}) {
	if (imageHolder.previewUrl) {
		return <Image alt="Capa do produto." fill={true} objectFit="cover" src={imageHolder.previewUrl} />;
	}
	if (imageUrl) {
		return <Image alt="Capa do produto." fill={true} objectFit="cover" src={imageUrl} />;
	}

	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-primary/20">
			<ImageIcon className="h-6 w-6" />
			<p className="text-center font-medium text-xs">DEFINIR CAPA</p>
		</div>
	);
}

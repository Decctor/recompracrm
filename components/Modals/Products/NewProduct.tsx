import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/files-storage";
import { createProduct } from "@/lib/mutations/products";
import type { TCreateProductInput } from "@/app/api/products/route";
import { type TProductState, useProductState } from "@/state-hooks/use-product-state";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import ProductAddOnsBlock from "./Blocks/AddOns";
import ProductGeneralBlock from "./Blocks/General";
import ProductStateOptionsBlock from "./Blocks/Options";
import ProductVariantsBlock from "./Blocks/Variants";
import ProductStockBlock from "./Blocks/Stock";
import ProductFiscalBlock from "./Blocks/Fiscal";

type NewProductProps = {
	user: TAuthUserSession["user"];
	userMembership: NonNullable<TAuthUserSession["membership"]>;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};
export default function NewProduct({ user, userMembership, closeModal, callbacks }: NewProductProps) {
	const userHasFiscalViewPermission = userMembership.permissoes.fiscal.visualizar;
	const userHasFiscalConfigurePermission = userMembership.permissoes.fiscal.configurar;
	const {
		state,
		updateProduct,
		updateProductImageHolder,
		addProductVariant,
		updateProductVariant,
		updateProductVariantImageHolder,
		removeProductVariant,
		addProductOption,
		updateProductOption,
		removeProductOption,
		addProductOptionValue,
		updateProductOptionValue,
		removeProductOptionValue,
		generateVariantMatrix,
		removeVariantFiscalProfile,
		addVariantFiscalProfile,
		updateVariantFiscalProfile,
		addProductAddOn,
		updateProductAddOn,
		removeProductAddOn,
		moveProductAddOn,
		addProductAddOnOption,
		updateProductAddOnOption,
		removeProductAddOnOption,
		addProductFiscalProfile,
		updateProductFiscalProfile,
		removeProductFiscalProfile,
		resetState,
	} = useProductState({});

	async function handleCreateProduct(state: TProductState) {
		// 1. Upload product cover image if exists
		let productImageUrl = state.product.imagemCapaUrl;
		if (state.product.imagemCapaHolder.file) {
			const { url } = await uploadFile({
				file: state.product.imagemCapaHolder.file,
				fileName: state.product.nome || "produto",
				prefix: "syncrono",
			});
			productImageUrl = url;
		}

		// 2. Process variants and upload their images
		const processedVariants: TCreateProductInput["productVariants"] = [];
		for (const variant of state.productVariants) {
			// Skip variants marked for deletion
			if (variant.deletar) continue;

			let variantImageUrl = variant.imagemCapaUrl;
			if (variant.imagemCapaHolder.file) {
				const { url } = await uploadFile({
					file: variant.imagemCapaHolder.file,
					fileName: variant.nome || "variante",
					prefix: "syncrono",
				});
				variantImageUrl = url;
			}

			// Process variant addOns (filter out deleted ones)
			const processedVariantAddOns = variant.addOns
				.filter((addOn) => !addOn.deletar)
				.map((addOn) => ({
					...addOn,
					opcoes: addOn.opcoes.filter((opt) => !opt.deletar),
				}));

			processedVariants.push({
				nome: variant.nome,
				codigo: variant.codigo,
				imagemCapaUrl: variantImageUrl,
				precoVenda: variant.precoVenda,
				precoCusto: variant.precoCusto,
				quantidade: variant.quantidade,
				rastreamentoEstoqueAtivo: variant.rastreamentoEstoqueAtivo,
				ativo: variant.ativo,
				addOns: processedVariantAddOns,
				perfisFiscais: [],
				opcoesValores: (variant.opcoesValores ?? [])
					.filter((ref) => !ref.deletar)
					.map((ref) => ({ opcaoReferenciaId: ref.opcaoReferenciaId, valorReferenciaId: ref.valorReferenciaId })),
			});
		}

		// Process variant option axes and their values (filter out deleted ones).
		const processedOptions: TCreateProductInput["productOptions"] = state.productOptions
			.filter((option) => !option.deletar)
			.map((option) => ({
				referenciaId: option.referenciaId,
				nome: option.nome,
				tipo: option.tipo,
				ordem: option.ordem,
				valores: option.valores
					.filter((value) => !value.deletar)
					.map((value) => ({
						referenciaId: value.referenciaId,
						nome: value.nome,
						valorAuxiliar: value.valorAuxiliar ?? null,
						imagemCapaUrl: value.imagemCapaUrl ?? null,
						ordem: value.ordem,
					})),
			}));

		// 3. Process product addOns (filter out deleted ones)
		const processedAddOns: TCreateProductInput["productAddOns"] = state.productAddOns
			.filter((addOn) => !addOn.deletar)
			.map((addOn) => ({
				...addOn,
				opcoes: addOn.opcoes.filter((opt) => !opt.deletar),
			}));

		// 4. Build the input for the API
		const input: TCreateProductInput = {
			product: {
				vendavel: state.product.vendavel,
				nome: state.product.nome,
				descricao: state.product.descricao,
				codigo: state.product.codigo,
				unidade: state.product.unidade,
				ncm: state.product.ncm,
				tipo: state.product.tipo,
				grupo: state.product.grupo,
				imagemCapaUrl: productImageUrl,
				precoVenda: state.product.precoVenda,
				precoCusto: state.product.precoCusto,
				rastreamentoEstoqueAtivo: state.product.rastreamentoEstoqueAtivo,
			},
			productVariants: processedVariants,
			productOptions: processedOptions,
			productAddOns: processedAddOns,
			productFiscalProfiles: [],
		};

		return await createProduct(input);
	}

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-product"],
		mutationFn: handleCreateProduct,
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate();
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			resetState({
				product: {
					vendavel: true,
					codigo: "",
					nome: "",
					descricao: null,
					unidade: "",
					ncm: "",
					tipo: "",
					grupo: "",
					rastreamentoEstoqueAtivo: false,
					imagemCapaHolder: { file: null, previewUrl: null },
				},
				productVariants: [],
				productOptions: [],
				productAddOns: [],
				productFiscalProfiles: [],
			});
			toast.success(data.message);
			return closeModal();
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError();
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVO PRODUTO"
			menuDescription="Preencha os campos abaixo para criar um novo produto"
			menuActionButtonText="CRIAR PRODUTO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate(state)}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
		>
			<ProductGeneralBlock product={state.product} updateProduct={updateProduct} updateProductImageHolder={updateProductImageHolder} />
			<ProductStockBlock product={state.product} updateProduct={updateProduct} />
			<ProductStateOptionsBlock
				options={state.productOptions}
				variants={state.productVariants}
				addProductOption={addProductOption}
				updateProductOption={updateProductOption}
				removeProductOption={removeProductOption}
				addProductOptionValue={addProductOptionValue}
				updateProductOptionValue={updateProductOptionValue}
				removeProductOptionValue={removeProductOptionValue}
				generateVariantMatrix={generateVariantMatrix}
				baseDefaults={{ precoVenda: state.product.precoVenda, precoCusto: state.product.precoCusto }}
			/>
			<ProductVariantsBlock
				variants={state.productVariants}
				options={state.productOptions}
				addVariant={addProductVariant}
				updateVariant={updateProductVariant}
				removeVariant={removeProductVariant}
				updateVariantImageHolder={updateProductVariantImageHolder}
			/>
			<ProductAddOnsBlock
				addOns={state.productAddOns}
				addProductAddOn={addProductAddOn}
				updateProductAddOn={updateProductAddOn}
				removeProductAddOn={removeProductAddOn}
				addProductAddOnOption={addProductAddOnOption}
				updateProductAddOnOption={updateProductAddOnOption}
				removeProductAddOnOption={removeProductAddOnOption}
				{...{ moveProductAddOn }}
			/>
			<ProductFiscalBlock
				userHasFiscalViewPermission={userHasFiscalViewPermission}
				userHasFiscalConfigurePermission={userHasFiscalConfigurePermission}
				productFiscalProfiles={state.productFiscalProfiles}
				addProductFiscalProfile={addProductFiscalProfile}
				updateProductFiscalProfile={updateProductFiscalProfile}
				removeProductFiscalProfile={removeProductFiscalProfile}
			/>
		</ResponsiveMenu>
	);
}

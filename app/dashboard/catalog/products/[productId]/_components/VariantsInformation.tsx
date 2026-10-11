import { TGetProductsOutputById } from "@/app/api/products/route";
import ProductStateOptionsBlock from "@/components/Modals/Products/Blocks/Options";
import ProductStateVariantsBlock from "@/components/Modals/Products/Blocks/Variants";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Section } from "@/components/ui/section";
import { useProductVariationsSectionEditor } from "@/state-hooks/use-product-section-editor";
import { GitBranch } from "lucide-react";

type ProductVariantsInformationProps = {
	product: TGetProductsOutputById;
	sectionWrapperClassName?: string;
	callbacks: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function ProductVariantsInformation({ product, sectionWrapperClassName, callbacks }: ProductVariantsInformationProps) {
	const editor = useProductVariationsSectionEditor({ product, callbacks });

	return (
		<Section.Root className={sectionWrapperClassName}>
			<Section.Header>
				<Section.Icon>
					<GitBranch className="h-4 w-4 min-h-4 min-w-4" />
				</Section.Icon>
				<Section.Title>VARIANTES</Section.Title>
			</Section.Header>
			<Section.Body>
				<ProductStateOptionsBlock
					embedded
					options={editor.state.productOptions}
					variants={editor.state.productVariants}
					addProductOption={editor.addProductOption}
					updateProductOption={editor.updateProductOption}
					removeProductOption={editor.removeProductOption}
					addProductOptionValue={editor.addProductOptionValue}
					updateProductOptionValue={editor.updateProductOptionValue}
					removeProductOptionValue={editor.removeProductOptionValue}
					generateVariantMatrix={editor.generateVariantMatrix}
					baseDefaults={{ precoVenda: product.precoVenda, precoCusto: product.precoCusto }}
				/>
				<ProductStateVariantsBlock
					embedded
					productId={product.id}
					variants={editor.state.productVariants}
					options={editor.state.productOptions}
					addVariant={editor.addProductVariant}
					updateVariant={editor.updateProductVariant}
					updateVariantImageHolder={editor.updateProductVariantImageHolder}
					removeVariant={editor.removeProductVariant}
				/>
				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />
			</Section.Body>
		</Section.Root>
	);
}

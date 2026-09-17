import { TGetProductsOutputById } from "@/app/api/products/route";
import LinkProductAddOn from "@/components/Modals/Products/AddOns/LinkProductAddOn";
import ProductStateAddOnsBlock from "@/components/Modals/Products/Blocks/AddOns";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { useProductAddOns } from "@/lib/queries/products";
import { useProductAddOnsSectionEditor } from "@/state-hooks/use-product-section-editor";
import { Layers, LinkIcon } from "lucide-react";
import { useMemo, useState } from "react";

type ProductAddOnsInformationProps = {
	product: TGetProductsOutputById;
	sectionWrapperClassName?: string;
	callbacks: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function ProductAddOnsInformation({ product, sectionWrapperClassName, callbacks }: ProductAddOnsInformationProps) {
	const editor = useProductAddOnsSectionEditor({ product, callbacks });
	const [linkAddOnModalIsOpen, setLinkAddOnModalIsOpen] = useState(false);

	const { data: registryAddOns } = useProductAddOns();
	const usageByAddOnId = useMemo(() => {
		if (!registryAddOns) return {};
		return Object.fromEntries(registryAddOns.map((addOn) => [addOn.id, addOn.produtos.length]));
	}, [registryAddOns]);

	const linkedAddOnIds = editor.state.productAddOns.filter((addOn) => !addOn.deletar && addOn.id).map((addOn) => addOn.id as string);

	return (
		<Section.Root className={sectionWrapperClassName}>
			<Section.Header>
				<Section.Icon>
					<Layers className="h-4 w-4 min-h-4 min-w-4" />
				</Section.Icon>
				<Section.Title>ADICIONAIS</Section.Title>
				<Section.Actions>
					<Button type="button" variant="outline" size="sm" className="flex items-center gap-1.5" onClick={() => setLinkAddOnModalIsOpen(true)}>
						<LinkIcon className="h-3.5 w-3.5" />
						VINCULAR EXISTENTE
					</Button>
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				<ProductStateAddOnsBlock
					embedded
					addOns={editor.state.productAddOns}
					usageByAddOnId={usageByAddOnId}
					addProductAddOn={editor.addProductAddOn}
					updateProductAddOn={editor.updateProductAddOn}
					removeProductAddOn={editor.removeProductAddOn}
					moveProductAddOn={editor.moveProductAddOn}
					addProductAddOnOption={editor.addProductAddOnOption}
					updateProductAddOnOption={editor.updateProductAddOnOption}
					removeProductAddOnOption={editor.removeProductAddOnOption}
				/>
				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />
				{linkAddOnModalIsOpen ? (
					<LinkProductAddOn
						productId={product.id}
						linkedAddOnIds={linkedAddOnIds}
						closeModal={() => setLinkAddOnModalIsOpen(false)}
						callbacks={callbacks}
					/>
				) : null}
			</Section.Body>
		</Section.Root>
	);
}

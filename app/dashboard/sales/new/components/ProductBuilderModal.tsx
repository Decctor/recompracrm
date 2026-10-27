import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import { ProductBuilderForm, type TBuilderStockContext, useProductBuilder } from "@/components/Products/ProductBuilderForm";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { cn } from "@/lib/utils";
import type { TCartItem } from "@/state-hooks/use-sale-state";
import { toast } from "sonner";

type ProductBuilderModalProps = {
	product: TGetPOSProductsOutput["data"]["products"][number];
	/** Variante pré-selecionada (leitura do código de barras da variante). */
	initialVariantId?: string | null;
	/** Saldo e reserva do carrinho: variante sem estoque não seleciona e a quantidade para no saldo. */
	stock?: TBuilderStockContext | null;
	onAddToCart: (item: TCartItem) => void;
	onClose: () => void;
	showImage?: boolean;
};

export default function ProductBuilderModal({
	product,
	initialVariantId = null,
	stock = null,
	onAddToCart,
	onClose,
	showImage = false,
}: ProductBuilderModalProps) {
	const builder = useProductBuilder({ product, initialVariantId, stock });

	const handleAddToCart = () => {
		const item = builder.buildItem();
		if (!item) {
			if (builder.blockReason) toast.error(builder.blockReason);
			return;
		}
		onAddToCart({ ...item, tempId: crypto.randomUUID() });
		onClose();
	};

	return (
		<ResponsiveMenu
			menuTitle={product.nome}
			menuDescription="Configure o produto para adicionar ao carrinho."
			drawerVariant="lg"
			menuActionButtonText="ADICIONAR AO CARRINHO"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleAddToCart}
			closeMenu={onClose}
			actionIsLoading={false}
			stateIsLoading={false}
			stateError={null}
			menuActionButtonClassName={cn(!builder.canConfirm && "opacity-50")}
		>
			<ProductBuilderForm product={product} builder={builder} showImage={showImage} />
		</ResponsiveMenu>
	);
}

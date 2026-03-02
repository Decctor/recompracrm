import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { getErrorMessage } from "@/lib/errors";
import type { TGetPOSProductsOutput } from "@/pages/api/pos/products";
import ProductCard from "../ProductCard";

type ProductsGridBlockProps = {
	productsData: TGetPOSProductsOutput["data"] | undefined;
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	onProductClick: (product: TGetPOSProductsOutput["data"]["products"][number]) => void;
};

export default function ProductsGridBlock({ productsData, isLoading, isError, error, onProductClick }: ProductsGridBlockProps) {
	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;

	if (productsData && productsData.products.length > 0) {
		return (
			<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
				{productsData.products.map((product) => (
					<ProductCard key={product.id} product={product} onClick={() => onProductClick(product)} />
				))}
			</div>
		);
	}

	return (
		<div className="w-full h-full flex items-center justify-center rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
			Nenhum produto encontrado para os filtros atuais.
		</div>
	);
}

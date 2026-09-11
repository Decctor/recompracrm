import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { getErrorMessage } from "@/lib/errors";
import type { TGetPOSProductsOutput } from "@/app/api/pos/products/route";
import { memo } from "react";
import ProductCard from "../ProductCard";
import ProductListRow from "../ProductListRow";
import type { ProductViewMode } from "./ViewModeToggle";

type Product = TGetPOSProductsOutput["data"]["products"][number];

type ProductsGridBlockProps = {
	productsData: TGetPOSProductsOutput["data"] | undefined;
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	viewMode: ProductViewMode;
	/** `preferencias.rastreamentoEstoque` da organização — sem o módulo, nenhum saldo é exibido. */
	orgTracksStock: boolean;
	onProductClick: (product: Product) => void;
};

function ProductsGridBlock({ productsData, isLoading, isError, error, viewMode, orgTracksStock, onProductClick }: ProductsGridBlockProps) {
	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;

	if (productsData && productsData.products.length > 0) {
		if (viewMode === "list") {
			return (
				<div className="flex flex-col gap-2 pb-4">
					{productsData.products.map((product) => (
						<ProductListRow key={product.id} product={product} orgTracksStock={orgTracksStock} onSelect={onProductClick} />
					))}
				</div>
			);
		}

		return (
			<div className="grid grid-cols-2 gap-2.5 pb-4 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,10.5rem))] sm:justify-start">
				{productsData.products.map((product) => (
					<ProductCard key={product.id} product={product} orgTracksStock={orgTracksStock} onSelect={onProductClick} />
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

export default memo(ProductsGridBlock);

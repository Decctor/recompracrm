import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { useProductsBySearch } from "@/lib/queries/products";
import { cn } from "@/lib/utils";
import type { TGetProductsBySearchOutput } from "@/app/api/products/search/route";
import { Code, Diamond, LinkIcon } from "lucide-react";

type ProductVinculationProps = {
	handleSelection: (product: TGetProductsBySearchOutput["data"]["products"][number], variant?: { id: string; nome: string }) => void;
	closeModal: () => void;
};
export default function ProductVinculation({ handleSelection, closeModal }: ProductVinculationProps) {
	const {
		data: productsResult,
		isLoading,
		isError,
		isSuccess,
		error,
		queryKey,
		params,
		updateParams,
	} = useProductsBySearch({
		initialParams: { search: "", page: 1 },
	});

	const products = productsResult?.products;
	const productsShowing = products ? products.length : 0;
	const productsMatched = productsResult?.productsMatched || 0;
	const totalPages = productsResult?.totalPages;
	return (
		<ResponsiveMenu.Root
			open
			onOpenChange={(open) => {
				if (!open) closeModal();
			}}
		>
			<ResponsiveMenu.Content dialogClassName="h-[60%] min-h-[60%] w-[40%] min-w-[40%] max-w-[40%]" drawerClassName="max-h-[70dvh]">
				<ResponsiveMenu.Header>
					<ResponsiveMenu.Title>VINCULAÇÃO DE PRODUTO</ResponsiveMenu.Title>
					<ResponsiveMenu.Description>Selecione o produto para vincular</ResponsiveMenu.Description>
				</ResponsiveMenu.Header>
				<ResponsiveMenu.Body>
					{isLoading ? (
						<LoadingComponent />
					) : (error ? getErrorMessage(error) : undefined) ? (
						<ErrorComponent msg={error ? getErrorMessage(error) : undefined} />
					) : (
						<>
							<Input
								value={params.search ?? ""}
								placeholder="Pesquisar produto..."
								onChange={(e) => updateParams({ search: e.target.value })}
								className="grow rounded-xl"
							/>
							<div className="h-1 bg-primary/20 w-full" />
							{isLoading ? <p className="w-full flex items-center justify-center animate-pulse"> Carregando produtos...</p> : null}
							{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
							{isSuccess ? (
								<div className="w-full flex flex-col gap-1.5">
									<GeneralPaginationComponent
										activePage={params.page}
										queryLoading={isLoading}
										selectPage={(page) => updateParams({ page })}
										totalPages={totalPages || 0}
										itemsMatchedText={productsMatched === 1 ? "1 produto encontrado" : `${productsMatched} produtos encontrados`}
										itemsShowingText={`mostrando ${productsShowing}`}
									/>
									{products ? (
										products.length > 0 ? (
											products.map((product) => (
												<ProductVinculationProductCard key={product.id} product={product} handleClick={(variantId) => handleSelection(product, variantId)} />
											))
										) : (
											<p className="w-full text-center text-sm italic text-foreground">Sem opções disponíveis.</p>
										)
									) : null}
								</div>
							) : null}
						</>
					)}
				</ResponsiveMenu.Body>
				<ResponsiveMenu.Footer>
					<ResponsiveMenu.Close variant="outline">CANCELAR</ResponsiveMenu.Close>
				</ResponsiveMenu.Footer>
			</ResponsiveMenu.Content>
		</ResponsiveMenu.Root>
	);
}

function ProductVinculationProductCard({
	product,
	handleClick,
}: {
	product: TGetProductsBySearchOutput["data"]["products"][number];
	handleClick: (variant?: { id: string; nome: string }) => void;
}) {
	const variants = product.variantes || [];
	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs")}>
			<div className="w-full flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 flex-wrap">
					<h1 className="text-xs font-bold tracking-tight lg:text-sm">{product.nome}</h1>
					<div className="flex items-center gap-1">
						<Code className="w-4 h-4 min-w-4 min-h-4" />
						<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic text-foreground/80">{product.codigo}</h1>
					</div>
					{product.grupo ? (
						<div className="flex items-center gap-1">
							<Diamond className="w-4 h-4 min-w-4 min-h-4" />
							<h1 className="py-0.5 text-center text-[0.65rem] font-medium italic text-foreground/80">{product.grupo}</h1>
						</div>
					) : null}
				</div>
			</div>
			{variants.length > 0 ? (
				<div className="flex flex-col gap-1 pl-4 mt-2 border-l-2 border-border">
					{variants.map((variant) => (
						<div key={variant.id} className="flex items-center justify-between gap-2 py-1">
							<div className="flex flex-col">
								<h2 className="text-xs font-medium text-muted-foreground">{variant.nome}</h2>
								<p className="text-[0.65rem] text-muted-foreground/70">{variant.codigo}</p>
							</div>
							<Button
								variant="ghost"
								className="flex items-center gap-1 h-6 px-2 text-[0.65rem]"
								size="sm"
								onClick={() => handleClick({ id: variant.id, nome: variant.nome })}
							>
								<LinkIcon className="w-2.5 min-w-2.5 h-2.5 min-h-2.5" />
								VINCULAR VARIANTE
							</Button>
						</div>
					))}
				</div>
			) : null}
			<div className="w-full flex items-center justify-end mt-2">
				<div className="flex items-center gap-3">
					<Button variant="ghost" className="flex items-center gap-1.5" size="sm" onClick={() => handleClick()}>
						<LinkIcon className="w-3 min-w-3 h-3 min-h-3" />
						VINCULAR PRODUTO
					</Button>
				</div>
			</div>
		</div>
	);
}

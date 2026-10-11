import ProductSearchInput from "@/components/Inputs/ProductSearchInput";

type SearchBlockProps = {
	searchValue: string[];
	onSearchChange: (value: string[], immediate?: boolean) => void;
	isLoading?: boolean;
};
export default function SearchBlock({ searchValue, onSearchChange, isLoading }: SearchBlockProps) {
	// 44px no celular (spec de inputs do DESIGN.md §5); a altura fica aqui para não mudar o primitive
	// nos outros lugares que o usam.
	return (
		<ProductSearchInput value={searchValue} onChange={onSearchChange} isLoading={isLoading} className="max-sm:[&_[data-slot=input-group]]:h-11" />
	);
}

import ProductSearchInput from "@/components/Inputs/ProductSearchInput";

type SearchBlockProps = {
	searchValue: string[];
	onSearchChange: (value: string[], immediate?: boolean) => void;
	isLoading?: boolean;
};
export default function SearchBlock({ searchValue, onSearchChange, isLoading }: SearchBlockProps) {
	return <ProductSearchInput value={searchValue} onChange={onSearchChange} isLoading={isLoading} />;
}

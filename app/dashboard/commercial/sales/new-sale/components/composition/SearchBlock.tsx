import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type SearchBlockProps = {
	searchValue: string;
	onSearchChange: (value: string) => void;
	isLoading?: boolean;
};

export default function SearchBlock({ searchValue, onSearchChange, isLoading }: SearchBlockProps) {
	return (
		<div className="relative">
			<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
			<Input
				value={searchValue}
				onChange={(event) => onSearchChange(event.target.value)}
				placeholder="Buscar produto..."
				className="pl-10 h-12 rounded-xl"
				disabled={isLoading}
			/>
		</div>
	);
}

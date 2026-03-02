import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationBlockProps = {
	currentPage: number;
	totalPages: number;
	isLoading: boolean;
	onPrevious: () => void;
	onNext: () => void;
};

export default function PaginationBlock({ currentPage, totalPages, isLoading, onPrevious, onNext }: PaginationBlockProps) {
	if (totalPages <= 1) return null;

	return (
		<div className="flex items-center justify-between gap-4 shrink-0 pb-4">
			<Button variant="outline" size="sm" onClick={onPrevious} disabled={currentPage <= 1 || isLoading}>
				<ChevronLeft className="w-4 h-4 mr-1" /> Anterior
			</Button>
			<span className="text-sm text-muted-foreground">
				Página {currentPage} de {totalPages}
			</span>
			<Button variant="outline" size="sm" onClick={onNext} disabled={currentPage >= totalPages || isLoading}>
				Próxima <ChevronRight className="w-4 h-4 ml-1" />
			</Button>
		</div>
	);
}

"use client";

import { useId } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { useProductSearchInput } from "@/state-hooks/use-product-search-input";
import { PRODUCT_SEARCH_MAX_LENGTH } from "@/lib/products/search-terms";
import { cn } from "@/lib/utils";

type ProductSearchInputProps = {
	value: string[];
	onChange: (value: string[], immediate?: boolean) => void;
	isLoading?: boolean;
	className?: string;
};

export default function ProductSearchInput({ value, onChange, isLoading, className }: ProductSearchInputProps) {
	const hintId = useId();
	const { inputRef, committed, draft, atLimit, commit, remove, changeDraft, clear } = useProductSearchInput(value, onChange);
	return (
		<div className={cn("flex w-full min-w-0 flex-col gap-2", className)}>
			<InputGroup>
				<InputGroupInput
					ref={inputRef}
					value={draft}
					onChange={(event) => changeDraft(event.target.value.replaceAll(",", " "))}
					aria-label="Buscar produtos"
					aria-describedby={hintId}
					placeholder={atLimit ? "Limite de 5 termos" : "Buscar produto ou código…"}
					readOnly={atLimit}
					maxLength={PRODUCT_SEARCH_MAX_LENGTH}
					onKeyDown={(event) => {
						if (event.nativeEvent.isComposing) return;
						if (event.key === "Enter") {
							event.preventDefault();
							commit();
						}
						if (event.key === "Backspace" && !draft && committed.length) {
							event.preventDefault();
							remove(committed.length - 1);
						}
					}}
				/>
				<InputGroupAddon>{isLoading ? <Loader2 className="animate-spin" aria-label="Buscando" /> : <Search />}</InputGroupAddon>
				<InputGroupAddon align="inline-end">
					{committed.length > 0 || draft ? (
						<InputGroupButton size="icon-sm" aria-label="Limpar busca" onClick={clear}>
							<X />
						</InputGroupButton>
					) : null}
					<InputGroupButton size="sm" variant="secondary" disabled={!draft.trim() || atLimit} onClick={commit}>
						OK
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
			{committed.length > 0 ? (
				<div className="flex flex-wrap gap-1" aria-label="Termos de busca">
					{committed.map((term, index) => (
						<Badge key={`${term}-${index}`} variant="secondary" className="h-8 max-w-full gap-1">
							<span className="truncate">{term}</span>
							<Button type="button" variant="ghost" size="icon-xs" aria-label={`Remover ${term}`} onClick={() => remove(index)}>
								<X />
							</Button>
						</Badge>
					))}
				</div>
			) : null}
			<p id={hintId} className="text-xs text-muted-foreground">
				Enter ou OK para adicionar outro termo. Até 5 termos.
			</p>
		</div>
	);
}

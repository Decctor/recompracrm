"use client";

import { useRef } from "react";
import { normalizeProductSearchTerms, PRODUCT_SEARCH_MAX_TERMS } from "@/lib/products/search-terms";

// The last array entry is the draft. Committing appends an empty draft without clearing earlier terms.
export function useProductSearchInput(value: string[], onChange: (value: string[], immediate?: boolean) => void) {
	const inputRef = useRef<HTMLInputElement>(null);
	const committed = value.slice(0, -1);
	const draft = value.at(-1) ?? "";
	const atLimit = committed.length >= PRODUCT_SEARCH_MAX_TERMS;
	function commit() {
		if (!draft.trim() || atLimit) return;
		onChange([...normalizeProductSearchTerms(value), ""], true);
		inputRef.current?.focus();
	}
	function remove(index: number) {
		onChange([...committed.filter((_, i) => i !== index), draft], true);
		inputRef.current?.focus();
	}
	return {
		inputRef,
		committed,
		draft,
		atLimit,
		commit,
		remove,
		changeDraft: (draft: string) => onChange([...committed, draft]),
		clear: () => {
			onChange([], true);
			inputRef.current?.focus();
		},
	};
}

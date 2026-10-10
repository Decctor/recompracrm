import type { TGetProductsDefaultInput } from "@/app/api/products/route";

export function buildProductsSearchParams(input: TGetProductsDefaultInput) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(input)) {
		if (value === null || value === undefined || value === false) continue;
		if (Array.isArray(value)) {
			if (value.length) params.set(key, value.join(","));
		} else params.set(key, value instanceof Date ? value.toISOString() : String(value));
	}
	return params;
}

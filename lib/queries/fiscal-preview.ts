import type { TGetFiscalPreviewInput, TGetFiscalPreviewOutput } from "@/app/api/pos/fiscal-preview/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export async function fetchFiscalPreview(input: TGetFiscalPreviewInput, signal?: AbortSignal) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(input)) if (value) params.set(key, value);
	const { data } = await axios.get<TGetFiscalPreviewOutput>(`/api/pos/fiscal-preview?${params}`, { signal });
	return data.data;
}

export function useFiscalPreview(input: TGetFiscalPreviewInput, enabled: boolean) {
	const queryKey = ["pos-fiscal-preview", input];
	return { ...useQuery({ queryKey, queryFn: ({ signal }) => fetchFiscalPreview(input, signal), enabled, staleTime: 0, retry: false }), queryKey };
}

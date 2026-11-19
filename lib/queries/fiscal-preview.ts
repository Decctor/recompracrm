import type { TGetFiscalPreviewInput, TGetFiscalPreviewOutput } from "@/app/api/pos/fiscal-preview/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export async function fetchFiscalPreview(input: TGetFiscalPreviewInput, signal?: AbortSignal) {
	const { data } = await axios.post<TGetFiscalPreviewOutput>("/api/pos/fiscal-preview", input, { signal });
	return data.data;
}

export function useFiscalPreview(input: TGetFiscalPreviewInput, enabled: boolean) {
	const queryKey = ["pos-fiscal-preview", input];
	return { ...useQuery({ queryKey, queryFn: ({ signal }) => fetchFiscalPreview(input, signal), enabled, staleTime: 0, retry: false }), queryKey };
}

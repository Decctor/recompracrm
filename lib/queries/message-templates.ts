import { TGetMessageTemplatesInput, TGetMessageTemplatesOutput } from "@/app/api/message-templates/route";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchMessageTemplates(input: Exclude<TGetMessageTemplatesInput, "id">) {
	const searchParams = new URLSearchParams();
	if (input.search) searchParams.set("search", input.search);
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());
	const { data } = await axios.get<TGetMessageTemplatesOutput>(`/api/message-templates?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Templates não encontrados.");
	return result;
}

async function fetchMessageTemplateById(id: string) {
	const { data } = await axios.get<TGetMessageTemplatesOutput>(`/api/message-templates?id=${id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Template não encontrado.");
	return result;
}

type UseMessageTemplatesParams = {
	initialParams: Exclude<TGetMessageTemplatesInput, "id">;
	/** Padrão herdado da listagem de comunicação. Telas com busca inline querem algo mais curto. */
	searchDebounceMs?: number;
};
export function useMessageTemplates({ initialParams, searchDebounceMs = 1200 }: UseMessageTemplatesParams) {
	const [params, setParams] = useState<Exclude<TGetMessageTemplatesInput, "id">>(initialParams);
	const debouncedSearch = useDebounceMemo({ search: params.search }, searchDebounceMs);

	function updateParams(newParams: Partial<Exclude<TGetMessageTemplatesInput, "id">>) {
		setParams((prevParams) => ({ ...prevParams, ...newParams }));
	}
	const finalParams = { ...params, ...debouncedSearch };
	return {
		...useQuery({
			queryKey: ["message-templates", finalParams],
			queryFn: async () => await fetchMessageTemplates(finalParams),
			placeholderData: keepPreviousData,
		}),
		queryKey: ["message-templates", finalParams],
		params,
		updateParams,
	};
}

export function useMessageTemplateById({ id }: { id: string }) {
	return {
		...useQuery({
			queryKey: ["message-template-by-id", id],
			queryFn: async () => await fetchMessageTemplateById(id),
		}),
		queryKey: ["message-template-by-id", id],
	};
}

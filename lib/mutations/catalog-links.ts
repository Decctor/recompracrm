import type { TImportIfoodItemInput, TImportIfoodItemOutput } from "@/app/api/integrations/ifood/sync/import/route";
import type {
	TCreateCatalogLinkInput,
	TCreateCatalogLinkOutput,
	TDeleteCatalogLinkOutput,
	TUpdateCatalogLinkInput,
	TUpdateCatalogLinkOutput,
} from "@/app/api/integrations/ifood/sync/links/route";
import type { TPublishProductInput, TPublishProductOutput } from "@/app/api/integrations/ifood/sync/publish/route";
import type {
	TReconcileInput,
	TReconcileOutput,
	TResolveDivergenceInput,
	TResolveDivergenceOutput,
} from "@/app/api/integrations/ifood/sync/reconcile/route";
import axios from "axios";

export async function createCatalogLink(input: TCreateCatalogLinkInput) {
	const { data } = await axios.post<TCreateCatalogLinkOutput>("/api/integrations/ifood/sync/links", input);
	return data;
}

export async function updateCatalogLinkPolicy(input: TUpdateCatalogLinkInput) {
	const { data } = await axios.patch<TUpdateCatalogLinkOutput>("/api/integrations/ifood/sync/links", input);
	return data;
}

export async function deleteCatalogLink({ linkId }: { linkId: string }) {
	const searchParams = new URLSearchParams({ linkId });
	const { data } = await axios.delete<TDeleteCatalogLinkOutput>(`/api/integrations/ifood/sync/links?${searchParams.toString()}`);
	return data;
}

export async function publishProductToIfood(input: TPublishProductInput) {
	const { data } = await axios.post<TPublishProductOutput>("/api/integrations/ifood/sync/publish", input);
	return data;
}

export async function importIfoodItem(input: TImportIfoodItemInput) {
	const { data } = await axios.post<TImportIfoodItemOutput>("/api/integrations/ifood/sync/import", input);
	return data;
}

export async function reconcileIfoodMerchant(input: TReconcileInput) {
	const { data } = await axios.post<TReconcileOutput>("/api/integrations/ifood/sync/reconcile", input);
	return data;
}

export async function resolveCatalogLinkDivergence(input: TResolveDivergenceInput) {
	const { data } = await axios.patch<TResolveDivergenceOutput>("/api/integrations/ifood/sync/reconcile", input);
	return data;
}

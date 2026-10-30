import type { TSyncMetaAdsCatalogInput, TSyncMetaAdsCatalogOutput } from "@/app/api/integrations/meta/ads/catalog/sync/route";
import axios from "axios";

export async function syncMetaAdsCatalog(input: TSyncMetaAdsCatalogInput) {
	const { data } = await axios.post<TSyncMetaAdsCatalogOutput>("/api/integrations/meta/ads/catalog/sync", input);
	return data;
}

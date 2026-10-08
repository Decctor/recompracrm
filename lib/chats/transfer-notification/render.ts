import { renderBrandAssetPng } from "@/lib/brand/render";
import { fetchOrganizationLogoAsDataUrl } from "@/lib/organizations/invite-header/render";
import { buildHandoffHeaderElement, HANDOFF_HEADER_HEIGHT, HANDOFF_HEADER_WIDTH, type THandoffHeaderPayload } from "./template";

type TRenderHandoffHeaderPayload = Omit<THandoffHeaderPayload, "organizationLogoDataUrl"> & {
	organizationLogoUrl?: string | null;
};

export async function renderHandoffHeaderPng(payload: TRenderHandoffHeaderPayload): Promise<Buffer> {
	const organizationLogoDataUrl = await fetchOrganizationLogoAsDataUrl(payload.organizationLogoUrl);
	const element = await buildHandoffHeaderElement({ ...payload, organizationLogoDataUrl });
	return renderBrandAssetPng({ element, width: HANDOFF_HEADER_WIDTH, height: HANDOFF_HEADER_HEIGHT });
}

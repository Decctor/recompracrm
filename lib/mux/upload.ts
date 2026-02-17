import { muxVideo } from "@/services/mux";

export async function createMuxDirectUpload(opts?: { corsOrigin?: string }) {
	const upload = await muxVideo.uploads.create({
		cors_origin: opts?.corsOrigin ?? process.env.NEXT_PUBLIC_APP_URL ?? "*",
		new_asset_settings: {
			playback_policy: ["public"],
			encoding_tier: "baseline",
		},
	});
	return {
		uploadId: upload.id,
		uploadUrl: upload.url,
	};
}

export async function getMuxAsset(assetId: string) {
	return await muxVideo.assets.retrieve(assetId);
}

export async function deleteMuxAsset(assetId: string) {
	return await muxVideo.assets.delete(assetId);
}

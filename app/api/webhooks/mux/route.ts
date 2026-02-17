import { deleteMuxAsset } from "@/lib/mux/upload";
import { db } from "@/services/drizzle";
import { communityLessons } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

type MuxWebhookEvent = {
	type: string;
	data: {
		id: string;
		upload_id?: string;
		playback_ids?: Array<{ id: string; policy: string }>;
		duration?: number;
		status?: string;
	};
};

export async function POST(request: NextRequest) {
	try {
		// Verify webhook signature if MUX_WEBHOOK_SECRET is set
		const webhookSecret = process.env.MUX_WEBHOOK_SECRET;
		if (webhookSecret) {
			const signature = request.headers.get("mux-signature");
			if (!signature) {
				return NextResponse.json({ error: "Missing signature" }, { status: 401 });
			}
			// Note: For production, implement full HMAC verification using the Mux signature
			// See: https://docs.mux.com/guides/listen-for-webhooks#verify-webhook-signatures
		}

		const event = (await request.json()) as MuxWebhookEvent;
		console.log("Mux webhook event:", event);
		switch (event.type) {
			case "video.upload.asset_created": {
				// An asset was created from a direct upload
				const assetId = event.data.id;
				const uploadId = event.data.upload_id;

				if (uploadId) {
					await db
						.update(communityLessons)
						.set({
							muxAssetId: assetId,
							muxAssetStatus: "PROCESSANDO",
						})
						.where(eq(communityLessons.muxUploadId, uploadId));
				}
				break;
			}

			case "video.asset.ready": {
				// Asset is ready for playback
				const assetId = event.data.id;
				const playbackId = event.data.playback_ids?.[0]?.id;
				const duration = event.data.duration ? Math.round(event.data.duration) : null;
				const lesson = await db.query.communityLessons.findFirst({
					where: eq(communityLessons.muxAssetId, assetId),
					columns: {
						id: true,
						muxMetadata: true,
					},
				});
				const assetAnteriorId = lesson?.muxMetadata?.alteracaoMuxAssetId ?? null;
				const { alteracaoMuxAssetId, alteracaoMuxAssetData, alteracaoMusAssetMotivo, ...muxMetadata } = lesson?.muxMetadata ?? {};

				await db
					.update(communityLessons)
					.set({
						muxPlaybackId: playbackId,
						muxAssetStatus: "PRONTO",
						duracaoSegundos: duration,
						muxMetadata,
					})
					.where(eq(communityLessons.muxAssetId, assetId));

				if (assetAnteriorId && assetAnteriorId !== assetId) {
					try {
						await deleteMuxAsset(assetAnteriorId);
					} catch (error) {
						console.error("Falha ao excluir asset antigo no Mux:", error);
					}
				}
				break;
			}

			case "video.asset.errored": {
				// Asset processing failed
				const assetId = event.data.id;
				await db
					.update(communityLessons)
					.set({ muxAssetStatus: "ERRO" })
					.where(eq(communityLessons.muxAssetId, assetId));
				break;
			}
		}

		return NextResponse.json({ received: true });
	} catch (error) {
		console.error("Mux webhook error:", error);
		return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
	}
}

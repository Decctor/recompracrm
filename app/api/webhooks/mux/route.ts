import { deleteMuxAsset } from "@/lib/mux/upload";
import { db } from "@/services/drizzle";
import { communityLessons } from "@/services/drizzle/schema";
import { muxClient } from "@/services/mux";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const webhookSecret = process.env.MUX_WEBHOOK_SECRET;
		if (!webhookSecret) {
			console.error("MUX_WEBHOOK_SECRET is not configured");
			return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
		}

		const body = await request.text();
		let event: Awaited<ReturnType<typeof muxClient.webhooks.unwrap>>;
		try {
			// `unwrap` validates signature + parses payload.
			event = muxClient.webhooks.unwrap(body, request.headers, webhookSecret);
		} catch (error) {
			console.error("Invalid Mux webhook signature:", error);
			return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
		}

		console.log("Mux webhook event:", event.type, event.id);
		switch (event.type) {
			case "video.upload.asset_created": {
				// An asset was created from a direct upload
				const uploadId = event.data.id;
				const assetId = event.data.asset_id;
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
				const playbackId = event.data.playback_ids?.find((item) => item.policy === "public")?.id ?? event.data.playback_ids?.[0]?.id;
				const duration = event.data.duration != null ? Math.round(event.data.duration) : null;
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
				await db.update(communityLessons).set({ muxAssetStatus: "ERRO" }).where(eq(communityLessons.muxAssetId, assetId));
				break;
			}

			default: {
				// Keep 2xx for unhandled events to avoid unnecessary retries from Mux.
				break;
			}
		}

		return NextResponse.json({ received: true });
	} catch (error) {
		console.error("Mux webhook error:", error);
		return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
	}
}

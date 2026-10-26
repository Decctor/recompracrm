import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { muxVideo } from "../services/mux";

// Sobe um vídeo local para o Mux (playback policy PUBLIC) e imprime as
// informações necessárias para preencher um case
// (app/_content/cases.ts).
//
// Uso: npx tsx ./scripts/upload-mux-video.ts <caminho-do-video>

async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
	const filePathArg = process.argv[2];
	if (!filePathArg) {
		console.error("Uso: npx tsx ./scripts/upload-mux-video.ts <caminho-do-video>");
		process.exit(1);
	}
	const filePath = path.resolve(filePathArg);

	console.log(`Lendo arquivo: ${filePath}`);
	const fileBuffer = await readFile(filePath);
	console.log(`Tamanho: ${(fileBuffer.byteLength / (1024 * 1024)).toFixed(1)} MB`);

	console.log("Criando direct upload no Mux (playback policy: public)...");
	const upload = await muxVideo.uploads.create({
		cors_origin: "*",
		new_asset_settings: {
			playback_policy: ["public"],
			video_quality: "plus",
			passthrough: path.basename(filePath),
		},
	});

	console.log(`Upload criado (id: ${upload.id}). Enviando arquivo...`);
	const putResponse = await fetch(upload.url, {
		method: "PUT",
		body: fileBuffer,
		headers: { "Content-Type": "application/octet-stream" },
	});
	if (!putResponse.ok) {
		throw new Error(`Falha no envio do arquivo: ${putResponse.status} ${putResponse.statusText}`);
	}
	console.log("Arquivo enviado. Aguardando o Mux criar o asset...");

	let assetId: string | null = null;
	for (let attempt = 0; attempt < 60; attempt++) {
		const currentUpload = await muxVideo.uploads.retrieve(upload.id);
		if (currentUpload.status === "errored") {
			throw new Error(`Upload falhou: ${JSON.stringify(currentUpload.error)}`);
		}
		if (currentUpload.asset_id) {
			assetId = currentUpload.asset_id;
			break;
		}
		await sleep(3000);
	}
	if (!assetId) throw new Error("Timeout aguardando a criação do asset.");

	console.log(`Asset criado (id: ${assetId}). Aguardando processamento...`);
	let asset = await muxVideo.assets.retrieve(assetId);
	for (let attempt = 0; attempt < 120 && asset.status === "preparing"; attempt++) {
		await sleep(5000);
		asset = await muxVideo.assets.retrieve(assetId);
	}
	if (asset.status === "errored") {
		throw new Error(`Processamento do asset falhou: ${JSON.stringify(asset.errors)}`);
	}
	if (asset.status !== "ready") {
		throw new Error(`Timeout aguardando o asset ficar pronto (status atual: ${asset.status}).`);
	}

	const playbackId = asset.playback_ids?.find((p) => p.policy === "public")?.id;
	if (!playbackId) throw new Error("Asset pronto, mas sem playback ID público.");

	const result = {
		assetId,
		playbackId,
		status: asset.status,
		durationSeconds: asset.duration,
		aspectRatio: asset.aspect_ratio,
		resolution: asset.max_stored_resolution,
		streamUrl: `https://stream.mux.com/${playbackId}.m3u8`,
		thumbnailUrl: `https://image.mux.com/${playbackId}/thumbnail.jpg`,
	};

	console.log("\n=== RESULTADO ===");
	console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

"use client";

import { mapWithConcurrency } from "@/lib/async/map-with-concurrency";
import { openZipVolumeWriter } from "@/lib/exportations/zip-volume-writer";

const ZIP_FETCH_CONCURRENCY = 4;

/** Baixa um blob com o nome dado (link + object URL, revogado depois que o download começa). */
export function downloadBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	link.remove();
	// O clique só agenda o download; revogar na hora cancela em alguns navegadores.
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type TVisualKitZipEntry = {
	folder: string;
	name: string;
	/** Blob já gerado ou URL de um arquivo salvo (baixado com os cookies da sessão). */
	source: Blob | string;
};

export type TVisualKitZipProgress = { done: number; total: number };

async function readSource(source: Blob | string): Promise<Uint8Array> {
	if (typeof source !== "string") return new Uint8Array(await source.arrayBuffer());
	const response = await fetch(source, { credentials: "include" });
	if (!response.ok) throw new Error(`Não foi possível baixar um arquivo do kit (HTTP ${response.status}).`);
	return new Uint8Array(await response.arrayBuffer());
}

function zipEntryPath(entry: TVisualKitZipEntry) {
	const folder = entry.folder.replace(/^\/+|\/+$/g, "");
	return folder ? `${folder}/${entry.name}` : entry.name;
}

/**
 * Monta e baixa o zip do kit com o escritor de volumes das exportações. Precisa começar dentro do
 * gesto do usuário (o Chrome abre o seletor "Salvar como"). Devolve `false` se o usuário cancelar o
 * seletor. PDF/PNG/JPG já são comprimidos, então entram sem deflate.
 */
export async function downloadVisualKitZip({
	zipName,
	files,
	onProgress,
}: {
	zipName: string;
	files: TVisualKitZipEntry[];
	onProgress?: (progress: TVisualKitZipProgress) => void;
}): Promise<boolean> {
	const writer = await openZipVolumeWriter({ fileNamePrefix: zipName.replace(/\.zip$/i, "") });
	if (!writer) return false;
	const total = files.length;
	let done = 0;
	onProgress?.({ done, total });
	try {
		await mapWithConcurrency(files, ZIP_FETCH_CONCURRENCY, async (entry) => {
			const data = await readSource(entry.source);
			writer.addFile(zipEntryPath(entry), data, { compress: false });
			await writer.flush();
			done += 1;
			onProgress?.({ done, total });
		});
		await writer.finish();
		return true;
	} catch (error) {
		await writer.abort();
		throw error;
	}
}

/** SHA-256 do conteúdo em hexadecimal minúsculo. */
export async function sha256Hex(blob: Blob): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

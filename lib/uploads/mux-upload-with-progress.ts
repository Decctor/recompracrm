import { requestMuxUploadUrl } from "@/lib/mutations/community-admin";

export type TMuxUploadStatus = "idle" | "preparing" | "uploading" | "success" | "error";

export type TUploadMuxVideoWithProgressParams = {
	file: File;
	onProgress?: (args: { loadedBytes: number; totalBytes: number; progressPercent: number }) => void;
	onStatusChange?: (status: TMuxUploadStatus) => void;
};

function toProgressPercent(loadedBytes: number, totalBytes: number) {
	if (totalBytes <= 0) return 0;
	return Math.max(0, Math.min(100, Math.round((loadedBytes / totalBytes) * 100)));
}

export async function uploadMuxVideoWithProgress({
	file,
	onProgress,
	onStatusChange,
}: TUploadMuxVideoWithProgressParams) {
	onStatusChange?.("preparing");
	const { data } = await requestMuxUploadUrl();
	onStatusChange?.("uploading");

	await new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest();

		xhr.upload.addEventListener("progress", (event) => {
			if (!event.lengthComputable) return;
			onProgress?.({
				loadedBytes: event.loaded,
				totalBytes: event.total,
				progressPercent: toProgressPercent(event.loaded, event.total),
			});
		});

		xhr.addEventListener("load", () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				const totalBytes = file.size || 0;
				onProgress?.({
					loadedBytes: totalBytes,
					totalBytes,
					progressPercent: 100,
				});
				onStatusChange?.("success");
				resolve();
				return;
			}

			onStatusChange?.("error");
			reject(new Error("Falha ao enviar vídeo para o Mux."));
		});

		xhr.addEventListener("error", () => {
			onStatusChange?.("error");
			reject(new Error("Erro de rede ao enviar vídeo para o Mux."));
		});

		xhr.open("PUT", data.uploadUrl);
		xhr.send(file);
	});

	return data.uploadId;
}

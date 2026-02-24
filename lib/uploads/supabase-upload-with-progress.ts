import { supabaseClient } from "@/services/supabase";

export type TSupabaseUploadStatus = "idle" | "preparing" | "uploading" | "success" | "error";

type TUploadSupabaseFileWithProgressParams = {
	file: File;
	fileName: string;
	prefix?: string;
	onProgress?: (args: { loadedBytes: number; totalBytes: number; progressPercent: number }) => void;
	onStatusChange?: (status: TSupabaseUploadStatus) => void;
};

function toProgressPercent(loadedBytes: number, totalBytes: number) {
	if (totalBytes <= 0) return 0;
	return Math.max(0, Math.min(100, Math.round((loadedBytes / totalBytes) * 100)));
}

function removeDiacritics(value: string) {
	return Array.from(value).filter((char) => char.normalize("NFD") === char).join("");
}

function sanitizeFileName(fileName: string): string {
	return removeDiacritics(fileName.normalize("NFD"))
		.toLowerCase()
		.replace(/[^a-z0-9_\/!\-\.\*'\(\) &$@=;:+,?]/g, "")
		.replace(/\s+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "")
		.replace(/^$/, "arquivo");
}

export async function uploadFileToSupabaseWithProgress({
	file,
	fileName,
	prefix = "community-materials",
	onProgress,
	onStatusChange,
}: TUploadSupabaseFileWithProgressParams) {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!supabaseUrl || !supabaseAnonKey) throw new Error("Configuração do Supabase não encontrada.");

	const formattedFileName = sanitizeFileName(fileName);
	const datetime = new Date().toISOString();
	const storagePath = `public/${prefix}/${formattedFileName}-${datetime}`;
	const uploadUrl = `${supabaseUrl}/storage/v1/object/files/${storagePath}`;

	onStatusChange?.("preparing");

	await new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		onStatusChange?.("uploading");

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
			reject(new Error("Falha ao enviar arquivo para o storage."));
		});

		xhr.addEventListener("error", () => {
			onStatusChange?.("error");
			reject(new Error("Erro de rede ao enviar arquivo para o storage."));
		});

		xhr.open("POST", uploadUrl);
		xhr.setRequestHeader("Authorization", `Bearer ${supabaseAnonKey}`);
		xhr.setRequestHeader("apikey", supabaseAnonKey);
		xhr.setRequestHeader("x-upsert", "false");
		if (file.type) xhr.setRequestHeader("Content-Type", file.type);
		xhr.send(file);
	});

	const {
		data: { publicUrl },
	} = supabaseClient.storage.from("files").getPublicUrl(storagePath);

	return {
		storagePath,
		storageUrl: publicUrl,
		mimeType: file.type || null,
		tamanhoBytes: file.size || null,
	};
}

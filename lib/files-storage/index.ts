import { supabaseClient } from "@/services/supabase";
import type { IconType } from "react-icons";
import {
	BsFiletypeCsv,
	BsFiletypeDocx,
	BsFiletypePdf,
	BsFiletypeXlsx,
	BsFiletypeXml,
	BsFillPlayBtnFill,
	BsImage,
	BsPeopleFill,
} from "react-icons/bs";

import { toast } from "sonner";
type FileTypes = {
	[contentType: string]: {
		title: string;
		extension: string;
		icon: IconType;
	};
};

export const FileTypes: FileTypes = {
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
		title: "WORD",
		extension: ".docx",
		icon: BsFiletypeDocx,
	},
	"image/png": {
		title: "IMAGEM (.PNG)",
		extension: ".png",
		icon: BsImage,
	},
	"image/jpeg": {
		title: "IMAGEM(.JPEG)",
		extension: ".jpeg",
		icon: BsImage,
	},
	"image/tiff": {
		title: "IMAGEM(.TIFF)",
		extension: ".tiff",
		icon: BsImage,
	},
	"application/pdf": {
		title: "PDF",
		extension: ".pdf",
		icon: BsFiletypePdf,
	},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
		title: "EXCEL",
		extension: ".xlsx",
		icon: BsFiletypeXlsx,
	},
	"text/xml": {
		title: "XML",
		extension: ".xml",
		icon: BsFiletypeXml,
	},
	"video/mp4": {
		title: "MP4",
		extension: ".mp4",
		icon: BsFillPlayBtnFill,
	},
	"application/vnd.sealed.tiff": {
		title: "IMAGEM(.TIFF)",
		extension: ".tiff",
		icon: BsImage,
	},
	"image/vnd.sealedmedia.softseal.jpg": {
		title: "IMAGEM(.JPG)",
		extension: ".jpg",
		icon: BsImage,
	},
	"text/csv": {
		title: "CSV(.CSV)",
		extension: ".csv",
		icon: BsFiletypeCsv,
	},
};

export type TFileContentKind = "video" | "image" | "audio" | "text" | "document";

export function inferFileContentKind(file: File): TFileContentKind {
	if (file.type?.startsWith("video/")) return "video";
	if (file.type?.startsWith("image/")) return "image";
	if (file.type?.startsWith("audio/")) return "audio";
	if (file.type?.startsWith("text/")) return "text";
	if (file.type === "application/json") return "text";

	const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
	if (["mp4", "mov", "avi", "mkv", "webm"].includes(extension)) return "video";
	if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) return "image";
	if (["mp3", "wav", "ogg", "m4a"].includes(extension)) return "audio";
	if (["txt", "md", "csv", "json"].includes(extension)) return "text";

	return "document";
}

function removeDiacritics(value: string) {
	return Array.from(value).filter((char) => char.normalize("NFD") === char).join("");
}

function sanitizeFileName(fileName: string): string {
	return (
		removeDiacritics(fileName.normalize("NFD"))
			// Remove acentos e normaliza
			// Converte para minúsculas
			.toLowerCase()
			// Remove caracteres especiais não permitidos pelo Supabase
			// Mantém apenas: \w (letras, números, underscore), /, !, -, ., *, ', (, ), espaço, &, $, @, =, ;, :, +, ,, ?
			.replace(/[^a-z0-9_\/!\-\.\*'\(\) &$@=;:+,?]/g, "")
			// Remove caracteres problemáticos específicos
			.replace(/[°]/g, "graus")
			.replace(/[#]/g, "numero")
			.replace(/[%]/g, "porcento")
			.replace(/[&]/g, "e")
			.replace(/[+]/g, "mais")
			.replace(/[=]/g, "igual")
			.replace(/[?]/g, "interrogacao")
			.replace(/[!]/g, "exclamacao")
			.replace(/[*]/g, "asterisco")
			.replace(/[']/g, "aspas")
			.replace(/[()]/g, "")
			.replace(/[;]/g, "")
			.replace(/[:]/g, "")
			.replace(/[,]/g, "")
			// Remove espaços múltiplos e substitui por underscore
			.replace(/\s+/g, "_")
			// Remove underscores múltiplos
			.replace(/_+/g, "_")
			// Remove underscores no início e fim
			.replace(/^_+|_+$/g, "")
			// Garante que não está vazio
			.replace(/^$/, "arquivo")
	);
}
type TSupabaseUploadPrefix = "syncrono" | "avatars" | "organizations";
type UploadFileParams = {
	file: File;
	prefix?: TSupabaseUploadPrefix;
	fileName: string;
	vinculationId?: string;
};

export async function uploadFile({ file, fileName, vinculationId, prefix = "syncrono" }: UploadFileParams) {
	try {
		if (!file) throw new Error("Arquivo não fornecido.");

		const formattedFileName = sanitizeFileName(fileName);
		const datetime = new Date().toISOString();
		const filePath = `/public/${prefix}/${vinculationId ? `(${vinculationId})` : ""}${formattedFileName} - ${datetime}`;

		const { data, error } = await supabaseClient.storage.from("files").upload(filePath, file);

		if (error) throw error;

		const {
			data: { publicUrl },
		} = supabaseClient.storage.from("files").getPublicUrl(filePath);

		const contentType = file.type;
		const format = contentType ? FileTypes[contentType]?.title || "INDEFINIDO" : "INDEFINIDO";
		const size = file.size;

		return { url: publicUrl, format, size };
	} catch (error) {
		console.error("Error uploading file:", error);
		throw error;
	}
}

export async function handleDownload({ fileName, fileUrl }: { fileName: string; fileUrl: string }) {
	try {
		const downloadLoadingToast = toast.loading("Baixando arquivo...");

		const response = await fetch(fileUrl);
		const blob = await response.blob();

		const blobUrl = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = blobUrl;
		link.download = fileName;
		link.target = "_blank";
		link.rel = "noopener noreferrer";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(blobUrl);

		toast.dismiss(downloadLoadingToast);
	} catch (error) {
		console.error("Error downloading file:", error);
		throw error;
	}
}

export function getFileTypeTitle(type: string) {
	return FileTypes[type]?.title || "NÃO DEFINIDO";
}

export function getTitleFileType(title: string) {
	const equivalent = Object.entries(FileTypes).find(([key, value]) => title === value.title);
	return equivalent ? equivalent[0] : "";
}

export function isFileFormatImage(format: string) {
	return ["IMAGEM (.PNG)", "IMAGEM(.JPEG)", "IMAGEM(.TIFF)", "IMAGEM(.JPG)"].includes(format);
}

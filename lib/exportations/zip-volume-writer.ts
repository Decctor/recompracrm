"use client";

import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

/**
 * Escritor de ZIP para exportações grandes, montado no navegador.
 *
 * Dois modos, decididos pelo navegador:
 * - `STREAM` (Chrome/Edge, `showSaveFilePicker`): o ZIP vai direto para o disco enquanto é montado.
 *   Um arquivo só, sem teto de tamanho — a memória guarda só o pedaço em trânsito.
 * - `VOLUMES` (Safari/Firefox): o ZIP é montado em memória e, ao passar do teto, fecha um volume,
 *   dispara o download (`…-parte-1.zip`) e começa outro. Sem o corte, um mês de DANFEs estoura a
 *   memória da aba.
 *
 * `addFile` é síncrono de propósito: o fflate comprime no push e chama o callback na hora, então
 * entradas que chegam de downloads concorrentes nunca se intercalam dentro do ZIP.
 */

const VOLUME_MAX_BYTES = 150 * 1024 * 1024;
const VOLUME_MAX_FILES = 2_000;

type TSaveFilePickerWindow = Window & {
	showSaveFilePicker?: (options: {
		suggestedName?: string;
		types?: { description: string; accept: Record<string, string[]> }[];
	}) => Promise<FileSystemFileHandle>;
};

export type TZipVolumeWriterMode = "STREAM" | "VOLUMES";

export type TZipVolumeWriter = {
	mode: TZipVolumeWriterMode;
	/** `compress: false` para o que já é comprimido (PDF): deflate só gastaria CPU. */
	addFile: (path: string, data: Uint8Array, options: { compress: boolean }) => void;
	/** Grava o último arquivo (ex.: relatório) e fecha. No modo `VOLUMES`, baixa o último volume. */
	finish: (lastFile?: { path: string; data: Uint8Array }) => Promise<void>;
	abort: () => Promise<void>;
	/** Espera os bytes já produzidos chegarem ao disco — contrapressão do modo `STREAM`. */
	flush: () => Promise<void>;
	volumesWritten: () => number;
};

function triggerBlobDownload(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	// O clique só agenda o download; revogar na hora cancela em alguns navegadores.
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Abre o destino do ZIP. Precisa rodar dentro do gesto do usuário (o seletor de arquivo exige);
 * devolve `null` se o usuário fechar o seletor.
 */
export async function openZipVolumeWriter({ fileNamePrefix }: { fileNamePrefix: string }): Promise<TZipVolumeWriter | null> {
	const pickerWindow = window as TSaveFilePickerWindow;
	if (typeof pickerWindow.showSaveFilePicker === "function") {
		let handle: FileSystemFileHandle;
		try {
			handle = await pickerWindow.showSaveFilePicker({
				suggestedName: `${fileNamePrefix}.zip`,
				types: [{ description: "Arquivo ZIP", accept: { "application/zip": [".zip"] } }],
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return null;
			throw error;
		}
		return createStreamWriter(await handle.createWritable());
	}
	return createVolumesWriter({ fileNamePrefix });
}

function addEntry(zip: Zip, path: string, data: Uint8Array, compress: boolean) {
	const entry = compress ? new ZipDeflate(path, { level: 6 }) : new ZipPassThrough(path);
	zip.add(entry);
	entry.push(data, true);
}

function createStreamWriter(writable: FileSystemWritableFileStream): TZipVolumeWriter {
	// O callback do fflate é síncrono e a escrita no disco não: a corrente serializa as escritas.
	let writeChain: Promise<void> = Promise.resolve();
	let writeError: unknown = null;
	const zip = new Zip((error, chunk) => {
		if (error) {
			writeError = error;
			return;
		}
		writeChain = writeChain.then(() => writable.write(chunk)).catch((err) => {
			writeError = err;
		});
	});

	const flush = async () => {
		await writeChain;
		if (writeError) throw writeError;
	};

	return {
		mode: "STREAM",
		addFile: (path, data, { compress }) => addEntry(zip, path, data, compress),
		finish: async (lastFile) => {
			if (lastFile) addEntry(zip, lastFile.path, lastFile.data, true);
			zip.end();
			await flush();
			await writable.close();
		},
		abort: async () => {
			zip.terminate();
			await writeChain.catch(() => undefined);
			await writable.abort().catch(() => undefined);
		},
		flush,
		volumesWritten: () => 1,
	};
}

function createVolumesWriter({ fileNamePrefix }: { fileNamePrefix: string }): TZipVolumeWriter {
	let chunks: Uint8Array[] = [];
	let bytes = 0;
	let files = 0;
	let volumes = 0;
	let zip = openVolume();

	function openVolume() {
		chunks = [];
		bytes = 0;
		files = 0;
		return new Zip((error, chunk) => {
			if (error) throw error;
			chunks.push(chunk);
			bytes += chunk.length;
		});
	}

	function closeVolume({ last }: { last: boolean }) {
		zip.end();
		volumes += 1;
		// Um volume só (o caso comum) não ganha sufixo de parte.
		const fileName = last && volumes === 1 ? `${fileNamePrefix}.zip` : `${fileNamePrefix}-parte-${volumes}.zip`;
		triggerBlobDownload(new Blob(chunks as BlobPart[], { type: "application/zip" }), fileName);
		chunks = [];
	}

	return {
		mode: "VOLUMES",
		addFile: (path, data, { compress }) => {
			addEntry(zip, path, data, compress);
			files += 1;
			if (bytes >= VOLUME_MAX_BYTES || files >= VOLUME_MAX_FILES) {
				closeVolume({ last: false });
				zip = openVolume();
			}
		},
		finish: async (lastFile) => {
			if (lastFile) addEntry(zip, lastFile.path, lastFile.data, true);
			closeVolume({ last: true });
		},
		abort: async () => {
			zip.terminate();
			chunks = [];
		},
		flush: async () => undefined,
		volumesWritten: () => volumes,
	};
}

/** Se o navegador grava o ZIP direto no disco (um arquivo só) ou em volumes baixados em partes. */
export function browserSupportsZipStreaming() {
	return typeof window !== "undefined" && typeof (window as TSaveFilePickerWindow).showSaveFilePicker === "function";
}

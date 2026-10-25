import type {
	TImportPurchaseCompositionInput,
	TImportPurchaseCompositionOutput,
	TImportPurchaseCompositionStageEvent,
	TImportPurchaseCompositionStreamEvent,
} from "@/app/api/purchases/import-composition/route";
import { TCreatePurchaseInput, TCreatePurchaseOutput, TUpdatePurchaseInput, TUpdatePurchaseOutput } from "@/app/api/purchases/route";
import type { TAttachFreightDocumentInput, TAttachFreightDocumentOutput } from "@/app/api/purchases/freight-documents/route";
import type { TCreatePurchaseReturnInput, TCreatePurchaseReturnOutput } from "@/app/api/purchases/returns/route";
import axios from "axios";

export async function createPurchase(input: TCreatePurchaseInput) {
	const { data } = await axios.post<TCreatePurchaseOutput>("/api/purchases", input);
	return data;
}

export async function updatePurchase(input: TUpdatePurchaseInput) {
	const { data } = await axios.put<TUpdatePurchaseOutput>("/api/purchases", input);
	return data;
}

/**
 * Reads the NDJSON stream from the import route, reporting each processing stage through `onStage`.
 * Uses `fetch` because axios can't stream response bodies in the browser. Aborting `signal` cancels
 * the request, and the server stops at its next checkpoint.
 */
export async function importPurchaseComposition(
	input: TImportPurchaseCompositionInput,
	{ onStage, signal }: { onStage?: (event: TImportPurchaseCompositionStageEvent) => void; signal?: AbortSignal } = {},
): Promise<TImportPurchaseCompositionOutput> {
	// Vision extraction can take tens of seconds; mirror the route's maxDuration.
	const timeoutSignal = AbortSignal.timeout(120_000);
	const response = await fetch("/api/purchases/import-composition", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
		signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
	});
	if (!response.ok || !response.body) {
		const body = await response.json().catch(() => null);
		throw new Error(body?.error?.message ?? "Não foi possível ler o documento.");
	}

	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = "";
	let result: TImportPurchaseCompositionOutput | null = null;
	const handleLine = (line: string) => {
		if (!line.trim()) return;
		const event = JSON.parse(line) as TImportPurchaseCompositionStreamEvent;
		if (event.type === "stage") onStage?.(event);
		else if (event.type === "error") throw new Error(event.message);
		else result = { data: event.data, message: event.message };
	};
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += value;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) handleLine(line);
	}
	handleLine(buffer);
	if (!result) throw new Error("A leitura terminou sem resultado. Tente novamente.");
	return result;
}

export async function attachPurchaseFreightDocument(input: TAttachFreightDocumentInput) {
	const { data } = await axios.post<TAttachFreightDocumentOutput>("/api/purchases/freight-documents", input);
	return data;
}

export async function createPurchaseReturn(input: TCreatePurchaseReturnInput) {
	const { data } = await axios.post<TCreatePurchaseReturnOutput>("/api/purchases/returns", input);
	return data;
}

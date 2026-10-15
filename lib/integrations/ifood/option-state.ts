import type { TIfoodDocumentOption, TIfoodItemDocument } from "./item-document";

/** O modifier do canal sobrescreve a raiz; ausência de status é dado desconhecido, não AVAILABLE. */
export function effectiveOptionAvailability(option: Pick<TIfoodDocumentOption, "status" | "contextModifiers">): boolean | null {
	const status = option.contextModifiers?.find((modifier) => modifier.catalogContext === "DEFAULT")?.status ?? option.status;
	if (status?.toUpperCase() === "AVAILABLE") return true;
	if (status?.toUpperCase() === "UNAVAILABLE") return false;
	return null;
}

export function effectiveOptionPrice(option: Pick<TIfoodDocumentOption, "price" | "contextModifiers">) {
	const context = option.contextModifiers?.find((modifier) => modifier.catalogContext === "DEFAULT");
	return context?.price?.value ?? option.price?.value ?? null;
}

export type TObservedIfoodOption = { nome: string | null; preco: number | null; disponivel: boolean | null };

export function observeIfoodOption(doc: TIfoodItemDocument, option: TIfoodDocumentOption): TObservedIfoodOption {
	return {
		nome: doc.products.find((product) => product.id === option.productId)?.name ?? null,
		preco: effectiveOptionPrice(option),
		disponivel: effectiveOptionAvailability(option),
	};
}

/** Preserva preço, agenda e código. Opções vivas mantêm outros canais; excluídas pausam em todos. */
export function applyManagedOptionAvailability(doc: TIfoodItemDocument, desired: ReadonlyMap<string, { disponivel: boolean; excluida: boolean }>) {
	for (const option of doc.options) {
		const state = desired.get(option.id);
		if (!state) continue;
		const status = state.disponivel ? "AVAILABLE" : "UNAVAILABLE";
		option.status = status;
		const contexts = option.contextModifiers ?? [];
		option.contextModifiers = contexts.map((context) => (state.excluida || context.catalogContext === "DEFAULT" ? { ...context, status } : context));
		if (!contexts.some((context) => context.catalogContext === "DEFAULT")) {
			option.contextModifiers.push({ catalogContext: "DEFAULT", status });
		}
	}
}

/** Releitura limitada: sucesso HTTP sozinho não confirma propagação. Retorna somente as confirmadas. */
export async function verifyIfoodOptionStates({
	read,
	matches,
	optionIds,
	wait = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
	delays = [0, 1000, 3000, 5000],
}: {
	read: (optionIds: ReadonlySet<string>) => Promise<Map<string, TObservedIfoodOption>>;
	matches: (optionId: string, observed: TObservedIfoodOption) => boolean;
	optionIds: ReadonlySet<string>;
	wait?: (ms: number) => Promise<void>;
	delays?: number[];
}) {
	const pending = new Set(optionIds);
	const confirmed = new Map<string, TObservedIfoodOption>();
	for (const delay of delays) {
		if (!pending.size) break;
		if (delay) await wait(delay);
		// Uma falha de leitura também não confirma a escrita. A próxima tentativa pode recuperar.
		const observed = await read(pending).catch(() => new Map<string, TObservedIfoodOption>());
		for (const id of pending) {
			const state = observed.get(id);
			if (!state || !matches(id, state)) continue;
			confirmed.set(id, state);
			pending.delete(id);
		}
	}
	return confirmed;
}

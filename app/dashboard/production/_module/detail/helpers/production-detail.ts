import type { TGetProductionsOutputById } from "@/app/api/productions/route";

export type TProductionById = TGetProductionsOutputById;
export type TProductionInputRow = TProductionById["entradas"][number];
export type TProductionOutputRow = TProductionById["saidas"][number];
export type TProductionStatus = TProductionById["status"];

/** O mesmo `itemKind` que `PATCH /api/productions/items` recebe. */
export type TWeighItemKind = "ENTRADA" | "SAIDA";
export type TWeighItemKey = { kind: TWeighItemKind; id: string };

export type TDetailPanel = "pesagem" | "preparo" | "etiquetas";

/** RASCUNHO se comporta como PLANEJADA na tela (plano, decisão 7). */
export function isPlannedStatus(status: TProductionStatus) {
	return status === "RASCUNHO" || status === "PLANEJADA";
}

/** Aba que a tela abre em cada situação: pesando enquanto roda, etiquetas depois, preparo antes. */
export function getDefaultPanel(status: TProductionStatus): TDetailPanel {
	if (status === "EM_PRODUCAO") return "pesagem";
	if (status === "CONCLUIDA") return "etiquetas";
	return "preparo";
}

export function getPanelOptions(status: TProductionStatus): TDetailPanel[] {
	if (status === "CONCLUIDA") return ["etiquetas", "preparo"];
	if (status === "CANCELADA") return ["preparo"];
	return ["pesagem", "preparo"];
}

const pad2 = (value: number) => String(value).padStart(2, "0");

export function formatDayMonth(value: Date | string) {
	const date = new Date(value);
	return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
}

export function formatHourMinute(value: Date | string) {
	const date = new Date(value);
	return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatFullDate(value: Date | string) {
	const date = new Date(value);
	return `${formatDayMonth(date)}/${date.getFullYear()}`;
}

/** `mm:ss` na primeira hora, `h:mm:ss` depois. */
export function formatElapsed(totalSeconds: number) {
	const seconds = Math.max(0, Math.floor(totalSeconds));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const rest = seconds % 60;
	if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(rest)}`;
	return `${pad2(minutes)}:${pad2(rest)}`;
}

/** Unidades contáveis não mostram casas decimais; o resto vai até 3 (balança). */
export function formatQuantityNumber(value: number | null | undefined, unit: string) {
	return Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: unit === "UN" ? 0 : 3 });
}

export function formatQuantity(value: number | null | undefined, unit: string) {
	return `${formatQuantityNumber(value, unit)} ${unit}`.trim();
}

export function getItemName(item: TProductionInputRow | TProductionOutputRow) {
	const productName = item.produto?.nome ?? "Produto";
	return item.produtoVariante?.nome ? `${productName} · ${item.produtoVariante.nome}` : productName;
}

export function getItemUnit(item: TProductionInputRow | TProductionOutputRow) {
	return item.produto?.unidade ?? "";
}

export function getInitials(name: string) {
	const initials = name
		.split(" ")
		.filter((word) => word.length > 2)
		.slice(0, 2)
		.map((word) => word[0])
		.join("")
		.toUpperCase();
	return initials || name.slice(0, 2).toUpperCase();
}

/** Conferido = `quantidadeReal` preenchida (plano, decisão 2). Não existe outra flag. */
export function isWeighed(item: { quantidadeReal: number | null }) {
	return item.quantidadeReal != null;
}

/** Diferença entre real e previsto: "OK" quando bate, tom de aviso fora de ±2%. Sem previsto, sem chip. */
export function getQuantityDiff(item: { quantidadePrevista: number | null; quantidadeReal: number | null }) {
	if (item.quantidadeReal == null || !item.quantidadePrevista) return null;
	const diff = item.quantidadeReal / item.quantidadePrevista - 1;
	const label =
		Math.abs(diff) < 0.0005 ? "OK" : `${diff > 0 ? "+" : "−"}${Math.abs(diff * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
	return { label, tone: Math.abs(diff) <= 0.02 ? ("ok" as const) : ("warn" as const) };
}

const VALIDITY_UNIT_LABELS: Record<NonNullable<TProductionOutputRow["prazoValidadeMedida"]>, [string, string]> = {
	MINUTOS: ["minuto", "minutos"],
	HORAS: ["hora", "horas"],
	DIAS: ["dia", "dias"],
	SEMANAS: ["semana", "semanas"],
	MESES: ["mês", "meses"],
	ANOS: ["ano", "anos"],
};

export function formatValidity(output: TProductionOutputRow) {
	if (output.dataValidade) return `vence ${formatDayMonth(output.dataValidade)}`;
	if (!output.prazoValidadeMedida || output.prazoValidadeValor == null) return null;
	const [singular, plural] = VALIDITY_UNIT_LABELS[output.prazoValidadeMedida];
	return `validade ${formatQuantityNumber(output.prazoValidadeValor, "")} ${output.prazoValidadeValor === 1 ? singular : plural}`;
}

/**
 * Soma quantidades por unidade — volume nunca soma unidades diferentes (plano, decisão 6). A primeira
 * unidade é a da saída principal (a primeira saída).
 */
export function sumByUnit(items: { unit: string; value: number }[]) {
	const totals = new Map<string, number>();
	for (const item of items) totals.set(item.unit, (totals.get(item.unit) ?? 0) + item.value);
	return [...totals.entries()].map(([unit, value]) => ({ unit, value }));
}

export function formatUnitTotals(totals: { unit: string; value: number }[]) {
	if (totals.length === 0) return "—";
	return totals.map((total) => formatQuantity(total.value, total.unit)).join(" + ");
}

/** Ordem da pesagem: entradas (reincorporado primeiro, como vem da API) e depois saídas. */
export function getWeighOrder(production: Pick<TProductionById, "entradas" | "saidas">) {
	return [
		...production.entradas.map((item) => ({ kind: "ENTRADA" as const, id: item.id, weighed: isWeighed(item) })),
		...production.saidas.map((item) => ({ kind: "SAIDA" as const, id: item.id, weighed: isWeighed(item) })),
	];
}

export function findWeighItem(production: Pick<TProductionById, "entradas" | "saidas">, key: TWeighItemKey | null) {
	if (!key) return null;
	if (key.kind === "ENTRADA") {
		const item = production.entradas.find((entry) => entry.id === key.id);
		return item ? { kind: "ENTRADA" as const, item } : null;
	}
	const item = production.saidas.find((entry) => entry.id === key.id);
	return item ? { kind: "SAIDA" as const, item } : null;
}

/** Próximo item não conferido depois do atual; sem nenhum, fica onde está. */
export function getNextWeighKey(order: ReturnType<typeof getWeighOrder>, current: TWeighItemKey) {
	const index = order.findIndex((entry) => entry.kind === current.kind && entry.id === current.id);
	const next = order.slice(index + 1).find((entry) => !entry.weighed);
	return next ? { kind: next.kind, id: next.id } : current;
}

export function hasPendingAfter(order: ReturnType<typeof getWeighOrder>, current: TWeighItemKey) {
	const index = order.findIndex((entry) => entry.kind === current.kind && entry.id === current.id);
	return order.slice(index + 1).some((entry) => !entry.weighed);
}

/** O que a conclusão exige e o que ela vai assumir — base do botão e da dica do cabeçalho. */
export function getCompletionReadiness(production: Pick<TProductionById, "entradas" | "saidas">) {
	const unweighedOutputs = production.saidas.filter((output) => !isWeighed(output)).length;
	const hasPositiveOutput = production.saidas.some((output) => (output.quantidadeReal ?? 0) > 0);
	const unweighedInputs = production.entradas.filter((input) => !isWeighed(input)).length;

	if (production.saidas.length === 0) return { ready: false, hint: "A produção não tem saídas para concluir." };
	if (unweighedOutputs > 0)
		return { ready: false, hint: production.saidas.length === 1 ? "Pese a saída para concluir." : "Pese as saídas para concluir." };
	if (!hasPositiveOutput) return { ready: false, hint: "Informe ao menos uma saída maior que zero para concluir." };
	if (unweighedInputs > 0)
		return {
			ready: true,
			hint:
				unweighedInputs === 1
					? "1 insumo não conferido será lançado com a quantidade prevista."
					: `${unweighedInputs} insumos não conferidos serão lançados com a quantidade prevista.`,
		};
	return { ready: true, hint: "Tudo conferido. Baixa os insumos e gera os lotes." };
}

/**
 * Modo de preparo escrito como lista numerada simples ("1. …" em cada linha) vira passos numerados;
 * qualquer outro markdown é renderizado como está.
 */
export function parseNumberedSteps(markdown: string) {
	const lines = markdown
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length === 0) return null;
	const pattern = /^\d+[.)]\s+(.*)$/;
	const steps: string[] = [];
	for (const line of lines) {
		const match = pattern.exec(line);
		if (!match) return null;
		steps.push(match[1]);
	}
	return steps;
}

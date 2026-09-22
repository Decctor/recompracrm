// Parte client-safe do resgate de recompensa: tipo do snapshot, chave de origem do item, o
// parser do rascunho e a matemática pura das linhas. Vive separada de sale-reward-redemption.ts
// porque aquele módulo importa o banco (loadChannelState) e é proibido em bundle de cliente —
// map-sale-to-sale-state.ts (página de edição, "use client") e os hooks de estado precisam
// apenas do que está aqui.

export const POS_REWARD_SALE_ITEM_ORIGIN = "POS-RESGATE-RECOMPENSA";

// Uma venda pode resgatar várias recompensas: uma LINHA por recompensa distinta, com
// `quantidade` para a mesma recompensa repetida ("dois cafés"). `recompensaId` é único dentro da
// venda — é a chave que correlaciona estado ↔ snapshot ↔ item ↔ linha do ledger.
//
// Snapshot carimbado pelo servidor em sales.rascunhoMetadados.recompensas (PDV) ou
// sales.rascunhoMetadados.shop.recompensas (loja digital). É a chave autoritativa lida pela
// confirmação de orçamento (via parseSaleRewardDraftSnapshots) — o blob enviado pelo cliente
// pode carregar o estado da UI em outra chave, mas nunca é lido para efeitos.
export type TSaleRewardDraftSnapshot = {
	recompensaId: string;
	programaId: string;
	titulo: string;
	// Débito de saldo POR UNIDADE, em moeda cashback (R$ ou pontos).
	valor: number;
	// Valor comercial POR UNIDADE (sempre R$).
	valorVenda: number;
	quantidade: number;
};

// Linha de resgate como o cliente a envia: só ids e quantidade; tudo que vira item/ledger é
// resolvido pelo servidor.
export type TSaleRewardRedemptionLineInput = {
	recompensaId: string;
	programaId?: string | null;
	quantidade?: number | null;
};

export const MAX_REWARD_REDEMPTION_LINES_PER_SALE = 20;
export const MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE = 99;

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseSnapshotObject(value: unknown): TSaleRewardDraftSnapshot | null {
	if (!isRecord(value)) return null;
	if (typeof value.recompensaId !== "string" || typeof value.programaId !== "string") return null;
	const quantidade =
		typeof value.quantidade === "number" && Number.isFinite(value.quantidade) && value.quantidade >= 1 ? Math.floor(value.quantidade) : 1;
	return {
		recompensaId: value.recompensaId,
		programaId: value.programaId,
		titulo: typeof value.titulo === "string" ? value.titulo : "",
		valor: typeof value.valor === "number" ? value.valor : 0,
		valorVenda: typeof value.valorVenda === "number" ? value.valorVenda : 0,
		quantidade,
	};
}

/**
 * Lê as chaves de recompensa de um container de metadados (raiz do PDV ou `shop` da loja).
 * `recompensas` (array, formato atual) tem precedência; `recompensa` (objeto, formato anterior
 * a múltiplas recompensas) é convertida em uma linha de quantidade 1. `recompensas: []` é uma
 * resposta válida ("nenhuma") e NÃO cai no legado — é assim que um PUT limpa o resgate.
 */
function readRewardSnapshotsFromContainer(container: unknown): TSaleRewardDraftSnapshot[] | null {
	if (!isRecord(container)) return null;
	if (Array.isArray(container.recompensas)) {
		return container.recompensas.map(parseSnapshotObject).filter((snapshot): snapshot is TSaleRewardDraftSnapshot => !!snapshot);
	}
	if (container.recompensas === null) return [];
	const legacy = parseSnapshotObject(container.recompensa);
	return legacy ? [legacy] : null;
}

/**
 * Lê os snapshots autoritativos de recompensa de um rascunho. O PDV grava em
 * `rascunhoMetadados.recompensas`; a loja digital grava o mesmo snapshot (carimbado pelo
 * servidor) dentro de `rascunhoMetadados.shop.recompensas` — sem a segunda leitura, um pedido
 * da loja confirmado pelo PDV entregaria o prêmio sem debitar o saldo. Rascunhos gravados
 * antes de múltiplas recompensas usam a chave singular `recompensa` e continuam legíveis.
 */
export function parseSaleRewardDraftSnapshots(rascunhoMetadados: unknown): TSaleRewardDraftSnapshot[] {
	if (!isRecord(rascunhoMetadados)) return [];
	const fromRoot = readRewardSnapshotsFromContainer(rascunhoMetadados);
	if (fromRoot && fromRoot.length > 0) return fromRoot;
	const fromShop = readRewardSnapshotsFromContainer(rascunhoMetadados.shop);
	if (fromShop && fromShop.length > 0) return fromShop;
	return [];
}

/**
 * Chaves a gravar no container de metadados quando o servidor carimba as recompensas: escreve
 * o formato atual e APAGA o legado, para nenhum leitor ver as duas formas ao mesmo tempo.
 */
export function buildRewardSnapshotsMetadataKeys(snapshots: TSaleRewardDraftSnapshot[]): {
	recompensas: TSaleRewardDraftSnapshot[];
	recompensa: null;
} {
	return { recompensas: snapshots, recompensa: null };
}

/**
 * Resolve o tri-estado da entrada de recompensas de um request, aceitando o campo plural
 * (`recompensasResgate`) e, por uma release, o singular anterior (`recompensaResgate`):
 * `undefined` = não altera; `[]`/`null` = remove todas; array = substitui.
 */
export function resolveRewardRedemptionLinesInput(input: {
	recompensasResgate?: TSaleRewardRedemptionLineInput[] | null;
	recompensaResgate?: TSaleRewardRedemptionLineInput | null;
}): TSaleRewardRedemptionLineInput[] | undefined {
	if (input.recompensasResgate !== undefined) return input.recompensasResgate ?? [];
	if (input.recompensaResgate !== undefined) return input.recompensaResgate ? [input.recompensaResgate] : [];
	return undefined;
}

export type TNormalizedRewardRedemptionLine = { recompensaId: string; programaId: string | null; quantidade: number };

/**
 * Normaliza e valida a forma das linhas (não o conteúdo, que exige o catálogo): quantidade
 * inteira ≥ 1, ids não repetidos (a mesma recompensa duas vezes é `quantidade: 2`, não duas
 * linhas — repetição é bug de estado do cliente e deve falhar alto, não ser fundida) e um
 * único programa entre as linhas que o informam.
 * Devolve `{ erro }` em vez de lançar para ser reutilizável no cliente.
 */
export function normalizeRewardRedemptionLines(
	lines: TSaleRewardRedemptionLineInput[],
): { linhas: TNormalizedRewardRedemptionLine[]; erro: null } | { linhas: null; erro: string } {
	if (lines.length > MAX_REWARD_REDEMPTION_LINES_PER_SALE) {
		return { linhas: null, erro: `Uma venda aceita no máximo ${MAX_REWARD_REDEMPTION_LINES_PER_SALE} recompensas distintas.` };
	}
	const seen = new Set<string>();
	const programIds = new Set<string>();
	const linhas: TNormalizedRewardRedemptionLine[] = [];
	for (const line of lines) {
		if (!line.recompensaId) return { linhas: null, erro: "ID da recompensa não informado." };
		if (seen.has(line.recompensaId)) {
			return { linhas: null, erro: "A mesma recompensa foi informada mais de uma vez. Use a quantidade para repeti-la." };
		}
		seen.add(line.recompensaId);
		const quantidade = line.quantidade ?? 1;
		if (!Number.isInteger(quantidade) || quantidade < 1) return { linhas: null, erro: "Quantidade da recompensa inválida." };
		if (quantidade > MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE) {
			return { linhas: null, erro: `Quantidade máxima por recompensa é ${MAX_REWARD_REDEMPTION_QUANTITY_PER_LINE}.` };
		}
		if (line.programaId) programIds.add(line.programaId);
		linhas.push({ recompensaId: line.recompensaId, programaId: line.programaId ?? null, quantidade });
	}
	if (programIds.size > 1) return { linhas: null, erro: "Todas as recompensas de uma venda precisam ser do mesmo programa de cashback." };
	return { linhas, erro: null };
}

/** Débito total de saldo (moeda cashback) de um conjunto de linhas. */
export function sumRewardRedemptionValue(lines: Array<{ valor: number; quantidade: number }>): number {
	return lines.reduce((sum, line) => sum + line.valor * line.quantidade, 0);
}

/** Valor comercial total (R$) de um conjunto de linhas. */
export function sumRewardRedemptionSaleValue(lines: Array<{ valorVenda: number; quantidade: number }>): number {
	return lines.reduce((sum, line) => sum + line.valorVenda * line.quantidade, 0);
}

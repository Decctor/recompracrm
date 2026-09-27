import type { TSalesChannelCatalogModeEnum } from "@/schemas/enums";
import { UNGROUPED_PRODUCTS_LABEL, type TChannelSettingNode, sortGroupsByChannelOrder } from "./sales-channels";

/**
 * Helpers puros da matriz de canais (aba "Canais" de Produtos): a grade edita TODOS os produtos ×
 * TODOS os canais de uma vez, e o que sai daqui é o mesmo patch esparso que o PUT unitário da
 * página do produto aceita — um nó por (produto, canal, variante), com os dois campos nulos
 * significando "volta a herdar".
 *
 * Nada aqui toca o banco nem o React: a rota, o state hook e os testes consomem as mesmas funções.
 */

/** Uma célula da matriz. Ausente do mapa = herda (sem linha esparsa). */
export type TMatrixCell = { disponivel: boolean | null; precoVenda: number | null };

export type TMatrixCellRow = {
	produtoId: string;
	canalVendaId: string;
	produtoVarianteId: string | null;
	disponivel: boolean | null;
	precoVenda: number | null;
};

// IDs são uuids, então ":" nunca aparece dentro de um segmento — a chave é reversível.
export function matrixNodeKey(produtoId: string, canalVendaId: string, produtoVarianteId: string | null | undefined) {
	return `${produtoId}:${canalVendaId}:${produtoVarianteId ?? ""}`;
}

export function parseMatrixNodeKey(key: string) {
	const [produtoId, canalVendaId, produtoVarianteId] = key.split(":");
	return { produtoId, canalVendaId, produtoVarianteId: produtoVarianteId || null };
}

/** Só guarda o que desvia: uma célula com os dois campos nulos não é override, é herança. */
export function isInheritingCell(cell: TMatrixCell | null | undefined) {
	return !cell || (cell.disponivel == null && cell.precoVenda == null);
}

export function buildMatrixCellMap(rows: TMatrixCellRow[]) {
	const cells = new Map<string, TMatrixCell>();
	for (const row of rows) {
		if (row.disponivel == null && row.precoVenda == null) continue;
		cells.set(matrixNodeKey(row.produtoId, row.canalVendaId, row.produtoVarianteId), { disponivel: row.disponivel, precoVenda: row.precoVenda });
	}
	return cells;
}

export type TMatrixProductPatch = { produtoId: string; settings: TChannelSettingNode[] };

/**
 * Diferença entre a matriz carregada e o rascunho, como patches esparsos por produto. Só nós que
 * mudaram entram: com centenas de produtos × canais, mandar a matriz inteira seria inútil e o PUT
 * já tem semântica de patch. Um nó que voltou a herdar vai com os dois campos nulos (remoção).
 */
export function diffMatrixCells({ baseline, draft }: { baseline: Map<string, TMatrixCell>; draft: Map<string, TMatrixCell> }): TMatrixProductPatch[] {
	const byProduct = new Map<string, TChannelSettingNode[]>();
	const keys = new Set([...baseline.keys(), ...draft.keys()]);

	for (const key of keys) {
		const before = baseline.get(key);
		const after = draft.get(key);
		const beforeInherits = isInheritingCell(before);
		const afterInherits = isInheritingCell(after);
		if (beforeInherits && afterInherits) continue;
		if (!beforeInherits && !afterInherits && before!.disponivel === after!.disponivel && before!.precoVenda === after!.precoVenda) continue;

		const { produtoId, canalVendaId, produtoVarianteId } = parseMatrixNodeKey(key);
		const node: TChannelSettingNode = {
			canalVendaId,
			produtoVarianteId,
			disponivel: after?.disponivel ?? null,
			precoVenda: after?.precoVenda ?? null,
		};
		const bucket = byProduct.get(produtoId);
		if (bucket) bucket.push(node);
		else byProduct.set(produtoId, [node]);
	}

	return [...byProduct.entries()].map(([produtoId, settings]) => ({ produtoId, settings }));
}

export type TMatrixChannelDraft = { catalogoModo: TSalesChannelCatalogModeEnum; ordemGrupos: string[] };
export type TMatrixChannelPatch = { canalVendaId: string; catalogoModo?: TSalesChannelCatalogModeEnum; ordemGrupos?: string[] };

function sameOrder(a: string[], b: string[]) {
	return a.length === b.length && a.every((item, index) => item === b[index]);
}

/** Canais cujo modo ou ordem de grupos mudou no rascunho; campos iguais ficam de fora do patch. */
export function diffMatrixChannels({
	baseline,
	draft,
}: {
	baseline: Map<string, TMatrixChannelDraft>;
	draft: Map<string, TMatrixChannelDraft>;
}): TMatrixChannelPatch[] {
	const patches: TMatrixChannelPatch[] = [];
	for (const [canalVendaId, after] of draft) {
		const before = baseline.get(canalVendaId);
		if (!before) continue;
		const patch: TMatrixChannelPatch = { canalVendaId };
		if (before.catalogoModo !== after.catalogoModo) patch.catalogoModo = after.catalogoModo;
		if (!sameOrder(before.ordemGrupos, after.ordemGrupos)) patch.ordemGrupos = after.ordemGrupos;
		if (patch.catalogoModo !== undefined || patch.ordemGrupos !== undefined) patches.push(patch);
	}
	return patches;
}

/**
 * Quais produtos do patch tocaram um canal iFood. O push para o iFood custa uma resolução de
 * contexto por merchant e uma leitura do vínculo por produto: disparar para todos os produtos
 * editados por causa de uma mudança no PDV seria desperdício e ruído de status.
 */
export function productsTouchingChannels(patches: TMatrixProductPatch[], channelIds: Set<string>) {
	return patches.filter((patch) => patch.settings.some((node) => channelIds.has(node.canalVendaId))).map((patch) => patch.produtoId);
}

export type TMatrixGroup<TProduct> = {
	/** Nome do grupo no cadastro; string vazia para os produtos sem grupo. */
	key: string;
	label: string;
	ungrouped: boolean;
	produtos: TProduct[];
};

/** Grupos não vazios presentes nos produtos, na ordem em que o canal os exibe. */
export function displayedMatrixGroups<TProduct extends { grupo: string }>(produtos: TProduct[], ordemGrupos: string[]) {
	const present = [...new Set(produtos.map((produto) => produto.grupo).filter((grupo) => grupo.trim().length > 0))];
	return sortGroupsByChannelOrder(present, ordemGrupos);
}

/**
 * Painéis da grade: um por grupo, na ordem curada do canal focado, produtos em ordem alfabética
 * dentro de cada um. O balde dos sem grupo vai por último — o mesmo "Outros" da loja pública.
 * Genérico sobre o produto porque a vitrine e a matriz carregam shapes diferentes.
 */
export function groupMatrixProducts<TProduct extends { grupo: string; nome: string }>(
	produtos: TProduct[],
	ordemGrupos: string[],
): TMatrixGroup<TProduct>[] {
	const byGroup = new Map<string, TProduct[]>();
	for (const produto of produtos) {
		const key = produto.grupo.trim().length > 0 ? produto.grupo : "";
		const bucket = byGroup.get(key);
		if (bucket) bucket.push(produto);
		else byGroup.set(key, [produto]);
	}

	const sortByName = (items: TProduct[]) => items.toSorted((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
	const groups: TMatrixGroup<TProduct>[] = displayedMatrixGroups(produtos, ordemGrupos).map((key) => ({
		key,
		label: key,
		ungrouped: false,
		produtos: sortByName(byGroup.get(key) ?? []),
	}));

	const ungrouped = byGroup.get("");
	if (ungrouped?.length) groups.push({ key: "", label: UNGROUPED_PRODUCTS_LABEL, ungrouped: true, produtos: sortByName(ungrouped) });

	return groups;
}

/**
 * Move um grupo na ordem EXIBIDA e devolve a ordem inteira: a cauda alfabética vira ordem explícita
 * no momento em que alguém decide mexer nela (mesma regra da vitrine). Devolve null quando não há
 * movimento possível.
 */
export function moveGroupInOrder({ displayed, grupo, direction }: { displayed: string[]; grupo: string; direction: "up" | "down" }) {
	const index = displayed.indexOf(grupo);
	const target = direction === "up" ? index - 1 : index + 1;
	if (index < 0 || target < 0 || target >= displayed.length) return null;
	const next = [...displayed];
	next[index] = displayed[target];
	next[target] = grupo;
	return next;
}

/** Renomear para um grupo existente funde os dois: a posição que vale é a primeira. */
export function renameGroupInOrder(ordemGrupos: string[], grupoAtual: string, grupoNovo: string) {
	return ordemGrupos.map((grupo) => (grupo === grupoAtual ? grupoNovo : grupo)).filter((grupo, index, list) => list.indexOf(grupo) === index);
}

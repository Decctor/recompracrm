import type { TCatalogLinkDivergence, TCatalogLinkSnapshot } from "@/schemas/catalog-links";
import type { TIfoodOptionDTO } from "../catalog-types";
import type { TCatalogLinkEntity } from "@/services/drizzle/schema";
import type { TObservedIfoodOption } from "../option-state";
import type { TAddOnOptionNode } from "./add-ons";

/** Um save pode editar o mesmo grupo compartilhado em vários produtos/variantes. Desanexar não altera o grupo. */
export function editedAddOnGroupIds(addOns: readonly { id?: string | null; deletar?: boolean | null }[]) {
	return [...new Set(addOns.filter((addOn) => addOn.id && !addOn.deletar).map((addOn) => addOn.id!))];
}

export function hasManagedDrift(link: Pick<TCatalogLinkEntity, "divergencias">, field: TCatalogLinkDivergence["campo"]) {
	return link.divergencias?.some((divergence) => divergence.campo === field && divergence.sincronizado) ?? false;
}

export function confirmedOptionSnapshot(
	link: Pick<TCatalogLinkEntity, "sincronizar" | "ultimoSnapshot">,
	option: TAddOnOptionNode | undefined,
	availabilityOnly: boolean,
): TCatalogLinkSnapshot {
	const snapshot = { ...link.ultimoSnapshot };
	if (!option) return { ...snapshot, disponivel: false };
	if (!availabilityOnly && link.sincronizar.nome) snapshot.nome = option.nome;
	if (!availabilityOnly && link.sincronizar.preco) snapshot.preco = option.precoDelta;
	if (link.sincronizar.disponibilidade) snapshot.disponivel = option.disponivel;
	return snapshot;
}

export function hasPotentialOptionDuplicate(option: Pick<TAddOnOptionNode, "nome" | "codigo">, remoteOptions: TIfoodOptionDTO[]) {
	const normalize = (value: string | null) => (value ?? "").trim().toLocaleLowerCase("pt-BR");
	return remoteOptions.some(
		(remote) => normalize(remote.nome) === normalize(option.nome) || (!!option.codigo?.trim() && remote.codigoExterno?.trim() === option.codigo.trim()),
	);
}

export function shouldPushOptionAvailability({
	link,
	option,
	observed,
}: {
	link: Pick<TCatalogLinkEntity, "sincronizar" | "ultimoSnapshot" | "divergencias" | "status">;
	option: Pick<TAddOnOptionNode, "disponivel"> | undefined;
	observed?: TObservedIfoodOption;
}) {
	if (option && !link.sincronizar.disponibilidade) return false;
	const desired = option?.disponivel ?? false;
	// Sem leitura confirmada não confiamos no snapshot de uma opção excluída.
	if (observed) return observed.disponivel !== desired;
	return !option || link.status === "ERRO" || link.ultimoSnapshot?.disponivel !== desired || hasManagedDrift(link, "disponibilidade");
}

export function computeOptionDivergences({
	link,
	option,
	observed,
}: {
	link: Pick<TCatalogLinkEntity, "sincronizar">;
	option: TAddOnOptionNode | undefined;
	observed: TObservedIfoodOption;
}): TCatalogLinkDivergence[] {
	const differences: TCatalogLinkDivergence[] = [];
	if (option) {
		const normalize = (value: string | null) => (value ?? "").trim().toLocaleLowerCase("pt-BR");
		if (normalize(option.nome) !== normalize(observed.nome))
			differences.push({ campo: "nome", valorInterno: option.nome, valorExterno: observed.nome, sincronizado: link.sincronizar.nome });
		if (observed.preco == null || Math.abs(observed.preco - option.precoDelta) > 0.010000001)
			differences.push({ campo: "preco", valorInterno: option.precoDelta, valorExterno: observed.preco, sincronizado: link.sincronizar.preco });
	}
	const desired = option?.disponivel ?? false;
	if (observed.disponivel !== desired)
		differences.push({
			campo: "disponibilidade",
			valorInterno: desired,
			valorExterno: observed.disponivel,
			sincronizado: !option || link.sincronizar.disponibilidade,
		});
	return differences;
}

/** Não casa por nome: uma opção remota pode pertencer a outro grupo local ou ser uma duplicata. */
export function findUnlinkedAvailableOptions(
	options: { id: string | null; nome: string | null }[],
	linkedIds: ReadonlySet<string>,
	observed: ReadonlyMap<string, TObservedIfoodOption>,
) {
	return options.filter((option) => option.id && !linkedIds.has(option.id) && observed.get(option.id)?.disponivel === true);
}

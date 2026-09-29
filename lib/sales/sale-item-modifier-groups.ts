/**
 * Agrupa os adicionais de um item de venda pelo grupo de adicionais de origem ("Escolha seu
 * gelato", "Escolha até 3 adicionais"). Sem o grupo, "Nutella" e "Pistache Supremo" aparecem
 * como uma lista solta e quem prepara não sabe qual escolha responde a qual pergunta.
 *
 * O grupo vem do cadastro atual (`opcao → produtoAddOn`): o modificador não guarda snapshot do
 * grupo. Adicional sem opção vinculada (opção apagada, ou não resolvida na importação) cai no
 * grupo `null`, sempre por último.
 */

export type TSaleItemModifierGroup<T> = {
	grupo: string | null;
	adicionais: T[];
};

// Os nomes de grupo costumam ser perguntas ao cliente ("Escolha seu gelato:"); como rótulo,
// o ":" final duplicaria o separador de quem renderiza.
export function formatModifierGroupName(name: string | null | undefined) {
	const trimmed = name?.trim().replace(/:+$/, "").trim();
	return trimmed ? trimmed : null;
}

export function groupSaleItemModifiers<T>(modifiers: T[], getGroupName: (modifier: T) => string | null | undefined): TSaleItemModifierGroup<T>[] {
	const groups = new Map<string | null, T[]>();
	for (const modifier of modifiers) {
		const groupName = formatModifierGroupName(getGroupName(modifier));
		const group = groups.get(groupName);
		if (group) group.push(modifier);
		else groups.set(groupName, [modifier]);
	}
	return Array.from(groups, ([grupo, adicionais]) => ({ grupo, adicionais })).sort((left, right) => {
		if (left.grupo === null) return right.grupo === null ? 0 : 1;
		return right.grupo === null ? -1 : 0;
	});
}

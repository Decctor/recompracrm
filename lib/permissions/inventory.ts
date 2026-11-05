import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Permissões de estoque com a semântica de ausência resolvida. Antes da chave `estoque`, o módulo
 * acompanhava `empresa.visualizar` (era o que liberava a capability `inventory`), então a ausência
 * cai para ela. Não leia `permissoes.estoque` diretamente fora deste arquivo.
 *
 * - `movimentar`: lançamentos manuais de entrada/saída e baixas avulsas;
 * - `ajustar`: operações que corrigem o saldo sem documento de origem — recontagem e descarte de lote.
 */
export type TInventoryPermissions = {
	visualizar: boolean;
	movimentar: boolean;
	ajustar: boolean;
};

export function resolveInventoryPermissions(permissoes: TOrganizationMemberPermissions | null | undefined): TInventoryPermissions {
	if (!permissoes) return { visualizar: false, movimentar: false, ajustar: false };
	const legacy = permissoes.empresa.visualizar ?? false;
	const estoque = permissoes.estoque;
	return {
		visualizar: estoque?.visualizar ?? legacy,
		movimentar: estoque?.movimentar ?? legacy,
		ajustar: estoque?.ajustar ?? legacy,
	};
}

export function canViewInventory(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveInventoryPermissions(permissoes).visualizar;
}

export function canMoveInventory(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveInventoryPermissions(permissoes).movimentar;
}

export function canAdjustInventory(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveInventoryPermissions(permissoes).ajustar;
}

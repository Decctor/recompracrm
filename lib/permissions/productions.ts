import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Permissões de produção (ordens e fichas técnicas) com a semântica de ausência resolvida. Antes da
 * chave `producao`, o módulo acompanhava `empresa.visualizar` (era o que liberava a capability
 * `production`), então a ausência cai para ela. Não leia `permissoes.producao` diretamente fora deste arquivo.
 *
 * `concluir` é separado de `editar` porque é o passo que consome insumos e dá entrada no estoque.
 */
export type TProductionPermissions = {
	visualizar: boolean;
	criar: boolean;
	editar: boolean;
	excluir: boolean;
	concluir: boolean;
};

export function resolveProductionPermissions(permissoes: TOrganizationMemberPermissions | null | undefined): TProductionPermissions {
	if (!permissoes) return { visualizar: false, criar: false, editar: false, excluir: false, concluir: false };
	const legacy = permissoes.empresa.visualizar ?? false;
	const producao = permissoes.producao;
	return {
		visualizar: producao?.visualizar ?? legacy,
		criar: producao?.criar ?? legacy,
		editar: producao?.editar ?? legacy,
		excluir: producao?.excluir ?? legacy,
		concluir: producao?.concluir ?? legacy,
	};
}

export function canViewProductions(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveProductionPermissions(permissoes).visualizar;
}

export function canCreateProductions(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveProductionPermissions(permissoes).criar;
}

export function canEditProductions(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveProductionPermissions(permissoes).editar;
}

export function canDeleteProductions(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveProductionPermissions(permissoes).excluir;
}

export function canCompleteProductions(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveProductionPermissions(permissoes).concluir;
}

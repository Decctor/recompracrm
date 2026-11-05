import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Permissões do catálogo de produtos com a semântica de ausência resolvida. Antes da chave
 * `produtos`, o catálogo era aberto a todo membro (a capability e as rotas não pediam nada), então a
 * ausência preserva esse acesso. Não leia `permissoes.produtos` diretamente fora deste arquivo.
 *
 * `visualizar` governa o catálogo como módulo (tela, estatísticas, exportação). A busca de produtos
 * que o PDV, as vendas e as compras usam para montar documentos não depende dela.
 */
export type TProductPermissions = {
	visualizar: boolean;
	criar: boolean;
	editar: boolean;
	alterarPrecos: boolean;
};

export function resolveProductPermissions(permissoes: TOrganizationMemberPermissions | null | undefined): TProductPermissions {
	if (!permissoes) return { visualizar: false, criar: false, editar: false, alterarPrecos: false };
	const produtos = permissoes.produtos;
	return {
		visualizar: produtos?.visualizar ?? true,
		criar: produtos?.criar ?? true,
		editar: produtos?.editar ?? true,
		alterarPrecos: produtos?.alterarPrecos ?? true,
	};
}

export function canViewProducts(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveProductPermissions(permissoes).visualizar;
}

export function canCreateProducts(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveProductPermissions(permissoes).criar;
}

export function canEditProducts(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveProductPermissions(permissoes).editar;
}

/** Alterar preço de venda (produto, variante, adicional e preço por canal). */
export function canChangeProductPrices(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveProductPermissions(permissoes).alterarPrecos;
}

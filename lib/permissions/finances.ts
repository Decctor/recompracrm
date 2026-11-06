import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Regras de autorização do módulo financeiro. Usa a chave nova `financeiro.*`; se o membro
 * ainda não tiver a chave (JSONB antigo), cai para `empresa.visualizar`/`empresa.editar` —
 * antes das permissões granulares, o acesso ao financeiro acompanhava a gestão da empresa.
 * Não leia `permissoes.financeiro` diretamente fora deste arquivo: a semântica de ausência mora aqui.
 */
export function canViewFinances(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	if (!permissoes) return false;
	return permissoes.financeiro?.visualizar ?? permissoes.empresa.visualizar ?? false;
}

export function canCreateFinances(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	if (!permissoes) return false;
	return permissoes.financeiro?.criar ?? permissoes.empresa.editar ?? false;
}

export function canEditFinances(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	if (!permissoes) return false;
	return permissoes.financeiro?.editar ?? permissoes.empresa.editar ?? false;
}

export function canReconcileFinances(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	if (!permissoes) return false;
	return permissoes.financeiro?.conciliar ?? permissoes.empresa.editar ?? false;
}

/**
 * Liberar fiado: definir quais clientes compram fiado e com que limite, e aprovar no balcão um
 * fiado fora da regra. Sem a chave, acompanha quem edita o financeiro — o mesmo grupo que já
 * recebia e dava baixa em fiados.
 */
export function canGrantStoreCredit(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	if (!permissoes) return false;
	return permissoes.financeiro?.liberarFiado ?? canEditFinances(permissoes);
}

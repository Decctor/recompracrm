import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Permissões do programa de cashback com a semântica de ausência resolvida. Antes da chave
 * `cashback`, todo membro de uma organização com o recurso via e configurava o programa; ver segue
 * liberado e configurar (regras, prêmios) cai em `empresa.editar`. Não leia `permissoes.cashback`
 * diretamente fora deste arquivo.
 *
 * O resgate não passa por aqui: na venda exige `vendas.criar`; no ponto de interação, a senha do
 * operador (que muitas vezes nem é membro).
 */
export type TCashbackPermissions = {
	visualizar: boolean;
	configurar: boolean;
};

export function resolveCashbackPermissions(permissoes: TOrganizationMemberPermissions | null | undefined): TCashbackPermissions {
	if (!permissoes) return { visualizar: false, configurar: false };
	const cashback = permissoes.cashback;
	return {
		visualizar: cashback?.visualizar ?? true,
		configurar: cashback?.configurar ?? permissoes.empresa.editar,
	};
}

export function canViewCashback(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveCashbackPermissions(permissoes).visualizar;
}

export function canConfigureCashback(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveCashbackPermissions(permissoes).configurar;
}

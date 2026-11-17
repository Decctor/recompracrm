import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Permissões de metas. As chaves sempre existiram em `resultados` (obrigatórias no schema), mas até
 * aqui só escondiam botões: as rotas não as conferiam. Centralizadas aqui para que tela e servidor
 * leiam o mesmo lugar.
 */
export type TGoalPermissions = {
	visualizar: boolean;
	criar: boolean;
	editar: boolean;
	excluir: boolean;
};

export function resolveGoalPermissions(permissoes: TOrganizationMemberPermissions | null | undefined): TGoalPermissions {
	if (!permissoes) return { visualizar: false, criar: false, editar: false, excluir: false };
	const resultados = permissoes.resultados;
	return {
		visualizar: resultados.visualizarMetas,
		criar: resultados.criarMetas,
		editar: resultados.editarMetas,
		excluir: resultados.excluirMetas,
	};
}

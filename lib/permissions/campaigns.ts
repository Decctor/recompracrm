import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Permissões de campanhas com a semântica de ausência resolvida. Antes da chave `campanhas`, todo
 * membro de uma organização com o recurso fazia tudo; ver e montar campanhas seguem liberados, e
 * colocar no ar (o que dispara mensagens para a base) cai em `empresa.editar`. Não leia
 * `permissoes.campanhas` diretamente fora deste arquivo.
 *
 * `ativar` vale para tudo o que muda o que sai para os clientes: criar já ativa, ativar ou pausar,
 * editar uma campanha que está ativa e reexecutar disparos ou interações. `editar` cobre rascunhos,
 * campanhas inativas e o disparo de teste. Cupons e públicos seguem o recurso de campanhas.
 */
export type TCampaignPermissions = {
	visualizar: boolean;
	editar: boolean;
	ativar: boolean;
};

export function resolveCampaignPermissions(permissoes: TOrganizationMemberPermissions | null | undefined): TCampaignPermissions {
	if (!permissoes) return { visualizar: false, editar: false, ativar: false };
	const campanhas = permissoes.campanhas;
	return {
		visualizar: campanhas?.visualizar ?? true,
		editar: campanhas?.editar ?? true,
		ativar: campanhas?.ativar ?? permissoes.empresa.editar,
	};
}

export function canViewCampaigns(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveCampaignPermissions(permissoes).visualizar;
}

export function canEditCampaigns(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveCampaignPermissions(permissoes).editar;
}

export function canActivateCampaigns(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveCampaignPermissions(permissoes).ativar;
}

/**
 * Uma escrita de campanha precisa de `ativar` quando a campanha está ativa antes ou depois dela:
 * ativar, pausar e mexer numa campanha no ar mudam o que os clientes recebem.
 */
export function campaignWriteRequiresActivation({ wasActive, willBeActive }: { wasActive: boolean; willBeActive: boolean }): boolean {
	return wasActive || willBeActive;
}

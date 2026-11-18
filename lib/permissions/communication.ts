import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Permissões de comunicação (templates de mensagem e kits visuais) com a semântica de ausência
 * resolvida. Antes da chave `comunicacao`, todo membro via, editava e enviava templates para a Meta;
 * ver e editar seguem liberados, e publicar (enviar para aprovação e sincronizar com a Meta) cai em
 * `empresa.editar`. Não leia `permissoes.comunicacao` diretamente fora deste arquivo.
 */
export type TCommunicationPermissions = {
	visualizar: boolean;
	editar: boolean;
	publicar: boolean;
};

export function resolveCommunicationPermissions(permissoes: TOrganizationMemberPermissions | null | undefined): TCommunicationPermissions {
	if (!permissoes) return { visualizar: false, editar: false, publicar: false };
	const comunicacao = permissoes.comunicacao;
	return {
		visualizar: comunicacao?.visualizar ?? true,
		editar: comunicacao?.editar ?? true,
		publicar: comunicacao?.publicar ?? permissoes.empresa.editar,
	};
}

export function canViewCommunication(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveCommunicationPermissions(permissoes).visualizar;
}

export function canEditCommunication(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveCommunicationPermissions(permissoes).editar;
}

export function canPublishCommunication(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveCommunicationPermissions(permissoes).publicar;
}

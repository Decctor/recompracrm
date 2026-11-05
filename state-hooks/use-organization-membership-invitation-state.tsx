import type { TOrganizationMembershipInvitationState } from "@/schemas/organizations";
import { useCallback, useState } from "react";

export function useOrganizationMembershipInvitationState() {
	const initialState: TOrganizationMembershipInvitationState = {
		invitation: {
			nome: "",
			email: "",
			telefone: null,
			vendedorAplicavel: false,
			permissoes: {
				empresa: {
					visualizar: true,
					editar: false,
				},
				resultados: {
					visualizar: true,
					visualizarSensiveis: true,
					criarMetas: true,
					visualizarMetas: true,
					editarMetas: true,
					excluirMetas: true,
					escopo: [],
				},
				usuarios: {
					visualizar: true,
					criar: true,
					editar: true,
					excluir: true,
				},
				vendas: {
					visualizar: true,
					criar: false,
					editar: false,
					excluir: false,
					// Igual ao comportamento legado (liberado, sem teto); o gestor restringe a partir daí.
					descontos: {
						aplicar: true,
						limiteTipo: null,
						limiteValor: null,
						aprovar: false,
					},
					operarCaixa: false,
					movimentarCaixa: false,
					conferirCaixa: false,
					configurar: false,
				},
				compras: {
					visualizar: true,
					criar: false,
					editar: false,
					excluir: false,
				},
				atendimentos: {
					visualizar: true,
					iniciar: true,
					responder: true,
					finalizar: true,
				},
				fiscal: {
					visualizar: false,
					configurar: false,
					emitir: false,
					cancelar: false,
				},
				produtos: {
					visualizar: true,
					criar: false,
					editar: false,
					alterarPrecos: false,
				},
				estoque: {
					visualizar: true,
					movimentar: false,
					ajustar: false,
				},
				producao: {
					visualizar: true,
					criar: false,
					editar: false,
					excluir: false,
					concluir: false,
				},
			},
		},
	};

	const [state, setState] = useState<TOrganizationMembershipInvitationState>(initialState);

	const updateInvitation = useCallback((invitation: Partial<TOrganizationMembershipInvitationState["invitation"]>) => {
		setState((prev) => ({
			...prev,
			invitation: { ...prev.invitation, ...invitation },
		}));
	}, []);

	const updateInvitationPermissions = useCallback((permissoes: Partial<TOrganizationMembershipInvitationState["invitation"]["permissoes"]>) => {
		setState((prev) => ({
			...prev,
			invitation: { ...prev.invitation, permissoes: { ...prev.invitation.permissoes, ...permissoes } },
		}));
	}, []);

	const resetState = useCallback(() => {
		setState(initialState);
	}, [initialState]);

	const redefineState = useCallback((state: TOrganizationMembershipInvitationState) => {
		setState(state);
	}, []);

	return {
		state,
		updateInvitation,
		updateInvitationPermissions,
		resetState,
		redefineState,
	};
}
export type TUseOrganizationMembershipInvitationState = ReturnType<typeof useOrganizationMembershipInvitationState>;

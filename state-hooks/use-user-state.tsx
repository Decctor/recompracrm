import { OrganizationMemberSchema } from "@/schemas/organizations";
import { UserSchema } from "@/schemas/users";
import { useCallback, useState } from "react";
import z from "zod";

const UserStateSchema = z.object({
	user: UserSchema.omit({ dataInsercao: true, admin: true }),
	membership: OrganizationMemberSchema.omit({ organizacaoId: true, usuarioId: true, dataInsercao: true }),
	avatarHolder: z.object({
		file: z.instanceof(File).optional().nullable(),
		previewUrl: z
			.string({
				invalid_type_error: "Tipo não válido para a url do preview do avatar do usuário.",
			})
			.optional()
			.nullable(),
	}),
});
type TUserState = z.infer<typeof UserStateSchema>;

export function useUserState() {
	const initialState: TUserState = {
		user: {
			nome: "",
			email: "",
			telefone: "",
			avatarUrl: "",
			dataNascimento: null,
			usuario: "",
			senha: "",
		},
		avatarHolder: {
			file: null,
			previewUrl: null,
		},
		membership: {
			usuarioVendedorId: "",
			permissoes: {
				empresa: {
					visualizar: true,
					editar: false,
				},
				resultados: {
					visualizar: false,
					visualizarSensiveis: false,
					criarMetas: false,
					visualizarMetas: false,
					editarMetas: false,
					excluirMetas: false,
					escopo: [],
				},
				usuarios: {
					visualizar: false,
					criar: false,
					editar: false,
					excluir: false,
				},
				vendas: {
					visualizar: false,
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
					visualizar: false,
					criar: false,
					editar: false,
					excluir: false,
				},
				atendimentos: {
					visualizar: false,
					iniciar: false,
					responder: false,
					finalizar: false,
				},
				fiscal: {
					visualizar: false,
					configurar: false,
					emitir: false,
					cancelar: false,
				},
				produtos: {
					visualizar: false,
					criar: false,
					editar: false,
					alterarPrecos: false,
				},
				estoque: {
					visualizar: false,
					movimentar: false,
					ajustar: false,
				},
				producao: {
					visualizar: false,
					criar: false,
					editar: false,
					excluir: false,
					concluir: false,
				},
			},
		},
	};
	const [state, setState] = useState<TUserState>(initialState);

	const updateUser = useCallback((user: Partial<TUserState["user"]>) => {
		setState((prev) => ({
			...prev,
			user: {
				...prev.user,
				...user,
			},
		}));
	}, []);

	const updateAvatarHolder = useCallback((avatarHolder: Partial<TUserState["avatarHolder"]>) => {
		setState((prev) => ({
			...prev,
			avatarHolder: {
				...prev.avatarHolder,
				...avatarHolder,
			},
		}));
	}, []);

	const updateMembership = useCallback((membership: Partial<TUserState["membership"]>) => {
		setState((prev) => ({
			...prev,
			membership: {
				...prev.membership,
				...membership,
			},
		}));
	}, []);
	const updateMembershipPermissions = useCallback((permissoes: Partial<TUserState["membership"]["permissoes"]>) => {
		setState((prev) => ({
			...prev,
			membership: {
				...prev.membership,
				permissoes: {
					...prev.membership.permissoes,
					...permissoes,
				},
			},
		}));
	}, []);
	const resetState = useCallback(() => {
		setState(initialState);
	}, []);

	const redefineState = useCallback((state: TUserState) => {
		setState(state);
	}, []);
	return {
		state,
		updateUser,
		updateMembership,
		updateAvatarHolder,
		updateMembershipPermissions,
		resetState,
		redefineState,
	};
}
export type TUseUserState = ReturnType<typeof useUserState>;

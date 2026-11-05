import {
	DEFAULT_ORGANIZATION_CONFIGURATION_DEFAULTS,
	DEFAULT_ORGANIZATION_CONFIGURATION_PREFERENCES,
	DEFAULT_ORGANIZATION_CONFIGURATION_RESOURCES,
} from "@/config";
import { OrganizationSchema } from "@/schemas/organizations";
import { NewUserSchema } from "@/schemas/users";
import { useCallback, useState } from "react";
import z from "zod";

const OrganizationStateSchema = z.object({
	organization: OrganizationSchema.omit({ dataInsercao: true }),
	logoHolder: z.object({
		file: z.instanceof(File).optional().nullable(),
		previewUrl: z
			.string({
				invalid_type_error: "Tipo não válido para a url do preview do logo da organização.",
			})
			.optional()
			.nullable(),
	}),
	mainUser: NewUserSchema.omit({ dataInsercao: true, organizacaoId: true }),
	mainUserAvatarHolder: z.object({
		file: z.instanceof(File).optional().nullable(),
		previewUrl: z
			.string({
				invalid_type_error: "Tipo não válido para a url do preview do avatar do usuário.",
			})
			.optional()
			.nullable(),
	}),
	productsExcelFile: z.instanceof(File).optional().nullable(),
});

export type TOrganizationState = z.infer<typeof OrganizationStateSchema>;

export function useOrganizationState() {
	const initialState: TOrganizationState = {
		organization: {
			nome: "",
			cnpj: "",
			slug: "",
			logoUrl: null,
			telefone: null,
			email: null,
			localizacaoCep: null,
			localizacaoEstado: null,
			localizacaoCidade: null,
			localizacaoBairro: null,
			localizacaoLogradouro: null,
			localizacaoNumero: null,
			localizacaoComplemento: null,
			configuracao: {
				recursos: DEFAULT_ORGANIZATION_CONFIGURATION_RESOURCES,
				preferencias: DEFAULT_ORGANIZATION_CONFIGURATION_PREFERENCES,
				defaults: DEFAULT_ORGANIZATION_CONFIGURATION_DEFAULTS,
			},
			origemDadosPadrao: "RECEPTOR",
			autorId: "",
			integracaoTipo: null,
			integracaoConfiguracao: null,
			dadosViaERP: false,
			dadosViaPDI: true,
			dadosViaIntegracoes: false,
			periodoTesteInicio: null,
			periodoTesteFim: null,
			consultoriaAtiva: false,
			baselineInicio: null,
			dataOnboardingConclusao: null,
			fiscalProvedor: null,
			fiscalEmissaoAutomatica: false,
			fiscalConfiguracao: null,
			corPrimaria: null,
			corPrimariaForeground: null,
			corSecundaria: null,
			corSecundariaForeground: null,
			poiConfirmacaoValorObrigatoria: false,
			integracaoDataUltimaSincronizacao: null,
		},
		logoHolder: {
			file: null,
			previewUrl: null,
		},
		mainUser: {
			nome: "",
			email: "",
			telefone: "",
			avatarUrl: "",
			dataNascimento: null,
			usuario: "",
			senha: "",
			admin: false,
			permissoes: {
				vendas: {
					visualizar: true,
					criar: true,
					editar: true,
					excluir: true,
					operarCaixa: true,
					movimentarCaixa: true,
					conferirCaixa: true,
					configurar: true,
				},
				compras: {
					visualizar: true,
					criar: true,
					editar: true,
					excluir: true,
				},
				empresa: {
					visualizar: true,
					editar: true,
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
				atendimentos: {
					visualizar: true,
					iniciar: true,
					responder: true,
					finalizar: true,
				},
				fiscal: {
					visualizar: true,
					configurar: true,
					emitir: true,
					cancelar: true,
				},
				produtos: {
					visualizar: true,
					criar: true,
					editar: true,
					alterarPrecos: true,
				},
				estoque: {
					visualizar: true,
					movimentar: true,
					ajustar: true,
				},
				producao: {
					visualizar: true,
					criar: true,
					editar: true,
					excluir: true,
					concluir: true,
				},
			},
		},
		mainUserAvatarHolder: {
			file: null,
			previewUrl: null,
		},
		productsExcelFile: null,
	};

	const [state, setState] = useState<TOrganizationState>(initialState);

	const updateOrganization = useCallback((organization: Partial<TOrganizationState["organization"]>) => {
		setState((prev) => ({
			...prev,
			organization: {
				...prev.organization,
				...organization,
			},
		}));
	}, []);

	const updateLogoHolder = useCallback((logoHolder: Partial<TOrganizationState["logoHolder"]>) => {
		setState((prev) => ({
			...prev,
			logoHolder: {
				...prev.logoHolder,
				...logoHolder,
			},
		}));
	}, []);

	const updateMainUser = useCallback((mainUser: Partial<TOrganizationState["mainUser"]>) => {
		setState((prev) => ({
			...prev,
			mainUser: {
				...prev.mainUser,
				...mainUser,
			},
		}));
	}, []);

	const updateMainUserAvatarHolder = useCallback((avatarHolder: Partial<TOrganizationState["mainUserAvatarHolder"]>) => {
		setState((prev) => ({
			...prev,
			mainUserAvatarHolder: {
				...prev.mainUserAvatarHolder,
				...avatarHolder,
			},
		}));
	}, []);

	const updateMainUserPermissions = useCallback((permissoes: Partial<TOrganizationState["mainUser"]["permissoes"]>) => {
		setState((prev) => ({
			...prev,
			mainUser: {
				...prev.mainUser,
				permissoes: { ...prev.mainUser.permissoes, ...permissoes },
			},
		}));
	}, []);

	const updateProductsExcelFile = useCallback((file: File | null) => {
		setState((prev) => ({
			...prev,
			productsExcelFile: file,
		}));
	}, []);

	const resetState = useCallback(() => {
		setState(initialState);
	}, []);

	const redefineState = useCallback((state: TOrganizationState) => {
		setState(state);
	}, []);

	return {
		state,
		updateOrganization,
		updateLogoHolder,
		updateMainUser,
		updateMainUserAvatarHolder,
		updateMainUserPermissions,
		updateProductsExcelFile,
		resetState,
		redefineState,
	};
}

export type TUseOrganizationState = ReturnType<typeof useOrganizationState>;

const OrganizationBaseStateSchema = z.object({
	organization: OrganizationSchema.omit({ dataInsercao: true }),
});
export type TOrganizationBaseState = z.infer<typeof OrganizationBaseStateSchema>;

export function useOrganizationBaseState() {
	const initialState: TOrganizationBaseState = {
		organization: {
			nome: "",
			cnpj: "",
			slug: "",
			logoUrl: null,
			telefone: null,
			email: null,
			localizacaoCep: null,
			localizacaoEstado: null,
			localizacaoCidade: null,
			localizacaoBairro: null,
			localizacaoLogradouro: null,
			localizacaoNumero: null,
			localizacaoComplemento: null,
			configuracao: {
				recursos: DEFAULT_ORGANIZATION_CONFIGURATION_RESOURCES,
				preferencias: DEFAULT_ORGANIZATION_CONFIGURATION_PREFERENCES,
				defaults: DEFAULT_ORGANIZATION_CONFIGURATION_DEFAULTS,
			},
			origemDadosPadrao: "RECEPTOR",
			autorId: "",
			integracaoTipo: null,
			integracaoConfiguracao: null,
			dadosViaERP: false,
			dadosViaPDI: true,
			dadosViaIntegracoes: false,
			periodoTesteInicio: null,
			periodoTesteFim: null,
			consultoriaAtiva: false,
			baselineInicio: null,
			dataOnboardingConclusao: null,
			fiscalProvedor: null,
			fiscalEmissaoAutomatica: false,
			fiscalConfiguracao: null,
			corPrimaria: null,
			corPrimariaForeground: null,
			corSecundaria: null,
			corSecundariaForeground: null,
			poiConfirmacaoValorObrigatoria: false,
			integracaoDataUltimaSincronizacao: null,
		},
	};
	const [state, setState] = useState<TOrganizationBaseState>(initialState);

	const updateOrganization = useCallback((organization: Partial<TOrganizationBaseState["organization"]>) => {
		setState((prev) => ({
			...prev,
			organization: {
				...prev.organization,
				...organization,
			},
		}));
	}, []);

	const updateConfigurationResources = useCallback(
		<K extends keyof TOrganizationBaseState["organization"]["configuracao"]["recursos"]>(
			resourceKey: K,
			resource: Partial<TOrganizationBaseState["organization"]["configuracao"]["recursos"][K]>,
		) => {
			setState((prev) => ({
				...prev,
				organization: {
					...prev.organization,
					configuracao: {
						...prev.organization.configuracao,
						recursos: {
							...prev.organization.configuracao.recursos,
							[resourceKey]: {
								...prev.organization.configuracao.recursos[resourceKey],
								...resource,
							},
						},
					},
				},
			}));
		},
		[],
	);

	const updateConfigurationPreferencias = useCallback(
		(preferencias: Partial<TOrganizationBaseState["organization"]["configuracao"]["preferencias"]>) => {
			setState((prev) => ({
				...prev,
				organization: {
					...prev.organization,
					configuracao: {
						...prev.organization.configuracao,
						preferencias: {
							...prev.organization.configuracao.preferencias,
							...preferencias,
						},
					},
				},
			}));
		},
		[],
	);

	const resetState = useCallback(() => {
		setState(initialState);
	}, []);

	const redefineState = useCallback((state: TOrganizationBaseState) => {
		setState(state);
	}, []);

	return {
		state,
		updateOrganization,
		updateConfigurationResources,
		updateConfigurationPreferencias,
		resetState,
		redefineState,
	};
}

export type TUseOrganizationBaseState = ReturnType<typeof useOrganizationBaseState>;

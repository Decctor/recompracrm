"use client";

import { OrganizationFiscalConfigSchema } from "@/schemas/fiscal";
import { z } from "zod";
import { useCallback, useState } from "react";

const InternalFiscalSettingsStateSchema = z.object({
	fiscalProvedor: z.enum(["MANUAL", "SPEDY"]).default("SPEDY"),
	fiscalEmissaoAutomatica: z.boolean().default(false),
	fiscalConfiguracao: OrganizationFiscalConfigSchema,
});

type TInternalFiscalSettingsState = z.infer<typeof InternalFiscalSettingsStateSchema>;

const DEFAULT_FISCAL_CONFIG = OrganizationFiscalConfigSchema.parse({
	nomeRazaoSocial: "",
	cpfCnpj: "",
	endereco: {
		logradouro: "",
		numero: "",
		bairro: "",
		codigoMunicipio: "",
		cidade: "",
		uf: "",
		cep: "",
	},
	regimeTributario: 1,
});

function normalizeFiscalConfig(config?: Partial<TInternalFiscalSettingsState["fiscalConfiguracao"]> | null) {
	const existingConfig = config ?? {};
	const existingSpedy = (existingConfig.spedy ?? {}) as Partial<TInternalFiscalSettingsState["fiscalConfiguracao"]["spedy"]>;

	return OrganizationFiscalConfigSchema.parse({
		...DEFAULT_FISCAL_CONFIG,
		...existingConfig,
		endereco: {
			...DEFAULT_FISCAL_CONFIG.endereco,
			...existingConfig.endereco,
		},
		spedy: {
			...DEFAULT_FISCAL_CONFIG.spedy,
			...existingSpedy,
			certificado: {
				...DEFAULT_FISCAL_CONFIG.spedy.certificado,
				...existingSpedy.certificado,
			},
			nfce: {
				...DEFAULT_FISCAL_CONFIG.spedy.nfce,
				...existingSpedy.nfce,
			},
			nfe: {
				...DEFAULT_FISCAL_CONFIG.spedy.nfe,
				...existingSpedy.nfe,
			},
		},
		operacaoPadraoPorTipo: {
			...DEFAULT_FISCAL_CONFIG.operacaoPadraoPorTipo,
			...existingConfig.operacaoPadraoPorTipo,
		},
		dfe: {
			...DEFAULT_FISCAL_CONFIG.dfe,
			...existingConfig.dfe,
		},
		entrada: {
			...DEFAULT_FISCAL_CONFIG.entrada,
			...existingConfig.entrada,
		},
		emissaoAutomatica: {
			...DEFAULT_FISCAL_CONFIG.emissaoAutomatica,
			...existingConfig.emissaoAutomatica,
			excecoes: {
				...DEFAULT_FISCAL_CONFIG.emissaoAutomatica.excecoes,
				...existingConfig.emissaoAutomatica?.excecoes,
			},
		},
		emissaoManual: {
			...DEFAULT_FISCAL_CONFIG.emissaoManual,
			...existingConfig.emissaoManual,
			classificacaoPresencialExcepcional: {
				...DEFAULT_FISCAL_CONFIG.emissaoManual.classificacaoPresencialExcepcional,
				...existingConfig.emissaoManual?.classificacaoPresencialExcepcional,
			},
		},
	});
}

export function useInternalFiscalSettingsState({ initialState }: { initialState: Partial<TInternalFiscalSettingsState> }) {
	const [state, setState] = useState<TInternalFiscalSettingsState>({
		fiscalProvedor: initialState.fiscalProvedor ?? "SPEDY",
		fiscalEmissaoAutomatica: initialState.fiscalEmissaoAutomatica ?? false,
		fiscalConfiguracao: normalizeFiscalConfig(initialState.fiscalConfiguracao),
	});

	const updateSettings = useCallback((patch: Partial<TInternalFiscalSettingsState>) => {
		setState((prev) => ({ ...prev, ...patch }));
	}, []);

	const updateFiscalConfig = useCallback((patch: Partial<TInternalFiscalSettingsState["fiscalConfiguracao"]>) => {
		setState((prev) => ({
			...prev,
			fiscalConfiguracao: normalizeFiscalConfig({
				...prev.fiscalConfiguracao,
				...patch,
			}),
		}));
	}, []);

	const redefineState = useCallback((nextState: Partial<TInternalFiscalSettingsState>) => {
		setState((prev) => ({
			...prev,
			...nextState,
			fiscalConfiguracao: nextState.fiscalConfiguracao !== undefined ? normalizeFiscalConfig(nextState.fiscalConfiguracao) : prev.fiscalConfiguracao,
		}));
	}, []);

	const resetState = useCallback(() => {
		setState({
			fiscalProvedor: initialState.fiscalProvedor ?? "SPEDY",
			fiscalEmissaoAutomatica: initialState.fiscalEmissaoAutomatica ?? false,
			fiscalConfiguracao: normalizeFiscalConfig(initialState.fiscalConfiguracao),
		});
	}, [initialState.fiscalConfiguracao, initialState.fiscalEmissaoAutomatica, initialState.fiscalProvedor]);

	return {
		state,
		updateSettings,
		updateFiscalConfig,
		redefineState,
		resetState,
	};
}

export type TUseInternalFiscalSettingsState = ReturnType<typeof useInternalFiscalSettingsState>;

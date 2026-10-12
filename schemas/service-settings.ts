import { z } from "zod";
import { PublicTabOpeningModeEnum, TabCustomerOrderingModeEnum, TabIdentificationModeEnum } from "./enums";

// ============================================================================
// SERVICE SETTINGS (Configuracao de atendimento — mesas/comandas)
// Politicas persistidas; a UI oferece presets. Ver docs/tabs/implementation-plan.md.
// ============================================================================

export const ServiceSettingsConfigurationSchema = z
	.object({
		pontos: z
			.object({
				habilitados: z.boolean({
					required_error: "Habilitacao de pontos de atendimento não informada.",
					invalid_type_error: "Tipo não valido para habilitacao de pontos de atendimento.",
				}),
			})
			.default({ habilitados: false }),
		contas: z
			.object({
				habilitadas: z.boolean({
					required_error: "Habilitacao de contas não informada.",
					invalid_type_error: "Tipo não valido para habilitacao de contas.",
				}),
				identificacao: TabIdentificationModeEnum.default("AUTOMATICA"),
				pontoObrigatorio: z.boolean({ invalid_type_error: "Tipo não valido para obrigatoriedade de ponto." }).default(false),
				maxAbertasPorPonto: z
					.number({ invalid_type_error: "Tipo não valido para o limite de contas abertas por ponto." })
					.int()
					.positive()
					.nullable()
					.default(null),
			})
			.default({ habilitadas: false, identificacao: "AUTOMATICA", pontoObrigatorio: false, maxAbertasPorPonto: null }),
		aberturaPublica: PublicTabOpeningModeEnum.default("DESABILITADA"),
		pedidosCliente: TabCustomerOrderingModeEnum.default("DESABILITADO"),
	})
	.strict();
export type TServiceSettingsConfiguration = z.infer<typeof ServiceSettingsConfigurationSchema>;

export const DEFAULT_SERVICE_SETTINGS_CONFIGURATION: TServiceSettingsConfiguration = {
	pontos: { habilitados: false },
	contas: { habilitadas: false, identificacao: "AUTOMATICA", pontoObrigatorio: false, maxAbertasPorPonto: null },
	aberturaPublica: "DESABILITADA",
	pedidosCliente: "DESABILITADO",
};

// Presets exibidos na UI. Persistimos as politicas resultantes, nunca o preset.
export const SERVICE_SETTINGS_PRESETS = {
	BALCAO: DEFAULT_SERVICE_SETTINGS_CONFIGURATION,
	SOMENTE_MESAS: {
		pontos: { habilitados: true },
		contas: { habilitadas: true, identificacao: "AUTOMATICA", pontoObrigatorio: true, maxAbertasPorPonto: 1 },
		aberturaPublica: "DESABILITADA",
		pedidosCliente: "DESABILITADO",
	},
	SOMENTE_COMANDAS: {
		pontos: { habilitados: false },
		contas: { habilitadas: true, identificacao: "CODIGO_MANUAL", pontoObrigatorio: false, maxAbertasPorPonto: null },
		aberturaPublica: "DESABILITADA",
		pedidosCliente: "DESABILITADO",
	},
	MESAS_E_COMANDAS: {
		pontos: { habilitados: true },
		contas: { habilitadas: true, identificacao: "CODIGO_MANUAL", pontoObrigatorio: true, maxAbertasPorPonto: null },
		aberturaPublica: "DESABILITADA",
		pedidosCliente: "DESABILITADO",
	},
} as const satisfies Record<string, TServiceSettingsConfiguration>;
export type TServiceSettingsPreset = keyof typeof SERVICE_SETTINGS_PRESETS;

/** A conta e identificada por um codigo de comanda (livre ou cadastrada) — e nao pela mesa. */
export function tabUsesCode(contas: TServiceSettingsConfiguration["contas"]) {
	return contas.identificacao === "CODIGO_MANUAL" || contas.identificacao === "COMANDA_CADASTRADA";
}

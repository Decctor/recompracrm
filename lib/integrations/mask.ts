import type { TOrganizationMemberPermissions } from "@/schemas/organizations";
import type { TIntegrationConfig } from "@/schemas/integrations";

const MASK = "********";

/**
 * Remove/oculta segredos de uma configuração de integração antes de devolvê-la ao cliente.
 * Nunca exponha `accessToken` cru na API. Preserva o resto da config (adAccountName, currency, etc.)
 * para a UI conseguir renderizar o estado da conexão.
 */
export function maskIntegrationConfig(config: TIntegrationConfig | null | undefined): TIntegrationConfig | null {
	if (!config) return null;
	switch (config.tipo) {
		case "META_ADS":
			return {
				...config,
				accessToken: config.accessToken ? MASK : config.accessToken,
			};
		case "ONLINE-SOFTWARE":
			return { ...config, token: config.token ? MASK : config.token };
		case "CARDAPIO-WEB":
			return { ...config, apiKey: config.apiKey ? MASK : config.apiKey };
		case "NUVEM-SHOP":
			return { ...config, accessToken: config.accessToken ? MASK : config.accessToken };
		case "IFOOD":
		case "BLING":
			return {
				...config,
				accessToken: config.accessToken ? MASK : config.accessToken,
				refreshToken: config.refreshToken ? MASK : config.refreshToken,
			};
		case "ERP-FLEX":
		case "SQL-VIEWS":
			return { ...config, password: config.password ? MASK : config.password };
		default:
			return config;
	}
}

/**
 * Regra de autorização para gerenciar integrações. Usa a nova chave `integracoes.gerenciar`; se o
 * membro ainda não tiver a chave (JSONB antigo), cai para `empresa.editar` — integrações são
 * configuração de nível empresa, então quem edita a empresa já tinha esse poder.
 */
export function canManageIntegrations(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	if (!permissoes) return false;
	return permissoes.integracoes?.gerenciar ?? permissoes.empresa.editar ?? false;
}

/**
 * Regra de autorização para visualizar integrações (dashboards, status). Fallback análogo para
 * `empresa.visualizar`.
 */
export function canViewIntegrations(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	if (!permissoes) return false;
	return permissoes.integracoes?.visualizar ?? permissoes.empresa.visualizar ?? false;
}

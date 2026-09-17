"use client";

import ConfigureIntegration from "@/components/Modals/Integrations/ConfigureIntegration";
import { IfoodSandboxIntegrationMenu } from "@/components/Settings/IfoodSandboxIntegrationMenu";
import type { TAuthSessionIntegrationSummary, TAuthUserSession } from "@/lib/authentication/types";
import { canManageIntegrations } from "@/lib/integrations/mask";
import { DATA_SOURCE_INTEGRATION_PROVIDERS } from "@/lib/integrations/data-source-providers";
import type { TDataSourceIntegrationTipoEnum } from "@/schemas/enums";
import { DataSourceIntegrationTipoEnum } from "@/schemas/enums";
import { useCallback, useState } from "react";

type TCredentialIntegrationId = "ONLINE-SOFTWARE" | "CARDAPIO-WEB" | "ERP-FLEX";

export function isDataSourceIntegrationSummary(integration: TAuthSessionIntegrationSummary) {
	return DataSourceIntegrationTipoEnum.options.includes(integration.tipo as TDataSourceIntegrationTipoEnum);
}

type UseDataSourceIntegrationConnectOptions = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

export function useDataSourceIntegrationConnect({ membership }: UseDataSourceIntegrationConnectOptions) {
	const canManage = canManageIntegrations(membership.permissoes);

	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [selectedIntegrationId, setSelectedIntegrationId] = useState<TCredentialIntegrationId | null>(null);
	const [ifoodMenuIsOpen, setIfoodMenuIsOpen] = useState(false);
	const [reconnectIntegrationId, setReconnectIntegrationId] = useState<string | null>(null);

	const activeConnections = membership.organizacao.integracoes.filter(
		(integration) => integration.ativo && isDataSourceIntegrationSummary(integration),
	);

	const connect = useCallback(
		(integrationId: TDataSourceIntegrationTipoEnum) => {
			if (!canManage) return;
			const integration = DATA_SOURCE_INTEGRATION_PROVIDERS.find((item) => item.id === integrationId);
			if (integration?.authUrl) {
				window.location.href = integration.authUrl;
				return;
			}
			if (integrationId === "IFOOD") {
				setReconnectIntegrationId(null);
				setIfoodMenuIsOpen(true);
				return;
			}
			if (integrationId === "ONLINE-SOFTWARE" || integrationId === "CARDAPIO-WEB" || integrationId === "ERP-FLEX") {
				setReconnectIntegrationId(null);
				setSelectedIntegrationId(integrationId);
				setIsMenuOpen(true);
			}
		},
		[canManage],
	);

	const reconnect = useCallback(
		(connection: TAuthSessionIntegrationSummary) => {
			if (!canManage) return;
			if (connection.tipo === "BLING") {
				window.location.href = `/api/integrations/bling/auth?reconnectIntegrationId=${connection.id}`;
				return;
			}
			if (connection.tipo === "NUVEM-SHOP") {
				window.location.href = "/api/integrations/nuvemshop/auth";
				return;
			}
			if (connection.tipo === "IFOOD") {
				setReconnectIntegrationId(connection.id);
				setIfoodMenuIsOpen(true);
				return;
			}
			if (connection.tipo === "ONLINE-SOFTWARE" || connection.tipo === "CARDAPIO-WEB" || connection.tipo === "ERP-FLEX") {
				setReconnectIntegrationId(connection.id);
				setSelectedIntegrationId(connection.tipo);
				setIsMenuOpen(true);
			}
		},
		[canManage],
	);

	const selectedTypeHasActiveConnection = selectedIntegrationId
		? activeConnections.some((integration) => integration.tipo === selectedIntegrationId)
		: false;

	const closeCredentialMenu = useCallback(() => {
		setIsMenuOpen(false);
		setReconnectIntegrationId(null);
	}, []);

	const closeIfoodMenu = useCallback(() => {
		setIfoodMenuIsOpen(false);
		setReconnectIntegrationId(null);
	}, []);

	const connectDialogs = (
		<>
			{isMenuOpen && selectedIntegrationId ? (
				<ConfigureIntegration
					integrationType={selectedIntegrationId}
					requireApelido={!reconnectIntegrationId && selectedTypeHasActiveConnection}
					reconnectIntegrationId={reconnectIntegrationId}
					closeMenu={closeCredentialMenu}
				/>
			) : null}
			{ifoodMenuIsOpen ? <IfoodSandboxIntegrationMenu closeMenu={closeIfoodMenu} /> : null}
		</>
	);

	return {
		connect,
		reconnect,
		canManage,
		activeConnections,
		connectDialogs,
	};
}

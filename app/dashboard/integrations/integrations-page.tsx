"use client";

import type { TAuthUserSession } from "@/lib/authentication/types";
import { DATA_SOURCE_INTEGRATION_PROVIDERS } from "@/lib/integrations/data-source-providers";
import { useDataSourceIntegrationConnect } from "@/lib/integrations/use-data-source-integration-connect";
import { IntegrationProviderCard, type TIntegrationProviderCardModel } from "./_components/IntegrationProviderCard";

const PROVIDERS: TIntegrationProviderCardModel[] = DATA_SOURCE_INTEGRATION_PROVIDERS.map((provider) => ({
	id: provider.id,
	nome: provider.nome,
	descricao:
		provider.id === "IFOOD"
			? "Sincronize pedidos e clientes automaticamente e gerencie sua loja no iFood: status, pausas, horários de funcionamento e catálogo de produtos."
			: provider.descricao,
	logo: provider.logo,
	brandColor: provider.brandColor,
	buttonText: provider.buttonText,
	brandClassName: provider.brandClassName,
	hubHref: provider.hubHref,
}));

type IntegrationsPageProps = {
	sessionUser: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};

export default function IntegrationsPage({ sessionUser: _sessionUser, membership }: IntegrationsPageProps) {
	const { connect, canManage, connectDialogs } = useDataSourceIntegrationConnect({ membership });

	return (
		<div className="flex h-full w-full flex-col gap-3 p-2 lg:p-4">
			<div className="flex w-full flex-col border-b pb-4">
				<h1 className="text-xl font-semibold tracking-tight">Integrações</h1>
				<p className="text-sm text-muted-foreground">Conecte e gerencie as integrações da sua organização com plataformas externas.</p>
			</div>

			<div className="flex w-full flex-wrap items-stretch gap-x-6 gap-y-4">
				{PROVIDERS.map((provider) => {
					const isConnected = membership.organizacao.integracoes.some(
						(integration) => integration.ativo && integration.tipo === provider.id,
					);

					return (
						<IntegrationProviderCard
							key={provider.id}
							provider={provider}
							isConnected={isConnected}
							canManage={canManage}
							onConnect={() => connect(provider.id)}
						/>
					);
				})}
			</div>

			{connectDialogs}
		</div>
	);
}

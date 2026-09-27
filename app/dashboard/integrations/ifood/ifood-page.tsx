"use client";

import LoadingComponent from "@/components/Layouts/LoadingComponent";
import IntegrationErpSettings from "@/components/Modals/Integrations/IntegrationErpSettings";
import { Button } from "@/components/ui/button";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { canManageIntegrations, canViewIntegrations } from "@/lib/integrations/mask";
import { useIfoodMerchants } from "@/lib/queries/ifood";
import IfoodLogo from "@/utils/images/integrations/ifood-logo.png";
import { RefreshCcw, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { IfoodCatalogEntrySection } from "./_module/catalog/IfoodCatalogEntrySection";
import { IfoodConnectMenu } from "./_module/connect/IfoodConnectMenu";
import { IfoodOrdersSection } from "./_module/orders/IfoodOrdersSection";
import { IfoodStoreSection } from "./_module/overview/IfoodStoreSection";
import { IfoodConnectionGate } from "./_module/shared/IfoodConnectionGate";
import { MerchantSelector } from "./_module/shared/MerchantSelector";
import { IfoodInterruptionsSection } from "./_module/status/IfoodInterruptionsSection";
import { IfoodOpeningHoursSection } from "./_module/status/IfoodOpeningHoursSection";

type IntegrationsIFoodPageProps = {
	sessionUser: TAuthUserSession["user"];
	membership: NonNullable<TAuthUserSession["membership"]>;
};

export default function IntegrationsIFoodPage({ sessionUser: _sessionUser, membership }: IntegrationsIFoodPageProps) {
	const activeIfoodConnections = membership.organizacao.integracoes.filter((integration) => integration.tipo === "IFOOD" && integration.ativo);
	const isConnected = activeIfoodConnections.length > 0;
	const canManage = canManageIntegrations(membership.permissoes);

	const canView = canViewIntegrations(membership.permissoes);
	const merchantsQuery = useIfoodMerchants({ enabled: isConnected });
	const merchants = merchantsQuery.data ?? [];
	const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
	const [settingsIsOpen, setSettingsIsOpen] = useState(false);
	const [reconnectIntegrationId, setReconnectIntegrationId] = useState<string | null>(null);

	useEffect(() => {
		if (!selectedMerchantId && merchants.length > 0) setSelectedMerchantId(merchants[0].id);
	}, [merchants, selectedMerchantId]);

	return (
		<div className="flex h-full w-full flex-col gap-3 p-2 lg:p-4">
			<div className="flex w-full flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<div className="relative h-10 w-10 overflow-hidden rounded-lg">
						<Image src={IfoodLogo} alt="iFood" fill className="object-contain" />
					</div>
					<div className="space-y-0.5">
						<h1 className="text-xl font-semibold tracking-tight">iFood</h1>
						<p className="text-sm text-muted-foreground">Gerencie o status, os horários e o catálogo da sua loja no iFood.</p>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{canManage
						? activeIfoodConnections.map((connection, index) => (
								<Button key={connection.id} variant="outline" size="sm" onClick={() => setReconnectIntegrationId(connection.id)}>
									<RefreshCcw className="h-4 w-4" />
									{activeIfoodConnections.length === 1 ? "RECONECTAR IFOOD" : `RECONECTAR ${connection.apelido ?? `CONEXÃO ${index + 1}`}`}
								</Button>
							))
						: null}
					{isConnected && canView ? (
						<Button variant="outline" size="sm" onClick={() => setSettingsIsOpen(true)}>
							<SlidersHorizontal className="h-4 w-4" />
							EFEITOS NO ERP
						</Button>
					) : null}
					<MerchantSelector merchants={merchants} selectedMerchantId={selectedMerchantId} onSelect={setSelectedMerchantId} />
				</div>
			</div>

			{settingsIsOpen ? <IntegrationErpSettings canManage={canManage} closeMenu={() => setSettingsIsOpen(false)} /> : null}
			{reconnectIntegrationId ? (
				<IfoodConnectMenu reconnectIntegrationId={reconnectIntegrationId} closeMenu={() => setReconnectIntegrationId(null)} />
			) : null}

			<IfoodConnectionGate
				isConnected={isConnected}
				error={merchantsQuery.error}
				canManage={canManage}
				reconnectIntegrationId={activeIfoodConnections.length === 1 ? activeIfoodConnections[0].id : null}
			>
				{merchantsQuery.isLoading ? (
					<LoadingComponent />
				) : (
					<div className="flex w-full flex-col gap-6 py-3">
						<IfoodStoreSection merchantId={selectedMerchantId} />
						<IfoodInterruptionsSection merchantId={selectedMerchantId} canManage={canManage} />
						<IfoodOpeningHoursSection merchantId={selectedMerchantId} canManage={canManage} />
						<IfoodOrdersSection canManage={canManage} />
						<IfoodCatalogEntrySection merchantId={selectedMerchantId} />
					</div>
				)}
			</IfoodConnectionGate>
		</div>
	);
}

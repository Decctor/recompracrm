"use client";
import "./mock-api";
import AppHeader from "@/components/Layouts/HeaderApp";
import { OrgColorsProvider } from "@/components/Providers/OrgColorsProvider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import { DEMO_SESSION } from "./fixtures/session";
import { SCREENS } from "./screens";

/**
 * Monta a tela pedida dentro da mesma moldura do layout do dashboard (app/dashboard/layout.tsx),
 * depois de trocar a URL para a rota real: o título e o ícone do cabeçalho saem do caminho, e os
 * parâmetros de busca (aba, filtros) são lidos pela própria página.
 */
export default function ScreensPreview({ screen }: { screen: string }) {
	const definition = SCREENS[screen];
	const [ready, setReady] = useState(false);
	useEffect(() => {
		if (!definition) return;
		window.history.replaceState(null, "", definition.path);
		setReady(true);
	}, [definition]);

	if (!definition) return <p className="p-6">Tela desconhecida. Use ?screen= com uma de: {Object.keys(SCREENS).join(", ")}</p>;
	if (!ready) return null;
	const organization = DEMO_SESSION.membership.organizacao;
	return (
		<SidebarProvider className="font-outfit">
			<SidebarInset className="min-w-0">
				<div className="flex min-h-full w-full flex-col gap-3 p-3 sm:p-6" data-content-studio-ready="true">
					<OrgColorsProvider
						corPrimaria={organization.corPrimaria}
						corPrimariaForeground={organization.corPrimariaForeground}
						corSecundaria={organization.corSecundaria}
						corSecundariaForeground={organization.corSecundariaForeground}
					>
						<AppHeader session={{ user: DEMO_SESSION.user, membership: DEMO_SESSION.membership }} />
						{definition.render()}
					</OrgColorsProvider>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

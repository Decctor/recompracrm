"use client";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import WhatsappConnectionsPills from "@/components/WhatsappConnections/ConnectionsPills";
import { canAccessDashboardCapability } from "@/lib/access/capabilities";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { cn } from "@/lib/utils";
import { LayoutDashboard } from "lucide-react";
import { useMemo } from "react";
import { Headline } from "./_hub/headline";
import { resolveDashboardWidgets, type TDashboardWidget, type TDashboardWidgetProps } from "./_hub/registry";

type DashboardPageProps = {
	user: TAuthUserSession["user"];
	userOrg: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	membership: NonNullable<TAuthUserSession["membership"]>;
	/** Ids de vendedor do escopo de resultados do membro; `null` = sem escopo (organização inteira). */
	scopeSellersIds: string[] | null;
};

const todayLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

/**
 * Casa única do dashboard: pendências que exigem ação e o pulso do dia, só no que o membro enxerga.
 * A análise profunda vive em cada módulo (Vendas > Resultados, Financeiro > Visão geral, Campanhas).
 */
export function DashboardPage({ user, userOrg, membership, scopeSellersIds }: DashboardPageProps) {
	const capabilityContext = useMemo(() => ({ organization: userOrg, permissions: membership.permissoes }), [userOrg, membership.permissoes]);
	const widgets = useMemo(
		() => resolveDashboardWidgets({ ...capabilityContext, sellerId: membership.usuarioVendedorId ?? null }),
		[capabilityContext, membership.usuarioVendedorId],
	);
	const canViewSales = canAccessDashboardCapability("salesResults", capabilityContext);
	const canViewGoals = canAccessDashboardCapability("goals", capabilityContext);
	const hasContent = widgets.length > 0 || canViewSales;
	const pendencias = widgets.filter((widget) => widget.kind === "pendencia");
	const pulso = widgets.filter((widget) => widget.kind === "pulso");

	const widgetProps: TDashboardWidgetProps = {
		scopeSellersIds,
		sellerId: membership.usuarioVendedorId ?? null,
		canViewSensitive: membership.permissoes.resultados.visualizarSensiveis,
	};

	const firstName = user.nome?.trim().split(/\s+/)[0] ?? "";

	return (
		<div className="flex w-full flex-col gap-4 p-1">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col">
					<h1 className="font-black text-2xl tracking-tight">{firstName ? `Olá, ${firstName}` : "Dashboard"}</h1>
					<p className="text-sm text-muted-foreground first-letter:uppercase">{todayLabel}</p>
				</div>
				<div className="self-end shrink-0">
					<WhatsappConnectionsPills />
				</div>
			</div>

			{!hasContent ? (
				<Empty className="justify-center bg-muted/25 py-12">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<LayoutDashboard className="text-muted-foreground" strokeWidth={1.5} aria-hidden />
						</EmptyMedia>
						<EmptyTitle className="text-sm font-semibold tracking-tight">Nada para acompanhar aqui</EmptyTitle>
						<EmptyDescription className="max-w-[320px] text-xs leading-relaxed">
							Seu acesso ainda não inclui nenhuma área com pendências ou números. Use o menu lateral para navegar.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<>
					<Headline canViewSales={canViewSales} canViewGoals={canViewGoals} canCreateGoals={membership.permissoes.resultados.criarMetas} />
					<WidgetSection title="Pendências" widgets={pendencias} widgetProps={widgetProps} />
					<WidgetSection title="Resumo do dia" widgets={pulso} widgetProps={widgetProps} />
				</>
			)}
		</div>
	);
}

type WidgetSectionProps = {
	title: string;
	widgets: TDashboardWidget[];
	widgetProps: TDashboardWidgetProps;
};

function WidgetSection({ title, widgets, widgetProps }: WidgetSectionProps) {
	if (widgets.length === 0) return null;
	return (
		<section className="flex w-full flex-col gap-2">
			<h2 className="text-label text-muted-foreground">{title}</h2>
			{/* Linhas de altura fixa + fluxo denso: um widget "lista" ocupa duas linhas e os compactos preenchem ao redor. */}
			<div className="grid w-full auto-rows-[minmax(9.5rem,auto)] grid-flow-dense grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
				{widgets.map(({ id, size, Component }) => (
					<div key={id} className={cn("flex min-w-0", size === "lista" && "md:row-span-2", size === "largo" && "md:col-span-2 xl:col-span-3")}>
						<Component {...widgetProps} />
					</div>
				))}
			</div>
		</section>
	);
}

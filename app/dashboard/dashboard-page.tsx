"use client";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import WhatsappConnectionsPills from "@/components/WhatsappConnections/ConnectionsPills";
import { canAccessDashboardCapability } from "@/lib/access/capabilities";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { useRecentSegmentChanges } from "@/lib/queries/dashboard-hub";
import { LayoutDashboard } from "lucide-react";
import { useMemo, useState } from "react";
import { type HeroRisk, HeroBand } from "./_hub/hero-band";
import { type TDashboardTab, TabBar } from "./_hub/tab-bar";
import { OperationsTab } from "./_hub/tabs/operations-tab";
import { RelationshipTab } from "./_hub/tabs/relationship-tab";
import { TeamTab } from "./_hub/tabs/team-tab";
import { useOperationsPending } from "./_hub/use-operations-pending";

type DashboardPageProps = {
	user: TAuthUserSession["user"];
	userOrg: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	membership: NonNullable<TAuthUserSession["membership"]>;
	/** Ids de vendedor do escopo de resultados do membro; `null` = sem escopo (organização inteira). */
	scopeSellersIds: string[] | null;
};

const todayLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
const COOLING_WINDOW_DAYS = 7;

/**
 * Casa única do dashboard: a faixa de vendas do dia, sempre visível, e abaixo dela três leituras
 * que se alternam — o relacionamento, a operação e a equipe.
 *
 * A faixa não troca com a aba. Vendas, meta e o valor em risco são o que todo papel precisa ver
 * antes de escolher onde olhar; só o bloco de risco segue a aba, porque "o que está parado" quer
 * dizer clientes esfriando no Relacionamento e dinheiro travado na Operação.
 *
 * A análise profunda continua em cada módulo (Vendas > Resultados, Financeiro > Visão geral,
 * Campanhas > Estatísticas). O hub não ganha filtros.
 */
export function DashboardPage({ user, userOrg, membership, scopeSellersIds }: DashboardPageProps) {
	const context = useMemo(() => ({ organization: userOrg, permissions: membership.permissoes }), [userOrg, membership.permissoes]);

	const canViewSales = canAccessDashboardCapability("salesResults", context);
	const canViewGoals = canAccessDashboardCapability("goals", context);
	const hasErp = userOrg.configuracao.recursos.erp.acesso;
	// Equipe só faz sentido para quem enxerga resultados de mais de uma pessoa ou a rotina das carteiras.
	const canViewTeam = canViewSales || canAccessDashboardCapability("portfolios", context);

	const tabs = useMemo<TDashboardTab[]>(() => {
		const available: TDashboardTab[] = ["relacionamento"];
		if (hasErp) available.push("operacao");
		if (canViewTeam) available.push("equipe");
		return available;
	}, [hasErp, canViewTeam]);

	const [tab, setTab] = useState<TDashboardTab>("relacionamento");
	// Uma aba pode sumir entre renderizações (a organização perde o ERP, a permissão muda): cair de
	// volta para Relacionamento é sempre válido, porque ela existe para toda organização.
	const activeTab = tabs.includes(tab) ? tab : "relacionamento";

	const cooling = useRecentSegmentChanges({ days: COOLING_WINDOW_DAYS });
	const operations = useOperationsPending(context);

	const risk: HeroRisk | null =
		activeTab === "operacao"
			? operations.valorParado > 0 || operations.isPending
				? {
						value: formatToMoney(operations.valorParado),
						label: `parados em ${formatDecimalPlaces(operations.totalItens)} ${operations.totalItens === 1 ? "pendência" : "pendências"}`,
						href: appRoutes.sales.orders(),
						isPending: operations.isPending,
					}
				: null
			: cooling.data && cooling.data.total > 0
				? {
						value: formatToMoney(cooling.data.valorEmRisco),
						label: `em risco: ${formatDecimalPlaces(cooling.data.total)} ${cooling.data.total === 1 ? "cliente esfriando" : "clientes esfriando"}`,
						href: appRoutes.customers.segments(),
					}
				: cooling.isPending
					? { value: "", label: "", href: appRoutes.customers.segments(), isPending: true }
					: null;

	const hint =
		activeTab === "operacao"
			? operations.valorParado > 0
				? `${formatToMoney(operations.valorParado)} parados`
				: undefined
			: activeTab === "relacionamento" && cooling.data && cooling.data.total > 0
				? `${formatDecimalPlaces(cooling.data.total)} clientes esfriaram nos últimos ${COOLING_WINDOW_DAYS} dias`
				: undefined;

	const badges = {
		operacao: operations.totalItens > 0 ? ({ count: operations.totalItens, tone: "destructive" } as const) : undefined,
	};

	const firstName = user.nome?.trim().split(/\s+/)[0] ?? "";
	// Sem resultados e sem ERP e sem carteiras, não sobra nenhuma leitura para montar o painel.
	const hasContent = canViewSales || tabs.length > 1 || canAccessDashboardCapability("customers", context);

	return (
		// `text-numeric` no painel inteiro: todo número daqui para baixo herda figuras alinhadas, sem
		// precisar repetir a classe em cada célula (ver o utilitário em `styles/globals.css`).
		<div className="text-numeric flex w-full flex-col gap-4 p-1">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col">
					<h1 className="font-black text-2xl tracking-tight">{firstName ? `Olá, ${firstName}` : "Dashboard"}</h1>
					<p className="text-sm text-muted-foreground first-letter:uppercase">{todayLabel}</p>
				</div>
				<div className="shrink-0 self-end">
					<WhatsappConnectionsPills />
				</div>
			</div>

			{!hasContent ? (
				<Empty className="justify-center bg-muted/25 py-12">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<LayoutDashboard className="text-muted-foreground" strokeWidth={1.5} aria-hidden />
						</EmptyMedia>
						<EmptyTitle className="font-semibold text-sm tracking-tight">Nada para acompanhar aqui</EmptyTitle>
						<EmptyDescription className="max-w-[320px] text-xs leading-relaxed">
							Seu acesso ainda não inclui nenhuma área com pendências ou números. Use o menu lateral para navegar.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<>
					<HeroBand canViewSales={canViewSales} canViewGoals={canViewGoals} canCreateGoals={membership.permissoes.resultados.criarMetas} risk={risk} />
					<TabBar tabs={tabs} active={activeTab} onSelect={setTab} badges={badges} hint={hint} />
					{activeTab === "relacionamento" ? <RelationshipTab context={context} /> : null}
					{activeTab === "operacao" ? <OperationsTab context={context} /> : null}
					{activeTab === "equipe" ? <TeamTab context={context} scopeSellersIds={scopeSellersIds} /> : null}
				</>
			)}
		</div>
	);
}

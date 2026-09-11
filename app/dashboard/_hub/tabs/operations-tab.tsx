"use client";

import { canAccessDashboardCapability, type TCapabilityContext } from "@/lib/access/capabilities";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { useActionApprovals } from "@/lib/queries/action-approvals";
import { useFinancesOverallStats } from "@/lib/queries/finances";
import { useFiscalPending } from "@/lib/queries/fiscal";
import { useSalesFulfillment } from "@/lib/queries/sales-fulfillment";
import { useTabs } from "@/lib/queries/tabs";
import { BookText, ClipboardList, ShieldCheck } from "lucide-react";
import { formatTimeAgo } from "../format";
import { HubTable, type THubTableColumn } from "../hub-table";
import { Panel, StatTile } from "../panel";
import { useOperationsPending } from "../use-operations-pending";

/**
 * A aba de Operação: o que está travado, quanto vale e há quanto tempo.
 *
 * Só existe para organizações com ERP — numa organização de CRM puro a aba não é renderizada, e é
 * por isso que ela pode ser densa sem risco de virar uma tela vazia para a maior parte da base.
 */

const RESOLVE_LIMIT = 4;

export function OperationsTab({ context }: { context: TCapabilityContext }) {
	const canViewFinance = canAccessDashboardCapability("finance", context);
	const canViewFiscal = canAccessDashboardCapability("fiscal", context);
	const canViewTabs = canAccessDashboardCapability("serviceAccounts", context);

	return (
		<div className="grid w-full items-start gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
			<div className="flex min-w-0 flex-col gap-3">
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{canViewFinance ? <OverdueTile /> : null}
					{canViewFiscal ? <FiscalTile /> : null}
					{canViewTabs ? <OpenTabsTile /> : null}
				</div>
				<PendingByFront context={context} />
			</div>
			<ResolveNowRail context={context} />
		</div>
	);
}

function OverdueTile() {
	const { data, isPending, isError } = useFinancesOverallStats({ initialParams: {} });
	const overdue = data?.totalPendingTransactionsOverdue;
	const total = (overdue?.inflow ?? 0) + (overdue?.outflow ?? 0);
	if (isPending || isError || !data) return <StatTile label="A receber vencido" value={isError ? "—" : "···"} />;
	return (
		<StatTile
			label="A receber vencido"
			value={formatToMoney(total)}
			tone={total > 0 ? "destructive" : "default"}
			caption={total > 0 ? `${formatToMoney(overdue?.inflow ?? 0)} a receber · ${formatToMoney(overdue?.outflow ?? 0)} a pagar` : "nada vencido"}
		/>
	);
}

function FiscalTile() {
	const { data, isPending, isError } = useFiscalPending({ refetchInterval: 120_000 });
	if (isPending || isError || !data) return <StatTile label="Documentos travados" value={isError ? "—" : "···"} />;
	const { documentos, valorTravado, prazosExpirando } = data.resumo;
	return (
		<StatTile
			label="Documentos travados"
			value={formatDecimalPlaces(documentos)}
			tone={documentos > 0 ? "destructive" : "default"}
			caption={
				documentos > 0
					? `${formatToMoney(valorTravado)} parados${prazosExpirando > 0 ? ` · ${formatDecimalPlaces(prazosExpirando)} com prazo acabando` : ""}`
					: "nenhuma pendência fiscal"
			}
		/>
	);
}

function OpenTabsTile() {
	const { data, isPending, isError } = useTabs({ initialParams: { status: ["ABERTA"] } });
	if (isPending || isError || !data) return <StatTile label="Comandas abertas" value={isError ? "—" : "···"} />;
	const total = data.length;
	const valorTotal = data.reduce((acc, tab) => acc + (tab.valorTotal ?? 0), 0);
	return (
		<StatTile
			label="Comandas abertas"
			value={formatToMoney(valorTotal)}
			caption={
				total > 0 ? `${formatDecimalPlaces(total)} ${total === 1 ? "comanda em atendimento" : "comandas em atendimento"}` : "nenhuma conta aberta"
			}
		/>
	);
}

const FRONT_COLUMNS: THubTableColumn[] = [
	{ id: "frente", header: "Frente", track: "minmax(0,1.4fr)" },
	{ id: "itens", header: "Itens", align: "right", track: "minmax(0,0.7fr)" },
	{ id: "valor", header: "Valor parado", align: "right", track: "minmax(0,1fr)" },
	{ id: "antigo", header: "Mais antigo", align: "right", track: "minmax(0,0.9fr)" },
];

/** A tabela de frentes. Cada célula sem dado imprime "—" em vez de zero — ver `useOperationsPending`. */
function PendingByFront({ context }: { context: TCapabilityContext }) {
	const { frentes, valorParado, isPending, isError, error } = useOperationsPending(context);

	return (
		<Panel>
			<Panel.Header
				title="Pendências por frente"
				hint={valorParado > 0 ? `${formatToMoney(valorParado)} parados` : undefined}
				hintTone="destructive"
				href={appRoutes.sales.orders()}
				hrefLabel="Ver tudo"
			/>
			{isPending || isError || frentes.length === 0 ? (
				<Panel.Body>
					{isPending ? (
						<Panel.Loading rows={4} />
					) : isError ? (
						<Panel.Error error={error} />
					) : (
						<Panel.Empty message="Nenhuma pendência aberta na operação." />
					)}
				</Panel.Body>
			) : (
				<Panel.Bleed>
					<HubTable
						columns={FRONT_COLUMNS}
						rows={frentes.map((front) => ({
							id: front.id,
							href: front.href,
							cells: {
								frente: front.titulo,
								itens: front.itens === null ? "—" : formatDecimalPlaces(front.itens),
								valor: front.valorParado === null ? "—" : formatToMoney(front.valorParado),
								antigo: front.maisAntigo ? formatTimeAgo(front.maisAntigo) : front.urgente ? "urgente" : "—",
							},
							cellClassName: {
								itens: "font-extrabold",
								valor: "font-bold",
								antigo: front.urgente ? "font-bold text-destructive-surface-foreground" : "text-muted-foreground",
							},
						}))}
					/>
				</Panel.Bleed>
			)}
		</Panel>
	);
}

/** O trilho da direita: as decisões individuais que só uma pessoa pode tomar, com nome e valor. */
function ResolveNowRail({ context }: { context: TCapabilityContext }) {
	const canViewApprovals = canAccessDashboardCapability("approvals", context);
	const canViewFiscal = canAccessDashboardCapability("fiscal", context);
	const canViewOrders = canAccessDashboardCapability("orders", context);

	const approvals = useActionApprovals({ status: "PENDENTE", enabled: canViewApprovals });
	const fiscal = useFiscalPending({ enabled: canViewFiscal, refetchInterval: 120_000 });
	const fulfillment = useSalesFulfillment({ enabled: canViewOrders });

	const pendingApprovals = canViewApprovals ? (approvals.data ?? []) : [];
	const fiscalCauses = canViewFiscal ? (fiscal.data?.porAlvo ?? []) : [];
	const pendingConfirmation = canViewOrders ? (fulfillment.data?.pendingConfirmation ?? []) : [];
	const urgentes = pendingApprovals.length + fiscalCauses.length + pendingConfirmation.length;

	const isPending = (canViewApprovals && approvals.isPending) || (canViewFiscal && fiscal.isPending) || (canViewOrders && fulfillment.isPending);

	return (
		<Panel>
			<Panel.Header title="Resolver agora" hint={urgentes > 0 ? `${formatDecimalPlaces(urgentes)} urgentes` : undefined} hintTone="destructive" />
			{isPending || urgentes === 0 ? (
				<Panel.Body>{isPending ? <Panel.Loading rows={3} /> : <Panel.Empty message="Nada aguardando uma decisão sua." />}</Panel.Body>
			) : (
				<Panel.Bleed>
					{pendingApprovals.slice(0, RESOLVE_LIMIT).map((request) => (
						<Panel.Row
							key={request.id}
							href={appRoutes.approvals()}
							leading={
								<Panel.RowIcon tone="destructive">
									<ShieldCheck aria-hidden />
								</Panel.RowIcon>
							}
							primary={request.resumo.titulo}
							secondary={[
								request.solicitante?.nome,
								formatTimeAgo(request.dataInsercao),
								request.resumo.valorPrincipal !== null ? formatToMoney(request.resumo.valorPrincipal) : null,
							]
								.filter(Boolean)
								.join(" · ")}
							trailing={<Panel.RowAction emphasis>Decidir</Panel.RowAction>}
						/>
					))}
					{fiscalCauses.slice(0, RESOLVE_LIMIT - pendingApprovals.length).map((group) => (
						<Panel.Row
							key={group.chave}
							href={appRoutes.fiscal.pending()}
							leading={
								<Panel.RowIcon tone="destructive">
									<BookText aria-hidden />
								</Panel.RowIcon>
							}
							primary={group.alvo.rotulo ?? group.problema.mensagem}
							secondary={`${formatDecimalPlaces(group.documentos.length)} doc · ${formatToMoney(group.valorTravado)}`}
							trailing={<Panel.RowAction>Corrigir</Panel.RowAction>}
						/>
					))}
					{pendingConfirmation.length > 0 ? (
						<Panel.Row
							href={appRoutes.sales.orders()}
							leading={
								<Panel.RowIcon tone="warning">
									<ClipboardList aria-hidden />
								</Panel.RowIcon>
							}
							primary={`${formatDecimalPlaces(pendingConfirmation.length)} ${pendingConfirmation.length === 1 ? "pedido aguardando confirmação" : "pedidos aguardando confirmação"}`}
							secondary={`o mais antigo ${formatTimeAgo(pendingConfirmation[0]?.dataVenda)}`}
							trailing={<Panel.RowAction>Abrir</Panel.RowAction>}
						/>
					) : null}
				</Panel.Bleed>
			)}
		</Panel>
	);
}

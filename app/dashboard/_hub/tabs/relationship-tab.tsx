"use client";

import { canAccessDashboardCapability, type TCapabilityContext } from "@/lib/access/capabilities";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { useCampaignRanking } from "@/lib/queries/campaigns";
import { useChatsStatsOverview } from "@/lib/queries/chats-stats";
import {
	useCirculatingCashback,
	useClientBirthdays,
	useExpiringCashback,
	useRecentSegmentChanges,
	useRelationshipPulse,
	useSegmentDistribution,
	useTeamRoutine,
} from "@/lib/queries/dashboard-hub";
import { cn } from "@/lib/utils";
import { BadgePercent, Cake, CalendarCheck, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { segmentColors, segmentLabel } from "../format";
import { HubTable, type THubTableColumn } from "../hub-table";
import { Panel, StatTile } from "../panel";
import { resolveTodayRange, useDayKey } from "../use-day-key";

/**
 * A aba de Relacionamento: o tamanho da base, como ela se move entre segmentos e quem precisa de
 * um contato hoje. É a aba padrão porque é a única que toda organização tem — a maior parte da
 * carteira é CRM puro, sem ERP.
 */

const WINDOW_DAYS = 30;

export function RelationshipTab({ context }: { context: TCapabilityContext }) {
	const canViewCashback = canAccessDashboardCapability("cashback", context);
	const canViewCampaigns = canAccessDashboardCapability("campaigns", context);

	return (
		<div className="grid w-full items-start gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
			<div className="flex min-w-0 flex-col gap-3">
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<BaseTile />
					<RepurchaseTile />
					{canViewCashback ? <CashbackTile /> : null}
				</div>
				<SegmentMovement />
				{canViewCampaigns ? <CampaignsPanel /> : null}
			</div>
			<TalkToTodayRail context={context} />
		</div>
	);
}

function BaseTile() {
	const { data, isPending, isError } = useRelationshipPulse({ days: WINDOW_DAYS });
	if (isPending || isError || !data)
		return <StatTile label="Base ativa" value={isError ? "—" : "···"} caption="clientes que compraram no último ano" />;

	const { total, novos, serie } = data.baseAtiva;
	const peak = Math.max(...serie.map((week) => week.clientes), 1);
	return (
		<StatTile
			label="Base ativa"
			value={formatDecimalPlaces(total)}
			delta={novos > 0 ? `+${formatDecimalPlaces(novos)}` : undefined}
			caption={`novos em ${WINDOW_DAYS} dias · clientes ativos há 12 meses`}
		>
			<div className="flex h-7 items-end gap-[3px]" role="img" aria-label="Clientes que compraram por semana nas últimas 7 semanas">
				{serie.map((week, index) => (
					<span
						key={week.semanaInicio}
						className={cn("flex-1 rounded-xs", index === serie.length - 1 ? "bg-primary" : "bg-muted")}
						style={{ height: `${Math.max((week.clientes / peak) * 100, 6)}%` }}
					/>
				))}
			</div>
		</StatTile>
	);
}

function RepurchaseTile() {
	const { data, isPending, isError } = useRelationshipPulse({ days: WINDOW_DAYS });
	if (isPending || isError || !data)
		return <StatTile label="Taxa de recompra" value={isError ? "—" : "···"} caption="de quem comprou, quantos voltaram" />;

	const { atual, anterior, recorrentes, compradores } = data.taxaRecompra;
	const delta = atual - anterior;
	return (
		<StatTile
			label="Taxa de recompra"
			value={`${formatDecimalPlaces(atual, 0, 0)}%`}
			delta={anterior > 0 ? `${delta >= 0 ? "+" : ""}${formatDecimalPlaces(delta, 0, 0)} pts` : undefined}
			deltaTone={delta >= 0 ? "success" : "destructive"}
			caption={`${formatDecimalPlaces(recorrentes)} de ${formatDecimalPlaces(compradores)} compraram mais de uma vez`}
		>
			{/* O traço marca o período anterior: a referência honesta é o próprio histórico da loja. */}
			<div className="relative h-2.5 rounded-sm bg-muted">
				<div className="absolute inset-y-0 left-0 rounded-sm bg-primary" style={{ width: `${Math.min(atual, 100)}%` }} />
				{anterior > 0 ? (
					<div
						className="-top-1 -bottom-1 absolute w-0.5 bg-foreground"
						style={{ left: `${Math.min(anterior, 100)}%` }}
						title={`Período anterior: ${formatDecimalPlaces(anterior, 0, 0)}%`}
					/>
				) : null}
			</div>
		</StatTile>
	);
}

function CashbackTile() {
	const { data, isPending, isError } = useCirculatingCashback({ days: WINDOW_DAYS });
	if (isPending || isError || !data)
		return <StatTile label="Cashback circulando" value={isError ? "—" : "···"} caption="saldo disponível dos clientes" />;

	const { circulando, expirando } = data;
	const share = circulando.valor > 0 ? (expirando.valor / circulando.valor) * 100 : 0;
	return (
		<StatTile
			label="Cashback circulando"
			value={formatToMoney(circulando.valor)}
			caption={`${formatDecimalPlaces(circulando.clientes)} clientes com saldo`}
		>
			<div className="flex items-center gap-2">
				<span className="text-micro shrink-0 font-normal text-muted-foreground">Expirando</span>
				<span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
					<span className="block h-full bg-warning" style={{ width: `${Math.min(share, 100)}%` }} />
				</span>
				<span className="text-micro shrink-0">{formatToMoney(expirando.valor)}</span>
			</div>
		</StatTile>
	);
}

/**
 * A base repartida pelos 11 segmentos RFM, na paleta real de `utils/rfm.ts`.
 *
 * Barra proporcional e não cartões: onze segmentos em cartões viram uma grade que ninguém lê, e a
 * proporção entre eles — quanto da base é campeã, quanto já está perdida — é justamente a leitura
 * que importa. O número ao lado de cada rótulo é **quem chegou** na janela, não saldo: não há
 * histórico de segmentação para dizer quem saiu (ver a rota `/api/segmentations/distribution`).
 */
function SegmentMovement() {
	const { data, isPending, isError, error } = useSegmentDistribution({ days: WINDOW_DAYS });
	const segmentos = useMemo(() => data?.segmentos.filter((segment) => segment.qtde > 0) ?? [], [data]);

	return (
		<Panel>
			<Panel.Header
				title="Como a base se divide hoje"
				hint={`chegadas em ${WINDOW_DAYS} dias`}
				href={appRoutes.customers.segments()}
				hrefLabel="Abrir matriz RFM"
			/>
			<Panel.Body>
				{isPending ? (
					<Panel.Loading rows={4} />
				) : isError ? (
					<Panel.Error error={error} />
				) : segmentos.length === 0 ? (
					<Panel.Empty message="Nenhum cliente segmentado ainda." />
				) : (
					<>
						<div className="flex h-10 gap-0.5 overflow-hidden rounded-lg" role="img" aria-label="Distribuição da base por segmento">
							{segmentos.map((segment) => {
								const colors = segmentColors(segment.segmento);
								const share = segment.qtde / Math.max(data.total, 1);
								return (
									<div
										key={segment.segmento}
										className={cn("flex items-center justify-center font-extrabold text-xs", colors.background, colors.text)}
										style={{ width: `${share * 100}%` }}
										title={`${segmentLabel(segment.segmento)}: ${formatDecimalPlaces(segment.qtde)}`}
									>
										{/* O número só cabe dentro da fatia quando há largura para ele: o limiar de 4% foi
										    medido no painel de 1328px, e numa barra de ~330px a mesma fatia tem 13px e o
										    número vaza por cima do vizinho. No celular a barra fica só com a proporção e
										    quem conta é a legenda logo abaixo, que já traz todos os nomes. */}
										<span className="hidden sm:inline">{share > 0.04 ? formatDecimalPlaces(segment.qtde) : null}</span>
									</div>
								);
							})}
						</div>
						<ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
							{segmentos.map((segment) => (
								<li key={segment.segmento} className="flex min-w-0 items-center gap-2">
									<span className={cn("size-2.5 shrink-0 rounded-xs", segmentColors(segment.segmento).background)} aria-hidden />
									<span className="text-micro min-w-0 flex-1 truncate font-bold">{segmentLabel(segment.segmento)}</span>
									<span className="text-micro shrink-0 font-normal text-muted-foreground">
										{formatDecimalPlaces(segment.qtde)}
										{segment.chegaram > 0 ? ` · ${formatDecimalPlaces(segment.chegaram)} novos` : ""}
									</span>
								</li>
							))}
						</ul>
					</>
				)}
			</Panel.Body>
		</Panel>
	);
}

const CAMPAIGN_LIMIT = 4;

const CAMPAIGN_COLUMNS: THubTableColumn[] = [
	{ id: "campanha", header: "Campanha", track: "minmax(0,1.6fr)" },
	{ id: "enviadas", header: "Enviadas", align: "right", track: "minmax(0,0.8fr)" },
	{ id: "conversao", header: "Conversão", align: "right", track: "minmax(0,0.9fr)" },
	{ id: "receita", header: "Receita", align: "right", track: "minmax(0,1fr)" },
];

/**
 * As campanhas que mais renderam na janela.
 *
 * A coluna do meio é conversão, não "resposta": o que o produto registra é a venda atribuída à
 * campanha, e é dela que sai a receita ao lado. Chamar isso de resposta prometeria uma métrica de
 * conversa que não existe.
 */
function CampaignsPanel() {
	const dayKey = useDayKey();
	const period = useMemo(() => {
		const { after, before } = resolveTodayRange(dayKey);
		return { startDate: after.subtract(29, "day").toDate(), endDate: before.toDate() };
	}, [dayKey]);
	const { data, isPending, isError, error } = useCampaignRanking({
		startDate: period.startDate,
		endDate: period.endDate,
		comparingStartDate: null,
		comparingEndDate: null,
		rankingBy: "revenue",
	});
	const campaigns = data?.filter((campaign) => campaign.interacoes > 0).slice(0, CAMPAIGN_LIMIT) ?? [];

	return (
		<Panel>
			<Panel.Header title="Campanhas em curso" hint={`${WINDOW_DAYS} dias`} href={`${appRoutes.growth.campaigns()}?view=stats`} hrefLabel="Ver todas" />
			{isPending || isError || campaigns.length === 0 ? (
				<Panel.Body>
					{isPending ? (
						<Panel.Loading rows={3} />
					) : isError ? (
						<Panel.Error error={error} />
					) : (
						<Panel.Empty message="Nenhuma mensagem enviada nos últimos 30 dias." />
					)}
				</Panel.Body>
			) : (
				<Panel.Bleed>
					<HubTable
						columns={CAMPAIGN_COLUMNS}
						rows={campaigns.map((campaign) => ({
							id: campaign.campanhaId,
							href: appRoutes.growth.campaign(campaign.campanhaId),
							cells: {
								campanha: campaign.titulo,
								enviadas: formatDecimalPlaces(campaign.interacoes),
								conversao: `${formatDecimalPlaces(campaign.taxaConversao, 0, 1)}%`,
								receita: formatToMoney(campaign.receita),
							},
							cellClassName: {
								enviadas: "font-bold",
								conversao: cn("font-extrabold", campaign.taxaConversao > 0 ? "text-success-surface-foreground" : "text-muted-foreground"),
								receita: "font-bold",
							},
						}))}
					/>
				</Panel.Bleed>
			)}
		</Panel>
	);
}

/** O trilho da direita: as pessoas que merecem um contato hoje, em ordem de urgência. */
function TalkToTodayRail({ context }: { context: TCapabilityContext }) {
	const canViewChats = canAccessDashboardCapability("whatsapp", context);
	const canViewPortfolios = canAccessDashboardCapability("portfolios", context);
	const canViewCashback = canAccessDashboardCapability("cashback", context);

	const dayKey = useDayKey();
	const today = useMemo(() => resolveTodayRange(dayKey), [dayKey]);
	const chatsPeriod = useMemo(() => ({ startDate: today.after.subtract(6, "day").toDate(), endDate: today.before.toDate() }), [today]);

	const chats = useChatsStatsOverview({ period: chatsPeriod, enabled: canViewChats });
	const routine = useTeamRoutine({ dayStart: today.after.toDate(), enabled: canViewPortfolios });
	const cashback = useExpiringCashback({ days: WINDOW_DAYS });
	const birthdays = useClientBirthdays({ days: 7 });
	const cooling = useRecentSegmentChanges({ days: 7 });

	const semResposta = canViewChats ? (chats.data?.volume.semPrimeiraResposta ?? 0) : 0;
	const pendentes = canViewPortfolios ? Math.max((routine.data?.previstos ?? 0) - (routine.data?.feitos ?? 0), 0) : 0;
	const atrasados = canViewPortfolios ? (routine.data?.atrasados ?? 0) : 0;
	const cashbackTotal = canViewCashback ? (cashback.data?.total ?? { valor: 0, clientes: 0 }) : { valor: 0, clientes: 0 };
	const aniversariantes = birthdays.data?.clientes ?? [];
	const esperando = semResposta + pendentes + atrasados + aniversariantes.length;

	return (
		<Panel>
			<Panel.Header title="Falar com hoje" hint={esperando > 0 ? `${formatDecimalPlaces(esperando)} pessoas` : undefined} hintTone="destructive" />

			<Panel.Bleed>
				{canViewChats && semResposta > 0 ? (
					<Panel.Row
						href={appRoutes.channels.whatsapp()}
						leading={
							<Panel.RowIcon tone="destructive">
								<MessageCircle aria-hidden />
							</Panel.RowIcon>
						}
						primary={`${formatDecimalPlaces(semResposta)} ${semResposta === 1 ? "conversa sem resposta" : "conversas sem resposta"}`}
						secondary={chats.data?.backlog.naFila ? `${formatDecimalPlaces(chats.data.backlog.naFila)} na fila, sem atendente` : "nos últimos 7 dias"}
						trailing={<Panel.RowAction emphasis>Abrir</Panel.RowAction>}
					/>
				) : null}

				{canViewPortfolios && pendentes + atrasados > 0 ? (
					<Panel.Row
						href={appRoutes.customers.portfolios()}
						leading={
							<Panel.RowIcon tone={atrasados > 0 ? "destructive" : "default"}>
								<CalendarCheck aria-hidden />
							</Panel.RowIcon>
						}
						primary={`${formatDecimalPlaces(pendentes)} ${pendentes === 1 ? "contato da carteira" : "contatos da carteira"}`}
						secondary={atrasados > 0 ? `${formatDecimalPlaces(atrasados)} atrasados de dias anteriores` : "previstos para hoje"}
						trailing={<Panel.RowAction>Ver</Panel.RowAction>}
					/>
				) : null}

				{canViewCashback && cashbackTotal.valor > 0 ? (
					<Panel.Row
						href={`${appRoutes.growth.newCampaign()}?category=EVENT&stage=trigger`}
						leading={
							<Panel.RowIcon tone="warning">
								<BadgePercent aria-hidden />
							</Panel.RowIcon>
						}
						primary={`${formatToMoney(cashbackTotal.valor)} de cashback expira`}
						secondary={`${formatDecimalPlaces(cashbackTotal.clientes)} clientes em ${WINDOW_DAYS} dias`}
						trailing={<Panel.RowAction>Avisar</Panel.RowAction>}
					/>
				) : null}

				{aniversariantes.length > 0 ? (
					<Panel.Row
						href={appRoutes.customers.root()}
						leading={
							<Panel.RowIcon>
								<Cake aria-hidden />
							</Panel.RowIcon>
						}
						primary={`${formatDecimalPlaces(aniversariantes.length)} ${aniversariantes.length === 1 ? "aniversariante" : "aniversariantes"}`}
						secondary={aniversariantes
							.slice(0, 2)
							.map((client) => client.nome)
							.join(", ")}
						trailing={<Panel.RowAction>Ver</Panel.RowAction>}
					/>
				) : null}

				<CoolingClients query={cooling} />
			</Panel.Bleed>
		</Panel>
	);
}

function CoolingClients({ query }: { query: ReturnType<typeof useRecentSegmentChanges> }) {
	const { data, isPending, isError, error } = query;
	// Dentro do `Bleed` o conteúdo encosta na borda, então os estados curtos recuperam o respiro.
	if (isPending)
		return (
			<div className="px-3 py-3.5">
				<Panel.Loading rows={3} />
			</div>
		);
	if (isError)
		return (
			<div className="px-3 py-3.5">
				<Panel.Error error={error} />
			</div>
		);
	if (!data || data.clientes.length === 0)
		return (
			<div className="px-3 py-3.5">
				<Panel.Empty message="Nenhum cliente esfriou nesta semana." />
			</div>
		);

	return (
		<div className="flex flex-col gap-2.5 border-border/60 border-t px-3 py-3.5">
			<span className="text-label text-muted-foreground">Clientes esfriando</span>
			{data.clientes.map((client) => (
				<Link
					key={client.id}
					href={appRoutes.customers.details(client.id)}
					className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<span className={cn("size-2 shrink-0 rounded-full", segmentColors(client.segmento).background)} aria-hidden />
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate font-bold text-sm leading-tight">{client.nome}</span>
						<span className="text-micro truncate font-normal text-muted-foreground">{segmentLabel(client.segmento)}</span>
					</span>
					<span className="shrink-0 font-bold text-xs">{formatToMoney(client.valorTotalCompras ?? 0)}</span>
				</Link>
			))}
		</div>
	);
}

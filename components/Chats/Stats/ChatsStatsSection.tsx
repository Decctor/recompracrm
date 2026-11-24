"use client";

import type { TGetWhatsappConnectionsOutput } from "@/app/api/whatsapp-connections/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { Button } from "@/components/ui/button";
import { DropdownMenuGroup, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InteractiveFilter } from "@/components/ui/interactive-filter";
import { formatInteractiveDateRangeSummary } from "@/components/ui/interactive-filter-formatting";
import { getErrorMessage } from "@/lib/errors";
import { useChatsStatsAgents, useChatsStatsOverview, useChatsStatsTimeseries, type TChatsStatsPeriod } from "@/lib/queries/chats-stats";
import dayjs from "dayjs";
import { Calendar, ChevronDown, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ChatsAgentRankingBlock } from "./Blocks/ChatsAgentRankingBlock";
import { ChatsAutomationBlock } from "./Blocks/ChatsAutomationBlock";
import { ChatsBacklogBlock } from "./Blocks/ChatsBacklogBlock";
import { ChatsFirstResponseBlock } from "./Blocks/ChatsFirstResponseBlock";
import { ChatsKpiCardsBlock } from "./Blocks/ChatsKpiCardsBlock";
import { ChatsLoadHeatmapBlock } from "./Blocks/ChatsLoadHeatmapBlock";
import { ChatsVolumeGraphBlock } from "./Blocks/ChatsVolumeGraphBlock";

type ChatsStatsSectionProps = {
	whatsappConnections: TGetWhatsappConnectionsOutput["data"];
	/** Ranking nominal é dado de gestão: a rota exige `finalizar` e a UI esconde o bloco. */
	canManageAttendances: boolean;
};

export default function ChatsStatsSection({ whatsappConnections, canManageAttendances }: ChatsStatsSectionProps) {
	const [period, setPeriod] = useState(() => ({
		startDate: dayjs().startOf("month").toDate(),
		endDate: dayjs().endOf("day").toDate(),
	}));
	const [phoneId, setPhoneId] = useState<string | null>(null);

	const phones = useMemo(
		() =>
			whatsappConnections.flatMap((connection) => [
				...(connection.telefones ?? []),
				// Desativados seguem no filtro: as conversas antigas continuam ligadas a eles.
				...(connection.telefonesDesativados ?? []).map((phone) => ({ ...phone, nome: `${phone.nome} (desativado)` })),
			]),
		[whatsappConnections],
	);
	const selectedPhone = phones.find((phone) => phone.id === phoneId) ?? null;

	// O período de comparação é o intervalo imediatamente anterior, de mesma duração — é o
	// que dá sentido aos deltas dos cards sem obrigar a escolher duas datas a mais.
	const statsPeriod: TChatsStatsPeriod = useMemo(() => {
		const duracaoMs = period.endDate.getTime() - period.startDate.getTime();
		return {
			startDate: period.startDate,
			endDate: period.endDate,
			comparingStartDate: new Date(period.startDate.getTime() - duracaoMs - 1),
			comparingEndDate: new Date(period.startDate.getTime() - 1),
			whatsappConexaoTelefoneId: phoneId,
		};
	}, [period, phoneId]);

	const {
		data: overview,
		isPending: overviewPending,
		isError: overviewError,
		error: overviewErrorObject,
	} = useChatsStatsOverview({ period: statsPeriod });
	const { data: timeseries, isPending: timeseriesPending } = useChatsStatsTimeseries({ period: statsPeriod });
	const { data: agents, isPending: agentsPending } = useChatsStatsAgents({ period: statsPeriod, enabled: canManageAttendances });

	if (overviewError) return <ErrorComponent msg={getErrorMessage(overviewErrorObject)} />;

	return (
		<div className="flex w-full flex-col gap-4 overflow-y-auto">
			<div className="flex w-full flex-wrap items-center justify-end gap-2">
				{selectedPhone ? (
					<button
						type="button"
						onClick={() => setPhoneId(null)}
						aria-label={`Remover filtro de número: ${selectedPhone.numero || selectedPhone.nome}`}
						className="flex h-9 min-w-0 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
					>
						<span className="truncate">{selectedPhone.numero || selectedPhone.nome}</span>
						<X className="h-3 w-3 shrink-0 opacity-60" />
					</button>
				) : (
					phones.length > 1 && (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button variant="outline" size="sm" className="h-9 gap-1 text-xs">
										Número
										<ChevronDown className="h-3 w-3 opacity-60" />
									</Button>
								}
							/>
							<DropdownMenuContent align="end">
								<DropdownMenuGroup>
									{phones.map((phone) => (
										<DropdownMenuItem key={phone.id} onClick={() => setPhoneId(phone.id)}>
											{phone.numero || phone.nome}
										</DropdownMenuItem>
									))}
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					)
				)}

				<InteractiveFilter.Root className="w-fit">
					<InteractiveFilter.Trigger>
						<InteractiveFilter.Icon>
							<Calendar className="h-4 w-4" />
							<InteractiveFilter.Label>PERÍODO</InteractiveFilter.Label>
						</InteractiveFilter.Icon>
						<InteractiveFilter.Value>
							{formatInteractiveDateRangeSummary(period.startDate.toISOString(), period.endDate.toISOString())}
						</InteractiveFilter.Value>
					</InteractiveFilter.Trigger>
					<InteractiveFilter.Content className="w-auto p-0">
						<InteractiveFilter.DateRangeContent
							value={{ from: period.startDate, to: period.endDate }}
							onChange={(range) => {
								if (range.from && range.to) setPeriod({ startDate: range.from, endDate: range.to });
								else if (range.from) setPeriod({ startDate: range.from, endDate: range.from });
							}}
						/>
					</InteractiveFilter.Content>
				</InteractiveFilter.Root>
			</div>

			<ChatsKpiCardsBlock overview={overview} isLoading={overviewPending} />

			<ChatsVolumeGraphBlock timeseries={timeseries} isLoading={timeseriesPending} />

			<div className="flex w-full flex-col gap-4 lg:flex-row lg:items-stretch">
				<div className="flex w-full min-w-0 lg:w-1/2">
					<ChatsFirstResponseBlock overview={overview} isLoading={overviewPending} />
				</div>
				<div className="flex w-full min-w-0 lg:w-1/2">
					<ChatsAutomationBlock overview={overview} isLoading={overviewPending} />
				</div>
			</div>

			<ChatsBacklogBlock overview={overview} isLoading={overviewPending} />

			{canManageAttendances && <ChatsAgentRankingBlock agents={agents} isLoading={agentsPending} />}

			<ChatsLoadHeatmapBlock timeseries={timeseries} isLoading={timeseriesPending} />
		</div>
	);
}

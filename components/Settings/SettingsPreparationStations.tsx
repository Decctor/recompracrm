"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { PREPARATION_STATION_TICKET_SCOPE_LABELS } from "@/components/Modals/PreparationStations/Blocks/General";
import ControlPreparationStation from "@/components/Modals/PreparationStations/ControlPreparationStation";
import NewPreparationStation from "@/components/Modals/PreparationStations/NewPreparationStation";
import { Button } from "@/components/ui/button";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { deletePreparationStation } from "@/lib/mutations/preparation-stations";
import { AGENT_PRINTERS_QUERY_KEY, type TAgentPrinterListItem, useAgentPrinters } from "@/lib/queries/desktop-agent";
import { PREPARATION_STATIONS_QUERY_KEY, type TPreparationStationListItem, usePreparationStations } from "@/lib/queries/preparation-stations";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChefHat, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import SettingsPanelSection from "./SettingsPanelSection";

// Estações de preparo (docs/dev-planning/preparation-stations-plan.md): para qual impressora vai cada
// item do TICKET_PREPARO. Quem atende cada estação se marca no card da impressora (Dispositivos).

// Mesmo critério de "apta" de organizationHasPrinterForFinalidade, restrito à estação.
function stationHasPrinter(printers: TAgentPrinterListItem[] | undefined, stationId: string) {
	if (!printers) return false;
	return printers.some(
		(printer) => printer.ativa && printer.disponivel && printer.finalidades.includes("TICKET_PREPARO") && printer.estacoesPreparo.includes(stationId),
	);
}

type SettingsPreparationStationsProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

export default function SettingsPreparationStations({ membership }: SettingsPreparationStationsProps) {
	const queryClient = useQueryClient();
	const { data: stations, isLoading, isError, error } = usePreparationStations();
	const { data: printers, isSuccess: printersLoaded } = useAgentPrinters();
	const [newStationModalIsOpen, setNewStationModalIsOpen] = useState(false);
	const [controlStationId, setControlStationId] = useState<string | null>(null);

	const canManage = membership.permissoes.empresa.editar;

	const { mutate: mutateDelete, isPending: isDeleting } = useMutation({
		mutationKey: ["delete-preparation-station"],
		mutationFn: deletePreparationStation,
		onSuccess: async (response) => {
			toast.success(response.message);
			// A exclusão também tira o id da estação das impressoras (agent_printers.estacoes_preparo).
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: PREPARATION_STATIONS_QUERY_KEY }),
				queryClient.invalidateQueries({ queryKey: AGENT_PRINTERS_QUERY_KEY }),
			]);
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	function handleDelete(station: TPreparationStationListItem) {
		if (!confirm(`Excluir a estação "${station.nome}"? As regras dela deixam de valer e as impressoras deixam de atendê-la.`)) return;
		mutateDelete({ id: station.id });
	}

	return (
		<SettingsPanelSection
			title="ESTAÇÕES DE PREPARO"
			icon={<ChefHat className="h-4 w-4 min-h-4 min-w-4" />}
			description="Separe o ticket de preparo por estação — bebidas no balcão, lanches na cozinha. Pedido com itens das duas sai nas duas."
			action={
				canManage ? (
					<Button size="sm" className="flex items-center gap-2 whitespace-nowrap" onClick={() => setNewStationModalIsOpen(true)}>
						<Plus className="h-4 w-4 min-h-4 min-w-4" />
						NOVA ESTAÇÃO
					</Button>
				) : null
			}
		>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{stations && stations.length === 0 ? (
				<p className="text-xs text-muted-foreground">
					Nenhuma estação cadastrada — o ticket de preparo sai inteiro em toda impressora que imprime ticket de preparo.
				</p>
			) : null}
			{stations && stations.length > 0 ? (
				<div className="flex w-full flex-col gap-1.5">
					{stations.map((station) => (
						<PreparationStationRow
							key={station.id}
							station={station}
							// Sem a lista de impressoras ainda, não acusa falta de impressora.
							missingPrinter={printersLoaded && station.ativa && !stationHasPrinter(printers, station.id)}
							canManage={canManage}
							isDeleting={isDeleting}
							onEdit={() => setControlStationId(station.id)}
							onDelete={() => handleDelete(station)}
						/>
					))}
				</div>
			) : null}

			{newStationModalIsOpen ? <NewPreparationStation closeModal={() => setNewStationModalIsOpen(false)} /> : null}
			{controlStationId ? <ControlPreparationStation stationId={controlStationId} closeModal={() => setControlStationId(null)} /> : null}
		</SettingsPanelSection>
	);
}

type PreparationStationRowProps = {
	station: TPreparationStationListItem;
	missingPrinter: boolean;
	canManage: boolean;
	isDeleting: boolean;
	onEdit: () => void;
	onDelete: () => void;
};
function PreparationStationRow({ station, missingPrinter, canManage, isDeleting, onEdit, onDelete }: PreparationStationRowProps) {
	// Regra PRODUTO de produto excluído não conta: é órfã e some no próximo salvamento.
	const validRules = station.regras.filter((regra) => regra.valor.criterio !== "PRODUTO" || regra.produto);
	const groupCount = validRules.filter((regra) => regra.valor.criterio === "GRUPO").length;
	const productCount = validRules.length - groupCount;
	const rulesSummary = [
		groupCount > 0 ? `${groupCount} ${groupCount === 1 ? "grupo" : "grupos"}` : null,
		productCount > 0 ? `${productCount} ${productCount === 1 ? "produto" : "produtos"}` : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className={cn("flex w-full flex-col gap-2 rounded-xl border border-border bg-card px-3 py-3 shadow-2xs", !station.ativa && "opacity-60")}>
			<div className="flex w-full items-center justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-0.5">
					<div className="flex flex-wrap items-center gap-2">
						<span className="truncate text-sm font-semibold">{station.nome}</span>
						{station.padrao ? (
							<span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[0.6rem] font-bold tracking-widest text-primary">
								PADRÃO
							</span>
						) : null}
						{!station.ativa ? (
							<span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[0.6rem] font-bold tracking-widest text-muted-foreground">
								INATIVA
							</span>
						) : null}
					</div>
					<span className="text-xs text-muted-foreground">
						{PREPARATION_STATION_TICKET_SCOPE_LABELS[station.escopoTicket]}
						{" · "}
						{rulesSummary || (station.padrao ? "Recebe o que nenhuma regra capturou" : "Nenhuma regra")}
					</span>
				</div>
				{canManage ? (
					<div className="flex shrink-0 items-center gap-1">
						<Button variant="outline" size="sm" className="gap-2" onClick={onEdit}>
							<Pencil className="h-4 w-4 min-h-4 min-w-4" /> EDITAR
						</Button>
						<Button variant="ghost" size="icon" aria-label={`Excluir ${station.nome}`} disabled={isDeleting} onClick={onDelete}>
							<Trash2 className="h-4 w-4 text-destructive" />
						</Button>
					</div>
				) : null}
			</div>
			{missingPrinter ? (
				<div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
					<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<p className="text-xs leading-relaxed">
						Nenhuma impressora ativa atende esta estação — os itens dela não serão impressos. Marque a estação no card de uma impressora que imprime ticket
						de preparo.
					</p>
				</div>
			) : null}
		</div>
	);
}

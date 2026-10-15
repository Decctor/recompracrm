import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ROUTABLE_PRINT_FINALIDADES } from "@/lib/desktop-agent/print-labels";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale } from "@/lib/formatting";
import { createManualPrintJob, updateAgentPrinter } from "@/lib/mutations/desktop-agent";
import type { TAgentPrinterListItem } from "@/lib/queries/desktop-agent";
import { usePreparationStations } from "@/lib/queries/preparation-stations";
import { cn } from "@/lib/utils";
import type { TPrintJobFinalidadeEnum } from "@/schemas/enums";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Printer } from "lucide-react";
import { memo, useId, useState } from "react";
import { toast } from "sonner";
import { StatusPill } from "../AccessStatusBadge";

type AgentPrinterCardProps = {
	printer: TAgentPrinterListItem;
	readOnly: boolean;
	onChanged: () => Promise<unknown>;
};

// memo + onChanged estável no pai: alternar uma finalidade não re-renderiza as outras impressoras.
export const AgentPrinterCard = memo(function AgentPrinterCard({ printer, readOnly, onChanged }: AgentPrinterCardProps) {
	// O apelido só vira campo quando o usuário pede — cada input sempre visível custava
	// uma linha inteira por impressora e enchia o modal antes da primeira rolagem.
	const [renameDraft, setRenameDraft] = useState<string | null>(null);
	const activeSwitchId = useId();

	const { mutate: mutatePrinter, isPending: isUpdating } = useMutation({
		mutationKey: ["update-agent-printer", printer.id],
		mutationFn: updateAgentPrinter,
		onSuccess: async (data) => {
			toast.success(data.message);
			setRenameDraft(null);
			await onChanged();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const { mutate: mutateTestPrint, isPending: isTesting } = useMutation({
		mutationKey: ["test-agent-printer", printer.id],
		mutationFn: createManualPrintJob,
		onSuccess: (data) => toast.success(data.message),
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	// Estações de preparo: query org-wide compartilhada com Configurações (mesmo queryKey, um fetch).
	const { data: preparationStations } = usePreparationStations({ enabled: !readOnly });
	const activeStations = preparationStations?.filter((station) => station.ativa) ?? [];
	const servesPreparationTicket = printer.finalidades.includes("TICKET_PREPARO");

	const toggleStation = (stationId: string) => {
		// Ids de estações excluídas caem fora aqui: o servidor recusa id que não é da organização.
		const knownIds = new Set(preparationStations?.map((station) => station.id) ?? []);
		const current = printer.estacoesPreparo.filter((id) => knownIds.has(id));
		const next = current.includes(stationId) ? current.filter((id) => id !== stationId) : [...current, stationId];
		mutatePrinter({ id: printer.id, estacoesPreparo: next });
	};

	const toggleFinalidade = (finalidade: TPrintJobFinalidadeEnum) => {
		const current = printer.finalidades as TPrintJobFinalidadeEnum[];
		const next = current.includes(finalidade) ? current.filter((item) => item !== finalidade) : [...current, finalidade];
		mutatePrinter({ id: printer.id, finalidades: next });
	};

	const displayName = printer.apelido || printer.nomeSistema;
	const driverLabel = printer.driver === "ZPL_REDE" ? "Térmica de rede (ZPL)" : "Driver do sistema";

	return (
		<div className={cn("flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-3", !printer.ativa && "opacity-60")}>
			<div className="flex w-full items-start justify-between gap-3">
				<div className="flex min-w-0 items-start gap-2.5">
					<div className="flex h-8 w-8 min-h-8 min-w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
						<Printer className="h-4 w-4" />
					</div>
					<div className="flex min-w-0 flex-col gap-0.5">
						<div className="flex min-w-0 items-center gap-1.5">
							<span className="truncate text-sm font-bold">{displayName}</span>
							{!readOnly && renameDraft === null ? (
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label={`Renomear ${displayName}`}
									className="shrink-0 text-muted-foreground"
									onClick={() => setRenameDraft(printer.apelido ?? "")}
								>
									<Pencil className="h-3 w-3" />
								</Button>
							) : null}
						</div>
						<span className="truncate text-xs text-muted-foreground">
							{printer.apelido ? `${printer.nomeSistema} · ` : ""}
							{driverLabel} · Sincronizada {printer.ultimaSincronizacao ? `em ${formatDateAsLocale(printer.ultimaSincronizacao, true)}` : "nunca"}
						</span>
					</div>
				</div>
				<StatusPill tone={printer.disponivel ? "success" : "warning"}>{printer.disponivel ? "DISPONÍVEL" : "AUSENTE"}</StatusPill>
			</div>

			{renameDraft !== null ? (
				<div className="flex w-full items-end gap-2">
					<div className="grow">
						<TextInput
							label="APELIDO"
							value={renameDraft}
							placeholder={printer.nomeSistema}
							handleChange={setRenameDraft}
							labelClassName="text-[0.65rem] font-bold tracking-[0.08em] text-muted-foreground"
						/>
					</div>
					<Button size="sm" disabled={isUpdating} onClick={() => mutatePrinter({ id: printer.id, apelido: renameDraft.trim() || null })}>
						SALVAR
					</Button>
					<Button variant="ghost" size="sm" disabled={isUpdating} onClick={() => setRenameDraft(null)}>
						CANCELAR
					</Button>
				</div>
			) : null}

			{!readOnly ? (
				<div className="flex w-full flex-col gap-1.5">
					<span className="text-[0.65rem] font-bold tracking-[0.08em] text-muted-foreground">IMPRIME</span>
					<div className="flex flex-wrap items-center gap-1.5">
						{ROUTABLE_PRINT_FINALIDADES.map((option) => {
							const isAssigned = printer.finalidades.includes(option.value);
							return (
								<button
									key={option.value}
									type="button"
									title={option.description}
									aria-pressed={isAssigned}
									disabled={isUpdating}
									onClick={() => toggleFinalidade(option.value)}
									className={cn(
										"rounded-full border px-3 py-1 text-xs font-bold transition-colors disabled:opacity-50",
										isAssigned ? "border-primary/25 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground hover:bg-accent",
									)}
								>
									{option.label}
								</button>
							);
						})}
						{printer.finalidades.length === 0 ? <span className="text-xs text-muted-foreground">Nada ainda</span> : null}
					</div>
				</div>
			) : null}

			{/* Org sem estação: nada novo aparece — a impressora atende o ticket inteiro, como sempre. */}
			{!readOnly && servesPreparationTicket && activeStations.length > 0 ? (
				<div className="flex w-full flex-col gap-1.5">
					<span className="text-[0.65rem] font-bold tracking-[0.08em] text-muted-foreground">ESTAÇÕES DE PREPARO</span>
					<div className="flex flex-wrap items-center gap-1.5">
						{activeStations.map((station) => {
							const isAssigned = printer.estacoesPreparo.includes(station.id);
							return (
								<button
									key={station.id}
									type="button"
									aria-pressed={isAssigned}
									disabled={isUpdating}
									onClick={() => toggleStation(station.id)}
									className={cn(
										"rounded-full border px-3 py-1 text-xs font-bold transition-colors disabled:opacity-50",
										isAssigned ? "border-primary/25 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground hover:bg-accent",
									)}
								>
									{station.nome}
								</button>
							);
						})}
					</div>
					{!activeStations.some((station) => printer.estacoesPreparo.includes(station.id)) ? (
						<span className="text-xs text-muted-foreground">Sem estação marcada, esta impressora não recebe tickets de preparo separados por estação.</span>
					) : null}
				</div>
			) : null}

			<div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
				<Button
					variant="outline"
					size="sm"
					className="flex items-center gap-1.5"
					disabled={isTesting || !printer.ativa || !printer.disponivel}
					onClick={() => mutateTestPrint({ finalidade: "TESTE", impressoraId: printer.id })}
				>
					<Printer className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
					IMPRIMIR TESTE
				</Button>
				{!readOnly ? (
					<div className="flex items-center gap-2">
						{/* htmlFor, não <label> em volta: o Switch da Radix é um <button> e aninhá-lo dispararia o clique duas vezes. */}
						<label htmlFor={activeSwitchId} className="cursor-pointer text-xs font-semibold text-muted-foreground">
							{printer.ativa ? "Ativa" : "Desativada"}
						</label>
						<Switch
							id={activeSwitchId}
							checked={printer.ativa}
							disabled={isUpdating}
							onCheckedChange={(ativa) => mutatePrinter({ id: printer.id, ativa })}
						/>
					</div>
				) : null}
			</div>
		</div>
	);
});

export default AgentPrinterCard;

"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ControlProduction from "@/components/Modals/Productions/ControlProduction";
import { Section } from "@/components/ui/section";
import { getErrorMessage } from "@/lib/errors";
import { createManualPrintJob } from "@/lib/mutations/desktop-agent";
import { completeProduction, deleteProduction, startProduction, weighProductionItem } from "@/lib/mutations/productions";
import { appRoutes } from "@/lib/navigation/routes";
import type { TProductionPagePermissions } from "../../_lib/require-production-access";
import { organizationHasPrinterForFinalidade, useAgentPrinters } from "@/lib/queries/desktop-agent";
import { useProductionById } from "@/lib/queries/productions";
import { showSuccessActionToast } from "@/lib/toasts/show-action-toast";
import { cn } from "@/lib/utils";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, CircleCheck, type LucideIcon, Play, Printer, Scale } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import ProductionDetailHeader, { type TPrimaryAction } from "./components/detail-header";
import ItemsPanel from "./components/items-panel";
import LabelsPanel from "./components/labels-panel";
import PreparationMethod from "./components/preparation-method";
import { WeighingLocked, WeighingPad } from "./components/weighing-pad";
import {
	findWeighItem,
	getCompletionReadiness,
	getDefaultPanel,
	getNextWeighKey,
	getPanelOptions,
	getWeighOrder,
	hasPendingAfter,
	isPlannedStatus,
	type TDetailPanel,
	type TProductionById,
	type TProductionStatus,
	type TWeighItemKey,
} from "./helpers/production-detail";

const PANEL_TABS: Record<TDetailPanel, { label: string; icon: LucideIcon }> = {
	pesagem: { label: "PESAGEM", icon: Scale },
	preparo: { label: "MODO DE PREPARO", icon: BookOpenText },
	etiquetas: { label: "ETIQUETAS", icon: Printer },
};

type ProductionDetailPageProps = {
	permissions: TProductionPagePermissions;
	productionId: string;
};

export default function ProductionDetailPage({ permissions, productionId }: ProductionDetailPageProps) {
	const queryClient = useQueryClient();
	const { data: production, queryKey, isLoading, isError, error } = useProductionById({ id: productionId });
	const weighMutationKey = ["weigh-production-item", productionId];
	const pendingWeighs = useIsMutating({ mutationKey: weighMutationKey });

	const [selected, setSelected] = useState<TWeighItemKey | null>(null);
	// A aba escolhida vale para a situação em que foi escolhida: iniciar ou concluir volta à aba padrão.
	const [panelChoice, setPanelChoice] = useState<{ status: TProductionStatus; panel: TDetailPanel } | null>(null);
	const [editOpen, setEditOpen] = useState(false);
	const asideRef = useRef<HTMLElement>(null);

	const { data: printers } = useAgentPrinters();
	const hasLabelPrinter = organizationHasPrinterForFinalidade(printers, "ETIQUETA_LOTE");

	async function refreshProduction() {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey }),
			queryClient.invalidateQueries({ queryKey: ["productions"] }),
			queryClient.invalidateQueries({ queryKey: ["production-recipes"] }),
			// O byId da receita traz os lotes de saldo que o construtor oferece: a conclusão os consome.
			queryClient.invalidateQueries({ queryKey: ["production-recipe-by-id"] }),
			queryClient.invalidateQueries({ queryKey: ["production-stats"] }),
		]);
	}

	const { mutate: start, isPending: isStarting } = useMutation({
		mutationKey: ["start-production", productionId],
		mutationFn: startProduction,
		onSuccess: (data) => toast.success(data.message),
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
		onSettled: refreshProduction,
	});

	const { mutate: complete, isPending: isCompleting } = useMutation({
		mutationKey: ["complete-production", productionId],
		mutationFn: completeProduction,
		onSuccess: (data) => {
			const createdStockLotIds = data.data.createdStockLots.map((stockLot) => stockLot.id);
			if (createdStockLotIds.length === 0) return toast.success(data.message);
			showSuccessActionToast({
				message: data.message,
				actionLabel: "PRÉ-VISUALIZAR ETIQUETAS",
				onAction: () => window.open(buildLabelsPreviewHref(createdStockLotIds), "_blank", "noopener,noreferrer"),
			});
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
		onSettled: async () => {
			await Promise.all([refreshProduction(), queryClient.invalidateQueries({ queryKey: ["product-stock-lots"] })]);
		},
	});

	const { mutate: cancel, isPending: isCancelling } = useMutation({
		mutationKey: ["cancel-production", productionId],
		mutationFn: deleteProduction,
		onSuccess: (data) => toast.success(data.message),
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
		onSettled: refreshProduction,
	});

	const { mutate: printLabels, isPending: isPrinting } = useMutation({
		mutationKey: ["print-production-labels", productionId],
		mutationFn: createManualPrintJob,
		onSuccess: (data) => toast.success(data.message),
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	// Uma pesagem por toque em "Confirmar": o cache muda na hora e volta atrás se o servidor recusar.
	const { mutate: weigh } = useMutation({
		mutationKey: weighMutationKey,
		mutationFn: weighProductionItem,
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<TProductionById>(queryKey);
			queryClient.setQueryData<TProductionById>(queryKey, (current) => {
				if (!current) return current;
				if (variables.itemKind === "ENTRADA")
					return {
						...current,
						entradas: current.entradas.map((item) => (item.id === variables.itemId ? { ...item, quantidadeReal: variables.quantidadeReal } : item)),
					};
				return {
					...current,
					saidas: current.saidas.map((item) => (item.id === variables.itemId ? { ...item, quantidadeReal: variables.quantidadeReal } : item)),
				};
			});
			return { previous };
		},
		onError: (mutationError, _variables, context) => {
			if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
			toast.error(getErrorMessage(mutationError));
		},
		onSettled: async () => {
			// Com outras pesagens ainda no ar, um refetch agora apagaria o otimismo delas; a última sincroniza.
			if (queryClient.isMutating({ mutationKey: weighMutationKey }) > 1) return;
			await queryClient.invalidateQueries({ queryKey });
		},
	});

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!production) return null;

	const status = production.status;
	const isPlanned = isPlannedStatus(status);
	const isRunning = status === "EM_PRODUCAO";
	const isDone = status === "CONCLUIDA";
	const isCancelled = status === "CANCELADA";

	const panelOptions = getPanelOptions(status);
	const panel = panelChoice?.status === status && panelOptions.includes(panelChoice.panel) ? panelChoice.panel : getDefaultPanel(status);

	const weighOrder = getWeighOrder(production);
	const firstPending = weighOrder.find((entry) => !entry.weighed) ?? weighOrder[0] ?? null;
	const currentKey = findWeighItem(production, selected) ? selected : firstPending ? { kind: firstPending.kind, id: firstPending.id } : null;
	const current = findWeighItem(production, currentKey);

	const lotIds = production.lotes.map((lot) => lot.id);
	const previewHref = lotIds.length > 0 ? buildLabelsPreviewHref(lotIds) : null;
	const canPrintLabels = (hasLabelPrinter && production.saidas.length > 0) || !!previewHref;
	function handlePrintLabels() {
		if (hasLabelPrinter && production) return printLabels({ finalidade: "ETIQUETA_LOTE", producaoId: production.id });
		if (previewHref) window.open(previewHref, "_blank", "noopener,noreferrer");
	}

	function selectItem(key: TWeighItemKey) {
		setSelected(key);
		setPanelChoice({ status, panel: "pesagem" });
		// Em uma coluna o teclado fica abaixo da lista: traz ele para a tela.
		const aside = asideRef.current;
		if (aside && aside.getBoundingClientRect().top > window.innerHeight * 0.6) aside.scrollIntoView({ behavior: "smooth", block: "start" });
	}

	function confirmWeighing(quantidadeReal: number) {
		if (!currentKey) return;
		const orderAfterConfirm = weighOrder.map((entry) =>
			entry.kind === currentKey.kind && entry.id === currentKey.id ? { ...entry, weighed: true } : entry,
		);
		weigh({ productionId, itemId: currentKey.id, itemKind: currentKey.kind, quantidadeReal });
		setSelected(getNextWeighKey(orderAfterConfirm, currentKey));
	}

	function resetWeighing() {
		if (!currentKey) return;
		weigh({ productionId, itemId: currentKey.id, itemKind: currentKey.kind, quantidadeReal: null });
	}

	let primaryAction: TPrimaryAction = null;
	if (isPlanned) {
		primaryAction = {
			label: "INICIAR PRODUÇÃO",
			icon: Play,
			hint: permissions.editar ? "Começa a contar o tempo e libera a pesagem." : "Você não possui permissão para iniciar produções.",
			disabled: !permissions.editar,
			loading: isStarting,
			onClick: () => start({ productionId }),
		};
	} else if (isRunning) {
		const readiness = getCompletionReadiness(production);
		primaryAction = {
			label: "CONCLUIR PRODUÇÃO",
			icon: CircleCheck,
			hint: permissions.concluir ? readiness.hint : "Você não possui permissão para concluir produções.",
			// Uma pesagem ainda no ar pode ser justamente a da saída: concluir antes dela chegar seria recusado.
			disabled: !permissions.concluir || !readiness.ready || pendingWeighs > 0,
			loading: isCompleting,
			onClick: () => complete({ productionId }),
		};
	} else if (isDone) {
		primaryAction = {
			label: "IMPRIMIR ETIQUETAS",
			icon: Printer,
			hint: hasLabelPrinter
				? "Envia para a impressora de etiquetas de lote."
				: previewHref
					? "Sem impressora de etiquetas conectada: abre a pré-visualização para imprimir."
					: "Nenhuma impressora ativa atende a etiquetas. Configure em Configurações → Dispositivos.",
			disabled: !canPrintLabels,
			loading: isPrinting,
			onClick: handlePrintLabels,
		};
	}

	return (
		<div className="@container flex w-full max-w-full grow flex-col gap-4 overflow-x-clip bg-background py-3">
			<ProductionDetailHeader
				production={production}
				primaryAction={primaryAction}
				onEdit={isPlanned && permissions.editar ? () => setEditOpen(true) : undefined}
				onCancel={permissions.excluir && !isDone && !isCancelled ? () => cancel({ productionId }) : undefined}
				isCancelling={isCancelling}
			/>
			<div className="grid w-full grid-cols-1 items-start gap-3.5 @min-[900px]:grid-cols-[minmax(0,1fr)_380px]">
				<ItemsPanel production={production} selectable={isRunning} selected={currentKey} onSelect={selectItem} />
				<aside ref={asideRef} className="scroll-mt-3 @min-[900px]:sticky @min-[900px]:top-3">
					<Section.Root className="gap-3 p-3">
						{panelOptions.length > 1 ? (
							<div role="tablist" aria-label="Painel da produção" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
								{panelOptions.map((option) => {
									const tab = PANEL_TABS[option];
									const active = option === panel;
									return (
										<button
											key={option}
											type="button"
											role="tab"
											aria-selected={active}
											onClick={() => setPanelChoice({ status, panel: option })}
											className={cn(
												"flex h-11 items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold transition-colors",
												active ? "bg-card text-foreground shadow-xs" : "text-foreground/60 hover:text-foreground",
											)}
										>
											<tab.icon className="h-4 w-4" />
											{tab.label}
										</button>
									);
								})}
							</div>
						) : null}
						{panel === "pesagem" ? (
							isPlanned ? (
								<WeighingLocked text="Inicie a produção para liberar a pesagem." />
							) : !permissions.editar ? (
								<WeighingLocked text="Você não possui permissão para pesar os itens desta produção." />
							) : current && currentKey ? (
								<WeighingPad current={current} pendingAfter={hasPendingAfter(weighOrder, currentKey)} onConfirm={confirmWeighing} onReset={resetWeighing} />
							) : (
								<WeighingLocked text="Nenhum item para pesar nesta produção." />
							)
						) : null}
						{panel === "preparo" ? <PreparationMethod production={production} /> : null}
						{panel === "etiquetas" ? (
							<LabelsPanel production={production} canPrint={canPrintLabels} isPrinting={isPrinting} onPrint={handlePrintLabels} previewHref={previewHref} />
						) : null}
					</Section.Root>
				</aside>
			</div>
			{editOpen ? (
				<ControlProduction productionId={productionId} closeModal={() => setEditOpen(false)} callbacks={{ onSettled: () => void refreshProduction() }} />
			) : null}
		</div>
	);
}

function buildLabelsPreviewHref(lotIds: string[]) {
	return `${appRoutes.inventory.lotLabelsPreview()}?ids=${lotIds.join(",")}`;
}

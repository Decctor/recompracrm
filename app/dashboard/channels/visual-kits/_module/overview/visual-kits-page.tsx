"use client";

import type { TGetVisualKitsOutputDefault } from "@/app/api/visual-kits/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { ActionToolbar } from "@/components/ui/action-toolbar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { LoadingButton } from "@/components/loading-button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale } from "@/lib/formatting";
import { deleteVisualKit } from "@/lib/mutations/visual-kits";
import { appRoutes } from "@/lib/navigation/routes";
import { useVisualKits } from "@/lib/queries/visual-kits";
import { cn } from "@/lib/utils";
import { VISUAL_KIT_FORMATS } from "@/lib/visual-kits/formats";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

type TVisualKitListItem = TGetVisualKitsOutputDefault[number];

export default function VisualKitsPage() {
	const { data: kits, isLoading, isError, error, queryKey } = useVisualKits();
	const [kitToDelete, setKitToDelete] = useState<TVisualKitListItem | null>(null);

	return (
		<div className="flex h-full w-full flex-col gap-3">
			<div className="flex w-full flex-col justify-between gap-2 lg:flex-row lg:items-center">
				<div className="flex flex-col">
					<h1 className="text-lg font-semibold tracking-tight">Comunicação visual</h1>
					<p className="text-xs text-muted-foreground">
						{kits ? (kits.length === 1 ? "1 kit salvo" : `${kits.length} kits salvos`) : "Kits de etiquetas, encartes e posts com os preços do catálogo."}
					</p>
				</div>
				<ActionToolbar>
					<ActionToolbar.Primary asChild icon={Plus}>
						<Link href={appRoutes.channels.newVisualKit()}>NOVO KIT</Link>
					</ActionToolbar.Primary>
				</ActionToolbar>
			</div>

			{isLoading ? (
				<div className="flex flex-col gap-2">
					{[0, 1, 2].map((index) => (
						<Skeleton key={index} className="h-24 w-full rounded-2xl" />
					))}
				</div>
			) : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{kits && kits.length === 0 ? (
				<Empty className="rounded-2xl border border-dashed border-border py-12">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Palette />
						</EmptyMedia>
						<EmptyTitle>Nenhum kit ainda</EmptyTitle>
						<EmptyDescription>Monte etiquetas, encartes, posts e stories de uma vez, com os mesmos produtos e preços.</EmptyDescription>
					</EmptyHeader>
					<Button asChild>
						<Link href={appRoutes.channels.newVisualKit()}>
							<Plus className="h-4 w-4" />
							NOVO KIT
						</Link>
					</Button>
				</Empty>
			) : null}

			<div className="flex flex-col gap-2">
				{kits?.map((kit) => (
					<VisualKitCard key={kit.id} kit={kit} onDelete={() => setKitToDelete(kit)} />
				))}
			</div>

			<DeleteVisualKitDialog kit={kitToDelete} onClose={() => setKitToDelete(null)} listQueryKey={queryKey} />
		</div>
	);
}

function VisualKitCard({ kit, onDelete }: { kit: TVisualKitListItem; onDelete: () => void }) {
	const updatedAt = kit.dataAtualizacao ?? kit.dataInsercao;
	const pieceLabel = kit.formatos.length === 1 ? "1 peça" : `${kit.formatos.length} peças`;
	const productLabel = kit.quantidadeItens === 1 ? "1 produto" : `${kit.quantidadeItens} produtos`;

	return (
		<div className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-brand/30 lg:flex-row lg:items-center">
			<Link href={appRoutes.channels.visualKit(kit.id)} className="flex min-w-0 flex-1 items-start gap-3">
				<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
					<Package className="h-5 w-5" />
				</span>
				<span className="flex min-w-0 flex-col gap-1">
					<span className="flex flex-wrap items-center gap-2">
						<span className="truncate text-sm font-semibold tracking-tight">{kit.nome || "Sem nome"}</span>
						<span
							className={cn(
								"rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
								kit.status === "GERADO" ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground",
							)}
						>
							{kit.status === "GERADO" ? "Gerado" : "Rascunho"}
						</span>
					</span>
					<span className="text-xs text-muted-foreground">
						{productLabel} · {pieceLabel} · atualizado em {formatDateAsLocale(updatedAt, true)}
						{kit.validadeFim ? ` · válido até ${formatDateAsLocale(kit.validadeFim)}` : ""}
					</span>
					<span className="flex flex-wrap gap-1">
						{kit.formatos.map((formato) => {
							const format = VISUAL_KIT_FORMATS[formato];
							const Icon = format.icone;
							return (
								<span
									key={formato}
									className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground/80"
								>
									<Icon className="h-3 w-3 opacity-70" />
									{format.nome}
								</span>
							);
						})}
					</span>
				</span>
			</Link>
			<div className="flex shrink-0 items-center gap-1 self-end lg:self-center">
				<Button type="button" variant="ghost" size="sm" asChild>
					<Link href={appRoutes.channels.visualKit(kit.id)}>
						<Pencil className="h-3.5 w-3.5" />
						EDITAR
					</Link>
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={onDelete} aria-label={`Excluir ${kit.nome}`}>
					<Trash2 className="h-3.5 w-3.5" />
				</Button>
			</div>
		</div>
	);
}

function DeleteVisualKitDialog({ kit, onClose, listQueryKey }: { kit: TVisualKitListItem | null; onClose: () => void; listQueryKey: string[] }) {
	const queryClient = useQueryClient();
	const { mutate, isPending } = useMutation({
		mutationKey: ["delete-visual-kit"],
		mutationFn: deleteVisualKit,
		onSuccess: async (data) => {
			toast.success(data.message);
			onClose();
			await queryClient.invalidateQueries({ queryKey: listQueryKey });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	return (
		<Dialog open={!!kit} onOpenChange={(open) => (!open ? onClose() : undefined)}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Excluir kit?</DialogTitle>
					<DialogDescription>“{kit?.nome}” e as configurações das peças serão excluídos. Os produtos do catálogo não são alterados.</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<LoadingButton variant="destructive" loading={isPending} onClick={() => kit && mutate({ id: kit.id })}>
						Excluir kit
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

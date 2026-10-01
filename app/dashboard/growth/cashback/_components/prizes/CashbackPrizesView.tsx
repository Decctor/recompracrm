"use client";

import type { TGetCashbackProgramPrizesOutputDefault } from "@/app/api/cashback-programs/prizes/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";
import { formatCashbackValue, formatDateAsLocale, getCashbackUnitLabel } from "@/lib/formatting";
import { restoreCashbackProgramPrize, updateCashbackProgramPrize } from "@/lib/mutations/cashback-programs";
import { useCashbackProgramPrizes } from "@/lib/queries/cashback-programs";
import { cn } from "@/lib/utils";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, ArchiveRestore, Gift, MoreHorizontal, Pencil, Plus, Printer, Search, Trash2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import DeletePrizeDialog from "./DeletePrizeDialog";
import PrizeEditor, { type TPrizeEditorFocus } from "./PrizeEditor";

type TPrize = TGetCashbackProgramPrizesOutputDefault[number];

type TStatusFilter = "TODAS" | "ATIVAS" | "INATIVAS" | "ARQUIVADAS";
type TSortMode = "VALOR" | "NOME" | "RESGATES";

const SORT_LABELS: Record<TSortMode, string> = {
	VALOR: "Menor valor",
	NOME: "Nome",
	RESGATES: "Mais resgatadas",
};

/** Linha aberta no editor: uma recompensa existente, o rascunho de uma nova, ou nada. */
type TOpenEditor = { prizeId: string | "NEW"; focus: TPrizeEditorFocus } | null;

type CashbackPrizesViewProps = {
	organizationId: string;
	programId: string;
	terminology: TCashbackProgramTerminologyEnum;
};

export default function CashbackPrizesView({ organizationId, programId, terminology }: CashbackPrizesViewProps) {
	const queryClient = useQueryClient();
	const { data: prizes, queryKey, isLoading, isError, error } = useCashbackProgramPrizes({ programId });

	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<TStatusFilter>("TODAS");
	const [sortMode, setSortMode] = useState<TSortMode>("VALOR");
	const [openEditor, setOpenEditor] = useState<TOpenEditor>(null);
	const [editorIsDirty, setEditorIsDirty] = useState(false);
	const [deletingPrize, setDeletingPrize] = useState<TPrize | null>(null);
	const editorHolderRef = useRef<HTMLDivElement>(null);

	const handleOnMutate = useCallback(async () => {
		await queryClient.cancelQueries({ queryKey });
	}, [queryClient, queryKey]);
	const handleOnSettled = useCallback(async () => {
		await queryClient.invalidateQueries({ queryKey: ["cashback-program-prizes"] });
		await queryClient.invalidateQueries({ queryKey: ["cashback-program"] });
	}, [queryClient]);
	const mutationCallbacks = useMemo(() => ({ onMutate: handleOnMutate, onSettled: handleOnSettled }), [handleOnMutate, handleOnSettled]);

	const counts = useMemo(() => {
		const all = prizes ?? [];
		const archived = all.filter((prize) => !!prize.dataArquivamento);
		const current = all.filter((prize) => !prize.dataArquivamento);
		return {
			TODAS: current.length,
			ATIVAS: current.filter((prize) => prize.ativo).length,
			INATIVAS: current.filter((prize) => !prize.ativo).length,
			ARQUIVADAS: archived.length,
		};
	}, [prizes]);

	const visiblePrizes = useMemo(() => {
		const normalizedSearch = normalize(search);
		const filtered = (prizes ?? []).filter((prize) => {
			if (statusFilter === "ARQUIVADAS" ? !prize.dataArquivamento : !!prize.dataArquivamento) return false;
			if (statusFilter === "ATIVAS" && !prize.ativo) return false;
			if (statusFilter === "INATIVAS" && prize.ativo) return false;
			if (!normalizedSearch) return true;
			const haystack = normalize([prize.titulo, prize.descricao, prize.produto?.nome, prize.produtoVariante?.nome].filter(Boolean).join(" "));
			return haystack.includes(normalizedSearch);
		});
		return filtered.sort((a, b) => {
			if (sortMode === "NOME") return a.titulo.localeCompare(b.titulo, "pt-BR");
			if (sortMode === "RESGATES") return b.resgatesQuantidade - a.resgatesQuantidade || a.valor - b.valor;
			return a.valor - b.valor || a.titulo.localeCompare(b.titulo, "pt-BR");
		});
	}, [prizes, search, statusFilter, sortMode]);

	// Um rascunho por vez: abrir outra linha com alterações pendentes jogaria o trabalho fora sem aviso.
	function requestOpenEditor(next: NonNullable<TOpenEditor>) {
		if (openEditor && editorIsDirty && openEditor.prizeId !== next.prizeId) {
			editorHolderRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
			toast.warning("Salve ou descarte a recompensa aberta antes de abrir outra.");
			return;
		}
		if (next.prizeId === "NEW") {
			setSearch("");
			setStatusFilter("TODAS");
		}
		setOpenEditor(next);
	}
	const closeEditor = useCallback(() => setOpenEditor(null), []);

	// Liga/desliga direto na linha, sem abrir o editor. Otimista: o switch responde na hora e volta
	// se o servidor recusar.
	const { mutate: toggleActive } = useMutation({
		mutationKey: ["toggle-cashback-program-prize"],
		mutationFn: async (prize: TPrize) =>
			await updateCashbackProgramPrize({
				cashbackProgramPrizeId: prize.id,
				cashbackProgramPrize: {
					ativo: !prize.ativo,
					produtoId: prize.produtoId,
					produtoVarianteId: prize.produtoVarianteId,
					titulo: prize.titulo,
					descricao: prize.descricao,
					imagemCapaUrl: prize.imagemCapaUrl,
					valor: prize.valor,
				},
			}),
		onMutate: async (prize) => {
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<TPrize[]>(queryKey);
			queryClient.setQueryData<TPrize[]>(queryKey, (current) =>
				current?.map((item) => (item.id === prize.id ? { ...item, ativo: !prize.ativo } : item)),
			);
			return { previous };
		},
		onSuccess: (_data, prize) => toast.success(prize.ativo ? `"${prize.titulo}" saiu do resgate.` : `"${prize.titulo}" voltou ao resgate.`),
		onError: (mutationError, _prize, context) => {
			if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
			toast.error(getErrorMessage(mutationError));
		},
		onSettled: handleOnSettled,
	});

	const { mutate: restorePrize, isPending: isRestoring } = useMutation({
		mutationKey: ["restore-cashback-program-prize"],
		mutationFn: restoreCashbackProgramPrize,
		onMutate: handleOnMutate,
		onSuccess: (data) => toast.success(data.message),
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
		onSettled: handleOnSettled,
	});

	const hasAnyPrize = (prizes?.length ?? 0) > 0;
	const isFiltering = !!search.trim() || statusFilter !== "TODAS";
	const isCreating = openEditor?.prizeId === "NEW";

	return (
		<Section.Root className="text-numeric">
			<Section.Header>
				<Section.Icon>
					<Gift />
				</Section.Icon>
				<Section.Title>Recompensas</Section.Title>
				{prizes ? <Section.Count>{counts.TODAS}</Section.Count> : null}
				<Section.Actions>
					<Button
						variant="ghost"
						size="sm"
						disabled={counts.ATIVAS === 0}
						onClick={() => window.open(`/cashback-rewards-display/${organizationId}`, "_blank", "noopener,noreferrer")}
					>
						<Printer className="h-4 w-4" />
						IMPRIMIR RESUMO
					</Button>
					<Button size="sm" disabled={isCreating} onClick={() => requestOpenEditor({ prizeId: "NEW", focus: "produto" })}>
						<Plus className="h-4 w-4" />
						ADICIONAR
					</Button>
				</Section.Actions>
			</Section.Header>

			{hasAnyPrize ? (
				<div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
					<InputGroup className="rounded-xl lg:max-w-sm">
						<InputGroupAddon>
							<Search />
						</InputGroupAddon>
						<InputGroupInput value={search} placeholder="Buscar por título ou produto..." onChange={(event) => setSearch(event.target.value)} />
					</InputGroup>
					<div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por status">
						{(["TODAS", "ATIVAS", "INATIVAS", "ARQUIVADAS"] as const).map((status) =>
							status === "ARQUIVADAS" && counts.ARQUIVADAS === 0 && statusFilter !== "ARQUIVADAS" ? null : (
								<Button
									key={status}
									size="sm"
									variant={statusFilter === status ? "default" : "outline"}
									aria-pressed={statusFilter === status}
									onClick={() => setStatusFilter(status)}
								>
									{STATUS_LABELS[status]}
									<span className={cn("text-micro", statusFilter === status ? "opacity-80" : "text-muted-foreground")}>{counts[status]}</span>
								</Button>
							),
						)}
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant="ghost" size="sm" className="lg:ml-auto" aria-label="Ordenar recompensas">
									<ArrowDownUp className="h-4 w-4" />
									{SORT_LABELS[sortMode].toUpperCase()}
								</Button>
							}
						/>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuRadioGroup value={sortMode} onValueChange={(value) => setSortMode(value as TSortMode)}>
								{(Object.keys(SORT_LABELS) as TSortMode[]).map((mode) => (
									<DropdownMenuRadioItem key={mode} value={mode}>
										{SORT_LABELS[mode]}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			) : null}

			<Section.Bleed className="divide-y divide-border">
				{isCreating ? (
					<div ref={editorHolderRef}>
						<PrizeEditor
							organizationId={organizationId}
							programId={programId}
							terminology={terminology}
							initialFocus="produto"
							onDirtyChange={setEditorIsDirty}
							onClose={closeEditor}
							callbacks={mutationCallbacks}
						/>
					</div>
				) : null}

				{isLoading ? <PrizeListSkeleton /> : null}
				{isError ? (
					<div className="p-4">
						<ErrorComponent msg={getErrorMessage(error)} />
					</div>
				) : null}

				{prizes && !hasAnyPrize && !isCreating ? (
					<Empty className="py-10">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Gift />
							</EmptyMedia>
							<EmptyTitle>Nenhuma recompensa ainda</EmptyTitle>
							<EmptyDescription>
								Recompensas são produtos que o cliente troca por {getCashbackUnitLabel(terminology)} no tablet, no PDV e na loja.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button size="sm" onClick={() => requestOpenEditor({ prizeId: "NEW", focus: "produto" })}>
								<Plus className="h-4 w-4" />
								ADICIONAR PRIMEIRA RECOMPENSA
							</Button>
						</EmptyContent>
					</Empty>
				) : null}

				{prizes && hasAnyPrize && visiblePrizes.length === 0 ? (
					<Empty className="py-10">
						<EmptyHeader>
							<EmptyTitle>{search.trim() ? `Nenhuma recompensa para "${search.trim()}"` : "Nenhuma recompensa neste filtro"}</EmptyTitle>
						</EmptyHeader>
						{isFiltering ? (
							<EmptyContent>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										setSearch("");
										setStatusFilter("TODAS");
									}}
								>
									LIMPAR FILTROS
								</Button>
							</EmptyContent>
						) : null}
					</Empty>
				) : null}

				{visiblePrizes.map((prize) =>
					openEditor?.prizeId === prize.id ? (
						<div key={prize.id} ref={editorHolderRef}>
							<PrizeEditor
								prize={prize}
								organizationId={organizationId}
								programId={programId}
								terminology={terminology}
								initialFocus={openEditor.focus}
								onDirtyChange={setEditorIsDirty}
								onClose={closeEditor}
								callbacks={mutationCallbacks}
							/>
						</div>
					) : (
						<PrizeRow
							key={prize.id}
							prize={prize}
							terminology={terminology}
							isRestoring={isRestoring}
							onEdit={(focus) => requestOpenEditor({ prizeId: prize.id, focus })}
							onToggleActive={() => toggleActive(prize)}
							onDelete={() => setDeletingPrize(prize)}
							onRestore={() => restorePrize({ id: prize.id })}
						/>
					),
				)}
			</Section.Bleed>

			{deletingPrize ? <DeletePrizeDialog prize={deletingPrize} closeDialog={() => setDeletingPrize(null)} callbacks={mutationCallbacks} /> : null}
		</Section.Root>
	);
}

const STATUS_LABELS: Record<TStatusFilter, string> = {
	TODAS: "TODAS",
	ATIVAS: "ATIVAS",
	INATIVAS: "INATIVAS",
	ARQUIVADAS: "ARQUIVADAS",
};

function normalize(value: string) {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.trim();
}

type PrizeRowProps = {
	prize: TPrize;
	terminology: TCashbackProgramTerminologyEnum;
	isRestoring: boolean;
	onEdit: (focus: TPrizeEditorFocus) => void;
	onToggleActive: () => void;
	onDelete: () => void;
	onRestore: () => void;
};

function PrizeRow({ prize, terminology, isRestoring, onEdit, onToggleActive, onDelete, onRestore }: PrizeRowProps) {
	const isArchived = !!prize.dataArquivamento;
	const linkedName = prize.produtoVariante && prize.produto ? `${prize.produto.nome} · ${prize.produtoVariante.nome}` : (prize.produto?.nome ?? null);
	const imageUrl = prize.imagemCapaUrl || prize.produtoVariante?.imagemCapaUrl || prize.produto?.imagemCapaUrl || null;
	// O título nasce do nome do produto; repetir o mesmo texto embaixo era o ruído da tela antiga.
	const subtitleParts = [
		linkedName && linkedName !== prize.titulo ? linkedName : null,
		prize.descricao && prize.descricao !== prize.titulo ? prize.descricao : null,
	].filter(Boolean);

	return (
		<div
			className={cn(
				"flex w-full items-center gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-muted/40",
				!prize.ativo && "text-muted-foreground",
			)}
		>
			<button
				type="button"
				onClick={() => (isArchived ? null : onEdit("produto"))}
				disabled={isArchived}
				className="flex min-w-0 grow items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default"
				aria-label={isArchived ? prize.titulo : `Editar ${prize.titulo}`}
			>
				<span className={cn("relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted", !prize.ativo && "opacity-60")}>
					{imageUrl ? (
						<Image src={imageUrl} alt="" fill sizes="44px" className="object-cover" />
					) : (
						<span className="flex h-full w-full items-center justify-center text-muted-foreground">
							<Gift className="h-4 w-4" />
						</span>
					)}
				</span>
				<span className="flex min-w-0 flex-col gap-0.5">
					<span className="flex min-w-0 items-center gap-2">
						<span className={cn("truncate text-sm font-semibold tracking-tight", prize.ativo ? "text-foreground" : "text-muted-foreground")}>
							{prize.titulo}
						</span>
						{isArchived ? (
							<Chip.Root variant="muted" size="xs" shape="pill">
								<Chip.Label caps>Arquivada</Chip.Label>
							</Chip.Root>
						) : !prize.ativo ? (
							<Chip.Root variant="outline" size="xs" shape="pill">
								<Chip.Label caps>Inativa</Chip.Label>
							</Chip.Root>
						) : null}
					</span>
					{isArchived ? (
						<span className="truncate text-xs text-muted-foreground">Arquivada em {formatDateAsLocale(prize.dataArquivamento)}</span>
					) : subtitleParts.length > 0 ? (
						<span className="truncate text-xs text-muted-foreground">{subtitleParts.join(" · ")}</span>
					) : null}
				</span>
			</button>

			<span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block">
				{prize.resgatesQuantidade === 0 ? "Sem resgates" : prize.resgatesQuantidade === 1 ? "1 resgate" : `${prize.resgatesQuantidade} resgates`}
			</span>

			<button
				type="button"
				disabled={isArchived}
				onClick={() => onEdit("valor")}
				title={isArchived ? undefined : "Alterar valor"}
				className={cn(
					"shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default",
					prize.ativo ? "border-brand/35 bg-brand/15 text-foreground enabled:hover:bg-brand/25" : "border-border bg-transparent text-muted-foreground",
				)}
			>
				{formatCashbackValue(prize.valor, terminology).toUpperCase()}
			</button>

			{isArchived ? (
				<Button variant="ghost" size="sm" disabled={isRestoring} onClick={onRestore}>
					<ArchiveRestore className="h-4 w-4" />
					RESTAURAR
				</Button>
			) : (
				<>
					<Switch
						checked={prize.ativo}
						onCheckedChange={onToggleActive}
						aria-label={prize.ativo ? `Desativar ${prize.titulo}` : `Ativar ${prize.titulo}`}
					/>
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${prize.titulo}`}>
									<MoreHorizontal className="h-4 w-4" />
								</Button>
							}
						/>
						<DropdownMenuContent align="end" className="w-44">
							<DropdownMenuGroup>
								<DropdownMenuItem onClick={() => onEdit("produto")}>
									<Pencil className="h-3.5 w-3.5" />
									EDITAR
								</DropdownMenuItem>
								<DropdownMenuItem variant="destructive" onClick={onDelete}>
									<Trash2 className="h-3.5 w-3.5" />
									EXCLUIR
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</>
			)}
		</div>
	);
}

function PrizeListSkeleton() {
	return (
		<>
			{[0, 1, 2, 3].map((index) => (
				<div key={index} className="flex w-full items-center gap-3 px-3 py-2.5">
					<Skeleton className="h-11 w-11 rounded-lg" />
					<div className="flex grow flex-col gap-1.5">
						<Skeleton className="h-3.5 w-40" />
						<Skeleton className="h-3 w-24" />
					</div>
					<Skeleton className="h-6 w-20 rounded-full" />
				</div>
			))}
		</>
	);
}

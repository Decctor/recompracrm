"use client";

import type { TGetFixedAssetsOutputDefault } from "@/app/api/fixed-assets/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import ControlFixedAsset from "@/components/Modals/FixedAssets/ControlFixedAsset";
import NewFixedAsset from "@/components/Modals/FixedAssets/NewFixedAsset";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { runFixedAssetAction } from "@/lib/mutations/fixed-assets";
import { appRoutes } from "@/lib/navigation/routes";
import { useFixedAssets, useFixedAssetsPendingMonths } from "@/lib/queries/fixed-assets";
import { cn } from "@/lib/utils";
import { FIXED_ASSET_STATUS_LABELS, type TFixedAssetStatusEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Landmark, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_FILTERS: { value: TFixedAssetStatusEnum[]; label: string }[] = [
	{ value: ["EM_USO", "EM_MANUTENCAO"], label: "ATIVOS" },
	{ value: ["BAIXADO"], label: "BAIXADOS" },
	{ value: [], label: "TODOS" },
];

const STATUS_TONES: Record<TFixedAssetStatusEnum, string> = {
	EM_USO: "bg-green-500/10 text-green-700 dark:text-green-400",
	EM_MANUTENCAO: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
	BAIXADO: "bg-muted text-muted-foreground",
};

type AssetsPageProps = { membership: NonNullable<TAuthUserSession["membership"]> };

/**
 * Patrimônio (ADR-0002, decisão 8): as unidades do ativo imobilizado. O produto continua sendo o
 * catálogo; aqui vivem os bens, sua depreciação e o fechamento mensal.
 */
export default function AssetsPage({ membership }: AssetsPageProps) {
	const queryClient = useQueryClient();
	const canEdit = membership.permissoes.compras.editar;
	const { data, isLoading, isError, isSuccess, error, filters, updateFilters } = useFixedAssets();
	const { data: pendingMonths } = useFixedAssetsPendingMonths();
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const assets = data?.assets ?? [];

	const { mutate: closeMonth, isPending: closing } = useMutation({
		mutationKey: ["fixed-assets-close-month"],
		mutationFn: runFixedAssetAction,
		onSuccess: async (response) => {
			toast.success(response.message);
			await queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
			await queryClient.invalidateQueries({ queryKey: ["fixed-assets-pending-months"] });
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	const activeFilterLabel = STATUS_FILTERS.find((option) => option.value.join(",") === filters.statuses.join(","))?.label ?? "TODOS";

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex w-full flex-col-reverse items-center gap-2 lg:flex-row">
				<Input value={filters.search} placeholder="Pesquisar bem, plaqueta, série ou local..." onChange={(event) => updateFilters({ search: event.target.value, page: 1 })} className="grow rounded-xl" />
				<div className="flex items-center gap-1">
					{STATUS_FILTERS.map((option) => (
						<Button
							key={option.label}
							type="button"
							size="sm"
							variant={activeFilterLabel === option.label ? "default" : "outline"}
							onClick={() => updateFilters({ statuses: option.value, page: 1 })}
						>
							{option.label}
						</Button>
					))}
				</div>
				{canEdit ? (
					<Button className="flex items-center gap-2" size="sm" onClick={() => setCreating(true)}>
						<Plus className="h-4 w-4" />
						NOVO BEM
					</Button>
				) : null}
			</div>

			{pendingMonths && pendingMonths.length > 0 ? (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
					<span>
						<CalendarCheck className="mr-1.5 inline h-4 w-4" />
						{pendingMonths.length === 1 ? `O mês ${pendingMonths[0]} ainda não teve o fechamento de depreciação lançado.` : `${pendingMonths.length} meses sem fechamento de depreciação (${pendingMonths[0]} a ${pendingMonths[pendingMonths.length - 1]}).`}{" "}
						O fechamento roda sozinho toda madrugada.
					</span>
					{canEdit ? (
						<Button size="xs" variant="outline" disabled={closing} onClick={() => closeMonth({ action: "FECHAR_MES", month: pendingMonths[0] })}>
							FECHAR {pendingMonths[0]} AGORA
						</Button>
					) : null}
				</div>
			) : null}

			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={data?.totalPages ?? 0}
				itemsMatchedText={`${data?.assetsMatched ?? 0} ${data?.assetsMatched === 1 ? "bem encontrado" : "bens encontrados"}.`}
				itemsShowingText={`Mostrando ${assets.length} ${assets.length === 1 ? "bem" : "bens"}.`}
			/>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				assets.length > 0 ? (
					assets.map((asset) => <AssetCard key={asset.id} asset={asset} onEdit={() => setEditingId(asset.id)} />)
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Landmark />
							</EmptyMedia>
							<EmptyTitle>Nenhum bem encontrado</EmptyTitle>
							<EmptyDescription>
								Bens nascem do recebimento de compras com destinação "Ativo imobilizado" ou do cadastro manual do que já existia.
							</EmptyDescription>
						</EmptyHeader>
						{canEdit ? (
							<EmptyContent className="flex-row justify-center gap-2">
								<Button onClick={() => setCreating(true)}>CADASTRAR BEM</Button>
							</EmptyContent>
						) : null}
					</Empty>
				)
			) : null}

			{creating ? <NewFixedAsset closeModal={() => setCreating(false)} /> : null}
			{editingId ? <ControlFixedAsset assetId={editingId} closeModal={() => setEditingId(null)} editable={canEdit} /> : null}
		</div>
	);
}

function AssetCard({ asset, onEdit }: { asset: TGetFixedAssetsOutputDefault["assets"][number]; onEdit: () => void }) {
	return (
		<div className="bg-card border-border flex w-full flex-col gap-2 rounded-xl border px-3 py-3 shadow-2xs">
			<div className="flex w-full flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<Landmark className="h-4 w-4 shrink-0 text-muted-foreground" />
					<button type="button" onClick={onEdit} className="truncate text-left text-sm font-bold tracking-tight hover:underline">
						{asset.descricao}
					</button>
					{asset.codigoPatrimonio ? <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] font-bold">{asset.codigoPatrimonio}</span> : null}
				</div>
				<div className="flex items-center gap-2">
					<span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight", STATUS_TONES[asset.status])}>
						{FIXED_ASSET_STATUS_LABELS[asset.status]}
					</span>
					<Button variant="ghost" size="xs" onClick={onEdit}>
						<Pencil className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
			<div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] font-medium text-muted-foreground">
				<span>
					{asset.quantidade} un. · aquisição <strong className="text-foreground">{formatToMoney(asset.valorAquisicao)}</strong>
				</span>
				<span>
					valor contábil <strong className="text-foreground">{formatToMoney(asset.posicao.valorContabil)}</strong>
				</span>
				<span>depreciado {formatToMoney(asset.posicao.depreciacaoAcumulada)}</span>
				<span>em uso desde {formatDateAsLocale(asset.dataInicioUso)}</span>
				{asset.localizacao ? <span>{asset.localizacao}</span> : null}
				{asset.produto ? <span>catálogo: {asset.produto.nome}</span> : null}
				{asset.compra ? (
					<Link href={appRoutes.purchase(asset.compra.id)} className="underline">
						compra: {asset.compra.titulo}
					</Link>
				) : null}
			</div>
		</div>
	);
}

"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { SalesChannelMark, salesChannelLabel } from "@/components/SalesChannels/SalesChannelMark";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import { groupMatrixProducts } from "@/lib/products/sales-channels-matrix";
import { useIfoodMerchantNames } from "@/lib/queries/ifood";
import {
	type TSalesChannelMatrix,
	type TSalesChannelMatrixChannel,
	type TSalesChannelMatrixLink,
	useSalesChannelMatrix,
} from "@/lib/queries/sales-channels";
import { cn } from "@/lib/utils";
import { useSalesChannelMatrixEditor } from "@/state-hooks/use-sales-channel-matrix-state";
import { AlertCircle, Search } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import ChannelMatrixGroupPanel from "./ChannelMatrixGroupPanel";
import { type TMatrixCellAccessors, type TMatrixChannelColumn, type TMatrixMerchantLinks, matrixLinkKey } from "./ChannelMatrixTable";

/**
 * Aba "Canais" de Produtos: o cardápio de todos os canais numa grade só. Ver
 * docs/catalog-channels-matrix-design.md.
 */
export default function ProductsChannelsView() {
	const { data: matrix, isLoading, isError, error } = useSalesChannelMatrix();

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!matrix) return <ErrorComponent msg="Matriz de canais não encontrada." />;

	return <ChannelMatrixEditor matrix={matrix} />;
}

const CHANNEL_ORDER = { POS: 0, SHOP: 1, COMANDA: 2, IFOOD: 3 } as const;

function sortChannels(channels: TSalesChannelMatrixChannel[]) {
	return channels.toSorted((a, b) => CHANNEL_ORDER[a.canal] - CHANNEL_ORDER[b.canal] || (a.refExterno ?? "").localeCompare(b.refExterno ?? ""));
}

/**
 * `?channel=` aceita o id do canal ou o tipo de um canal interno ("SHOP"): a vitrine da loja
 * linka para cá com o tipo, sem conhecer ids.
 */
function resolveFocusedChannel(channels: TSalesChannelMatrixChannel[], param: string | null) {
	if (param) {
		const byId = channels.find((channel) => channel.id === param);
		if (byId) return byId;
		const byType = channels.find((channel) => channel.canal === param && !channel.integracaoId && !channel.refExterno);
		if (byType) return byType;
	}
	return channels.find((channel) => channel.canal === "SHOP") ?? channels[0] ?? null;
}

function matchesSearch(product: TSalesChannelMatrix["products"][number], search: string) {
	if (!search) return true;
	const needle = search.toLocaleLowerCase("pt-BR");
	const haystack = [product.nome, product.codigo, product.grupo, ...product.variantes.flatMap((variant) => [variant.nome, variant.codigo ?? ""])]
		.join(" ")
		.toLocaleLowerCase("pt-BR");
	return haystack.includes(needle);
}

// O editor é um componente à parte para que o hook de rascunho nasça com um estado já resolvido.
function ChannelMatrixEditor({ matrix }: { matrix: TSalesChannelMatrix }) {
	const editor = useSalesChannelMatrixEditor({ matrix });
	const channels = useMemo(() => sortChannels(matrix.channels), [matrix.channels]);

	const hasIfood = channels.some((channel) => channel.canal === "IFOOD");
	const merchantNames = useIfoodMerchantNames({ enabled: hasIfood });

	const [channelParam, setChannelParam] = useQueryState("channel", parseAsString);
	const focusedChannel = resolveFocusedChannel(channels, channelParam);

	// Sem persistência: a URL diz qual canal está em foco, e o foco nasce visível. Chegando pela
	// vitrine (`?channel=SHOP`) a grade abre só com a loja, como a vitrine era; sem parâmetro,
	// abre com tudo.
	const [hiddenChannelIds, setHiddenChannelIds] = useState<Set<string>>(() => {
		if (!channelParam || !focusedChannel) return new Set();
		return new Set(channels.filter((channel) => channel.id !== focusedChannel.id).map((channel) => channel.id));
	});
	const toggleChannel = (canalVendaId: string) => {
		if (focusedChannel?.id === canalVendaId) return;
		setHiddenChannelIds((prev) => {
			const next = new Set(prev);
			if (next.has(canalVendaId)) next.delete(canalVendaId);
			else next.add(canalVendaId);
			return next;
		});
	};
	const focusChannel = (canalVendaId: string) => {
		setChannelParam(canalVendaId);
		setHiddenChannelIds((prev) => {
			const next = new Set(prev);
			next.delete(canalVendaId);
			return next;
		});
	};

	const links = useMemo(() => {
		const map = new Map<string, TSalesChannelMatrixLink>();
		for (const link of matrix.links) {
			if (!link.produtoId) continue;
			map.set(matrixLinkKey(link.merchantId, link.produtoId, link.produtoVarianteId), link);
		}
		return map;
	}, [matrix.links]);

	const merchantLinks = useMemo(() => {
		const map = new Map<string, TMatrixMerchantLinks>();
		for (const link of matrix.links) {
			const entry = map.get(link.merchantId) ?? { linkedItemIds: new Set<string>(), linkedProductIds: new Set<string>() };
			if (link.externoItemId) entry.linkedItemIds.add(link.externoItemId);
			if (link.produtoId) entry.linkedProductIds.add(link.produtoId);
			map.set(link.merchantId, entry);
		}
		return map;
	}, [matrix.links]);

	const columns: TMatrixChannelColumn[] = useMemo(
		() =>
			channels
				.filter((channel) => !hiddenChannelIds.has(channel.id))
				.map((channel) => ({
					channel,
					label: salesChannelLabel(channel, merchantNames),
					catalogoModo: editor.state.channels.get(channel.id)?.catalogoModo ?? channel.catalogoModo,
					linkedCount: channel.refExterno ? matrix.links.filter((link) => link.merchantId === channel.refExterno).length : 0,
					divergentCount: channel.refExterno
						? matrix.links.filter((link) => link.merchantId === channel.refExterno && (link.status === "DIVERGENTE" || link.status === "ERRO")).length
						: 0,
				})),
		[channels, editor.state.channels, hiddenChannelIds, matrix.links, merchantNames],
	);
	const focusedColumn = columns.find((column) => column.channel.id === focusedChannel?.id) ?? null;

	const [search, setSearch] = useState("");
	const filteredProducts = useMemo(() => matrix.products.filter((product) => matchesSearch(product, search.trim())), [matrix.products, search]);
	const focusedOrder = focusedChannel ? (editor.state.channels.get(focusedChannel.id)?.ordemGrupos ?? []) : [];
	const groups = useMemo(() => groupMatrixProducts(filteredProducts, focusedOrder), [filteredProducts, focusedOrder]);
	const orderableGroups = groups.filter((group) => !group.ungrouped);
	// A ordem exibida SEM o filtro de busca: mover um grupo com a busca ativa não pode apagar os
	// grupos que a busca escondeu.
	const displayedOrder = focusedChannel ? editor.displayedGroupsFor(focusedChannel.id) : [];

	const accessors: TMatrixCellAccessors = {
		cells: editor.state.cells,
		links,
		merchantLinks,
		cycleAvailability: editor.cycleAvailability,
		updatePrice: editor.updatePrice,
		setChannelCatalogMode: editor.setChannelCatalogMode,
	};

	const emptySelectionChannels = columns.filter((column) => {
		if (column.catalogoModo !== "SELECIONADOS" || column.channel.canal === "IFOOD") return false;
		for (const [key, cell] of editor.state.cells) {
			if (cell.disponivel === true && key.split(":")[1] === column.channel.id) return false;
		}
		return true;
	});

	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex flex-col gap-2 lg:flex-row lg:items-center">
				<div className="relative grow">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						placeholder="Pesquisar produto, código ou grupo..."
						onChange={(event) => setSearch(event.target.value)}
						className="rounded-xl pl-9"
					/>
				</div>
				{focusedChannel ? (
					<Select
						// O Select renderiza o rótulo do valor a partir de `items`; sem isso mostra o id.
						items={channels.map((channel) => ({ value: channel.id, label: `Foco: ${salesChannelLabel(channel, merchantNames)}` }))}
						value={focusedChannel.id}
						onValueChange={(value) => value && focusChannel(value)}
					>
						<SelectTrigger className="h-9 w-full rounded-xl lg:w-64" aria-label="Canal em foco">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{channels.map((channel) => (
								<SelectItem key={channel.id} value={channel.id}>
									Foco: {salesChannelLabel(channel, merchantNames)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : null}
			</div>

			<div className="flex flex-wrap items-center gap-1.5">
				<span className="mr-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">Canais</span>
				{channels.map((channel) => {
					const visible = !hiddenChannelIds.has(channel.id);
					const focused = focusedChannel?.id === channel.id;
					return (
						<button
							key={channel.id}
							type="button"
							aria-pressed={visible}
							disabled={focused}
							title={focused ? "Canal em foco: sempre visível" : visible ? "Ocultar coluna" : "Mostrar coluna"}
							onClick={() => toggleChannel(channel.id)}
							className={cn(
								"inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition-colors",
								visible ? "border-primary/30 bg-primary/5 text-foreground" : "border-border text-muted-foreground line-through opacity-70 hover:opacity-100",
								focused && "ring-1 ring-primary/40",
							)}
						>
							<SalesChannelMark canal={channel.canal} className="size-5 rounded-full" />
							{salesChannelLabel(channel, merchantNames)}
						</button>
					);
				})}
			</div>

			{emptySelectionChannels.length > 0 ? (
				<div className="flex items-start gap-3 rounded-2xl border border-brand-secondary/30 bg-brand-secondary/10 p-4">
					<AlertCircle className="mt-0.5 size-5 shrink-0" />
					<div>
						<p className="font-bold">{emptySelectionChannels.map((column) => column.label).join(", ")}: nenhum produto selecionado</p>
						<p className="mt-1 text-sm text-muted-foreground">
							No modo "somente os selecionados", só entra quem estiver marcado como DISPONÍVEL. Marque ao menos um produto ou volte para o modo de todos os
							produtos ativos.
						</p>
					</div>
				</div>
			) : null}

			<p className="text-xs text-muted-foreground">
				Disponibilidade e preço em branco herdam o cadastro do produto. Produtos com variantes precificam por variante. As setas dos grupos ordenam o
				canal em foco; a loja usa essa ordem na vitrine.
			</p>

			<div className="flex flex-col gap-3">
				{groups.map((group, index) => (
					<ChannelMatrixGroupPanel
						key={group.key || "__sem-grupo__"}
						group={group}
						position={index + 1}
						focusedLabel={focusedColumn?.label ?? (focusedChannel ? salesChannelLabel(focusedChannel, merchantNames) : "")}
						canMoveUp={!group.ungrouped && !search && orderableGroups.indexOf(group) > 0}
						canMoveDown={!group.ungrouped && !search && orderableGroups.indexOf(group) < orderableGroups.length - 1}
						otherGroups={orderableGroups.filter((item) => item.key !== group.key).map((item) => item.key)}
						columns={columns}
						focusedColumn={focusedColumn}
						accessors={accessors}
						moveGroup={(grupo, direction) => {
							if (!focusedChannel) return;
							editor.moveChannelGroup({ canalVendaId: focusedChannel.id, displayed: displayedOrder, grupo, direction });
						}}
						renameGroup={editor.renameGroup}
					/>
				))}

				{groups.length === 0 ? (
					<p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
						{search ? "Nenhum produto corresponde à busca." : "Nenhum produto vendável cadastrado."}
					</p>
				) : null}
			</div>

			<SectionApplyBar
				isDirty={editor.isDirty}
				isPending={editor.isPending}
				message="Alterações não salvas nos canais"
				applyButtonText="APLICAR CANAIS"
				onApply={editor.apply}
				onDiscard={editor.discard}
			/>
		</div>
	);
}

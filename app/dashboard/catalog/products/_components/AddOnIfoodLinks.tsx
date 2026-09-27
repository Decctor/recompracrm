"use client";

import type { TGetProductAddOnsOutputDefault } from "@/app/api/products/add-ons/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { LoadingButton } from "@/components/loading-button";
import { SalesChannelMark, salesChannelLabel } from "@/components/SalesChannels/SalesChannelMark";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { createCatalogLink, deleteCatalogLink, updateCatalogLinkPolicy } from "@/lib/mutations/catalog-links";
import { type TCatalogLink, useCatalogLinks } from "@/lib/queries/catalog-links";
import { useIfoodMerchantNames, useIfoodOptionGroups } from "@/lib/queries/ifood";
import { useSalesChannels } from "@/lib/queries/sales-channels";
import { cn } from "@/lib/utils";
import type { TCatalogLinkSyncPolicy } from "@/schemas/catalog-links";
import type { TCatalogLinkStatusEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Link2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type TAddOn = TGetProductAddOnsOutputDefault[number];

const STATUS_CHIP: Record<TCatalogLinkStatusEnum, { label: string; className: string }> = {
	PENDENTE: { label: "Pendente", className: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400" },
	SINCRONIZADO: { label: "Sincronizado", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
	DIVERGENTE: { label: "Divergente", className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500" },
	ERRO: { label: "Erro", className: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" },
	DESVINCULADO: { label: "Desvinculado", className: "border-border bg-muted text-muted-foreground" },
};

function normalize(value: string | null | undefined) {
	return (value ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.trim()
		.toLocaleLowerCase("pt-BR");
}

/**
 * Um chip por merchant iFood no card do grupo de adicionais: "Vincular" ou o status do vínculo
 * ADD_ON. O grupo é da organização, então o vínculo dele mora aqui, na aba Adicionais — não na
 * matriz de canais, que é por produto.
 */
export default function AddOnIfoodLinks({ addOn }: { addOn: TAddOn }) {
	const { data: channels } = useSalesChannels();
	const merchants = useMemo(
		() => (channels ?? []).filter((channel) => channel.canal === "IFOOD" && channel.refExterno).map((channel) => channel.refExterno as string),
		[channels],
	);
	const merchantNames = useIfoodMerchantNames({ enabled: merchants.length > 0 });
	if (merchants.length === 0) return null;

	return (
		<>
			{merchants.map((merchantId) => (
				<AddOnMerchantChip
					key={merchantId}
					addOn={addOn}
					merchantId={merchantId}
					merchantLabel={salesChannelLabel({ canal: "IFOOD", refExterno: merchantId }, merchantNames)}
				/>
			))}
		</>
	);
}

function AddOnMerchantChip({ addOn, merchantId, merchantLabel }: { addOn: TAddOn; merchantId: string; merchantLabel: string }) {
	const { data: links } = useCatalogLinks({ merchantId });
	const groupLink = useMemo(
		() => (links ?? []).find((link) => link.tipo === "ADD_ON" && link.produtoAddOnId === addOn.id && link.status !== "DESVINCULADO") ?? null,
		[addOn.id, links],
	);
	const [isOpen, setIsOpen] = useState(false);
	const chip = groupLink ? STATUS_CHIP[groupLink.status] : null;

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				title={groupLink ? `${merchantLabel}: ${chip?.label}` : `Vincular a um grupo de complementos em ${merchantLabel}`}
				className={cn(
					"inline-flex items-center gap-1 rounded-md border py-0.5 pl-0.5 pr-1.5 text-[0.6rem] font-medium uppercase tracking-wide transition-opacity hover:opacity-80",
					chip ? chip.className : "border-dashed border-border text-muted-foreground",
				)}
			>
				<SalesChannelMark canal="IFOOD" className="size-4 rounded" />
				{groupLink ? chip?.label : "Vincular"}
			</button>
			{isOpen ? (
				<AddOnIfoodLinkDialog
					addOn={addOn}
					merchantId={merchantId}
					merchantLabel={merchantLabel}
					link={groupLink}
					links={links ?? []}
					closeModal={() => setIsOpen(false)}
				/>
			) : null}
		</>
	);
}

/**
 * Sem vínculo: escolhe um optionGroup da loja (ordenados por semelhança de nome) e vincula; as
 * opções são casadas por código ou nome no servidor. Com vínculo: status, política, as opções
 * com o estado de cada uma, e desvincular.
 */
function AddOnIfoodLinkDialog({
	addOn,
	merchantId,
	merchantLabel,
	link,
	links,
	closeModal,
}: {
	addOn: TAddOn;
	merchantId: string;
	merchantLabel: string;
	link: TCatalogLink | null;
	links: TCatalogLink[];
	closeModal: () => void;
}) {
	const queryClient = useQueryClient();
	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["catalog-links", merchantId] });
		queryClient.invalidateQueries({ queryKey: ["sales-channel-matrix"] });
		queryClient.invalidateQueries({ queryKey: ["ifood-option-groups", merchantId] });
	};

	if (!link)
		return (
			<LinkAddOnGroupDialog
				addOn={addOn}
				merchantId={merchantId}
				merchantLabel={merchantLabel}
				links={links}
				closeModal={closeModal}
				onSettled={invalidate}
			/>
		);

	return (
		<AddOnGroupLinkDetails addOn={addOn} merchantLabel={merchantLabel} link={link} links={links} closeModal={closeModal} onSettled={invalidate} />
	);
}

function LinkAddOnGroupDialog({
	addOn,
	merchantId,
	merchantLabel,
	links,
	closeModal,
	onSettled,
}: {
	addOn: TAddOn;
	merchantId: string;
	merchantLabel: string;
	links: TCatalogLink[];
	closeModal: () => void;
	onSettled: () => void;
}) {
	const groupsQuery = useIfoodOptionGroups({ merchantId });
	const [search, setSearch] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const linkedGroupIds = useMemo(
		() =>
			new Set(
				links
					.filter((entry) => entry.tipo === "ADD_ON" && entry.status !== "DESVINCULADO" && entry.externoOptionGroupId)
					.map((entry) => entry.externoOptionGroupId as string),
			),
		[links],
	);
	const candidates = useMemo(() => {
		const target = normalize(addOn.nome);
		const needle = normalize(search);
		return (groupsQuery.data ?? [])
			.filter((group) => !linkedGroupIds.has(group.id))
			.filter((group) => !needle || normalize(group.nome).includes(needle))
			.map((group) => ({
				group,
				exact: normalize(group.nome) === target,
				partial: normalize(group.nome).includes(target) || target.includes(normalize(group.nome)),
			}))
			.toSorted(
				(a, b) =>
					Number(b.exact) - Number(a.exact) || Number(b.partial) - Number(a.partial) || (a.group.nome ?? "").localeCompare(b.group.nome ?? "", "pt-BR"),
			);
	}, [addOn.nome, groupsQuery.data, linkedGroupIds, search]);
	const effectiveSelectedId = selectedId ?? candidates.find((candidate) => candidate.exact)?.group.id ?? null;

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-catalog-link-add-on", merchantId, addOn.id],
		mutationFn: () => {
			if (!effectiveSelectedId) throw new Error("Selecione um grupo de complementos.");
			return createCatalogLink({ merchantId, tipo: "ADD_ON", produtoAddOnId: addOn.id, externoOptionGroupId: effectiveSelectedId });
		},
		onSuccess: (data) => {
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled,
	});

	return (
		<ResponsiveMenu
			menuTitle="VINCULAR GRUPO AO IFOOD"
			menuDescription={`${addOn.nome} passa a controlar nome, status e opções do grupo escolhido em ${merchantLabel}. As opções são casadas por código ou nome; as que não tiverem par são criadas no próximo envio.`}
			menuActionButtonText="VINCULAR"
			menuCancelButtonText="CANCELAR"
			menuActionButtonDisabled={!effectiveSelectedId}
			actionFunction={() => mutate()}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
			drawerVariant="lg"
		>
			<div className="flex w-full flex-col gap-3 px-1 py-2">
				{groupsQuery.isLoading ? <LoadingComponent /> : null}
				{groupsQuery.error ? <ErrorComponent msg={getErrorMessage(groupsQuery.error)} /> : null}
				{!groupsQuery.isLoading && !groupsQuery.error ? (
					<>
						<div className="relative">
							<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input value={search} placeholder="Pesquisar grupo de complementos..." onChange={(event) => setSearch(event.target.value)} className="pl-9" />
						</div>
						<div className="flex max-h-[50vh] flex-col overflow-y-auto rounded-xl border border-border">
							{candidates.length === 0 ? (
								<p className="px-3 py-6 text-center text-sm text-muted-foreground">
									{groupsQuery.data?.length
										? "Nenhum grupo livre corresponde à busca."
										: "A loja não tem grupos de complementos. Publique um produto com adicionais para criá-los."}
								</p>
							) : (
								candidates.map(({ group, exact }) => {
									const selected = group.id === effectiveSelectedId;
									return (
										<button
											key={group.id}
											type="button"
											onClick={() => setSelectedId(group.id)}
											aria-pressed={selected}
											className={cn(
												"flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/40",
												selected && "bg-primary/5",
											)}
										>
											<span className="flex min-w-0 flex-col">
												<span className="truncate text-sm font-medium">
													{group.nome ?? group.id}
													{exact ? <span className="ml-1.5 text-[0.6rem] uppercase tracking-wide text-primary">mesmo nome</span> : null}
												</span>
												<span className="truncate text-[0.65rem] text-muted-foreground">
													{group.opcoes.length === 1 ? "1 opção" : `${group.opcoes.length} opções`}
													{group.opcoes.length
														? ` · ${group.opcoes
																.map((opcao) => opcao.nome ?? "?")
																.slice(0, 4)
																.join(", ")}${group.opcoes.length > 4 ? "…" : ""}`
														: null}
												</span>
											</span>
											<span
												className={cn(
													"flex size-5 shrink-0 items-center justify-center rounded-full border",
													selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
												)}
											>
												{selected ? <Check className="size-3" /> : null}
											</span>
										</button>
									);
								})
							)}
						</div>
					</>
				) : null}
			</div>
		</ResponsiveMenu>
	);
}

const GROUP_POLICY_FIELDS: { key: keyof TCatalogLinkSyncPolicy; label: string; hint: string }[] = [
	{ key: "nome", label: "Nome", hint: "Empurra o nome do grupo e das opções." },
	{ key: "disponibilidade", label: "Disponibilidade", hint: "Empurra ativo/inativo do grupo." },
];

function AddOnGroupLinkDetails({
	addOn,
	merchantLabel,
	link,
	links,
	closeModal,
	onSettled,
}: {
	addOn: TAddOn;
	merchantLabel: string;
	link: TCatalogLink;
	links: TCatalogLink[];
	closeModal: () => void;
	onSettled: () => void;
}) {
	const optionLinkById = useMemo(
		() =>
			new Map(
				links
					.filter(
						(entry) => entry.tipo === "ADD_ON_OPCAO" && entry.produtoAddOnId === addOn.id && entry.status !== "DESVINCULADO" && entry.produtoAddOnOpcaoId,
					)
					.map((entry) => [entry.produtoAddOnOpcaoId as string, entry]),
			),
		[addOn.id, links],
	);

	const policyMutation = useMutation({
		mutationKey: ["update-catalog-link-policy", link.id],
		mutationFn: (sincronizar: Partial<TCatalogLinkSyncPolicy>) => updateCatalogLinkPolicy({ linkId: link.id, sincronizar }),
		onSuccess: (data) => toast.success(data.message),
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled,
	});
	const unlinkMutation = useMutation({
		mutationKey: ["delete-catalog-link", link.id],
		mutationFn: () => deleteCatalogLink({ linkId: link.id }),
		onSuccess: (data) => {
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled,
	});
	const anyPending = policyMutation.isPending || unlinkMutation.isPending;
	const chip = STATUS_CHIP[link.status];

	return (
		<ResponsiveMenu
			mode="read-only"
			menuTitle="VÍNCULO DO GRUPO COM O IFOOD"
			menuDescription={`${addOn.nome} em ${merchantLabel}.`}
			menuCancelButtonText="FECHAR"
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
			drawerVariant="lg"
		>
			<div className="flex w-full flex-col gap-4 px-1 py-2">
				<div className="flex flex-col gap-1 rounded-xl border border-border p-3">
					<span
						className={cn(
							"inline-flex w-fit items-center rounded-md border px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide",
							chip.className,
						)}
					>
						{chip.label}
					</span>
					<span className="text-xs text-muted-foreground">
						{link.dataUltimaSincronizacao
							? `Última sincronização em ${new Date(link.dataUltimaSincronizacao).toLocaleString("pt-BR")}.`
							: "Ainda não sincronizado com o iFood."}
					</span>
					{link.status === "ERRO" && link.ultimoErro ? <span className="text-xs text-red-600">{link.ultimoErro}</span> : null}
					{link.divergencias?.length ? (
						<ul className="mt-1 flex flex-col gap-0.5 text-xs">
							{link.divergencias.map((divergencia) => (
								<li key={divergencia.campo}>
									<span className="font-medium capitalize">{divergencia.campo}</span>: aqui {String(divergencia.valorInterno ?? "—")}, no iFood{" "}
									{String(divergencia.valorExterno ?? "—")}
								</li>
							))}
						</ul>
					) : null}
				</div>

				<div className="flex flex-col gap-2">
					<span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">O que sincroniza</span>
					<div className="flex flex-col rounded-xl border border-border">
						{GROUP_POLICY_FIELDS.map((field) => (
							<label key={field.key} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
								<span className="flex min-w-0 flex-col">
									<span className="text-sm font-medium">{field.label}</span>
									<span className="text-[0.65rem] text-muted-foreground">{field.hint}</span>
								</span>
								<Switch
									checked={link.sincronizar[field.key]}
									disabled={anyPending}
									onCheckedChange={(checked) => policyMutation.mutate({ [field.key]: checked })}
								/>
							</label>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">Opções</span>
					<div className="flex flex-col rounded-xl border border-border">
						{addOn.opcoes.map((opcao) => {
							const optionLink = optionLinkById.get(opcao.id);
							const optionChip = optionLink ? STATUS_CHIP[optionLink.status] : null;
							return (
								<div key={opcao.id} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
									<span className="flex min-w-0 flex-col">
										<span className={cn("truncate text-sm font-medium", opcao.ativo === false && "line-through text-muted-foreground")}>{opcao.nome}</span>
										<span className="text-[0.65rem] tabular-nums text-muted-foreground">{formatToMoney(opcao.precoDelta)}</span>
									</span>
									<span
										title={optionLink?.ultimoErro ?? undefined}
										className={cn(
											"inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide",
											optionChip ? optionChip.className : "border-dashed border-border text-muted-foreground",
										)}
									>
										{optionChip ? optionChip.label : "no próximo envio"}
									</span>
								</div>
							);
						})}
					</div>
					<p className="text-xs text-muted-foreground">
						Opções sem par no iFood são criadas no grupo remoto quando o grupo for salvo ou um produto vinculado for reenviado.
					</p>
				</div>

				<div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 p-3">
					<span className="text-xs text-muted-foreground">Desvincular para de sincronizar o grupo e suas opções. Nada é apagado no iFood.</span>
					<LoadingButton
						type="button"
						size="sm"
						variant="destructive"
						loading={unlinkMutation.isPending}
						disabled={anyPending}
						onClick={() => unlinkMutation.mutate()}
					>
						<Link2 className="size-3.5" />
						DESVINCULAR
					</LoadingButton>
				</div>
			</div>
		</ResponsiveMenu>
	);
}

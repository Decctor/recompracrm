"use client";

import { Plus, Search, Tag, Tags, X } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { formatWithoutDiacritics } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TUseClientState } from "@/state-hooks/use-client-state";
import { ClientTagIconMap, TagsColorPalette } from "@/utils/select-options";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClientTags } from "@/lib/queries/clients";
import { createClientTag } from "@/lib/mutations/clients";

const CLIENT_TAG_ICONS = Object.keys(ClientTagIconMap) as (keyof typeof ClientTagIconMap)[];
const CLIENT_TAG_MATCH_THRESHOLD = 0.72;

type ClientTagsProps = {
	tags: TUseClientState["state"]["clientTags"];
	addClientTag: TUseClientState["addClientTag"];
	removeClientTag: TUseClientState["removeClientTag"];
	/** Dentro de uma `Section` do cadastro o cabeçalho já existe; aqui só o conteúdo. */
	embedded?: boolean;
};

type ClientTagDraft = {
	titulo: string;
	icone: keyof typeof ClientTagIconMap;
	cor: string;
	corForeground: string;
	metadados: { tipo: "manual" };
};

function normalizeTagTitle(value: string) {
	return formatWithoutDiacritics(value.trim(), true);
}

function getLevenshteinDistance(a: string, b: string) {
	const previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);

	for (let i = 1; i <= a.length; i++) {
		let previousDiagonal = previousRow[0];
		previousRow[0] = i;

		for (let j = 1; j <= b.length; j++) {
			const temporary = previousRow[j];
			const insertion = previousRow[j - 1] + 1;
			const deletion = previousRow[j] + 1;
			const substitution = previousDiagonal + (a[i - 1] === b[j - 1] ? 0 : 1);
			previousRow[j] = Math.min(insertion, deletion, substitution);
			previousDiagonal = temporary;
		}
	}

	return previousRow[b.length] ?? 0;
}

function getTagSimilarityScore(searchValue: string, title: string) {
	const normalizedSearch = normalizeTagTitle(searchValue);
	const normalizedTitle = normalizeTagTitle(title);
	if (!normalizedSearch || !normalizedTitle) return 0;
	if (normalizedSearch === normalizedTitle) return 1;

	const maxLength = Math.max(normalizedSearch.length, normalizedTitle.length);
	const lengthRatio = Math.min(normalizedSearch.length, normalizedTitle.length) / maxLength;

	if (normalizedTitle.startsWith(normalizedSearch) || normalizedSearch.startsWith(normalizedTitle)) {
		return normalizedSearch.length < 3 ? 0.5 : 0.78 + lengthRatio * 0.18;
	}

	if (normalizedTitle.includes(normalizedSearch) || normalizedSearch.includes(normalizedTitle)) {
		return normalizedSearch.length < 3 ? 0.45 : 0.65 + lengthRatio * 0.18;
	}

	return 1 - getLevenshteinDistance(normalizedSearch, normalizedTitle) / maxLength;
}

function getBestClientTagMatch<T extends { titulo: string }>(searchValue: string, candidateTags: readonly T[]) {
	return candidateTags.reduce<{ tag: T; score: number } | null>((bestMatch, tag) => {
		const score = getTagSimilarityScore(searchValue, tag.titulo);
		if (!bestMatch || score > bestMatch.score) return { tag, score };
		return bestMatch;
	}, null);
}

export default function ClientTags({ tags, addClientTag, removeClientTag, embedded = false }: ClientTagsProps) {
	const queryClient = useQueryClient();
	const { data: clientTags = [], queryKey } = useClientTags();
	const [search, setSearch] = useState("");
	const [draft, setDraft] = useState<ClientTagDraft>({
		titulo: "",
		icone: "Tag",
		cor: TagsColorPalette[0]?.secondary || "#F8F8F8",
		corForeground: TagsColorPalette[0]?.primary || "#111111",
		metadados: { tipo: "manual" },
	});

	const activeTags = useMemo(() => tags.map((tag, index) => ({ tag, index })).filter((item) => !item.tag.deletar), [tags]);
	const selectedTagIds = useMemo(() => new Set(activeTags.map((item) => item.tag.clienteTagId)), [activeTags]);
	const normalizedSearch = formatWithoutDiacritics(search.trim(), true);
	const filteredTags = useMemo(() => {
		if (!normalizedSearch) return clientTags;
		return clientTags.filter((tag) => normalizeTagTitle(tag.titulo).includes(normalizedSearch));
	}, [clientTags, normalizedSearch]);
	const hasExactMatch = clientTags.some((tag) => normalizeTagTitle(tag.titulo) === normalizedSearch);
	const availableTags = useMemo(() => clientTags.filter((tag) => !selectedTagIds.has(tag.id)), [clientTags, selectedTagIds]);
	const bestSubmitMatch = useMemo(() => getBestClientTagMatch(search, availableTags), [availableTags, search]);
	const submitMatchedTag =
		bestSubmitMatch && bestSubmitMatch.score >= CLIENT_TAG_MATCH_THRESHOLD && (!hasExactMatch || bestSubmitMatch.score === 1)
			? bestSubmitMatch.tag
			: null;
	const showCreateInline = normalizedSearch.length > 0 && !submitMatchedTag && !hasExactMatch;
	const enterSubmitHint = submitMatchedTag
		? `Enter para adicionar "${submitMatchedTag.titulo}"`
		: normalizedSearch && !hasExactMatch
			? `Enter para criar "${search.trim()}"`
			: null;

	const { mutate: createClientTagMutation, isPending: isCreating } = useMutation({
		mutationKey: ["create-client-tag"],
		mutationFn: createClientTag,
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: queryKey });
			return;
		},
		onSuccess: async (data, variables) => {
			addClientTag({
				clienteTagId: data.data.insertedId,
				tag: {
					titulo: variables.titulo,
					icone: variables.icone ?? "Tag",
					cor: variables.cor,
					corForeground: variables.corForeground,
				},
			});
			setSearch("");
			setDraft((prev) => ({ ...prev, titulo: "" }));
			toast.success(data.message);
		},
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKey });
		},
	});

	function getTagData(tagReference: TUseClientState["state"]["clientTags"][number]) {
		return tagReference.tag ?? clientTags.find((tag) => tag.id === tagReference.clienteTagId) ?? null;
	}

	function handleCreateTag() {
		const title = (draft.titulo || search).trim();
		if (!title) return;
		createClientTagMutation({
			titulo: title,
			icone: (draft.icone as keyof typeof ClientTagIconMap) ?? "Tag",
			cor: draft.cor,
			corForeground: draft.corForeground,
			metadados: { tipo: "MANUAL" },
			tituloNormalizado: normalizeTagTitle(title),
		});
	}

	function handleAddExistingTag(tag: (typeof clientTags)[number]) {
		addClientTag({
			clienteTagId: tag.id,
			tag: {
				titulo: tag.titulo,
				icone: (tag.icone as keyof typeof ClientTagIconMap) ?? "Tag",
				cor: tag.cor,
				corForeground: tag.corForeground,
			},
		});
		setSearch("");
		setDraft((prev) => ({ ...prev, titulo: "" }));
	}

	function handleSubmitSearch() {
		if (!normalizedSearch || isCreating) return;
		if (submitMatchedTag) {
			handleAddExistingTag(submitMatchedTag);
			return;
		}
		if (!hasExactMatch) handleCreateTag();
	}

	function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key !== "Enter") return;
		event.preventDefault();
		handleSubmitSearch();
	}

	const tagsContent = (
		<div className="w-full">
			<div className="rounded-md border border-primary/15 bg-linear-to-br from-background via-background to-primary/3 p-3 shadow-xs">
				<div className="flex flex-col gap-3">
					<div className="flex flex-wrap items-center gap-2">
						{activeTags.length > 0 ? (
							activeTags.map(({ tag: tagReference, index }) => {
								const tagData = getTagData(tagReference);
								if (!tagData) return null;
								const Icon = ClientTagIconMap[(tagData.icone || "Tag") as keyof typeof ClientTagIconMap] ?? Tag;
								return (
									<button
										key={`${tagReference.clienteTagId}-${index}`}
										type="button"
										onClick={() => removeClientTag(index)}
										style={{ borderColor: tagData.corForeground, color: tagData.corForeground, backgroundColor: tagData.cor }}
										className="group flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold shadow-xs transition hover:-translate-y-0.5 hover:shadow-md"
									>
										<Icon className="h-3.5 w-3.5 shrink-0" />
										<span className="truncate">{tagData.titulo}</span>
										<X className="h-3 w-3 shrink-0 opacity-45 transition group-hover:opacity-100" />
									</button>
								);
							})
						) : (
							<div className="w-full flex items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/30 px-3 py-2 text-xs font-medium text-muted-foreground">
								<Tag className="h-3.5 w-3.5" />
								Nenhuma etiqueta aplicada
							</div>
						)}
					</div>

					<div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 shadow-inner">
						<Search className="h-4 w-4 shrink-0 text-muted-foreground" />
						<input
							value={search}
							onChange={(event) => {
								setSearch(event.target.value);
								setDraft((prev) => ({ ...prev, titulo: event.target.value }));
							}}
							onKeyDown={handleSearchKeyDown}
							placeholder="Buscar ou criar etiqueta..."
							className="min-w-0 flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground/70"
						/>
					</div>
					{enterSubmitHint ? <p className="text-[0.7rem] font-medium text-muted-foreground">{enterSubmitHint}</p> : null}

					{filteredTags.length > 0 ? (
						<div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
							{filteredTags.map((tag) => {
								const Icon = ClientTagIconMap[(tag.icone || "Tag") as keyof typeof ClientTagIconMap] ?? Tag;
								const selected = selectedTagIds.has(tag.id);
								return (
									<button
										key={tag.id}
										type="button"
										disabled={selected}
										onClick={() => handleAddExistingTag(tag)}
										style={{ borderColor: tag.corForeground, color: tag.corForeground, backgroundColor: tag.cor }}
										className={cn(
											"flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold shadow-xs transition",
											selected ? "cursor-not-allowed opacity-35" : "hover:-translate-y-0.5 hover:shadow-md",
										)}
									>
										<Icon className="h-3.5 w-3.5 shrink-0" />
										<span className="truncate">{tag.titulo}</span>
									</button>
								);
							})}
						</div>
					) : null}

					{showCreateInline ? (
						<div className="rounded-md border border-border bg-primary/4 p-3">
							<div className="flex flex-col gap-3">
								<div className="flex flex-wrap items-center gap-2">
									<TagPreview draft={draft} title={draft.titulo || search} />
									<LoadingButton loading={isCreating} className="h-8 px-3 text-xs" onClick={handleCreateTag}>
										<Plus className="h-3.5 w-3.5" />
										CRIAR ETIQUETA
									</LoadingButton>
								</div>
								<div className="flex flex-wrap gap-1.5">
									{TagsColorPalette.map((color) => (
										<button
											key={`${color.primary}-${color.secondary}`}
											type="button"
											onClick={() => setDraft((prev) => ({ ...prev, cor: color.secondary, corForeground: color.primary }))}
											style={{ backgroundColor: color.secondary, borderColor: color.primary }}
											className={cn(
												"h-5 w-5 rounded border shadow-xs transition hover:scale-110",
												draft.corForeground === color.primary ? "ring-2 ring-primary/40" : "",
											)}
											aria-label="Selecionar cor da etiqueta"
										/>
									))}
								</div>
								<div className="flex flex-wrap gap-1.5">
									{CLIENT_TAG_ICONS.map((iconKey) => {
										const Icon = ClientTagIconMap[iconKey];
										return (
											<Button
												key={iconKey}
												type="button"
												variant={draft.icone === iconKey ? "default" : "outline"}
												size="icon"
												className="h-7 w-7"
												onClick={() => setDraft((prev) => ({ ...prev, icone: iconKey }))}
											>
												<Icon className="h-3.5 w-3.5" />
											</Button>
										);
									})}
								</div>
							</div>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);

	if (embedded) return tagsContent;

	return (
		<ResponsiveMenuSection title="ETIQUETAS DO CLIENTE" icon={<Tags className="h-4 w-4 min-w-4" />}>
			{tagsContent}
		</ResponsiveMenuSection>
	);
}

function TagPreview({ draft, title }: { draft: ClientTagDraft; title: string }) {
	const Icon = ClientTagIconMap[draft.icone] ?? Tag;
	return (
		<div
			style={{ borderColor: draft.corForeground, color: draft.corForeground, backgroundColor: draft.cor }}
			className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold shadow-xs"
		>
			<Icon className="h-3.5 w-3.5 shrink-0" />
			<span className="truncate">{title}</span>
		</div>
	);
}

"use client";

import type { TGetClientMergeSuggestionsOutput } from "@/app/api/clients/duplicates/suggestions/route";
import type { TSearchClientsOutput } from "@/app/api/clients/search/route";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { useClientMergeSuggestions } from "@/lib/queries/client-duplicates";
import { useClientsBySearch } from "@/lib/queries/clients";
import type { TClientMergeSuggestionReasonEnum } from "@/schemas/enums";
import {
	ArrowLeft,
	ArrowRightLeft,
	CreditCardIcon,
	IdCard,
	type LucideIcon,
	Mail,
	MailIcon,
	Phone,
	PhoneIcon,
	Search,
	Sparkles,
	TextCursorInput,
	UserRoundSearch,
} from "lucide-react";
import { useState } from "react";

import { ClientReconciliation, useClientReconciliation, useReconciliationMenuActionProps } from "./ClientReconciliation";
import { DUPLICATE_SIGNAL_CLASS } from "./signals";

type ClientMergeMenuProps = {
	/** Cliente de onde o menu foi aberto — o mantido por padrão. */
	client: { id: string; nome: string };
	/** clientes.gerenciarBase: sem ela dá para comparar, mas não mesclar nem descartar. */
	canReconcile: boolean;
	closeMenu: () => void;
	/** Chamado após um merge bem sucedido (ex.: sair da página do cadastro removido). */
	onMerged?: (result: { keeperId: string; sourceId: string }) => void;
};

type TClientMergeSuggestion = TGetClientMergeSuggestionsOutput["data"]["suggestions"][number];

const MENU_TITLE = "MESCLAR CADASTRO";
const SECTION_ICON_CLASS = "h-3.5 w-3.5 min-h-3.5 min-w-3.5 shrink-0";

const REASON_ICONS: Record<TClientMergeSuggestionReasonEnum, LucideIcon> = {
	CPF_CNPJ: CreditCardIcon,
	TELEFONE: PhoneIcon,
	TELEFONE_PARECIDO: PhoneIcon,
	EMAIL: MailIcon,
	NOME_IGUAL: TextCursorInput,
	NOME_ABREVIADO: TextCursorInput,
	NOME_SEMELHANTE: TextCursorInput,
};

const CONFIDENCE: Record<TClientMergeSuggestion["confianca"], { label: string; variant: "success" | "warning" | "muted" }> = {
	ALTA: { label: "Confiança alta", variant: "success" },
	MEDIA: { label: "Confiança média", variant: "warning" },
	BAIXA: { label: "Confiança baixa", variant: "muted" },
};

/**
 * Mesclagem iniciada pelo usuário, a partir de um cliente: sugestões ousadas calculadas na hora
 * (lib/clients/merge-suggestions.ts) ou qualquer cadastro achado pela busca. Escolhido o outro
 * lado, a comparação e a mesclagem são as mesmas da fila de reconciliação — o provider só troca o
 * par da fila por dois IDs de cliente, e nada vai para a fila só por ter sido olhado.
 */
export function ClientMergeMenu({ client, canReconcile, closeMenu, onMerged }: ClientMergeMenuProps) {
	const [candidateId, setCandidateId] = useState<string | null>(null);

	return (
		<ClientReconciliation.Provider
			pairId=""
			clientIds={candidateId ? [client.id, candidateId] : null}
			perspectiveClienteId={client.id}
			canReconcile={canReconcile}
			// Descartado: volta à escolha (a sugestão some). Mesclado: o onMerged fecha antes.
			onResolved={() => setCandidateId(null)}
			onMerged={(result) => {
				closeMenu();
				onMerged?.(result);
			}}
		>
			{candidateId ? (
				<MergeComparisonMenu closeMenu={closeMenu} onBack={() => setCandidateId(null)} />
			) : (
				<ResponsiveMenu
					mode="read-only"
					menuTitle={MENU_TITLE}
					menuDescription={`Encontre o outro cadastro de ${client.nome} para unir os dois. Todo o histórico passa para o cadastro mantido.`}
					menuCancelButtonText="FECHAR"
					stateIsLoading={false}
					closeMenu={closeMenu}
					dialogVariant="md"
					drawerVariant="lg"
				>
					<MergeSuggestions clientId={client.id} onPick={setCandidateId} />
					<MergeSearch clientId={client.id} onPick={setCandidateId} />
				</ResponsiveMenu>
			)}
		</ClientReconciliation.Provider>
	);
}

function MergeComparisonMenu({ closeMenu, onBack }: { closeMenu: () => void; onBack: () => void }) {
	const { state, meta } = useClientReconciliation();
	const actionProps = useReconciliationMenuActionProps();
	const baseProps = {
		menuTitle: MENU_TITLE,
		menuDescription: "Escolha qual cadastro fica. O outro é removido e seu histórico (vendas, cashback, conversas, cupons) passa para o mantido.",
		stateIsLoading: state.isLoading,
		stateError: state.error,
		closeMenu,
		dialogVariant: "md",
		drawerVariant: "lg",
		lockClose: state.isPending,
	} as const;

	const backButton = (
		<Button variant="ghost" size="sm" className="w-fit gap-1" onClick={onBack} disabled={state.isPending}>
			<ArrowLeft className="h-4 w-4 min-h-4 min-w-4" />
			ESCOLHER OUTRO CADASTRO
		</Button>
	);

	if (!meta.canReconcile) {
		return (
			<ResponsiveMenu {...baseProps} mode="read-only" menuCancelButtonText="FECHAR">
				{backButton}
				<ClientReconciliation.Body />
			</ResponsiveMenu>
		);
	}
	return (
		<ResponsiveMenu {...baseProps} {...actionProps}>
			{backButton}
			<ClientReconciliation.Body />
		</ResponsiveMenu>
	);
}

// ─── Sugestões ───────────────────────────────────────────────────────────────

function MergeSuggestions({ clientId, onPick }: { clientId: string; onPick: (clientId: string) => void }) {
	const { data: suggestions, isLoading, isError, error, refetch } = useClientMergeSuggestions({ clientId });

	return (
		<ResponsiveMenuSection title="CADASTROS PARECIDOS" icon={<Sparkles className={SECTION_ICON_CLASS} />}>
			{isLoading ? (
				<div className="flex w-full flex-col gap-2" aria-label="Procurando cadastros parecidos">
					{[0, 1].map((item) => (
						<Skeleton key={item} className="h-[88px] w-full rounded-xl" />
					))}
				</div>
			) : isError ? (
				<div className="flex w-full flex-col items-center gap-2 py-4 text-center">
					<p className="text-xs text-muted-foreground">{getErrorMessage(error)}</p>
					<Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
						TENTAR NOVAMENTE
					</Button>
				</div>
			) : !suggestions || suggestions.length === 0 ? (
				<p className="w-full py-3 text-center text-xs text-muted-foreground">
					Nenhum cadastro parecido encontrado. Se você sabe qual é o outro cadastro, busque por ele abaixo.
				</p>
			) : (
				<div className="flex w-full flex-col gap-2">
					{suggestions.map((suggestion) => (
						<SuggestionCard key={suggestion.cliente.id} suggestion={suggestion} onPick={() => onPick(suggestion.cliente.id)} />
					))}
				</div>
			)}
		</ResponsiveMenuSection>
	);
}

function SuggestionCard({ suggestion, onPick }: { suggestion: TClientMergeSuggestion; onPick: () => void }) {
	const { cliente, motivos, confianca, naFila } = suggestion;
	const confidence = CONFIDENCE[confianca];
	const lastPurchase = cliente.ultimaCompraData ? formatDateAsLocale(cliente.ultimaCompraData) : null;

	return (
		<div className="flex w-full min-w-0 flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5 shadow-2xs">
			<div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex min-w-0 flex-col gap-1">
					<div className="flex min-w-0 flex-wrap items-center gap-1.5">
						<p className="truncate text-sm font-semibold" title={cliente.nome}>
							{cliente.nome}
						</p>
						<Chip.Root variant={confidence.variant} size="xs" shape="pill">
							<Chip.Label weight="bold">{confidence.label}</Chip.Label>
						</Chip.Root>
						{naFila ? (
							<Chip.Root variant="outline" size="xs" shape="pill">
								<Chip.Label>Já na reconciliação</Chip.Label>
							</Chip.Root>
						) : null}
					</div>
					<ClientContactLine telefone={cliente.telefone} email={cliente.email} cpfCnpj={cliente.cpfCnpj} />
					<p className="text-[11px] text-muted-foreground tabular-nums">
						{cliente.metadataTotalCompras} {cliente.metadataTotalCompras === 1 ? "compra" : "compras"} · {formatToMoney(cliente.metadataValorTotalCompras)}
						{lastPurchase ? ` · última em ${lastPurchase}` : ""}
					</p>
				</div>
				<Button type="button" size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={onPick}>
					<ArrowRightLeft className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
					COMPARAR
				</Button>
			</div>
			<div className="flex w-full flex-wrap gap-1">
				{motivos.map((motivo) => {
					const ReasonIcon = REASON_ICONS[motivo.tipo];
					return (
						<Chip.Root key={motivo.tipo} size="xs" shape="pill" className={DUPLICATE_SIGNAL_CLASS}>
							<Chip.Icon>
								<ReasonIcon />
							</Chip.Icon>
							<Chip.Label weight="semibold">{motivo.valor}</Chip.Label>
						</Chip.Root>
					);
				})}
			</div>
		</div>
	);
}

// ─── Busca livre ─────────────────────────────────────────────────────────────

function MergeSearch({ clientId, onPick }: { clientId: string; onPick: (clientId: string) => void }) {
	// Mesma busca do "vincular cliente" do PDV (nome, telefone ou CPF/CNPJ, com as regras de lib/clients/search.ts).
	const { search, updateSearch, debouncedSearch, isSearchPending, data, isFetching, isError } = useClientsBySearch({ initialSearch: "" });
	const results = (data ?? []).filter((result) => result.id !== clientId);
	const hasEnoughSearch = search.trim().length >= 2;
	const isSettled = debouncedSearch.length >= 2 && !isSearchPending && !isFetching;

	return (
		<ResponsiveMenuSection title="BUSCAR OUTRO CADASTRO" icon={<UserRoundSearch className={SECTION_ICON_CLASS} />}>
			<div className="relative w-full">
				<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={search}
					onChange={(event) => updateSearch(event.target.value)}
					placeholder="Nome, telefone ou CPF/CNPJ..."
					className="min-h-10 w-full rounded-xl pl-9"
				/>
			</div>
			{hasEnoughSearch && !isSettled ? (
				<div className="flex w-full flex-col gap-2" aria-label="Buscando clientes">
					{[0, 1].map((item) => (
						<Skeleton key={item} className="h-[60px] w-full rounded-xl" />
					))}
				</div>
			) : null}
			{isSettled && isError ? <p className="w-full py-2 text-center text-xs text-muted-foreground">Não foi possível buscar os clientes.</p> : null}
			{isSettled && !isError && results.length === 0 ? (
				<p className="w-full py-2 text-center text-xs text-muted-foreground">Nenhum outro cadastro encontrado.</p>
			) : null}
			{isSettled && results.length > 0 ? (
				<div className="flex w-full flex-col gap-2">
					{results.map((result) => (
						<SearchResultCard key={result.id} result={result} onPick={() => onPick(result.id)} />
					))}
				</div>
			) : null}
		</ResponsiveMenuSection>
	);
}

function SearchResultCard({ result, onPick }: { result: TSearchClientsOutput["data"]["clients"][number]; onPick: () => void }) {
	return (
		<div className="flex w-full min-w-0 flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
			<div className="flex min-w-0 flex-col gap-1">
				<p className="truncate text-sm font-semibold" title={result.nome}>
					{result.nome}
				</p>
				<ClientContactLine telefone={result.telefone} email={result.email} cpfCnpj={result.cpfCnpj} />
			</div>
			<Button type="button" size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={onPick}>
				<ArrowRightLeft className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
				COMPARAR
			</Button>
		</div>
	);
}

function ClientContactLine({ telefone, email, cpfCnpj }: { telefone: string | null; email: string | null; cpfCnpj: string | null }) {
	const items = [
		{ icon: Phone, value: telefone?.trim() || "Sem telefone" },
		...(email?.trim() ? [{ icon: Mail, value: email.trim() }] : []),
		...(cpfCnpj?.trim() ? [{ icon: IdCard, value: cpfCnpj.trim() }] : []),
	];
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
			{items.map(({ icon: ItemIcon, value }) => (
				<span key={value} className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
					<ItemIcon className="h-3 w-3 min-h-3 min-w-3 shrink-0" />
					<span className="truncate" title={value}>
						{value}
					</span>
				</span>
			))}
		</div>
	);
}

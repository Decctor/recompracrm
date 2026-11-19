"use client";

import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ButtonProps } from "@/components/ui/button";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { dismissClientDuplicate, mergeClientDuplicate } from "@/lib/mutations/client-duplicates";
import { type TClientComparisonTarget, useClientDuplicateComparison } from "@/lib/queries/client-duplicates";
import { cn } from "@/lib/utils";
import type { TGetClientDuplicateComparisonOutput } from "@/app/api/clients/duplicates/comparison/route";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	BadgeDollarSign,
	CreditCardIcon,
	InstagramIcon,
	type LucideIcon,
	MailIcon,
	PhoneIcon,
	ShieldAlertIcon,
	SplitIcon,
	TriangleAlertIcon,
	UserCheckIcon,
} from "lucide-react";
import { createContext, type PropsWithChildren, type ReactNode, use, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DuplicateSignalChip, sortDuplicateReasons } from "./signals";

type TComparison = TGetClientDuplicateComparisonOutput["data"];
type TComparisonClient = TComparison["clienteA"];
type TFieldConflict = { field: string; label: string; valueA: string; valueB: string };
type TCashbackPreviewEntry = { programaId: string; titulo: string; saldoA: number; saldoB: number };

/** Campos com escolha explícita quando keeper e origem conflitam. */
const CHOOSABLE_FIELDS: { field: string; label: string }[] = [
	{ field: "nome", label: "Nome" },
	{ field: "telefone", label: "Telefone" },
	{ field: "email", label: "E-mail" },
	{ field: "cpfCnpj", label: "CPF/CNPJ" },
	{ field: "instagram", label: "Instagram" },
];

/** Campos de identidade exibidos no cartão de cada cadastro, na ordem em que o lojista os lê. */
const IDENTITY_FIELDS: { field: string; icon: LucideIcon }[] = [
	{ field: "telefone", icon: PhoneIcon },
	{ field: "email", icon: MailIcon },
	{ field: "cpfCnpj", icon: CreditCardIcon },
	{ field: "instagram", icon: InstagramIcon },
];

const RECORD_LABELS: Record<string, string> = {
	vendas: "vendas",
	conversas: "conversas",
	interacoes: "interações",
	cuponsAtribuidos: "cupons",
	cuponsResgatados: "resgates de cupom",
	comandas: "comandas",
};

const SECTION_ICON_CLASS = "h-3.5 w-3.5 min-h-3.5 min-w-3.5 shrink-0";

function fieldValue(client: TComparisonClient, field: string): string {
	const value = (client as unknown as Record<string, unknown>)[field];
	return typeof value === "string" ? value.trim() : "";
}

function recordCount(client: TComparisonClient, key: string): number {
	return (client.registros as unknown as Record<string, number>)[key] ?? 0;
}

/** Total de registros que migram do cadastro removido para o mantido. */
function totalLinkedRecords(client: TComparisonClient): number {
	return Object.keys(RECORD_LABELS).reduce((total, key) => total + recordCount(client, key), 0);
}

// ─── Contexto ────────────────────────────────────────────────────────────────
// Estado/ações/meta injetados pelo provider: o mesmo corpo de comparação serve
// o diálogo avulso (pill) e a fila inline, cada um com sua casca.

type TReconciliationState = {
	comparison: TComparison | null;
	isLoading: boolean;
	error: string | null;
	keeper: TComparisonClient | null;
	source: TComparisonClient | null;
	keeperIsA: boolean;
	conflicts: TFieldConflict[];
	fieldPicks: Record<string, string>;
	cashbackPreview: TCashbackPreviewEntry[];
	confirmingMerge: boolean;
	isPending: boolean;
};

type TReconciliationActions = {
	setKeeper: (clienteId: string) => void;
	pickField: (field: string, side: "A" | "B") => void;
	/** Primeiro acionamento arma a confirmação; o segundo executa a mesclagem. */
	merge: () => void;
	cancelMergeConfirmation: () => void;
	dismiss: () => void;
};

type TReconciliationMeta = {
	pairId: string;
	/** Há algo para comparar: um par da fila ou dois clientes escolhidos à mão. */
	hasTarget: boolean;
	canReconcile: boolean;
};

type TReconciliationContextValue = {
	state: TReconciliationState;
	actions: TReconciliationActions;
	meta: TReconciliationMeta;
};

const ReconciliationContext = createContext<TReconciliationContextValue | null>(null);

export function useClientReconciliation(): TReconciliationContextValue {
	const context = use(ReconciliationContext);
	if (!context) throw new Error("useClientReconciliation deve ser usado dentro de <ClientReconciliation.Provider>.");
	return context;
}

type ClientReconciliationProviderProps = PropsWithChildren & {
	/** Par em análise; vazio deixa o provider ocioso (fila em modo lista). */
	pairId: string;
	/**
	 * Alternativa ao `pairId`: dois clientes escolhidos à mão (menu de mesclagem), que podem não ter
	 * par na fila. Mesclar e descartar funcionam igual; o par só passa a existir no descarte.
	 */
	clientIds?: [string, string] | null;
	/** Cliente da página atual — vira o keeper padrão. */
	perspectiveClienteId: string;
	canReconcile: boolean;
	/** Chamado após um merge ou descarte bem sucedido. */
	onResolved: () => void;
	/** Chamado após um merge bem sucedido (para redirecionar quando a página era do cliente removido). */
	onMerged?: (result: { keeperId: string; sourceId: string }) => void;
};

function ClientReconciliationProvider({
	pairId,
	clientIds = null,
	perspectiveClienteId,
	canReconcile,
	onResolved,
	onMerged,
	children,
}: ClientReconciliationProviderProps) {
	const [keeperId, setKeeperId] = useState(perspectiveClienteId);
	const [fieldPicks, setFieldPicks] = useState<Record<string, string>>({});
	const [confirmingMerge, setConfirmingMerge] = useState(false);

	const clientIdsKey = clientIds?.join(",") ?? "";
	const target = useMemo<TClientComparisonTarget | null>(() => {
		if (pairId) return { pairId };
		if (clientIdsKey) return { clientIds: clientIdsKey.split(",") as [string, string] };
		return null;
	}, [pairId, clientIdsKey]);

	// Trocar de par zera as escolhas: keeper padrão, sem picks, confirmação desarmada.
	useEffect(() => {
		setKeeperId(perspectiveClienteId);
		setFieldPicks({});
		setConfirmingMerge(false);
	}, [pairId, clientIdsKey, perspectiveClienteId]);

	const queryClient = useQueryClient();
	const comparisonQuery = useClientDuplicateComparison({ target });
	const comparison = comparisonQuery.data ?? null;

	function invalidateAfterResolution() {
		void queryClient.invalidateQueries({ queryKey: ["client-duplicates-by-entity"] });
		void queryClient.invalidateQueries({ queryKey: ["client-duplicates-pending"] });
		void queryClient.invalidateQueries({ queryKey: ["client-duplicates-pending-count"] });
		void queryClient.invalidateQueries({ queryKey: ["client-merge-suggestions"] });
	}

	const dismissMutation = useMutation({
		mutationKey: ["dismiss-client-duplicate"],
		mutationFn: dismissClientDuplicate,
		onSuccess: (result) => {
			toast.success(result.message);
			invalidateAfterResolution();
			onResolved();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const mergeMutation = useMutation({
		mutationKey: ["merge-client-duplicate"],
		mutationFn: mergeClientDuplicate,
		onSuccess: (result, variables) => {
			toast.success(result.message);
			invalidateAfterResolution();
			void queryClient.invalidateQueries({ queryKey: ["clients"] });
			if (comparison) {
				const sourceId = variables.keeperId === comparison.clienteA.id ? comparison.clienteB.id : comparison.clienteA.id;
				onMerged?.({ keeperId: variables.keeperId, sourceId });
			}
			onResolved();
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
			setConfirmingMerge(false);
		},
	});

	const conflicts = useMemo(() => {
		if (!comparison) return [];
		return CHOOSABLE_FIELDS.flatMap(({ field, label }) => {
			const valueA = fieldValue(comparison.clienteA, field);
			const valueB = fieldValue(comparison.clienteB, field);
			if (!valueA || !valueB || valueA === valueB) return [];
			return [{ field, label, valueA, valueB }];
		});
	}, [comparison]);

	// Saldo resultante por programa: união dos programas dos dois lados.
	const cashbackPreview = useMemo(() => {
		if (!comparison) return [];
		const byProgram = new Map<string, { titulo: string; saldoA: number; saldoB: number }>();
		for (const balance of comparison.clienteA.saldosCashback) {
			byProgram.set(balance.programaId, { titulo: balance.programaTitulo, saldoA: balance.saldoValorDisponivel, saldoB: 0 });
		}
		for (const balance of comparison.clienteB.saldosCashback) {
			const existing = byProgram.get(balance.programaId);
			if (existing) existing.saldoB = balance.saldoValorDisponivel;
			else byProgram.set(balance.programaId, { titulo: balance.programaTitulo, saldoA: 0, saldoB: balance.saldoValorDisponivel });
		}
		return [...byProgram.entries()].map(([programaId, entry]) => ({ programaId, ...entry }));
	}, [comparison]);

	const keeper = !comparison ? null : keeperId === comparison.clienteB.id ? comparison.clienteB : comparison.clienteA;
	const source = !comparison || !keeper ? null : keeper.id === comparison.clienteA.id ? comparison.clienteB : comparison.clienteA;
	const keeperIsA = !!comparison && !!keeper && keeper.id === comparison.clienteA.id;
	const isPending = dismissMutation.isPending || mergeMutation.isPending;

	function merge() {
		if (!comparison || !keeper) return;
		if (!confirmingMerge) {
			setConfirmingMerge(true);
			return;
		}
		const fieldChoices: Record<string, "keeper" | "source"> = {};
		for (const conflict of conflicts) {
			const pick = fieldPicks[conflict.field];
			if (!pick) continue;
			const pickedSource = (keeperIsA && pick === "B") || (!keeperIsA && pick === "A");
			fieldChoices[conflict.field] = pickedSource ? "source" : "keeper";
		}
		if (pairId) mergeMutation.mutate({ pairId, keeperId: keeper.id, fieldChoices });
		else if (source) mergeMutation.mutate({ sourceId: source.id, keeperId: keeper.id, fieldChoices });
	}

	const contextValue: TReconciliationContextValue = {
		state: {
			comparison,
			isLoading: comparisonQuery.isLoading,
			error: comparisonQuery.isError ? getErrorMessage(comparisonQuery.error) : null,
			keeper,
			source,
			keeperIsA,
			conflicts,
			fieldPicks,
			cashbackPreview,
			confirmingMerge,
			isPending,
		},
		actions: {
			setKeeper: (clienteId) => {
				setKeeperId(clienteId);
				setConfirmingMerge(false);
			},
			pickField: (field, side) => setFieldPicks((previous) => ({ ...previous, [field]: side })),
			merge,
			cancelMergeConfirmation: () => setConfirmingMerge(false),
			dismiss: () => dismissMutation.mutate(pairId ? { pairId } : { clientIds: clientIdsKey.split(",") }),
		},
		meta: { pairId, hasTarget: !!target, canReconcile },
	};

	return <ReconciliationContext value={contextValue}>{children}</ReconciliationContext>;
}

/** Props de rodapé (ação/secundária/cancelar) do ResponsiveMenu no modo acionável. */
export function useReconciliationMenuActionProps() {
	const { state, actions } = useClientReconciliation();
	return {
		menuCancelButtonText: "FECHAR",
		menuSecondaryActionButtonText: state.confirmingMerge ? "VOLTAR" : "NÃO SÃO A MESMA PESSOA",
		menuSecondaryActionButtonVariant: "ghost" as ButtonProps["variant"],
		menuSecondaryActionButtonDisabled: state.isPending,
		secondaryActionFunction: state.confirmingMerge ? actions.cancelMergeConfirmation : actions.dismiss,
		menuActionButtonText: state.confirmingMerge ? "CONFIRMAR MESCLAGEM" : "MESCLAR CADASTROS",
		menuActionButtonVariant: (state.confirmingMerge ? "destructive" : "default") as ButtonProps["variant"],
		menuActionButtonDisabled: !state.comparison,
		actionFunction: actions.merge,
		actionIsLoading: state.isPending,
	};
}

// ─── Seções ──────────────────────────────────────────────────────────────────

function ReconciliationSignals() {
	const { state } = useClientReconciliation();
	if (!state.comparison) return null;
	return (
		<div className="flex w-full flex-wrap gap-1.5">
			{sortDuplicateReasons(state.comparison.motivos).map((reason, index) => (
				<DuplicateSignalChip key={`${reason.tipo}-${index}`} tipo={reason.tipo} valor={reason.valor} />
			))}
		</div>
	);
}

function ClientChoiceCard({ client, isKeeper }: { client: TComparisonClient; isKeeper: boolean }) {
	const identity = IDENTITY_FIELDS.map(({ field, icon }) => ({ icon, value: fieldValue(client, field) })).filter(({ value }) => !!value);
	const records = Object.entries(RECORD_LABELS)
		.map(([key, label]) => ({ label, count: recordCount(client, key) }))
		.filter(({ count }) => count > 0);
	const createdAt = formatDateAsLocale(client.dataInsercao ?? undefined);

	return (
		<Label
			htmlFor={`keeper-${client.id}`}
			className={cn(
				"flex h-full min-w-0 cursor-pointer flex-col items-stretch gap-2.5 rounded-xl border p-3 transition-colors",
				isKeeper ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40",
			)}
		>
			<div className="flex w-full items-start justify-between gap-2">
				<div className="flex min-w-0 items-start gap-2">
					<RadioGroupItem value={client.id} id={`keeper-${client.id}`} className="mt-0.5 shrink-0" />
					<div className="flex min-w-0 flex-col gap-0.5">
						<p className="truncate text-sm font-semibold" title={client.nome}>
							{client.nome}
						</p>
						{createdAt ? <p className="text-[11px] font-semibold text-muted-foreground">Criado em {createdAt}</p> : null}
					</div>
				</div>
				<Chip.Root variant={isKeeper ? "default" : "destructive"} size="xs" shape="pill">
					<Chip.Label caps weight="bold">
						{isKeeper ? "Mantido" : "Removido"}
					</Chip.Label>
				</Chip.Root>
			</div>

			{identity.length > 0 ? (
				<div className="flex min-w-0 flex-col gap-1">
					{identity.map(({ icon: IdentityIcon, value }) => (
						<p key={value} className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
							<IdentityIcon className="h-3 w-3 min-h-3 min-w-3 shrink-0" />
							<span className="truncate" title={value}>
								{value}
							</span>
						</p>
					))}
				</div>
			) : null}

			{records.length > 0 || client.registros.valorTotalComprado > 0 ? (
				<div className="mt-auto flex flex-wrap gap-1">
					{records.map(({ label, count }) => (
						<Chip.Root key={label} variant="muted" size="xs" shape="pill">
							<Chip.Label>
								{count} {label}
							</Chip.Label>
						</Chip.Root>
					))}
					{client.registros.valorTotalComprado > 0 ? (
						<Chip.Root variant="muted" size="xs" shape="pill">
							<Chip.Label className="tabular-nums">{formatToMoney(client.registros.valorTotalComprado)} comprados</Chip.Label>
						</Chip.Root>
					) : null}
				</div>
			) : null}
		</Label>
	);
}

function ReconciliationKeeperChoice() {
	const { state, actions } = useClientReconciliation();
	if (!state.comparison || !state.keeper) return null;
	return (
		<ResponsiveMenuSection title="CADASTRO MANTIDO" icon={<UserCheckIcon className={SECTION_ICON_CLASS} />}>
			<RadioGroup value={state.keeper.id} onValueChange={actions.setKeeper} className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-2">
				{[state.comparison.clienteA, state.comparison.clienteB].map((client) => (
					<ClientChoiceCard key={client.id} client={client} isKeeper={client.id === state.keeper?.id} />
				))}
			</RadioGroup>
			<p className="text-[11px] leading-relaxed text-muted-foreground">
				Todo o histórico do cadastro removido (vendas, cashback, conversas, cupons) passa para o mantido.
			</p>
		</ResponsiveMenuSection>
	);
}

function ReconciliationCashbackPreview() {
	const { state } = useClientReconciliation();
	if (state.cashbackPreview.length === 0) return null;
	return (
		<ResponsiveMenuSection title="SALDO DE CASHBACK RESULTANTE" icon={<BadgeDollarSign className={SECTION_ICON_CLASS} />}>
			<div className="flex w-full flex-col divide-y divide-border">
				{state.cashbackPreview.map((entry) => {
					const keeperBalance = state.keeperIsA ? entry.saldoA : entry.saldoB;
					const sourceBalance = state.keeperIsA ? entry.saldoB : entry.saldoA;
					return (
						<div key={entry.programaId} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
							<span className="min-w-0 truncate text-xs font-medium" title={entry.titulo}>
								{entry.titulo}
							</span>
							<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
								{formatToMoney(keeperBalance)} + {formatToMoney(sourceBalance)} ={" "}
								<span className="text-sm font-bold text-foreground">{formatToMoney(keeperBalance + sourceBalance)}</span>
							</span>
						</div>
					);
				})}
			</div>
		</ResponsiveMenuSection>
	);
}

function ReconciliationConflicts() {
	const { state, actions } = useClientReconciliation();
	if (!state.comparison || state.conflicts.length === 0) return null;
	const comparison = state.comparison;
	return (
		<ResponsiveMenuSection title="CAMPOS EM CONFLITO" icon={<SplitIcon className={SECTION_ICON_CLASS} />}>
			<p className="text-[11px] leading-relaxed text-muted-foreground">
				Os dois cadastros divergem nos campos abaixo. Escolha o valor que fica no cadastro mantido.
			</p>
			{state.conflicts.map((conflict) => (
				<div key={conflict.field} className="flex w-full flex-col gap-1.5">
					<p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{conflict.label}</p>
					<RadioGroup
						value={state.fieldPicks[conflict.field] ?? (state.keeperIsA ? "A" : "B")}
						onValueChange={(value) => actions.pickField(conflict.field, value as "A" | "B")}
						className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
					>
						{(
							[
								{ side: "A", value: conflict.valueA, owner: comparison.clienteA.nome },
								{ side: "B", value: conflict.valueB, owner: comparison.clienteB.nome },
							] as const
						).map(({ side, value, owner }) => {
							const isPicked = (state.fieldPicks[conflict.field] ?? (state.keeperIsA ? "A" : "B")) === side;
							const inputId = `conflict-${conflict.field}-${side}`;
							return (
								<Label
									key={side}
									htmlFor={inputId}
									className={cn(
										"flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
										isPicked ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40",
									)}
								>
									<RadioGroupItem value={side} id={inputId} className="shrink-0" />
									<span className="flex min-w-0 flex-col gap-0.5">
										<span className="truncate text-xs font-medium" title={value}>
											{value}
										</span>
										<span className="truncate text-[10px] text-muted-foreground" title={owner}>
											de {owner}
										</span>
									</span>
								</Label>
							);
						})}
					</RadioGroup>
				</div>
			))}
		</ResponsiveMenuSection>
	);
}

/** Aviso âmbar: pede atenção antes de uma ação irreversível, sem ser um erro. */
function ReconciliationAlert({ children }: { children: ReactNode }) {
	return (
		<div className="flex w-full items-start gap-2.5 rounded-xl border border-brand/35 bg-brand/15 px-3 py-2.5">
			<TriangleAlertIcon className="mt-0.5 h-4 w-4 min-h-4 min-w-4 shrink-0" />
			<p className="text-xs leading-relaxed text-foreground">{children}</p>
		</div>
	);
}

function ReconciliationAlerts() {
	const { state } = useClientReconciliation();
	if (!state.comparison) return null;
	return (
		<>
			{state.comparison.alerts.acumuloNaMesmaVenda ? (
				<ReconciliationAlert>
					Os dois cadastros acumularam cashback na <span className="font-bold">mesma venda</span>. Isso costuma indicar comprador e parceiro, ou seja, duas
					pessoas diferentes. Considere descartar o par em vez de mesclar.
				</ReconciliationAlert>
			) : null}
			{state.comparison.alerts.cpfCnpjDivergentes ? (
				<ReconciliationAlert>
					Os cadastros têm <span className="font-bold">CPF/CNPJ diferentes</span>. Documentos fiscais já emitidos não são alterados pela mesclagem.
					Confirme que são de fato a mesma pessoa antes de continuar.
				</ReconciliationAlert>
			) : null}
		</>
	);
}

function ReconciliationMergeConfirmation() {
	const { state } = useClientReconciliation();
	if (!state.confirmingMerge || !state.keeper || !state.source) return null;
	return (
		<div className="flex w-full items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5">
			<ShieldAlertIcon className="mt-0.5 h-4 w-4 min-h-4 min-w-4 shrink-0 text-destructive" />
			<div className="flex min-w-0 flex-col gap-0.5">
				<p className="text-xs font-extrabold text-destructive">Esta ação não pode ser desfeita.</p>
				<p className="text-xs leading-relaxed text-foreground">
					O cadastro <span className="font-bold">{state.source.nome}</span> será removido e seus {totalLinkedRecords(state.source)} registros passam para{" "}
					<span className="font-bold">{state.keeper.nome}</span>.
				</p>
			</div>
		</div>
	);
}

function ReconciliationPermissionNote() {
	const { state, meta } = useClientReconciliation();
	if (meta.canReconcile || !state.comparison) return null;
	return (
		<p className="text-[11px] leading-relaxed text-muted-foreground">
			Você pode comparar os cadastros, mas apenas usuários com permissão de gestão da empresa podem mesclar ou descartar.
		</p>
	);
}

/** Corpo completo da comparação na ordem padrão; as seções também são compostas individualmente. */
function ReconciliationBody() {
	return (
		<>
			<ReconciliationSignals />
			<ReconciliationKeeperChoice />
			<ReconciliationCashbackPreview />
			<ReconciliationConflicts />
			<ReconciliationAlerts />
			<ReconciliationMergeConfirmation />
			<ReconciliationPermissionNote />
		</>
	);
}

export const ClientReconciliation = {
	Provider: ClientReconciliationProvider,
	Body: ReconciliationBody,
	Signals: ReconciliationSignals,
	KeeperChoice: ReconciliationKeeperChoice,
	CashbackPreview: ReconciliationCashbackPreview,
	Conflicts: ReconciliationConflicts,
	Alerts: ReconciliationAlerts,
	MergeConfirmation: ReconciliationMergeConfirmation,
	PermissionNote: ReconciliationPermissionNote,
};

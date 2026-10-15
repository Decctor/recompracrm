"use client";

import { getPurchaseItemsTotal } from "@/components/Modals/Purchases/Blocks/Items";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { getAccountingEntryBalanceError, getActiveTransactionsTotal } from "@/lib/finances/accounting-entry-balance";
import { invalidateFinanceQueries } from "@/lib/finances/invalidate-finance-queries";
import { formatToMoney } from "@/lib/formatting";
import { updatePurchase as updatePurchaseMutation } from "@/lib/mutations/purchases";
import { usePurchaseById } from "@/lib/queries/purchases";
import { usePurchaseState, type TPurchaseState } from "@/state-hooks/use-purchase-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilesIcon, PencilIcon, ShoppingCartIcon, WalletIcon } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import PurchaseDetailHeader from "./components/detail-header";
import { buildPurchaseStateFromPurchase, getDirtyTabs, type TDetailTab } from "./helpers/hydrate";
import DocumentsTab from "./tabs/documents-tab";
import FinanceTab from "./tabs/finance-tab";
import ItemsTab from "./tabs/items-tab";
import RegistryTab from "./tabs/registry-tab";

const TABS: { id: TDetailTab; label: string; icon: typeof PencilIcon }[] = [
	{ id: "cadastro", label: "CADASTRO", icon: PencilIcon },
	{ id: "itens", label: "ITENS", icon: ShoppingCartIcon },
	{ id: "financeiro", label: "FINANCEIRO", icon: WalletIcon },
	{ id: "documentos", label: "DOCUMENTOS", icon: FilesIcon },
];
const TAB_NAMES: Record<TDetailTab, string> = { cadastro: "Cadastro", itens: "Itens", financeiro: "Financeiro", documentos: "Documentos" };

type PurchaseDetailPageProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
	purchaseId: string;
};

export default function PurchaseDetailPage({ membership, purchaseId }: PurchaseDetailPageProps) {
	const [tab, setTab] = useQueryState("tab", parseAsStringEnum<TDetailTab>(TABS.map((option) => option.id)).withDefault("itens"));
	const queryClient = useQueryClient();
	const { data: purchase, queryKey, isLoading, isError, error, dataUpdatedAt } = usePurchaseById({ id: purchaseId });
	const editor = usePurchaseState({ initialState: {} });
	const { state, redefineState } = editor;
	// The last saved state: what DESCARTAR goes back to and what "unsaved" is measured against.
	const [baseline, setBaseline] = useState<TPurchaseState | null>(null);
	const hydratedAtRef = useRef(0);

	const dirtyTabs = useMemo(() => getDirtyTabs(state, baseline), [state, baseline]);
	const isDirty = dirtyTabs.size > 0;

	// Fresh data replaces the editable state only when nothing is pending: a background refetch must
	// never wipe what the operator is typing.
	useEffect(() => {
		if (!purchase || dataUpdatedAt === hydratedAtRef.current || isDirty) return;
		hydratedAtRef.current = dataUpdatedAt;
		const next = buildPurchaseStateFromPurchase(purchase);
		redefineState(next);
		setBaseline(next);
	}, [purchase, dataUpdatedAt, isDirty, redefineState]);

	const { mutate: savePurchase, isPending } = useMutation({
		mutationKey: ["update-purchase", purchaseId],
		mutationFn: updatePurchaseMutation,
		onMutate: async () => await queryClient.cancelQueries({ queryKey }),
		onSuccess: async (data, variables) => {
			toast.success(data.message);
			// What was just saved (status changes included) is both the page state and the new baseline, so
			// nothing reads as pending and the refetch below is allowed to hydrate the server's version.
			const saved = {
				purchase: variables.purchase,
				purchaseItems: variables.purchaseItems,
				lancamentoContabil: variables.lancamentoContabil,
			} as TPurchaseState;
			redefineState(saved);
			setBaseline(saved);
			void invalidateFinanceQueries(queryClient, { accountingEntryId: state.lancamentoContabil.id });
			await queryClient.invalidateQueries({ queryKey: ["purchases"] });
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
		onSettled: async () => await queryClient.invalidateQueries({ queryKey }),
	});

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!purchase || !baseline) return null;

	const savedStatus = purchase.status;
	const isReceived = savedStatus === "RECEBIDA";
	const isCancelled = savedStatus === "CANCELADA";
	const canEdit = membership.permissoes.compras.editar && !isCancelled;

	const itemsTotal = getPurchaseItemsTotal(state.purchaseItems);
	const entryValue = state.lancamentoContabil.valor;
	const itemsMatchValue = Math.round(itemsTotal * 100) === Math.round(entryValue * 100);
	const balanceError = getAccountingEntryBalanceError({ entryValue, transactions: state.lancamentoContabil.transacoes });
	const transactionsRemaining = Math.round((entryValue - getActiveTransactionsTotal(state.lancamentoContabil.transacoes)) * 100) / 100;

	/** Saves the whole page. Status changes (receive, cancel) go through here too, with any pending edits. */
	function save(purchaseOverrides: Partial<TPurchaseState["purchase"]> = {}) {
		const nextPurchase = { ...state.purchase, ...purchaseOverrides };
		if (nextPurchase.status !== "CANCELADA") {
			if (balanceError) return toast.error(balanceError);
			if (!isReceived && nextPurchase.status === "RECEBIDA" && !itemsMatchValue)
				return toast.error(`O valor efetivo precisa ser igual ao total dos itens (${formatToMoney(itemsTotal)}) para receber a compra.`);
		}
		savePurchase({
			purchaseId,
			purchase: nextPurchase,
			importedDocuments: nextPurchase.documentosImportados?.documentos ?? [],
			purchaseItems: state.purchaseItems,
			lancamentoContabil: state.lancamentoContabil,
		});
	}

	const dirtyNames = TABS.filter((option) => dirtyTabs.has(option.id)).map((option) => TAB_NAMES[option.id]);
	let saveMessage = `Alterações não salvas em ${dirtyNames.join(" e ")}`;
	if (dirtyTabs.has("itens") && !itemsMatchValue) saveMessage += ". O total dos itens deixou de bater com o valor a pagar";
	if (dirtyTabs.has("financeiro") && transactionsRemaining > 0.009) saveMessage += `. Faltam ${formatToMoney(transactionsRemaining)} em transações`;
	if (dirtyTabs.has("financeiro") && transactionsRemaining < -0.009) saveMessage += ". As transações passam do valor a pagar";
	saveMessage += ".";

	return (
		<div className="flex w-full max-w-full grow flex-col gap-6 overflow-x-hidden bg-background py-3">
			<PurchaseDetailHeader
				purchase={purchase}
				state={state}
				canEdit={canEdit}
				isSaving={isPending}
				itemsTotal={itemsTotal}
				itemsMatchValue={itemsMatchValue}
				hasUnsavedChanges={isDirty}
				onReceive={(receivedAt) => save({ status: "RECEBIDA", entregaDataRecebimentoEfetivacao: receivedAt })}
				// A receipt date is only valid on RECEBIDA; the server's cancel path also clears it.
				onCancel={() => save({ status: "CANCELADA", entregaDataRecebimentoEfetivacao: null })}
			/>
			<Tabs value={tab} onValueChange={(value) => setTab(value as TDetailTab)}>
				<TabsList variant="page">
					{TABS.map((option) => (
						<TabsTrigger key={option.id} value={option.id}>
							<option.icon className="h-4 min-h-4 w-4 min-w-4" />
							{option.label}
							{dirtyTabs.has(option.id) ? <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="Alterações não salvas" /> : null}
						</TabsTrigger>
					))}
				</TabsList>
				<TabsContent value="cadastro" className="mt-4">
					<RegistryTab purchase={purchase} editor={editor} editable={canEdit} />
				</TabsContent>
				<TabsContent value="itens" className="mt-4">
					<ItemsTab purchase={purchase} editor={editor} baseline={baseline} editable={canEdit && !isReceived} isReceived={isReceived} />
				</TabsContent>
				<TabsContent value="financeiro" className="mt-4">
					<FinanceTab editor={editor} editable={canEdit} isReceived={isReceived} itemsTotal={itemsTotal} />
				</TabsContent>
				<TabsContent value="documentos" className="mt-4">
					<DocumentsTab purchase={purchase} state={state} />
				</TabsContent>
			</Tabs>
			<SectionApplyBar
				isDirty={isDirty && canEdit}
				isPending={isPending}
				disabled={!!balanceError}
				disabledReason={balanceError}
				message={saveMessage}
				applyButtonText="SALVAR ALTERAÇÕES"
				onApply={() => save()}
				onDiscard={() => redefineState(baseline)}
			/>
		</div>
	);
}

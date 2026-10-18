import { getPurchaseItemsTotal } from "@/components/Modals/Purchases/Blocks/Items";
import { getAccountingEntryBalanceError } from "@/lib/finances/accounting-entry-balance";
import { formatToMoney } from "@/lib/formatting";
import type { TPurchaseState } from "@/state-hooks/use-purchase-state";
import { getIncludedLinesTotal, getLineIssue, type TReviewLine } from "./review-lines";
import { STAGE_ORDER, type TBuilderStageId } from "./stages";

export type TBuilderOrigin = "document" | "manual";
export type TBuilderReadStatus = "idle" | "reading" | "done";

export type TStageValidationResult = { valid: boolean; reason?: string };

export type TBuilderValidationContext = {
	origin: TBuilderOrigin | null;
	readStatus: TBuilderReadStatus;
	lines: TReviewLine[];
	state: TPurchaseState;
	received: boolean;
};

export function getPendingLines(lines: TReviewLine[]) {
	return lines.filter((line) => getLineIssue(line) !== null);
}

/** Financial total of the purchase: reviewed invoice lines plus items added by hand. */
export function getBuilderItemsTotal({ lines, state }: Pick<TBuilderValidationContext, "lines" | "state">) {
	return Math.round((getIncludedLinesTotal(lines) + getPurchaseItemsTotal(state.purchaseItems)) * 100) / 100;
}

export function getBuilderItemsCount({ lines, state }: Pick<TBuilderValidationContext, "lines" | "state">) {
	return lines.filter((line) => line.incluir).length + state.purchaseItems.filter((item) => !item.deletar).length;
}

export function itemsMatchEntryValue(context: Pick<TBuilderValidationContext, "lines" | "state">) {
	return Math.round(getBuilderItemsTotal(context) * 100) === Math.round(context.state.lancamentoContabil.valor * 100);
}

export function validateStage(stage: TBuilderStageId, context: TBuilderValidationContext): TStageValidationResult {
	const { origin, readStatus, lines, state, received } = context;
	switch (stage) {
		case "origin":
			if (!origin) return { valid: false, reason: "Escolha como começar." };
			if (origin === "document" && readStatus !== "done") return { valid: false, reason: "Leia o documento para continuar." };
			return { valid: true };
		case "supplier":
			return { valid: true };
		case "items": {
			const pending = getPendingLines(lines).length;
			if (pending > 0)
				return {
					valid: false,
					reason: `Resolva ${pending} ${pending === 1 ? "pendência" : "pendências"} ou marque as linhas como não incluídas para continuar.`,
				};
			return { valid: true };
		}
		case "finance": {
			const balanceError = getAccountingEntryBalanceError({
				entryValue: state.lancamentoContabil.valor,
				transactions: state.lancamentoContabil.transacoes,
			});
			if (balanceError) return { valid: false, reason: balanceError };
			return { valid: true };
		}
		case "delivery":
			// Receiving freezes the items: the server only accepts it when they explain the whole value.
			if (received && getBuilderItemsCount(context) > 0 && !itemsMatchEntryValue(context))
				return {
					valid: false,
					reason: `Para receber agora, o valor efetivo precisa ser igual ao total dos itens (${formatToMoney(getBuilderItemsTotal(context))}).`,
				};
			return { valid: true };
		case "review":
			if (!state.purchase.titulo.trim()) return { valid: false, reason: "Dê um título para a compra." };
			return { valid: true };
	}
}

/** First stage that blocks the confirmation, with its reason. */
export function findFirstInvalidStage(context: TBuilderValidationContext) {
	for (const stage of STAGE_ORDER) {
		const result = validateStage(stage, context);
		if (!result.valid) return { stage, reason: result.reason ?? "Revise os campos obrigatórios." };
	}
	return null;
}

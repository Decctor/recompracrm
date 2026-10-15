"use client";

import { ACCOUNTING_ENTRY_BALANCE_TOLERANCE, getActiveTransactionsTotal } from "@/lib/finances/accounting-entry-balance";
import { useMemo } from "react";
import { getLineStatus } from "../helpers/review-lines";
import {
	findFirstInvalidStage,
	getBuilderItemsCount,
	getBuilderItemsTotal,
	getPendingLines,
	itemsMatchEntryValue,
	validateStage,
	type TBuilderValidationContext,
} from "../helpers/validation";
import { useBuilder } from "./builder-provider";

export function useBuilderSummary() {
	const builder = useBuilder();
	const { origin, readStatus, lines, state, received, currentStage } = builder;

	return useMemo(() => {
		const context: TBuilderValidationContext = { origin, readStatus, lines, state, received };
		const pendingLines = getPendingLines(lines);
		const readyCount = lines.filter((line) => getLineStatus(line) === "ready").length;
		const ignoredCount = lines.filter((line) => getLineStatus(line) === "ignored").length;
		const itemsTotal = getBuilderItemsTotal(context);
		const itemsCount = getBuilderItemsCount(context);
		const entryValue = state.lancamentoContabil.valor;
		const transactionsTotal = getActiveTransactionsTotal(state.lancamentoContabil.transacoes);
		const transactionsRemaining = Math.round((entryValue - transactionsTotal) * 100) / 100;
		const transactionsBalanced = Math.abs(transactionsRemaining) <= ACCOUNTING_ENTRY_BALANCE_TOLERANCE;
		const fromDocument = origin === "document" && readStatus === "done";
		const totalsMatch = itemsCount === 0 || itemsMatchEntryValue(context);

		return {
			context,
			fromDocument,
			pendingLines,
			readyCount,
			ignoredCount,
			itemsTotal,
			itemsCount,
			entryValue,
			transactionsTotal,
			transactionsRemaining,
			transactionsBalanced,
			totalsMatch,
			activeValidation: validateStage(currentStage, context),
			firstInvalid: findFirstInvalidStage(context),
		};
	}, [origin, readStatus, lines, state, received, currentStage]);
}

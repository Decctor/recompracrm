import dayjs from "dayjs";
import { z } from "zod";
import type { TGetProductsDefaultInput } from "@/lib/products/list";
import { REPORT_PERIOD_PRESETS, matchPeriodPreset } from "../period-presets";

/**
 * Filtros da listagem de produtos guardados no dispositivo, para que cada usuário monte a tela do
 * seu jeito (ordenação, grupos, estoque...) e a encontre igual na próxima visita.
 *
 * Busca e página ficam de fora de propósito: são da tarefa do momento, não preferência.
 *
 * O período nunca é gravado como datas soltas quando corresponde a um recorte relativo. Quem usa o
 * mês corrente (o padrão) ou um atalho como "ÚLTIMOS 30 DIAS" quer o mesmo recorte amanhã, não as
 * datas de hoje congeladas; só um intervalo escolhido à mão no calendário volta com as mesmas datas.
 */
const STORAGE_PREFIX = "ampmais:products-filters:v1";

export type TPersistedProductsFilters = Omit<TGetProductsDefaultInput, "page" | "search" | "mode" | "resultLimit">;

const PeriodSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("current-month") }),
	z.object({ type: z.literal("preset"), id: z.string() }),
	z.object({ type: z.literal("none") }),
	z.object({ type: z.literal("fixed"), after: z.string().datetime().nullable(), before: z.string().datetime().nullable() }),
]);
type TStoredPeriod = z.infer<typeof PeriodSchema>;

const StringListSchema = z.array(z.string()).optional().catch(undefined);
const NumberOrNullSchema = z.number().nullable().optional().catch(undefined);
const BooleanSchema = z.boolean().optional().catch(undefined);

// Cada campo inválido é descartado sozinho (`catch`): um valor corrompido não apaga as demais escolhas.
const StoredProductsFiltersSchema = z.object({
	period: PeriodSchema.optional().catch(undefined),
	filters: z.object({
		groups: StringListSchema,
		statsSellerIds: StringListSchema,
		statsIntegrationsIds: StringListSchema,
		statsExcludedSalesIds: StringListSchema,
		statsTotalMin: NumberOrNullSchema,
		statsTotalMax: NumberOrNullSchema,
		stockStatus: StringListSchema,
		mainSupplierIds: StringListSchema,
		withoutMainSupplier: BooleanSchema,
		trackedOnly: BooleanSchema,
		abcClasses: z
			.array(z.enum(["A", "B", "C"]))
			.optional()
			.catch(undefined),
		priceMin: NumberOrNullSchema,
		priceMax: NumberOrNullSchema,
		orderByField: z
			.enum(["nome", "codigo", "grupo", "vendasValorTotal", "vendasQtdeTotal", "quantidade", "dataInsercao", "dataAtualizacao"])
			.nullable()
			.optional()
			.catch(undefined),
		orderByDirection: z.enum(["asc", "desc"]).nullable().optional().catch(undefined),
	}),
});
type TStoredProductsFilters = z.infer<typeof StoredProductsFiltersSchema>;

export function getProductsFiltersStorageKey({ organizationId, userId }: { organizationId: string; userId: string }) {
	return `${STORAGE_PREFIX}:${organizationId}:${userId}`;
}

/** Período padrão da listagem: o mês de calendário inteiro da data de referência. */
export function getDefaultProductsPeriod(referenceDate: Date) {
	return { statsPeriodAfter: dayjs(referenceDate).startOf("month").toDate(), statsPeriodBefore: dayjs(referenceDate).endOf("month").toDate() };
}

/** Estado padrão da listagem, o mesmo de quem nunca mexeu nos filtros. */
export function getDefaultProductsFilters(referenceDate: Date): TPersistedProductsFilters {
	return {
		...getDefaultProductsPeriod(referenceDate),
		groups: [],
		statsSellerIds: [],
		statsIntegrationsIds: [],
		statsExcludedSalesIds: [],
		statsTotalMin: null,
		statsTotalMax: null,
		stockStatus: [],
		mainSupplierIds: [],
		withoutMainSupplier: false,
		trackedOnly: false,
		abcClasses: [],
		priceMin: null,
		priceMax: null,
		orderByField: "nome",
		orderByDirection: "asc",
	};
}

/** Se os filtros na tela diferem do padrão em algo que seria gravado (busca e página não contam). */
export function differsFromDefaultProductsFilters(filters: TPersistedProductsFilters, referenceDate: Date) {
	const current = serializeProductsFilters(filters, referenceDate);
	const defaults = serializeProductsFilters(getDefaultProductsFilters(referenceDate), referenceDate);
	return JSON.stringify(current) !== JSON.stringify(defaults);
}

function serializePeriod(after: Date | null, before: Date | null, referenceDate: Date): TStoredPeriod {
	if (!after && !before) return { type: "none" };
	if (after && before) {
		const defaultPeriod = getDefaultProductsPeriod(referenceDate);
		if (dayjs(after).isSame(defaultPeriod.statsPeriodAfter, "day") && dayjs(before).isSame(defaultPeriod.statsPeriodBefore, "day")) {
			return { type: "current-month" };
		}
		const preset = matchPeriodPreset(REPORT_PERIOD_PRESETS, { after, before }, referenceDate);
		if (preset) return { type: "preset", id: preset.id };
	}
	return { type: "fixed", after: after?.toISOString() ?? null, before: before?.toISOString() ?? null };
}

function resolvePeriod(period: TStoredPeriod, referenceDate: Date): Pick<TPersistedProductsFilters, "statsPeriodAfter" | "statsPeriodBefore"> | null {
	switch (period.type) {
		case "current-month":
			return getDefaultProductsPeriod(referenceDate);
		case "none":
			return { statsPeriodAfter: null, statsPeriodBefore: null };
		case "preset": {
			// Atalho que deixou de existir: cai no período padrão da tela.
			const preset = REPORT_PERIOD_PRESETS.find((item) => item.id === period.id);
			if (!preset) return null;
			const { from, to } = preset.getValue(referenceDate);
			return { statsPeriodAfter: from, statsPeriodBefore: to };
		}
		case "fixed":
			return {
				statsPeriodAfter: period.after ? new Date(period.after) : null,
				statsPeriodBefore: period.before ? new Date(period.before) : null,
			};
	}
}

export function serializeProductsFilters(filters: TPersistedProductsFilters, referenceDate: Date): TStoredProductsFilters {
	return {
		period: serializePeriod(filters.statsPeriodAfter, filters.statsPeriodBefore, referenceDate),
		filters: {
			groups: filters.groups,
			statsSellerIds: filters.statsSellerIds,
			statsIntegrationsIds: filters.statsIntegrationsIds,
			statsExcludedSalesIds: filters.statsExcludedSalesIds,
			statsTotalMin: filters.statsTotalMin,
			statsTotalMax: filters.statsTotalMax,
			stockStatus: filters.stockStatus,
			mainSupplierIds: filters.mainSupplierIds,
			withoutMainSupplier: filters.withoutMainSupplier,
			trackedOnly: filters.trackedOnly,
			abcClasses: filters.abcClasses as ("A" | "B" | "C")[],
			priceMin: filters.priceMin,
			priceMax: filters.priceMax,
			orderByField: filters.orderByField,
			orderByDirection: filters.orderByDirection,
		},
	};
}

/**
 * Lê o JSON gravado e devolve só os filtros que sobreviveram à validação, prontos para sobrepor os
 * padrões da tela. Qualquer coisa ilegível resulta em `{}`: a tela abre no padrão, nunca quebra.
 */
export function parseStoredProductsFilters(raw: string | null, referenceDate: Date): Partial<TPersistedProductsFilters> {
	if (!raw) return {};
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return {};
	}
	const parsed = StoredProductsFiltersSchema.safeParse(json);
	if (!parsed.success) return {};
	const restored: Partial<TPersistedProductsFilters> = {};
	for (const [key, value] of Object.entries(parsed.data.filters)) {
		if (value !== undefined) (restored as Record<string, unknown>)[key] = value;
	}
	const period = parsed.data.period ? resolvePeriod(parsed.data.period, referenceDate) : null;
	if (period) Object.assign(restored, period);
	return restored;
}

export function readStoredProductsFilters(storageKey: string, referenceDate: Date): Partial<TPersistedProductsFilters> {
	try {
		return parseStoredProductsFilters(window.localStorage.getItem(storageKey), referenceDate);
	} catch {
		return {};
	}
}

export function writeStoredProductsFilters(storageKey: string, filters: TPersistedProductsFilters, referenceDate: Date) {
	try {
		window.localStorage.setItem(storageKey, JSON.stringify(serializeProductsFilters(filters, referenceDate)));
	} catch {
		// Modo privativo ou cota estourada: os filtros continuam valendo nesta sessão.
	}
}

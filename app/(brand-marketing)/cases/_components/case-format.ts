import type { TCaseMetric, TLandingCase } from "@/app/_content/cases";

export const CASES_BASE_URL = "https://www.recompracrm.com.br";

const KIND_LABEL: Record<NonNullable<TLandingCase["video"]>["kind"], string> = {
	resultado: "O resultado, contado pelo cliente",
	depoimento: "Depoimento do cliente",
};

export function caseHref(item: TLandingCase) {
	return `/cases/${item.id}`;
}

export function casePlace(item: TLandingCase) {
	return `${item.client.segment} · ${item.client.city}/${item.client.state}`;
}

export function caseKindLabel(item: TLandingCase) {
	return item.video ? KIND_LABEL[item.video.kind] : "Case de cliente";
}

/** Título do case: o do vídeo, ou um genérico quando o case não tem vídeo. */
export function caseTitle(item: TLandingCase) {
	return item.video?.title ?? `Case ${item.client.name}`;
}

export function caseThumbnail(item: TLandingCase, width: 960 | 1920) {
	if (!item.video) return null;
	return `https://image.mux.com/${item.video.muxPlaybackId}/thumbnail.webp?time=${item.video.thumbnailTime ?? 0}&width=${width}`;
}

/** Partes do número: o prefixo e a unidade são renderizados menores que o valor. */
export function caseMetricParts(metric: TCaseMetric) {
	const digits = metric.decimals ?? 0;
	const value = metric.value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
	return { prefix: metric.prefix ?? "", value: `${value}${metric.suffix ?? ""}`, unit: metric.unit ?? "" };
}

export function caseMetricText(metric: TCaseMetric) {
	const { prefix, value, unit } = caseMetricParts(metric);
	return `${prefix}${value}${unit ? ` ${unit}` : ""}`;
}

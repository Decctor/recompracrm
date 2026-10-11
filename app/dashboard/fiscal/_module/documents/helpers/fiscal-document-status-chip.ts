import { SALE_FISCAL_STATUS_PRESENTATION, SALE_STATUS_TONE_CLASSNAMES } from "@/lib/sales/status-presentation";
import { mapInternalFiscalStatus } from "@/lib/sales/utils";
import type { TFiscalDocumentLifecycleStatusEnum } from "@/schemas/enums";

/** Classes do selo em pílula usado nos cabeçalhos de seção da venda — o mesmo selo aqui. */
export const FISCAL_DOCUMENT_STATUS_CHIP_CLASSNAME = "rounded-full border px-2.5 py-1 text-[0.65rem] font-bold tracking-tight whitespace-nowrap";

/**
 * Selo do documento no vocabulário da venda ("AUTORIZADA", "NOTA REJEITADA"): a mesma nota lê
 * igual na venda e aqui. Cancelamento pendente ganha o próprio rótulo — na venda ele cai em
 * "processando", mas nesta página a diferença é o que o operador precisa saber.
 */
export function resolveFiscalDocumentStatusChip(statusInterno: TFiscalDocumentLifecycleStatusEnum) {
	if (statusInterno === "CANCELAMENTO_PENDENTE") {
		return { label: "CANCELAMENTO PENDENTE", className: SALE_STATUS_TONE_CLASSNAMES.neutral };
	}
	const derived = mapInternalFiscalStatus(statusInterno);
	const presentation = derived ? SALE_FISCAL_STATUS_PRESENTATION[derived] : null;
	return presentation
		? { label: presentation.chipLabel, className: presentation.className }
		: { label: statusInterno, className: SALE_STATUS_TONE_CLASSNAMES.muted };
}

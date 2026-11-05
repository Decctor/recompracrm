import { formatDateAsLocale } from "@/lib/formatting";
import type { TFinancialTransactionSettlementOriginEnum } from "@/schemas/enums";

export type TSettlementAudit = {
	efetivacaoAutorId: string | null;
	efetivacaoOrigem: TFinancialTransactionSettlementOriginEnum | null;
};

/**
 * Auditoria da efetivação para formulários que gravam `dataEfetivacao` junto com o resto da
 * transação (lançamentos, compras). Os demais caminhos carimbam autor e origem direto no ponto em
 * que efetivam.
 *
 * - transação nova já paga: nasceu paga (IMEDIATA), por quem a lançou;
 * - pendente que passa a paga: um usuário confirmou depois (MANUAL);
 * - paga que volta a pendente: a auditoria deixa de valer e é limpa;
 * - ajuste de uma transação que continua paga: nada muda — mexer na data não troca quem efetivou.
 *
 * Devolve só os campos que devem ser escritos, para o `set` de um update não sobrescrever o resto.
 */
export function resolveSettlementAuditOnWrite({
	isNew,
	previousDataEfetivacao,
	nextDataEfetivacao,
	authorId,
}: {
	isNew: boolean;
	previousDataEfetivacao?: Date | null;
	nextDataEfetivacao: Date | null | undefined;
	authorId: string | null;
}): Partial<TSettlementAudit> {
	const willBeSettled = nextDataEfetivacao != null;
	if (isNew)
		return willBeSettled ? { efetivacaoAutorId: authorId, efetivacaoOrigem: "IMEDIATA" } : { efetivacaoAutorId: null, efetivacaoOrigem: null };

	const wasSettled = previousDataEfetivacao != null;
	if (!wasSettled && willBeSettled) return { efetivacaoAutorId: authorId, efetivacaoOrigem: "MANUAL" };
	if (wasSettled && !willBeSettled) return { efetivacaoAutorId: null, efetivacaoOrigem: null };
	return {};
}

export const SETTLEMENT_ORIGIN_LABEL: Record<TFinancialTransactionSettlementOriginEnum, string> = {
	IMEDIATA: "Imediata",
	MANUAL: "Manual",
	INTEGRACAO: "Integração",
	CONCILIACAO: "Conciliação",
	SISTEMA: "Sistema",
};

/**
 * Datas digitadas só com o dia chegam ao banco num horário cravado: 12:00 UTC (meio-dia de
 * `formatDateOnInputChange`), 00:00 UTC (extratos e datas ISO puras) ou 03:00 UTC (meia-noite de
 * Brasília). Mostrar esse horário seria inventar um momento que ninguém registrou. Um clique real
 * cair no milissegundo exato de um deles é, na prática, impossível.
 */
export function isDateOnlyTimestamp(value: Date | string) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return true;
	return date.getUTCMilliseconds() === 0 && date.getUTCSeconds() === 0 && date.getUTCMinutes() === 0 && [0, 3, 12].includes(date.getUTCHours());
}

/** Data de efetivação para exibição: com hora quando ela foi de fato registrada, só o dia quando não. */
export function formatSettlementDate(value: Date | string | null | undefined) {
	if (!value) return null;
	return formatDateAsLocale(value, !isDateOnlyTimestamp(value));
}

export type TAuditSaleHeader = {
	valorTotal: number;
	descontosTotal: number | null;
	acrescimosTotal: number | null;
	natureza: string;
	situacao: string;
	statusVenda: string | null;
	dataVenda: string | Date | null;
	modelo?: string;
};

export function toAuditCents(value: number | null) {
	if (value !== null && !Number.isFinite(value)) throw new Error("Valor monetário inválido na auditoria.");
	return Math.round((value ?? 0) * 100);
}

// postgres-js devolve timestamp WITHOUT time zone como texto; a aplicação persiste UTC.
export function toAuditTime(date: string | Date) {
	const value = typeof date === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(date) ? `${date.replace(" ", "T")}Z` : date;
	const time = new Date(value).getTime();
	if (!Number.isFinite(time)) throw new Error("Data inválida na auditoria.");
	return time;
}

export function compareAuditSaleHeaders(actual: TAuditSaleHeader, expected: TAuditSaleHeader) {
	const fields: string[] = [];
	for (const key of ["valorTotal", "descontosTotal", "acrescimosTotal"] as const) {
		if (toAuditCents(actual[key]) !== toAuditCents(expected[key])) fields.push(key);
	}
	for (const key of ["natureza", "situacao", "statusVenda"] as const) {
		// O importador anterior gravava FECHADO onde o atual grava SN01.
		const value = key === "situacao" && actual[key] === "FECHADO" ? "SN01" : actual[key];
		if (value !== expected[key]) fields.push(key);
	}
	if (expected.modelo !== undefined && actual.modelo !== expected.modelo) fields.push("modelo");
	if (!actual.dataVenda || !expected.dataVenda || toAuditTime(actual.dataVenda) !== toAuditTime(expected.dataVenda)) fields.push("dataVenda");
	return fields;
}

export function isInAuditWindow(date: string | Date | null, start: string, end: string) {
	if (!date) return false;
	const time = toAuditTime(date);
	return time >= toAuditTime(start) && time < toAuditTime(end);
}

export function isInternalPOIAuditSale(sale: { idExterno: string; modelo: string }) {
	return sale.modelo === "DV" && sale.idExterno.startsWith("POI-");
}

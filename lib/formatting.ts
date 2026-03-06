import dayjs from "dayjs";
import { getAgeFromBirthdayDate } from "./dates";

export function formatDateTime(value: any) {
	if (!value) return undefined;
	if (Number.isNaN(new Date(value).getMilliseconds())) return undefined;
	return dayjs(value).format("YYYY-MM-DDTHH:mm");
}

export function formatDateAsLocale(date?: string | Date | null, showHours = false) {
	if (!date) return null;
	if (showHours) return dayjs(date).format("DD/MM/YYYY HH:mm");
	return dayjs(date).add(3, "hour").format("DD/MM/YYYY");
}
export function formatDateBirthdayAsLocale(date?: string | Date | null, showAge = false) {
	if (!date) return null;
	if (showAge) return `${formatDateAsLocale(date)} (${getAgeFromBirthdayDate(date)} anos)`;
	return formatDateAsLocale(date);
}
export function formatAsSlug(string: string) {
	return string
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/ /g, "-")
		.replace(/[^\w-]+/g, "");
}

export function formatDateForInputValue(value: Date | string | null | undefined, type: "default" | "datetime" = "default"): string | undefined {
	if (value === "" || value === undefined || value === null) return undefined;
	const date = dayjs(value);
	const yearValue = date.year();
	const monthValue = date.month();
	const dayValue = date.date();

	const year = yearValue.toString().padStart(4, "0");
	const month = (monthValue + 1).toString().padStart(2, "0");
	const day = dayValue.toString().padStart(2, "0");

	if (type === "datetime") {
		const hourValue = date.hour();
		const minuteValue = date.minute();
		const hour = hourValue.toString().padStart(2, "0");
		const minute = minuteValue.toString().padStart(2, "0");
		return `${year}-${month}-${day}T${hour}:${minute}`;
	}

	return `${year}-${month}-${day}`;
}

export function formatDateOnInputChange<T extends "string" | "date" = "string">(
	value: string | undefined,
	returnType: T = "string" as T,
	type: "natural" | "start" | "end" = "natural",
): T extends "string" ? string | null : Date | null {
	// The value coming from input change can be either string or undefined
	// First, checking if the value is either empty or undefined
	if (value === "" || value === undefined || value === null) return null;

	const isFullISO = value.includes("T") && value.includes("Z");
	const isDateTimeOnly = value.includes("T") && !value.includes("Z");

	// Then, since we know it's not empty, we can define the default date we will be working with
	// If the value includes "T", we can assume it comes with datetime definition, we only complement it with "00.000Z" to make a valid ISO string
	// If not, we define 12:00:00.000Z as "midday" for the coming input date (which already is YYYY-MM-DD)
	const defaultDateStringAsISO = isFullISO ? value : isDateTimeOnly ? new Date(value).toISOString() : `${value}T12:00:00.000Z`;

	const isValid = dayjs(defaultDateStringAsISO).isValid();
	if (!isValid) return null;

	if (type === "natural") {
		// If type is natural, we return the default date without any further treatment
		if (returnType === "string") return defaultDateStringAsISO as T extends "string" ? string | null : Date | null;
		if (returnType === "date") return dayjs(defaultDateStringAsISO).toDate() as T extends "string" ? string | null : Date | null;
	}

	if (type === "start") {
		if (returnType === "string") return dayjs(defaultDateStringAsISO).startOf("day").toISOString() as T extends "string" ? string | null : Date | null;
		if (returnType === "date") return dayjs(defaultDateStringAsISO).startOf("day").toDate() as T extends "string" ? string | null : Date | null;
	}

	if (type === "end") {
		if (returnType === "string") return dayjs(defaultDateStringAsISO).endOf("day").toISOString() as T extends "string" ? string | null : Date | null;
		if (returnType === "date") return dayjs(defaultDateStringAsISO).endOf("day").toDate() as T extends "string" ? string | null : Date | null;
	}

	return null;
}

export function formatToDateTime(date: string | null) {
	if (!date) return "";
	return dayjs(date).format("DD/MM/YYYY HH:mm");
}
export function formatDateQuery(date: string, type: "start" | "end", returnAs?: "string" | "date") {
	if (type === "start") {
		if (returnAs === "date") return dayjs(date).startOf("day").subtract(3, "hour").toDate() as Date;
		return dayjs(date).startOf("day").subtract(3, "hour").toISOString();
	}
	if (type === "end") {
		if (returnAs === "date") return dayjs(date).endOf("day").subtract(3, "hour").toDate() as Date;
		return dayjs(date).endOf("day").subtract(3, "hour").toISOString();
	}
	return dayjs(date).startOf("day").subtract(3, "hour").toISOString();
}
export function formatNameAsInitials(name: string) {
	const splittedName = name.split(" ");
	const firstLetter = splittedName[0][0];
	let secondLetter: string;
	if (["DE", "DA", "DO", "DOS", "DAS"].includes(splittedName[1])) secondLetter = splittedName[2] ? splittedName[2][0] : "";
	else secondLetter = splittedName[1] ? splittedName[1][0] : "";
	if (!firstLetter && !secondLetter) return "N";
	return firstLetter + secondLetter;
}
export function formatToMoney(value: string | number, tag = "R$") {
	return `${tag} ${Number(value).toLocaleString("pt-br", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}
export function formatDecimalPlaces(value: string | number, minPlaces?: number, maxPlaces?: number) {
	return Number(value).toLocaleString("pt-br", {
		minimumFractionDigits: minPlaces != null && minPlaces !== undefined ? minPlaces : 0,
		maximumFractionDigits: maxPlaces != null && maxPlaces !== undefined ? maxPlaces : 2,
	});
}

export function formatWithoutDiacritics(string: string, useUpperCase?: boolean) {
	if (!useUpperCase) return string.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
	return string
		.toUpperCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

export function formatLongString(str: string, size: number) {
	return str.length > size ? str.substring(0, size) + "\u2026" : str;
}

export function formatStringAsOnlyDigits(s: string) {
	return s.replace(/[^0-9]/g, "");
}

// Retorna sempre a "base" comparável: DDD (2) + últimos 8 dígitos
export function formatPhoneAsBase(phone: string) {
	let d = formatStringAsOnlyDigits(phone);

	// Remove country code (55) if present
	if (d.startsWith("55") && d.length > 12) {
		d = d.slice(2);
	}

	if (d.length < 10) return ""; // inválido
	// Se 11 dígitos e tiver '9' logo após o DDD, remove esse '9'
	if (d.length === 11 && d[2] === "9") {
		return d.slice(0, 2) + d.slice(3); // remove o 3º dígito
	}
	// Se 10 dígitos (fixo/antigo), já é a base
	if (d.length === 10) return d;
	// Outros comprimentos: tente usar DDD + últimos 8
	return d.slice(0, 2) + d.slice(-8);
}

export function formatToPhone(value: string): string {
	if (!value) return "";
	value = value.replace(/\D/g, "");
	// Limita a 11 dígitos (máximo para telefone brasileiro: DDD + 9 dígitos)
	value = value.slice(0, 11);
	value = value.replace(/(\d{2})(\d)/, "($1) $2");
	value = value.replace(/(\d)(\d{4})$/, "$1-$2");
	return value;
}

export function formatToCPF(value: string): string {
	if (!value) return "";
	value = value.replace(/\D/g, "");
	// Limita a 11 dígitos (máximo para CPF)
	value = value.slice(0, 11);
	return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/g, "$1.$2.$3-$4");
}
export function formatToCNPJ(value: string): string {
	if (!value) return "";
	value = value.replace(/\D/g, "");
	// Limita a 14 dígitos (máximo para CNPJ)
	value = value.slice(0, 14);
	return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/g, "$1.$2.$3/$4-$5");
}
export function formatToCPForCNPJ(value: string): string {
	if (!value) return "";
	const cnpjCpf = value.replace(/\D/g, "");

	if (cnpjCpf.length === 11) {
		// Limita a 11 dígitos e formata como CPF
		return formatToCPF(cnpjCpf.slice(0, 11));
	}

	// Limita a 14 dígitos e formata como CNPJ
	return formatToCNPJ(cnpjCpf.slice(0, 14));
}
export function formatToCEP(value: string): string {
	return value
		.replace(/\D/g, "")
		.replace(/(\d{5})(\d)/, "$1-$2")
		.replace(/(-\d{3})\d+?$/, "$1");
}

export function formatToNumericPassword(value: string, maxDigits = 5): string {
	const digits = value.replace(/\D/g, "");
	return digits.slice(0, maxDigits);
}

export function formatLocation({
	location,
	includeUf,
	includeCity,
	includeCEP,
}: {
	location: {
		cep?: string | null;
		uf: string;
		cidade: string;
		bairro?: string | null;
		endereco?: string | null;
		numeroOuIdentificador?: string | null;
		complemento?: string | null;
		latitude?: string | null;
		longitude?: string | null;
		// distancia: z.number().optional().nullable(),
	};
	includeUf?: boolean;
	includeCity?: boolean;
	includeCEP?: boolean;
}) {
	let addressStr = "";
	if (includeCity && location.cidade) addressStr = addressStr + `${location.cidade}`;
	if (includeUf && location.uf) addressStr = location.endereco ? addressStr + ` (${location.uf}), ` : addressStr + ` (${location.uf})`;
	if (!location.endereco && !includeUf && !includeCity) return "";
	if (location.endereco) addressStr = addressStr + location.endereco;
	if (location.numeroOuIdentificador) addressStr = addressStr + `, Nº ${location.numeroOuIdentificador}`;
	if (location.bairro) addressStr = addressStr + `, ${location.bairro}`;
	if (location.latitude) addressStr = addressStr + `, LAT ${location.latitude}`;
	if (location.longitude) addressStr = addressStr + `, LONG ${location.longitude}`;
	if (includeCEP && location.cep) addressStr = addressStr + `, CEP:${location.cep}`;

	if (addressStr) addressStr += ".";
	return addressStr.toUpperCase();
}

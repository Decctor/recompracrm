import { formatToPhone } from "../formatting";

export function formatPhoneAsWhatsappId(phone: string) {
	const onlyNumbers = phone.replace(/[^0-9]/g, "");
	return `55${onlyNumbers}`;
}

/**
 * Formats a phone number for Internal Gateway
 * Returns digits only with country code (55 for Brazil)
 * @param phone The phone number to format
 * @returns Phone number with only digits (e.g., "5511999998888")
 */
export function formatPhoneForInternalGateway(phone: string): string {
	const onlyNumbers = phone.replace(/[^0-9]/g, "");
	// Add Brazil country code if not present
	if (!onlyNumbers.startsWith("55")) {
		return `55${onlyNumbers}`;
	}
	return onlyNumbers;
}
export function formatWhatsappIdAsPhone(whatsappId: string) {
	return formatToPhone(whatsappId);
}

/**
 * Sanitizes a string to be used as a WhatsApp template parameter.
 * WhatsApp template parameters cannot have:
 * - Newline characters (\n)
 * - Tab characters (\t)
 * - More than 4 consecutive spaces
 *
 * @param text The text to sanitize
 * @returns The sanitized text
 */
export function sanitizeTemplateParameter(text: string): string {
	if (!text) return "";

	return text
		.replace(/[\n\r\t]+/g, " ") // Replace newlines, carriage returns and tabs with a single space
		.replace(/\s{4,}/g, "   ") // Replace 4 or more consecutive spaces with 3 spaces
		.trim();
}

/**
 * Builds a `wa.me` link that opens a chat with the given phone. Local Brazilian numbers
 * (10-11 digits) get the 55 country code; anything shorter cannot be dialed and yields null.
 */
export function buildWhatsappChatUrl(phone: string | null | undefined, message?: string) {
	const digits = phone?.replace(/[^0-9]/g, "") ?? "";
	if (digits.length < 10) return null;
	const internationalNumber = digits.length <= 11 ? `55${digits}` : digits;
	const url = `https://wa.me/${internationalNumber}`;
	return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}

import { proxyVisualKitImageUrl } from "@/lib/visual-kits/generation/image-proxy";
import {
	buildServiceCardsCsv,
	buildServiceCardsPdf,
	detectServiceCardLogoType,
	serviceCardsFileBaseName,
	type TServiceCardPrintItem,
	type TServiceCardPrintLogo,
} from "./service-card-print";

// ============================================================================
// Download do arquivo para grafica (somente browser).
// ============================================================================

export type TServiceCardFileFormat = "PDF" | "CSV";

/** O QR fica impresso por anos: dominio canonico, nunca o de onde o painel foi aberto (preview, localhost). */
export function getServiceCardBaseUrl() {
	return process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
}

// O logo vem do storage (outra origem): passa pelo proxy same-origin, que so serve a logo
// desta organizacao e devolve PNG/JPEG — exatamente o que o pdf-lib embute.
async function loadLogo(logoUrl: string): Promise<TServiceCardPrintLogo | null> {
	try {
		const response = await fetch(proxyVisualKitImageUrl(logoUrl) ?? logoUrl);
		if (!response.ok) return null;
		const bytes = new Uint8Array(await response.arrayBuffer());
		const type = detectServiceCardLogoType(bytes);
		return type ? { bytes, type } : null;
	} catch {
		return null;
	}
}

function triggerDownload(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = fileName;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Gera e baixa o arquivo. Devolve se o logo entrou (falha no logo nao impede o arquivo). */
export async function downloadServiceCardsFile({
	cards,
	format,
	logoUrl,
}: {
	cards: TServiceCardPrintItem[];
	format: TServiceCardFileFormat;
	logoUrl?: string | null;
}): Promise<{ logoIncluded: boolean }> {
	const baseUrl = getServiceCardBaseUrl();
	const fileName = serviceCardsFileBaseName(cards);

	if (format === "CSV") {
		triggerDownload(new Blob([buildServiceCardsCsv({ cards, baseUrl })], { type: "text/csv;charset=utf-8" }), `${fileName}.csv`);
		return { logoIncluded: false };
	}

	const logo = logoUrl ? await loadLogo(logoUrl) : null;
	const bytes = await buildServiceCardsPdf({ cards, baseUrl, logo });
	triggerDownload(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${fileName}.pdf`);
	return { logoIncluded: !!logo };
}

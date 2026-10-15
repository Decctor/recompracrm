import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { getServiceCardUrl } from "./service-card-codes";
import { layoutServiceCardFront, qrModulesToSvgPath } from "./service-card-print-layout";

// ============================================================================
// Arquivo para grafica das comandas fixas: PDF de dados variaveis (uma pagina
// por cartao, QR vetorial, TrimBox/BleedBox) e CSV `codigo;url` para graficas
// que montam a arte no proprio software. Roda no browser e no Node (sem DOM).
// ============================================================================

const PDF_CREATOR = "Comandas fixas";
const LABEL_TEXT = "COMANDA";
const INSTRUCTION_LINES = ["Escaneie para ver sua conta", "e fazer pedidos pelo celular."];

export type TServiceCardPrintItem = { codigo: string; tokenPublico: string };
export type TServiceCardPrintLogo = { bytes: Uint8Array; type: "png" | "jpeg" };

export async function buildServiceCardsPdf({
	cards,
	baseUrl,
	logo,
}: {
	cards: TServiceCardPrintItem[];
	baseUrl: string;
	logo?: TServiceCardPrintLogo | null;
}): Promise<Uint8Array> {
	const pdf = await PDFDocument.create();
	pdf.setCreator(PDF_CREATOR);
	pdf.setTitle(`Comandas ${cards[0]?.codigo ?? ""}–${cards[cards.length - 1]?.codigo ?? ""}`);

	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
	const regular = await pdf.embedFont(StandardFonts.Helvetica);
	const black = rgb(0, 0, 0);
	const gray = rgb(0.35, 0.35, 0.35);

	const logoImage = logo ? await (logo.type === "png" ? pdf.embedPng(logo.bytes) : pdf.embedJpg(logo.bytes)) : null;

	for (const card of cards) {
		// Nivel M: legivel com o desgaste de um cartao manuseado o dia todo, sem inflar o QR.
		const qr = QRCode.create(getServiceCardUrl(card.tokenPublico, baseUrl), { errorCorrectionLevel: "M" });
		const layout = layoutServiceCardFront({
			qrModuleCount: qr.modules.size,
			numberWidthAt1pt: bold.widthOfTextAtSize(card.codigo, 1),
			logo: logoImage ? { width: logoImage.width, height: logoImage.height } : null,
		});

		const page = pdf.addPage([layout.page.width, layout.page.height]);
		page.setBleedBox(layout.bleedBox.x, layout.bleedBox.y, layout.bleedBox.width, layout.bleedBox.height);
		page.setTrimBox(layout.trimBox.x, layout.trimBox.y, layout.trimBox.width, layout.trimBox.height);

		if (logoImage && layout.logo) page.drawImage(logoImage, layout.logo);

		page.drawText(LABEL_TEXT, { x: layout.label.x, y: layout.label.y, size: layout.label.size, font: bold, color: gray });
		page.drawText(card.codigo, { x: layout.number.x, y: layout.number.y, size: layout.number.size, font: bold, color: black });
		INSTRUCTION_LINES.forEach((line, index) => {
			page.drawText(line, {
				x: layout.instruction.x,
				y: layout.instruction.y - index * layout.instruction.lineHeight,
				size: layout.instruction.size,
				font: regular,
				color: gray,
			});
		});

		// QR vetorial: o path SVG tem y para baixo, com origem no canto superior esquerdo.
		const path = qrModulesToSvgPath(qr.modules.size, (row, col) => !!qr.modules.get(row, col));
		page.drawSvgPath(path, { x: layout.qr.x, y: layout.qr.y + layout.qr.height, scale: layout.qr.moduleSize, color: black, borderWidth: 0 });
	}

	return pdf.save();
}

/** CSV `codigo;url` com BOM: abre direto no Excel em pt-BR. */
export function buildServiceCardsCsv({ cards, baseUrl }: { cards: TServiceCardPrintItem[]; baseUrl: string }): string {
	const lines = ["codigo;url", ...cards.map((card) => `${card.codigo};${getServiceCardUrl(card.tokenPublico, baseUrl)}`)];
	return `﻿${lines.join("\r\n")}\r\n`;
}

export function serviceCardsFileBaseName(cards: TServiceCardPrintItem[]): string {
	if (cards.length === 0) return "comandas";
	const first = cards[0].codigo;
	const last = cards[cards.length - 1].codigo;
	return first === last ? `comanda-${first}` : `comandas-${first}-${last}`;
}

/** Identifica PNG/JPEG pelos bytes (o proxy so devolve esses dois). */
export function detectServiceCardLogoType(bytes: Uint8Array): TServiceCardPrintLogo["type"] | null {
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
	return null;
}

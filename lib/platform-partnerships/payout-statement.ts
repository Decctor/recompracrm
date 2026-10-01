import { formatCentavos, formatCommissionPercent, formatPartnerDate } from "@/lib/platform-partnerships/earnings";
import type { TPartnerPayoutDetail } from "@/lib/platform-partnerships/partner-panel";
import { type PDFFont, PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAYOUT_STATUS_LABEL: Record<TPartnerPayoutDetail["status"], string> = {
	RASCUNHO: "Em apuração",
	APROVADO: "Aprovado",
	PAGO: "Pago",
	CANCELADO: "Cancelado",
};

const BLUE = rgb(36 / 255, 84 / 255, 156 / 255);
const INK = rgb(23 / 255, 23 / 255, 23 / 255);
const MUTED = rgb(115 / 255, 115 / 255, 115 / 255);
const BORDER = rgb(229 / 255, 229 / 255, 229 / 255);

function fitText(text: string, font: PDFFont, size: number, maxWidth: number) {
	if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
	let fitted = text;
	while (fitted.length > 1 && font.widthOfTextAtSize(`${fitted}…`, size) > maxWidth) fitted = fitted.slice(0, -1);
	return `${fitted}…`;
}

/** Demonstrativo em PDF de um PIX: quem recebeu, competência, datas e as comissões que somam o valor. */
export async function buildPayoutStatementPdf(payout: TPartnerPayoutDetail) {
	const pdf = await PDFDocument.create();
	pdf.setTitle(`Demonstrativo de pagamento - ${formatPartnerDate(payout.dataPagamento ?? payout.dataPrevista)}`);
	pdf.setProducer("RecompraCRM");
	const regular = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

	const width = 595.28;
	const height = 841.89;
	const margin = 48;
	let page = pdf.addPage([width, height]);
	let y = height - margin;

	page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: BLUE });
	page.drawText("PROGRAMA DE PARCERIAS · RECOMPRACRM", { x: margin, y, size: 9, font: bold, color: BLUE });
	y -= 28;
	page.drawText("Demonstrativo de pagamento", { x: margin, y, size: 22, font: bold, color: INK });
	y -= 34;
	page.drawText(formatCentavos(payout.valorTotalCentavos), { x: margin, y, size: 28, font: bold, color: INK });
	const statusLabel = PAYOUT_STATUS_LABEL[payout.status];
	page.drawText(statusLabel, { x: width - margin - bold.widthOfTextAtSize(statusLabel, 11), y: y + 6, size: 11, font: bold, color: BLUE });
	y -= 32;

	const info: [string, string][] = [
		["Parceiro", payout.parceiroNome ?? "—"],
		["Competência", `${formatPartnerDate(payout.competenciaInicio)} a ${formatPartnerDate(payout.competenciaFim)}`],
		["Chave PIX", payout.chavePixMascarada ?? "—"],
		["Previsto para", formatPartnerDate(payout.dataPrevista)],
		["Pago em", formatPartnerDate(payout.dataPagamento)],
	];
	for (const [label, value] of info) {
		page.drawLine({ start: { x: margin, y: y + 14 }, end: { x: width - margin, y: y + 14 }, thickness: 0.6, color: BORDER });
		page.drawText(label, { x: margin, y, size: 10, font: regular, color: MUTED });
		page.drawText(value, { x: width - margin - bold.widthOfTextAtSize(value, 10), y, size: 10, font: bold, color: INK });
		y -= 24;
	}
	y -= 16;

	page.drawText("O QUE COMPÕE ESTE PIX", { x: margin, y, size: 9, font: bold, color: MUTED });
	y -= 20;
	const columns = [
		{ label: "Loja", x: margin, width: 190, align: "left" as const },
		{ label: "Mensalidade", x: margin + 196, width: 80, align: "left" as const },
		{ label: "Fatura", x: margin + 280, width: 80, align: "right" as const },
		{ label: "%", x: margin + 364, width: 44, align: "right" as const },
		{ label: "Comissão", x: margin + 412, width: width - margin * 2 - 412, align: "right" as const },
	];
	const drawRow = (cells: string[], font: PDFFont, color = INK) => {
		cells.forEach((cell, index) => {
			const column = columns[index];
			const text = fitText(cell, font, 10, column.width);
			const x = column.align === "right" ? column.x + column.width - font.widthOfTextAtSize(text, 10) : column.x;
			page.drawText(text, { x, y, size: 10, font, color });
		});
	};
	drawRow(
		columns.map((column) => column.label),
		bold,
		MUTED,
	);
	y -= 8;
	for (const commission of payout.comissoes) {
		if (y < margin + 60) {
			page = pdf.addPage([width, height]);
			y = height - margin;
		}
		page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.6, color: BORDER });
		y -= 16;
		drawRow(
			[
				commission.lojaNome,
				commission.ajuste ? "Ajuste" : `${commission.numeroInvoiceAssinatura}ª`,
				formatCentavos(commission.valorInvoiceBrutoCentavos),
				formatCommissionPercent(commission.percentualComissaoBps),
				formatCentavos(commission.valorComissaoCentavos),
			],
			regular,
		);
		y -= 8;
	}
	page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: INK });
	y -= 18;
	page.drawText("Total", { x: margin, y, size: 11, font: bold, color: INK });
	const total = formatCentavos(payout.valorTotalCentavos);
	page.drawText(total, { x: width - margin - bold.widthOfTextAtSize(total, 11), y, size: 11, font: bold, color: INK });

	const footer = "Comissão calculada sobre o valor do plano, sem consultoria. Documento gerado pelo painel do parceiro.";
	page.drawText(footer, { x: margin, y: margin - 16, size: 8, font: regular, color: MUTED });

	return pdf.save();
}

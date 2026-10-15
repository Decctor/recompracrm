// ============================================================================
// Arquivo para grafica das comandas fixas — geometria pura (sem pdf-lib).
// Cartao CR80 (85,6 x 54 mm) com 3 mm de sangria em cada lado e 3 mm de margem
// de seguranca para dentro do corte. Coordenadas devolvidas em pontos PDF
// (origem no canto inferior esquerdo da PAGINA, sangria inclusa).
// ============================================================================

export const PT_PER_MM = 72 / 25.4;

export const SERVICE_CARD_TRIM_MM = { width: 85.6, height: 54 };
export const SERVICE_CARD_BLEED_MM = 3;
export const SERVICE_CARD_SAFE_MM = 3;
/** Lado do bloco do QR incluindo a zona de silencio. */
const QR_BLOCK_MM = 34;
export const QR_QUIET_ZONE_MODULES = 4;
const COLUMN_GAP_MM = 3;
const LOGO_MAX_HEIGHT_MM = 11;
const NUMBER_MAX_SIZE_PT = 40;
const NUMBER_BOX_TOP_MM = 21; // abaixo do logo e do rotulo "COMANDA"

export type TPdfRect = { x: number; y: number; width: number; height: number };

export type TServiceCardFrontLayout = {
	page: { width: number; height: number };
	trimBox: TPdfRect;
	bleedBox: TPdfRect;
	/** Area escura do QR (sem a zona de silencio) e tamanho do modulo. */
	qr: TPdfRect & { moduleSize: number };
	logo: TPdfRect | null;
	label: { x: number; y: number; size: number };
	number: { x: number; y: number; size: number };
	instruction: { x: number; y: number; size: number; lineHeight: number };
};

type TLayoutInput = {
	/** Modulos por lado do QR (sem zona de silencio). */
	qrModuleCount: number;
	/** Largura do numero, em pontos, no tamanho de 1pt — o chamador mede com a fonte real. */
	numberWidthAt1pt: number;
	logo?: { width: number; height: number } | null;
};

const mm = (value: number) => value * PT_PER_MM;

export function layoutServiceCardFront({ qrModuleCount, numberWidthAt1pt, logo }: TLayoutInput): TServiceCardFrontLayout {
	const bleed = SERVICE_CARD_BLEED_MM;
	const pageWidthMm = SERVICE_CARD_TRIM_MM.width + bleed * 2;
	const pageHeightMm = SERVICE_CARD_TRIM_MM.height + bleed * 2;
	const page = { width: mm(pageWidthMm), height: mm(pageHeightMm) };

	// Converte um retangulo descrito a partir do canto SUPERIOR esquerdo do corte (mm) para pontos PDF.
	const fromTrim = (x: number, y: number, width: number, height: number): TPdfRect => ({
		x: mm(bleed + x),
		y: page.height - mm(bleed + y + height),
		width: mm(width),
		height: mm(height),
	});

	const safe = SERVICE_CARD_SAFE_MM;
	const innerRight = SERVICE_CARD_TRIM_MM.width - safe;
	const innerBottom = SERVICE_CARD_TRIM_MM.height - safe;

	// QR a direita, centralizado na vertical. A zona de silencio faz parte do bloco.
	const qrBlockX = innerRight - QR_BLOCK_MM;
	const qrBlockY = (SERVICE_CARD_TRIM_MM.height - QR_BLOCK_MM) / 2;
	const totalModules = qrModuleCount + QR_QUIET_ZONE_MODULES * 2;
	const moduleMm = QR_BLOCK_MM / totalModules;
	const quietMm = moduleMm * QR_QUIET_ZONE_MODULES;
	const qrRect = fromTrim(qrBlockX + quietMm, qrBlockY + quietMm, moduleMm * qrModuleCount, moduleMm * qrModuleCount);

	// Coluna de texto a esquerda.
	const columnX = safe;
	const columnWidth = qrBlockX - COLUMN_GAP_MM - columnX;

	let logoRect: TPdfRect | null = null;
	if (logo && logo.width > 0 && logo.height > 0) {
		const scale = Math.min(columnWidth / logo.width, LOGO_MAX_HEIGHT_MM / logo.height);
		logoRect = fromTrim(columnX, safe, logo.width * scale, logo.height * scale);
	}

	const labelSize = 7;
	const label = { x: mm(bleed + columnX), y: page.height - mm(bleed + NUMBER_BOX_TOP_MM - 1), size: labelSize };

	// Numero: o maior tamanho que cabe na coluna, limitado pelo teto.
	const numberSize = numberWidthAt1pt > 0 ? Math.min(NUMBER_MAX_SIZE_PT, mm(columnWidth) / numberWidthAt1pt) : NUMBER_MAX_SIZE_PT;
	// Linha de base logo abaixo do rotulo, deixando a altura das maiusculas (~0,72em) livre.
	const number = { x: mm(bleed + columnX), y: label.y - mm(1.5) - numberSize * 0.72, size: numberSize };

	const instructionSize = 6;
	const lineHeight = instructionSize * 1.25;
	// Duas linhas acima da margem inferior de seguranca.
	const instruction = { x: mm(bleed + columnX), y: page.height - mm(bleed + innerBottom) + lineHeight, size: instructionSize, lineHeight };

	return {
		page,
		trimBox: { x: mm(bleed), y: mm(bleed), width: mm(SERVICE_CARD_TRIM_MM.width), height: mm(SERVICE_CARD_TRIM_MM.height) },
		bleedBox: { x: 0, y: 0, width: page.width, height: page.height },
		qr: { ...qrRect, moduleSize: mm(moduleMm) },
		logo: logoRect,
		label,
		number,
		instruction,
	};
}

/**
 * Contorno dos modulos escuros como um unico path SVG (unidade = 1 modulo, y para baixo).
 * Corridas horizontais viram um retangulo so: menos operacoes e nenhuma emenda entre vizinhos.
 */
export function qrModulesToSvgPath(size: number, isDark: (row: number, col: number) => boolean): string {
	const parts: string[] = [];
	for (let row = 0; row < size; row++) {
		let col = 0;
		while (col < size) {
			if (!isDark(row, col)) {
				col++;
				continue;
			}
			const start = col;
			while (col < size && isDark(row, col)) col++;
			parts.push(`M${start} ${row}h${col - start}v1h${start - col}z`);
		}
	}
	return parts.join("");
}

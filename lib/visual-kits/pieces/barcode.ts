import { normalizeGtin } from "@/lib/products/gtin";
import type { TVisualKitConfig } from "@/schemas/visual-kits";
import type { TVisualKitPieceItem } from "../types";
import { CODE128_QUIET_MODULES, code128Bars, type TCode128Bars } from "./code128";
import { normalizeEanCode } from "./ean";

type TLabelBarcode = { kind: "EAN"; code: string } | { kind: "CODE128"; bars: TCode128Bars };

export function barcodeFor(
	item: Pick<TVisualKitPieceItem, "codigo" | "codigoBarras">,
	configuracao: Pick<TVisualKitConfig, "mostrarCodigoBarras">,
	maxCode128Modules: number,
): TLabelBarcode | null {
	if (!configuracao.mostrarCodigoBarras || !item.codigoBarras) return null;
	const code = normalizeEanCode(normalizeGtin(item.codigoBarras));
	if (code) return { kind: "EAN", code };
	const bars = code128Bars(item.codigoBarras);
	// Não cortar barras nem diminuir X: códigos longos demais ficam sem desenho nesta etiqueta.
	return bars && bars.modules.length + 2 * CODE128_QUIET_MODULES <= maxCode128Modules ? { kind: "CODE128", bars } : null;
}

import { authenticateExternalRequest, requireExternalScope } from "@/lib/access/authentication";
import { paymentTerminalApiHandler } from "@/lib/payment-attempts";
import { toTerminalCatalogProduct } from "@/lib/payment-attempts/terminal-catalog";
import { lookupPOSProductsByBarcode } from "@/lib/pos/barcode-lookup";
import { BARCODE_SCAN_MAX_LENGTH } from "@/lib/pos/barcode-scan-detector";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Leitura de código de barras no terminal (câmera ou leitor pareado): a mesma resolução do PDV web
// (`lookupPOSProductsByBarcode` — GTIN da variante, GTIN do produto, SKU da variante, SKU do produto,
// com UPC-A/EAN-13 equivalentes), devolvida no formato do catálogo do terminal. Código duplicado no
// cadastro volta todos os produtos para o operador escolher; nenhum match volta lista vazia.

const GetTerminalProductByBarcodeInputSchema = z.object({
	code: z
		.string({ required_error: "Código não informado.", invalid_type_error: "Tipo inválido para código." })
		.trim()
		.min(1, "Código não informado.")
		.max(BARCODE_SCAN_MAX_LENGTH, "Código muito longo."),
	canal: z
		.enum(["POS", "COMANDA"], { invalid_type_error: "Canal inválido." })
		.optional()
		.nullable()
		.transform((value) => value ?? "POS"),
});
export type TGetTerminalProductByBarcodeInput = z.infer<typeof GetTerminalProductByBarcodeInputSchema>;

async function getTerminalProductByBarcode({ input, organizationId }: { input: TGetTerminalProductByBarcodeInput; organizationId: string }) {
	const matches = await lookupPOSProductsByBarcode({ orgId: organizationId, code: input.code, canal: input.canal });
	return {
		data: {
			code: input.code,
			matches: matches.map((match) => ({ product: toTerminalCatalogProduct(match.product), variantId: match.variantId, matchedBy: match.matchedBy })),
		},
		message: matches.length === 0 ? "Nenhum produto com esse código." : "Produto encontrado.",
	};
}
export type TGetTerminalProductByBarcodeOutput = Awaited<ReturnType<typeof getTerminalProductByBarcode>>;

async function getTerminalProductByBarcodeRoute(request: NextRequest) {
	const actor = await authenticateExternalRequest(request);
	requireExternalScope(actor, "payment-terminal:catalog:read");
	const { searchParams } = request.nextUrl;
	const input = GetTerminalProductByBarcodeInputSchema.parse({ code: searchParams.get("code"), canal: searchParams.get("canal") });
	return NextResponse.json(await getTerminalProductByBarcode({ input, organizationId: actor.organizationId }));
}

export const GET = paymentTerminalApiHandler({ GET: getTerminalProductByBarcodeRoute });

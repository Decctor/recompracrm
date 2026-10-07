import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { lookupPOSProductsByBarcode } from "@/lib/pos/barcode-lookup";
import { BARCODE_SCAN_MAX_LENGTH } from "@/lib/pos/barcode-scan-detector";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Leitura de código de barras no PDV: resolve o código lido para o item do catálogo, já no shape
// da grade (variantes, adicionais e preço do canal), para o cliente adicionar ao carrinho sem
// passar pela busca. Mais de um match (código duplicado no cadastro) volta a lista inteira para
// o operador escolher; nenhum match volta vazio — a decisão de UX é do cliente.

const GetPOSProductByBarcodeInputSchema = z.object({
	code: z
		.string({ required_error: "Código não informado.", invalid_type_error: "Tipo inválido para código." })
		.trim()
		.min(1, "Código não informado.")
		.max(BARCODE_SCAN_MAX_LENGTH, "Código muito longo."),
	channel: z
		.string({ invalid_type_error: "Tipo inválido para canal." })
		.optional()
		.nullable()
		.transform((value) => (value === "COMANDA" ? ("COMANDA" as const) : ("POS" as const))),
});
export type TGetPOSProductByBarcodeInput = z.infer<typeof GetPOSProductByBarcodeInputSchema>;

async function getPOSProductByBarcode({ input, session }: { input: TGetPOSProductByBarcodeInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const matches = await lookupPOSProductsByBarcode({ orgId, code: input.code, canal: input.channel });
	return {
		data: { code: input.code, matches },
		message: matches.length === 0 ? "Nenhum produto com esse código." : "Produto encontrado.",
	};
}
export type TGetPOSProductByBarcodeOutput = Awaited<ReturnType<typeof getPOSProductByBarcode>>;

async function getPOSProductByBarcodeRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = GetPOSProductByBarcodeInputSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
	const result = await getPOSProductByBarcode({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getPOSProductByBarcodeRoute });

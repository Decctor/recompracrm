import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { sniffMimeType } from "@/lib/files/inspect";
import { fetchPublicUrl } from "@/lib/http/fetch-public-url";
import { db } from "@/services/drizzle";
import { products, productVariants } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

const GetVisualKitImageInputSchema = z.object({
	url: z
		.string({
			required_error: "URL da imagem não informada.",
			invalid_type_error: "Tipo inválido para URL da imagem.",
		})
		.url({ message: "URL da imagem inválida." }),
});
export type TGetVisualKitImageInput = z.infer<typeof GetVisualKitImageInputSchema>;

/**
 * Proxy same-origin das imagens das peças. O navegador gera os arquivos desenhando as peças num
 * canvas, e uma imagem de outro domínio sem CORS (CDN da Nuvem Shop, por exemplo) "suja" o canvas
 * e bloqueia a exportação. Para não virar um proxy aberto, só serve URLs cadastradas como foto de
 * produto/variante ou logo DESTA organização, e o download passa pelas barreiras anti-SSRF de
 * `fetchPublicUrl` (https, IP público, redirects revalidados).
 */
async function getVisualKitImage({ input, session }: { input: TGetVisualKitImageInput; session: TAuthUserSession }) {
	const organization = session.membership?.organizacao;
	if (!organization) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const isOrganizationImage =
		organization.logoUrl === input.url ||
		!!(await db.query.products.findFirst({
			where: and(eq(products.organizacaoId, organization.id), eq(products.imagemCapaUrl, input.url)),
			columns: { id: true },
		})) ||
		!!(await db.query.productVariants.findFirst({
			where: and(eq(productVariants.organizacaoId, organization.id), eq(productVariants.imagemCapaUrl, input.url)),
			columns: { id: true },
		}));
	if (!isOrganizationImage) throw new createHttpError.NotFound("Imagem não encontrada.");

	const { buffer } = await fetchPublicUrl(input.url, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 15_000 });
	// Tipo pelos bytes, nunca pelo Content-Type da origem.
	const mimeType = sniffMimeType(buffer.subarray(0, 16));
	if (!mimeType || !ALLOWED_IMAGE_TYPES.has(mimeType)) throw new createHttpError.UnprocessableEntity("A imagem não é PNG nem JPEG.");
	return { buffer, mimeType };
}

async function getVisualKitImageRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetVisualKitImageInputSchema.parse({ url: request.nextUrl.searchParams.get("url") ?? undefined });
	const { buffer, mimeType } = await getVisualKitImage({ input, session });
	return new NextResponse(new Uint8Array(buffer), {
		status: 200,
		headers: { "Content-Type": mimeType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
	});
}

export const GET = appApiHandler({ GET: getVisualKitImageRoute });

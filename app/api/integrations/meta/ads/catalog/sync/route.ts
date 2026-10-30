import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canManageIntegrations } from "@/lib/integrations/mask";
import { syncMetaAdsCatalog } from "@/lib/integrations/meta/ads/catalog-sync";
import { resolveMetaAdsIntegration } from "@/lib/integrations/meta/ads/config";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const SyncMetaAdsCatalogInputSchema = z.object({
	integrationId: z.string({ required_error: "Integração não informada.", invalid_type_error: "Tipo inválido para o ID da integração." }),
});
export type TSyncMetaAdsCatalogInput = z.infer<typeof SyncMetaAdsCatalogInputSchema>;

/** Sincronização manual: sempre completa, para o botão refletir também os anúncios removidos. */
async function syncMetaAdsCatalogNow({ input, organizacaoId }: { input: TSyncMetaAdsCatalogInput; organizacaoId: string }) {
	// Garante que a integração é desta organização antes de qualquer leitura na Meta.
	const { integrationId } = await resolveMetaAdsIntegration({ organizacaoId, integrationId: input.integrationId });
	const result = await syncMetaAdsCatalog({ integrationId, mode: "full" });
	return { data: result, message: `Catálogo sincronizado: ${result.read} anúncio(s) lido(s).` };
}
export type TSyncMetaAdsCatalogOutput = Awaited<ReturnType<typeof syncMetaAdsCatalogNow>>;

async function syncMetaAdsCatalogRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para sincronizar o catálogo.");
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.BadRequest("Você precisa estar vinculado a uma organização.");
	if (!canManageIntegrations(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para gerenciar integrações.");

	const input = SyncMetaAdsCatalogInputSchema.parse(await request.json());
	const result = await syncMetaAdsCatalogNow({ input, organizacaoId });
	return NextResponse.json(result);
}

export const maxDuration = 300;

export const POST = appApiHandler({ POST: syncMetaAdsCatalogRoute });

import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { requireIntegrationManageSession } from "@/lib/integrations/ifood/sync/guards";
import { adoptRemotePrice, reconcileMerchantCatalog } from "@/lib/integrations/ifood/sync/reconcile";
import { pushProductToLinkedMerchants } from "@/lib/integrations/ifood/sync/push";
import { db } from "@/services/drizzle";
import { catalogLinks } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ReconcileInputSchema = z.object({
	merchantId: z.string({ required_error: "ID da loja não informado.", invalid_type_error: "Tipo não válido para ID da loja." }).min(1),
});
export type TReconcileInput = z.infer<typeof ReconcileInputSchema>;

const ResolveDivergenceInputSchema = z.object({
	linkId: z.string({ required_error: "ID do vínculo não informado.", invalid_type_error: "Tipo não válido para ID do vínculo." }).min(1),
	// APLICAR_NOSSO empurra o estado interno; ADOTAR_IFOOD grava o preço remoto como override do canal.
	acao: z.enum(["APLICAR_NOSSO", "ADOTAR_IFOOD"], { required_error: "Ação não informada." }),
});
export type TResolveDivergenceInput = z.infer<typeof ResolveDivergenceInputSchema>;

async function reconcile({ orgId, input }: { orgId: string; input: TReconcileInput }) {
	const resultado = await reconcileMerchantCatalog({ orgId, merchantId: input.merchantId });
	return { data: { resultado }, message: `Reconciliação concluída: ${resultado.divergentes} divergente(s) de ${resultado.verificados} vínculo(s).` };
}
export type TReconcileOutput = Awaited<ReturnType<typeof reconcile>>;

async function resolveDivergence({ orgId, input }: { orgId: string; input: TResolveDivergenceInput }) {
	const link = await db.query.catalogLinks.findFirst({ where: and(eq(catalogLinks.id, input.linkId), eq(catalogLinks.organizacaoId, orgId)) });
	if (!link) throw new createHttpError.NotFound("Vínculo não encontrado.");

	if (input.acao === "ADOTAR_IFOOD") {
		const { precoAdotado } = await adoptRemotePrice({ orgId, linkId: input.linkId });
		return { data: { precoAdotado }, message: "Preço do iFood adotado como preço do canal." };
	}

	if (!link.produtoId) throw new createHttpError.BadRequest("Vínculo sem produto interno associado.");
	const resultado = await pushProductToLinkedMerchants({ orgId, produtoId: link.produtoId });
	return { data: { precoAdotado: null, resultado }, message: "Estado interno reenviado ao iFood." };
}
export type TResolveDivergenceOutput = Awaited<ReturnType<typeof resolveDivergence>>;

async function reconcileRoute(request: NextRequest) {
	const session = requireIntegrationManageSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = ReconcileInputSchema.parse(await request.json());
	const result = await reconcile({ orgId, input });
	return NextResponse.json(result);
}

async function resolveDivergenceRoute(request: NextRequest) {
	const session = requireIntegrationManageSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = ResolveDivergenceInputSchema.parse(await request.json());
	const result = await resolveDivergence({ orgId, input });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: reconcileRoute });
export const PATCH = appApiHandler({ PATCH: resolveDivergenceRoute });

import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { requireIntegrationManageSession } from "@/lib/integrations/ifood/sync/guards";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { publishProductToIfood, resolvePublishNodes } from "@/lib/integrations/ifood/sync/publish";
import { ensureIfoodSalesChannel } from "@/lib/products/sales-channels-store";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PublishProductInputSchema = z.object({
	merchantId: z.string({ required_error: "ID da loja não informado.", invalid_type_error: "Tipo não válido para ID da loja." }).min(1),
	categoriaId: z.string({ required_error: "Categoria não informada.", invalid_type_error: "Tipo não válido para categoria." }).min(1),
	produtoId: z.string({ required_error: "ID do produto não informado.", invalid_type_error: "Tipo não válido para ID do produto." }).min(1),
	/** Resolve os nós e devolve o que SERIA publicado, sem tocar no iFood. */
	simular: z.boolean({ invalid_type_error: "Tipo não válido para simulação." }).optional().default(false),
});
export type TPublishProductInput = z.infer<typeof PublishProductInputSchema>;

async function publishProduct({ orgId, userId, input }: { orgId: string; userId: string; input: TPublishProductInput }) {
	const context = await resolveIfoodManagementContext({ organizacaoId: orgId, merchantId: input.merchantId });
	await ensureIfoodSalesChannel({ orgId, integracaoId: context.integrationId, merchantId: input.merchantId });

	if (input.simular) {
		const nodes = await resolvePublishNodes({ orgId, merchantId: input.merchantId, produtoId: input.produtoId });
		return { data: { simulacao: nodes, published: null }, message: `${nodes.length} item(ns) seriam publicados no iFood.` };
	}

	const result = await publishProductToIfood({
		client: context.client,
		orgId,
		merchantId: input.merchantId,
		categoriaId: input.categoriaId,
		produtoId: input.produtoId,
		autorId: userId,
	});
	return { data: { simulacao: null, ...result }, message: `${result.published.length} item(ns) publicados no iFood.` };
}
export type TPublishProductOutput = Awaited<ReturnType<typeof publishProduct>>;

async function publishProductRoute(request: NextRequest) {
	const session = requireIntegrationManageSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = PublishProductInputSchema.parse(await request.json());
	const result = await publishProduct({ orgId, userId: session.user.id, input });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: publishProductRoute });

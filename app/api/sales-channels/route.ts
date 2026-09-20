import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { ensureSalesChannels } from "@/lib/products/sales-channels-store";
import { SalesChannelCatalogModeEnum, SalesChannelTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { integrations, salesChannels } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const UpdateSalesChannelInputSchema = z.object({
	canal: SalesChannelTypeEnum,
	integracaoId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da integração.",
		})
		.optional()
		.nullable(),
	refExterno: z
		.string({
			invalid_type_error: "Tipo não válido para referência externa do canal.",
		})
		.optional()
		.nullable(),
	// Atualização parcial: o cliente manda só o que está mudando. Reenviar o estado inteiro fazia o
	// toggle de adicionais carimbar de volta um `catalogoModo` possivelmente velho — a vitrine da
	// loja reescreve esse campo por fora (PUT /api/sales-channels/showcase), então o eco revertia a
	// curadoria.
	catalogoModo: SalesChannelCatalogModeEnum.optional(),
	exigirAdicionaisMinimos: z.boolean({ invalid_type_error: "Tipo não válido para exigência de adicionais obrigatórios." }).optional(),
});
export type TUpdateSalesChannelInput = z.infer<typeof UpdateSalesChannelInputSchema>;

async function getSalesChannels({ orgId }: { orgId: string }) {
	const channels = await ensureSalesChannels({ orgId });

	return { data: { channels }, message: "Canais de venda carregados com sucesso." };
}
export type TGetSalesChannelsOutput = Awaited<ReturnType<typeof getSalesChannels>>;

async function updateSalesChannel({ input, orgId }: { input: TUpdateSalesChannelInput; orgId: string }) {
	// A FK só prova que a integração existe em ALGUMA organização — sem esta checagem, um canal
	// da org A poderia apontar para a integração da org B (e sumir junto no cascade dela).
	if (input.integracaoId) {
		const integration = await db.query.integrations.findFirst({
			where: and(eq(integrations.id, input.integracaoId), eq(integrations.organizacaoId, orgId)),
			columns: { id: true },
		});
		if (!integration) throw new createHttpError.BadRequest("A integração não pertence à organização.");
	}

	// Upsert pela identidade do canal: o toggle é idempotente, então dois cliques simultâneos
	// não podem virar violação de unicidade (unq_sales_channels_identity, NULLS NOT DISTINCT).
	// Só o que veio no input entra no UPDATE: campo ausente continua com o valor que já está no banco.
	const updates = {
		...(input.catalogoModo !== undefined ? { catalogoModo: input.catalogoModo } : {}),
		...(input.exigirAdicionaisMinimos !== undefined ? { exigirAdicionaisMinimos: input.exigirAdicionaisMinimos } : {}),
	};

	const [channel] = await db
		.insert(salesChannels)
		.values({ organizacaoId: orgId, canal: input.canal, integracaoId: input.integracaoId, refExterno: input.refExterno, ...updates })
		.onConflictDoUpdate({
			target: [salesChannels.organizacaoId, salesChannels.canal, salesChannels.integracaoId, salesChannels.refExterno],
			set: { ...updates, dataAtualizacao: new Date() },
		})
		.returning();

	return { data: { channel }, message: "Canal de venda atualizado com sucesso." };
}
export type TUpdateSalesChannelOutput = Awaited<ReturnType<typeof updateSalesChannel>>;

async function getSalesChannelsRoute() {
	// Só o módulo ERP: a lista de canais já chega a qualquer usuário ERP pelo GET de
	// /api/products/channel-settings, e o cadastro de produto (que não pede permissão de empresa)
	// precisa dela para montar a matriz de canais antes de o produto existir.
	const session = requireERPSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const result = await getSalesChannels({ orgId });
	return NextResponse.json(result);
}

async function updateSalesChannelRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	// A tela desabilita o toggle sem esta permissão; sem a checagem aqui a regra valia só no cliente.
	if (!session.membership!.permissoes.empresa.editar) {
		throw new createHttpError.Forbidden("Você não tem permissão para editar os canais de venda.");
	}
	const orgId = session.membership!.organizacao.id;

	const input = UpdateSalesChannelInputSchema.parse(await request.json());
	const result = await updateSalesChannel({ input, orgId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSalesChannelsRoute });
export const PUT = appApiHandler({ PUT: updateSalesChannelRoute });

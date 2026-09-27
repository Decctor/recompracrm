import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { requireIntegrationManageSession, requireIntegrationViewSession } from "@/lib/integrations/ifood/sync/guards";
import { resolveIfoodManagementContext } from "@/lib/integrations/ifood/context";
import { linkAddOnGroup } from "@/lib/integrations/ifood/sync/add-ons";
import { listCatalogLinks, unlinkCatalogLink, updateCatalogLinkPolicy, upsertCatalogLink } from "@/lib/integrations/ifood/sync/links";
import { ensureIfoodSalesChannel } from "@/lib/products/sales-channels-store";
import { CatalogLinkSyncPolicySchema } from "@/schemas/catalog-links";
import { CatalogLinkTypeEnum } from "@/schemas/enums";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetCatalogLinksInputSchema = z.object({
	merchantId: z.string({ invalid_type_error: "Tipo não válido para ID da loja." }).optional().nullable(),
	produtoIds: z
		.string({ invalid_type_error: "Tipo não válido para IDs de produto." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",").filter(Boolean) : undefined)),
});
export type TGetCatalogLinksInput = z.infer<typeof GetCatalogLinksInputSchema>;

const CreateCatalogLinkInputSchema = z.object({
	merchantId: z.string({ required_error: "ID da loja não informado.", invalid_type_error: "Tipo não válido para ID da loja." }).min(1),
	tipo: CatalogLinkTypeEnum,
	produtoId: z.string({ invalid_type_error: "Tipo não válido para ID do produto." }).optional().nullable(),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo não válido para ID da variante." }).optional().nullable(),
	produtoAddOnId: z.string({ invalid_type_error: "Tipo não válido para ID do grupo de adicionais." }).optional().nullable(),
	produtoAddOnOpcaoId: z.string({ invalid_type_error: "Tipo não válido para ID da opção de adicional." }).optional().nullable(),
	externoItemId: z.string({ invalid_type_error: "Tipo não válido para ID do item no iFood." }).optional().nullable(),
	externoProdutoId: z.string({ invalid_type_error: "Tipo não válido para ID do produto no iFood." }).optional().nullable(),
	externoCategoriaId: z.string({ invalid_type_error: "Tipo não válido para ID da categoria no iFood." }).optional().nullable(),
	externoOptionGroupId: z.string({ invalid_type_error: "Tipo não válido para ID do grupo de complementos no iFood." }).optional().nullable(),
	externoOptionId: z.string({ invalid_type_error: "Tipo não válido para ID da opção no iFood." }).optional().nullable(),
	sincronizar: CatalogLinkSyncPolicySchema.partial().optional(),
});
export type TCreateCatalogLinkInput = z.infer<typeof CreateCatalogLinkInputSchema>;

const UpdateCatalogLinkInputSchema = z.object({
	linkId: z.string({ required_error: "ID do vínculo não informado.", invalid_type_error: "Tipo não válido para ID do vínculo." }).min(1),
	sincronizar: CatalogLinkSyncPolicySchema.partial(),
});
export type TUpdateCatalogLinkInput = z.infer<typeof UpdateCatalogLinkInputSchema>;

const DeleteCatalogLinkInputSchema = z.object({
	linkId: z.string({ required_error: "ID do vínculo não informado.", invalid_type_error: "Tipo não válido para ID do vínculo." }).min(1),
});

async function getCatalogLinks({ orgId, input }: { orgId: string; input: TGetCatalogLinksInput }) {
	const links = await listCatalogLinks({ orgId, merchantId: input.merchantId, produtoIds: input.produtoIds });
	return { data: { links }, message: "Vínculos de catálogo carregados com sucesso." };
}
export type TGetCatalogLinksOutput = Awaited<ReturnType<typeof getCatalogLinks>>;

async function createCatalogLink({ orgId, userId, input }: { orgId: string; userId: string; input: TCreateCatalogLinkInput }) {
	// Valida a conexão e que o merchant pertence à organização (isolamento multi-tenant).
	const context = await resolveIfoodManagementContext({ organizacaoId: orgId, merchantId: input.merchantId });
	// O canal da loja passa a existir junto do primeiro vínculo: é contra ele que a matriz do
	// produto grava disponibilidade e preço para este merchant.
	await ensureIfoodSalesChannel({ orgId, integracaoId: context.integrationId, merchantId: input.merchantId });

	// Grupo de adicionais: além do vínculo, casa as opções internas com as do optionGroup remoto.
	if (input.tipo === "ADD_ON") {
		if (!input.produtoAddOnId || !input.externoOptionGroupId) throw new createHttpError.BadRequest("Informe o grupo interno e o grupo do iFood.");
		const result = await linkAddOnGroup({
			client: context.client,
			orgId,
			merchantId: input.merchantId,
			produtoAddOnId: input.produtoAddOnId,
			externoOptionGroupId: input.externoOptionGroupId,
			sincronizar: input.sincronizar,
			autorId: userId,
		});
		const createsMissing = input.sincronizar?.criarOpcoes ?? true;
		return {
			data: { link: result.link, opcoesCasadas: result.opcoesCasadas, opcoesInternas: result.opcoesInternas },
			message: `Grupo vinculado: ${result.opcoesCasadas} de ${result.opcoesInternas} opções casadas.${createsMissing ? " As demais entram no próximo envio." : ""}`,
		};
	}

	const link = await upsertCatalogLink({
		orgId,
		merchantId: input.merchantId,
		node: {
			tipo: input.tipo,
			produtoId: input.produtoId,
			produtoVarianteId: input.produtoVarianteId,
			produtoAddOnId: input.produtoAddOnId,
			produtoAddOnOpcaoId: input.produtoAddOnOpcaoId,
		},
		externalRefs: {
			externoItemId: input.externoItemId ?? null,
			externoProdutoId: input.externoProdutoId ?? null,
			externoCategoriaId: input.externoCategoriaId ?? null,
			externoOptionGroupId: input.externoOptionGroupId ?? null,
			externoOptionId: input.externoOptionId ?? null,
		},
		sincronizar: input.sincronizar,
		autorId: userId,
	});
	return { data: { link, opcoesCasadas: null, opcoesInternas: null }, message: "Vínculo criado com sucesso." };
}
export type TCreateCatalogLinkOutput = Awaited<ReturnType<typeof createCatalogLink>>;

async function updateCatalogLink({ orgId, input }: { orgId: string; input: TUpdateCatalogLinkInput }) {
	const link = await updateCatalogLinkPolicy({ orgId, linkId: input.linkId, sincronizar: input.sincronizar });
	return { data: { link }, message: "Política de sincronização atualizada com sucesso." };
}
export type TUpdateCatalogLinkOutput = Awaited<ReturnType<typeof updateCatalogLink>>;

async function deleteCatalogLink({ orgId, linkId }: { orgId: string; linkId: string }) {
	const link = await unlinkCatalogLink({ orgId, linkId });
	return { data: { link }, message: "Vínculo desfeito. O item permanece no iFood." };
}
export type TDeleteCatalogLinkOutput = Awaited<ReturnType<typeof deleteCatalogLink>>;

async function getCatalogLinksRoute(request: NextRequest) {
	const session = requireIntegrationViewSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = GetCatalogLinksInputSchema.parse({
		merchantId: request.nextUrl.searchParams.get("merchantId"),
		produtoIds: request.nextUrl.searchParams.get("produtoIds"),
	});
	const result = await getCatalogLinks({ orgId, input });
	return NextResponse.json(result);
}

async function createCatalogLinkRoute(request: NextRequest) {
	const session = requireIntegrationManageSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = CreateCatalogLinkInputSchema.parse(await request.json());
	const result = await createCatalogLink({ orgId, userId: session.user.id, input });
	return NextResponse.json(result);
}

async function updateCatalogLinkRoute(request: NextRequest) {
	const session = requireIntegrationManageSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = UpdateCatalogLinkInputSchema.parse(await request.json());
	const result = await updateCatalogLink({ orgId, input });
	return NextResponse.json(result);
}

async function deleteCatalogLinkRoute(request: NextRequest) {
	const session = requireIntegrationManageSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = DeleteCatalogLinkInputSchema.parse({ linkId: request.nextUrl.searchParams.get("linkId") });
	const result = await deleteCatalogLink({ orgId, linkId: input.linkId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCatalogLinksRoute });
export const POST = appApiHandler({ POST: createCatalogLinkRoute });
export const PATCH = appApiHandler({ PATCH: updateCatalogLinkRoute });
export const DELETE = appApiHandler({ DELETE: deleteCatalogLinkRoute });

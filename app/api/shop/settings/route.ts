import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { TAuthUserSession } from "@/lib/authentication/types";
import { normalizeShopSettingsConfiguration } from "@/lib/shop/config";
import { ShopModeEnum } from "@/schemas/enums";
import { DEFAULT_SHOP_SETTINGS_CONFIGURATION, ShopSettingsConfigurationSchema } from "@/schemas/shop";
import { db } from "@/services/drizzle";
import { products, shopSettings } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const UpdateShopSettingsInputSchema = z.object({
	ativo: z.boolean({
		required_error: "Status da loja digital não informado.",
		invalid_type_error: "Tipo não válido para status da loja digital.",
	}),
	modo: ShopModeEnum,
	configuracoes: ShopSettingsConfigurationSchema,
});
export type TUpdateShopSettingsInput = z.infer<typeof UpdateShopSettingsInputSchema>;

function getSessionWithOrg(session: Awaited<ReturnType<typeof getCurrentSessionUncached>>) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

async function validateShopProductIds({ orgId, productIds }: { orgId: string; productIds: string[] }) {
	const uniqueIds = [...new Set(productIds.filter(Boolean))];
	if (uniqueIds.length === 0) return;

	const matched = await db
		.select({ id: products.id })
		.from(products)
		.where(and(eq(products.organizacaoId, orgId), inArray(products.id, uniqueIds)));
	const matchedIds = new Set(matched.map((item) => item.id));
	const invalidIds = uniqueIds.filter((id) => !matchedIds.has(id));
	if (invalidIds.length > 0) {
		throw new createHttpError.BadRequest("Um ou mais produtos selecionados não pertencem à organização.");
	}
}

async function getShopSettingsService({ session }: { session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const settings = await db.query.shopSettings.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, orgId),
	});
	if (!settings) {
		return {
			data: null,
			message: "Configurações da loja digital não encontradas.",
		};
	}

	const configuracoes = normalizeShopSettingsConfiguration(settings.configuracoes);
	const productIds = configuracoes.produtos.produtoIds;

	const settingSelectedProducts =
		productIds.length > 0
			? await db.query.products.findMany({
					where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, orgId), inArray(fields.id, productIds)),
					columns: {
						id: true,
						nome: true,
						imagemCapaUrl: true,
					},
				})
			: [];
	return {
		data: {
			...settings,
			produtos: settingSelectedProducts,
			configuracoes,
		},
		message: "Configurações da loja digital carregadas com sucesso.",
	};
}

async function getShopSettingsRoute() {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	if (!orgId) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const result = await getShopSettingsService({ session });

	return NextResponse.json(result);
}
export type TGetShopSettingsOutput = Awaited<ReturnType<typeof getShopSettingsRoute>> extends NextResponse<infer T> ? T : never;

async function createShopSettingsService({ session }: { session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você não está autenticado.");

	// Uma organização tem no máximo uma loja digital. A checagem prévia devolve uma mensagem clara;
	// o `onConflictDoNothing` (unique em organizacao_id) cobre a corrida entre duas requisições.
	const existing = await db.query.shopSettings.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, orgId),
		columns: { id: true },
	});
	if (existing) throw new createHttpError.Conflict("A organização já possui configurações da loja digital.");

	const [settings] = await db
		.insert(shopSettings)
		.values({
			organizacaoId: orgId,
			ativo: false,
			modo: "CARDAPIO",
			configuracoes: DEFAULT_SHOP_SETTINGS_CONFIGURATION,
			dataAtualizacao: new Date(),
		})
		.onConflictDoNothing({ target: shopSettings.organizacaoId })
		.returning();
	if (!settings) throw new createHttpError.Conflict("A organização já possui configurações da loja digital.");

	return {
		data: { settings },
		message: "Configurações da loja digital criadas com sucesso.",
	};
}

async function createShopSettingsRoute() {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const result = await createShopSettingsService({ session });
	return NextResponse.json(result);
}
export type TCreateShopSettingsOutput = Awaited<ReturnType<typeof createShopSettingsService>>;

async function updateShopSettingsRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;
	const body = await request.json();
	const input = UpdateShopSettingsInputSchema.parse(body);
	const configuracoes = normalizeShopSettingsConfiguration({
		...DEFAULT_SHOP_SETTINGS_CONFIGURATION,
		...input.configuracoes,
	});

	// Só os destaques são validados: `produtoIds` é resíduo legado que pode apontar para produtos
	// já excluídos, e travar o salvamento do painel por causa dele seria bloquear a edição de
	// horário por um campo que nada mais lê.
	await validateShopProductIds({ orgId, productIds: configuracoes.produtos.destaqueIds });

	const [settings] = await db
		.insert(shopSettings)
		.values({
			organizacaoId: orgId,
			ativo: input.ativo,
			modo: input.modo,
			configuracoes,
			dataAtualizacao: new Date(),
		})
		.onConflictDoUpdate({
			target: shopSettings.organizacaoId,
			set: {
				ativo: input.ativo,
				modo: input.modo,
				configuracoes,
				dataAtualizacao: new Date(),
			},
		})
		.returning();

	// Sem dual-write: a curadoria da loja é editada direto no canal SHOP (PUT /api/sales-channels/
	// showcase). Sincronizar aqui a partir do jsonb apagaria as linhas do canal a cada salvamento
	// do painel — o bloco `produtos.modo/produtoIds` é legado e só sobrevive como origem da
	// migração feita uma única vez por `ensureSalesChannels`.
	return NextResponse.json({
		data: {
			settings,
		},
		message: "Configurações da loja digital atualizadas com sucesso.",
	});
}
export type TUpdateShopSettingsOutput = Awaited<ReturnType<typeof updateShopSettingsRoute>> extends NextResponse<infer T> ? T : never;

export const GET = appApiHandler({ GET: getShopSettingsRoute });
export const POST = appApiHandler({ POST: createShopSettingsRoute });
export const PUT = appApiHandler({ PUT: updateShopSettingsRoute });

import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { schedulePushForProduct } from "@/lib/integrations/ifood/sync/push";
import { splitChannelSettingNodes, validateChannelSettingNodes } from "@/lib/products/sales-channels";
import { ensureSalesChannels } from "@/lib/products/sales-channels-store";
import { db } from "@/services/drizzle";
import { productChannelSettings, products, salesChannels } from "@/services/drizzle/schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetProductChannelSettingsInputSchema = z.object({
	produtoId: z
		.string({
			required_error: "ID do produto não informado.",
			invalid_type_error: "Tipo não válido para ID do produto.",
		})
		.min(1, { message: "ID do produto não informado." }),
});
export type TGetProductChannelSettingsInput = z.infer<typeof GetProductChannelSettingsInputSchema>;

const SettingInputSchema = z.object({
	canalVendaId: z
		.string({
			required_error: "ID do canal de venda não informado.",
			invalid_type_error: "Tipo não válido para ID do canal de venda.",
		})
		.min(1, { message: "ID do canal de venda não informado." }),
	produtoVarianteId: z
		.string({
			invalid_type_error: "Tipo não válido para ID da variante.",
		})
		.optional()
		.nullable(),
	// Os dois campos nulos = voltar a herdar (a linha esparsa é removida).
	disponivel: z
		.boolean({
			invalid_type_error: "Tipo não válido para disponibilidade no canal.",
		})
		.optional()
		.nullable(),
	precoVenda: z
		.number({
			invalid_type_error: "Tipo não válido para preço de venda no canal.",
		})
		.nonnegative({ message: "O preço de venda no canal não pode ser negativo." })
		.optional()
		.nullable(),
});
const UpdateProductChannelSettingsInputSchema = z.object({
	produtoId: z
		.string({
			required_error: "ID do produto não informado.",
			invalid_type_error: "Tipo não válido para ID do produto.",
		})
		.min(1, { message: "ID do produto não informado." }),
	settings: z.array(SettingInputSchema),
});
export type TUpdateProductChannelSettingsInput = z.infer<typeof UpdateProductChannelSettingsInputSchema>;

async function findProductInOrg({ orgId, produtoId }: { orgId: string; produtoId: string }) {
	return db.query.products.findFirst({
		where: and(eq(products.id, produtoId), eq(products.organizacaoId, orgId)),
		columns: { id: true },
		with: { variantes: { columns: { id: true } } },
	});
}

async function getProductChannelSettings({ orgId, produtoId }: { orgId: string; produtoId: string }) {
	// As três consultas são independentes: a de escopo só decide se a resposta é 404.
	const [product, channels, settings] = await Promise.all([
		db.query.products.findFirst({
			where: and(eq(products.id, produtoId), eq(products.organizacaoId, orgId)),
			columns: { id: true },
		}),
		ensureSalesChannels({ orgId }),
		db.query.productChannelSettings.findMany({
			where: and(eq(productChannelSettings.organizacaoId, orgId), eq(productChannelSettings.produtoId, produtoId)),
		}),
	]);
	if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

	return { data: { channels, settings }, message: "Configurações dos canais carregadas com sucesso." };
}
export type TGetProductChannelSettingsOutput = Awaited<ReturnType<typeof getProductChannelSettings>>;

async function updateProductChannelSettings({ orgId, input }: { orgId: string; input: TUpdateProductChannelSettingsInput }) {
	const channelIds = [...new Set(input.settings.map((setting) => setting.canalVendaId))];
	const [product, ownedChannels] = await Promise.all([
		findProductInOrg({ orgId, produtoId: input.produtoId }),
		channelIds.length
			? db
					.select({ id: salesChannels.id })
					.from(salesChannels)
					.where(and(eq(salesChannels.organizacaoId, orgId), inArray(salesChannels.id, channelIds)))
			: Promise.resolve([] as { id: string }[]),
	]);
	if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

	// As mesmas regras do POST /api/products, que grava a matriz junto com o produto novo.
	const validationError = validateChannelSettingNodes({
		settings: input.settings,
		ownedChannelIds: new Set(ownedChannels.map((channel) => channel.id)),
		variantIds: new Set(product.variantes.map((variant) => variant.id)),
	});
	if (validationError) throw new createHttpError.BadRequest(validationError);

	// Patch esparso: só os nós enviados mudam. Nó com os dois campos nulos volta a herdar (linha
	// removida); nós ausentes do payload ficam intactos, para que uma tela por canal não apague
	// os overrides dos outros canais do mesmo produto.
	const { upserts, clears } = splitChannelSettingNodes(input.settings);

	await db.transaction(async (tx) => {
		if (clears.length) {
			await tx
				.delete(productChannelSettings)
				.where(
					and(
						eq(productChannelSettings.organizacaoId, orgId),
						eq(productChannelSettings.produtoId, input.produtoId),
						or(
							...clears.map((setting) =>
								and(
									eq(productChannelSettings.canalVendaId, setting.canalVendaId),
									setting.produtoVarianteId
										? eq(productChannelSettings.produtoVarianteId, setting.produtoVarianteId)
										: isNull(productChannelSettings.produtoVarianteId),
								),
							),
						),
					),
				);
		}
		if (upserts.length) {
			await tx
				.insert(productChannelSettings)
				.values(
					upserts.map((setting) => ({
						organizacaoId: orgId,
						produtoId: input.produtoId,
						canalVendaId: setting.canalVendaId,
						produtoVarianteId: setting.produtoVarianteId ?? null,
						disponivel: setting.disponivel ?? null,
						precoVenda: setting.precoVenda ?? null,
					})),
				)
				.onConflictDoUpdate({
					target: [productChannelSettings.canalVendaId, productChannelSettings.produtoId, productChannelSettings.produtoVarianteId],
					set: {
						disponivel: sql`excluded.disponivel`,
						precoVenda: sql`excluded.preco_venda`,
						dataAtualizacao: new Date(),
					},
				});
		}
	});

	// Mudar um override do canal iFood É uma mudança de preço/disponibilidade lá — o push é
	// disparado aqui pelo mesmo motivo que no save do produto.
	schedulePushForProduct({ orgId, produtoId: input.produtoId });

	return { data: { updated: true }, message: "Configurações dos canais atualizadas com sucesso." };
}
export type TUpdateProductChannelSettingsOutput = Awaited<ReturnType<typeof updateProductChannelSettings>>;

async function getProductChannelSettingsRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = GetProductChannelSettingsInputSchema.parse({ produtoId: request.nextUrl.searchParams.get("produtoId") });
	const result = await getProductChannelSettings({ orgId, produtoId: input.produtoId });
	return NextResponse.json(result);
}

async function updateProductChannelSettingsRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = UpdateProductChannelSettingsInputSchema.parse(await request.json());
	const result = await updateProductChannelSettings({ orgId, input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getProductChannelSettingsRoute });
export const PUT = appApiHandler({ PUT: updateProductChannelSettingsRoute });

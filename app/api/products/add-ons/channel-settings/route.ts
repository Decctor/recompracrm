import { AddOnOptionChannelSettingInputSchema } from "@/schemas/product-add-on-channel-settings";
import { applyAddOnChannelSettings } from "@/lib/products/add-on-channel-settings";
import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { scheduleAddOnGroupPush } from "@/lib/integrations/ifood/sync/queue";
import { ensureSalesChannelsWithIntegrations } from "@/lib/integrations/ifood/sales-channels";
import { db } from "@/services/drizzle";
import { productAddOnOptionChannelSettings, productAddOns } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetAddOnChannelSettingsInputSchema = z.object({
	produtoAddOnId: z
		.string({
			required_error: "ID do grupo de adicionais não informado.",
			invalid_type_error: "Tipo não válido para ID do grupo de adicionais.",
		})
		.min(1, { message: "ID do grupo de adicionais não informado." }),
});
export type TGetAddOnChannelSettingsInput = z.infer<typeof GetAddOnChannelSettingsInputSchema>;

const UpdateAddOnChannelSettingsInputSchema = z.object({
	produtoAddOnId: z
		.string({
			required_error: "ID do grupo de adicionais não informado.",
			invalid_type_error: "Tipo não válido para ID do grupo de adicionais.",
		})
		.min(1, { message: "ID do grupo de adicionais não informado." }),
	settings: z.array(AddOnOptionChannelSettingInputSchema),
});
export type TUpdateAddOnChannelSettingsInput = z.infer<typeof UpdateAddOnChannelSettingsInputSchema>;

async function findAddOnInOrg({ orgId, produtoAddOnId }: { orgId: string; produtoAddOnId: string }) {
	return db.query.productAddOns.findFirst({
		where: and(eq(productAddOns.id, produtoAddOnId), eq(productAddOns.organizacaoId, orgId)),
		columns: { id: true },
		with: { opcoes: { where: (fields, { isNull: isNullOp }) => isNullOp(fields.dataExclusao), columns: { id: true } } },
	});
}

async function getAddOnChannelSettings({ orgId, input }: { orgId: string; input: TGetAddOnChannelSettingsInput }) {
	const [addOn, channels] = await Promise.all([
		findAddOnInOrg({ orgId, produtoAddOnId: input.produtoAddOnId }),
		ensureSalesChannelsWithIntegrations({ orgId }),
	]);
	if (!addOn) throw new createHttpError.NotFound("Grupo de adicionais não encontrado.");

	const optionIds = addOn.opcoes.map((opcao) => opcao.id);
	const settings = optionIds.length
		? await db.query.productAddOnOptionChannelSettings.findMany({
				where: and(eq(productAddOnOptionChannelSettings.organizacaoId, orgId), inArray(productAddOnOptionChannelSettings.produtoAddOnOpcaoId, optionIds)),
			})
		: [];

	return { data: { channels, settings }, message: "Configurações das opções por canal carregadas com sucesso." };
}
export type TGetAddOnChannelSettingsOutput = Awaited<ReturnType<typeof getAddOnChannelSettings>>;

async function updateAddOnChannelSettings({ orgId, input }: { orgId: string; input: TUpdateAddOnChannelSettingsInput }) {
	const result = await db.transaction((tx) => applyAddOnChannelSettings({ tx, orgId, ...input }));
	if (result.touchedIfood) await scheduleAddOnGroupPush({ orgId, produtoAddOnId: input.produtoAddOnId });
	return { data: { updated: true }, message: "Preços e disponibilidade das opções por canal atualizados com sucesso." };
}
export type TUpdateAddOnChannelSettingsOutput = Awaited<ReturnType<typeof updateAddOnChannelSettings>>;

async function getAddOnChannelSettingsRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = GetAddOnChannelSettingsInputSchema.parse({ produtoAddOnId: request.nextUrl.searchParams.get("produtoAddOnId") });
	const result = await getAddOnChannelSettings({ orgId, input });
	return NextResponse.json(result);
}

async function updateAddOnChannelSettingsRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const orgId = session.membership!.organizacao.id;

	const input = UpdateAddOnChannelSettingsInputSchema.parse(await request.json());
	const result = await updateAddOnChannelSettings({ orgId, input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getAddOnChannelSettingsRoute });
export const PUT = appApiHandler({ PUT: updateAddOnChannelSettingsRoute });

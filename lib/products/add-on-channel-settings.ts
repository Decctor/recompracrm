import type { DBTransaction } from "@/services/drizzle";
import { productAddOnOptionChannelSettings, productAddOns, salesChannels } from "@/services/drizzle/schema";
import type { TAddOnOptionChannelSettingInput } from "@/schemas/product-add-on-channel-settings";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";

/** Aplica o patch na transação do grupo; o chamador agenda o push após o commit. */
export async function applyAddOnChannelSettings({
	tx,
	orgId,
	produtoAddOnId,
	settings,
}: {
	tx: DBTransaction;
	orgId: string;
	produtoAddOnId: string;
	settings: TAddOnOptionChannelSettingInput[];
}) {
	const channelIds = [...new Set(settings.map((setting) => setting.canalVendaId))];
	const [addOn, ownedChannels] = await Promise.all([
		tx.query.productAddOns.findFirst({
			where: and(eq(productAddOns.id, produtoAddOnId), eq(productAddOns.organizacaoId, orgId)),
			columns: { id: true },
			with: {
				opcoes: { where: (fields, { and, eq, isNull }) => and(isNull(fields.dataExclusao), eq(fields.organizacaoId, orgId)), columns: { id: true } },
			},
		}),
		channelIds.length
			? tx
					.select({ id: salesChannels.id, canal: salesChannels.canal })
					.from(salesChannels)
					.where(and(eq(salesChannels.organizacaoId, orgId), inArray(salesChannels.id, channelIds)))
			: Promise.resolve([] as { id: string; canal: string }[]),
	]);
	if (!addOn) throw new createHttpError.NotFound("Grupo de adicionais não encontrado.");

	const optionIds = new Set(addOn.opcoes.map((opcao) => opcao.id));
	const ownedChannelIds = new Set(ownedChannels.map((channel) => channel.id));
	const nodeKeys = settings.map((setting) => `${setting.canalVendaId}:${setting.produtoAddOnOpcaoId}`);
	// Duas linhas para o mesmo nó violariam unq_add_on_option_channel_settings_node no insert e
	// virariam 500 no lugar de um erro de payload.
	if (nodeKeys.length !== new Set(nodeKeys).size) throw new createHttpError.BadRequest("Há configurações repetidas para a mesma opção e canal.");
	if (settings.some((setting) => !ownedChannelIds.has(setting.canalVendaId))) {
		throw new createHttpError.BadRequest("Um canal de venda não pertence à organização.");
	}
	if (settings.some((setting) => !optionIds.has(setting.produtoAddOnOpcaoId))) {
		throw new createHttpError.BadRequest("Uma opção não pertence ao grupo de adicionais.");
	}

	// A linha só RESTRINGE a disponibilidade (ver resolveChannelOptionAvailability): `true` é o mesmo
	// que herdar, então vira nulo em vez de ocupar a tabela esparsa.
	const normalized = settings.map((setting) => ({
		...setting,
		precoDelta: setting.precoDelta ?? null,
		disponivel: setting.disponivel === false ? false : null,
	}));
	const upserts = normalized.filter((setting) => setting.precoDelta != null || setting.disponivel != null);
	const clears = normalized.filter((setting) => setting.precoDelta == null && setting.disponivel == null);

	// Patch esparso: só os nós enviados mudam; os ausentes do payload ficam intactos.
	if (clears.length) {
		await tx
			.delete(productAddOnOptionChannelSettings)
			.where(
				and(
					eq(productAddOnOptionChannelSettings.organizacaoId, orgId),
					or(
						...clears.map((setting) =>
							and(
								eq(productAddOnOptionChannelSettings.canalVendaId, setting.canalVendaId),
								eq(productAddOnOptionChannelSettings.produtoAddOnOpcaoId, setting.produtoAddOnOpcaoId),
							),
						),
					),
				),
			);
	}
	if (upserts.length) {
		await tx
			.insert(productAddOnOptionChannelSettings)
			.values(
				upserts.map((setting) => ({
					organizacaoId: orgId,
					canalVendaId: setting.canalVendaId,
					produtoAddOnOpcaoId: setting.produtoAddOnOpcaoId,
					precoDelta: setting.precoDelta,
					disponivel: setting.disponivel,
				})),
			)
			.onConflictDoUpdate({
				target: [productAddOnOptionChannelSettings.canalVendaId, productAddOnOptionChannelSettings.produtoAddOnOpcaoId],
				set: {
					precoDelta: sql`excluded.preco_delta`,
					disponivel: sql`excluded.disponivel`,
					dataAtualizacao: new Date(),
				},
			});
	}

	return { touchedIfood: ownedChannels.some((channel) => channel.canal === "IFOOD") };
}

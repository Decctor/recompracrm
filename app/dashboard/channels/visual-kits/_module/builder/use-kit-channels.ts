"use client";

import { salesChannelLabel } from "@/components/SalesChannels/SalesChannelMark";
import { useIfoodMerchantNames } from "@/lib/queries/ifood";
import { useSalesChannels } from "@/lib/queries/sales-channels";
import type { TSalesChannelTypeEnum } from "@/schemas/enums";
import { useMemo } from "react";
import { useKitBuilder } from "./kit-builder-context";

export type TKitChannelOption = { id: string; canal: TSalesChannelTypeEnum; label: string };

/** Canais de venda da organização (só ERP tem canais) e o rótulo do canal escolhido no kit. */
export function useKitChannels() {
	const { orgHasERPAccess, state } = useKitBuilder();
	const { data } = useSalesChannels({ enabled: orgHasERPAccess });
	const channels = useMemo(() => data ?? [], [data]);
	const merchantNames = useIfoodMerchantNames({ enabled: channels.some((channel) => channel.canal === "IFOOD") });

	const options = useMemo<TKitChannelOption[]>(
		() => channels.map((channel) => ({ id: channel.id, canal: channel.canal, label: salesChannelLabel(channel, merchantNames) })),
		[channels, merchantNames],
	);
	const selected = options.find((option) => option.id === state.kit.canalVendaId) ?? null;

	return { options, selected, selectedLabel: selected?.label ?? "Preço base" };
}

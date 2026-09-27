"use client";

import { IfoodIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { TSalesChannelTypeEnum } from "@/schemas/enums";
import { ClipboardList, Monitor, Store } from "lucide-react";

/**
 * Marca de um canal do registro de canais de venda (`sales_channels`).
 *
 * Canal integrado entra com o logotipo do parceiro, canal próprio com ícone genérico — mas os dois
 * dividem a mesma cápsula, porque numa lista de canais o que alinha as linhas é a caixa, não a
 * marca. A cor tingindo a cápsula é o que separa um canal do outro à distância.
 *
 * Vocabulário do registro (POS|SHOP|COMANDA|IFOOD), diferente do trilho de status do header
 * (IFOOD|LOJA_DIGITAL) atendido por `ChannelMark`. Unificar quando o trilho migrar para o registro.
 */

export const SALES_CHANNEL_LABELS: Record<TSalesChannelTypeEnum, string> = {
	POS: "PDV",
	SHOP: "Loja digital",
	COMANDA: "Comandas",
	IFOOD: "iFood",
};

/**
 * Rótulo de uma linha do registro. O iFood tem um canal POR MERCHANT (`refExterno` = merchantId), e
 * uma organização com duas lojas não pode ver duas colunas chamadas só "iFood": o nome da loja
 * entra quando o chamador o tem (`useIfoodMerchants`), senão o prefixo do id serve de desempate.
 */
export function salesChannelLabel(channel: { canal: TSalesChannelTypeEnum; refExterno?: string | null }, merchantNames?: Map<string, string>) {
	const base = SALES_CHANNEL_LABELS[channel.canal] ?? channel.canal;
	if (channel.canal !== "IFOOD" || !channel.refExterno) return base;
	const nome = merchantNames?.get(channel.refExterno);
	return `${base} · ${nome ?? channel.refExterno.slice(0, 8)}`;
}

const CHANNEL_CHIP_CLASSNAME: Record<TSalesChannelTypeEnum, string> = {
	POS: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
	SHOP: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
	COMANDA: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
	// O vermelho do iFood é da marca, não do tema — fica fora dos tokens de propósito.
	IFOOD: "bg-[#ea1d2c]/10 text-[#ea1d2c]",
};

export function SalesChannelMark({ canal, className }: { canal: TSalesChannelTypeEnum; className?: string }) {
	return (
		<span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", CHANNEL_CHIP_CLASSNAME[canal], className)}>
			<SalesChannelGlyph canal={canal} />
		</span>
	);
}

function SalesChannelGlyph({ canal }: { canal: TSalesChannelTypeEnum }) {
	// A marca nominativa do iFood é larga: presa pela altura, ela cabe na cápsula sem esticar.
	if (canal === "IFOOD") return <IfoodIcon aria-hidden className="h-3 w-auto" />;

	const Icon = canal === "POS" ? Monitor : canal === "SHOP" ? Store : ClipboardList;
	return <Icon aria-hidden className="size-4" />;
}

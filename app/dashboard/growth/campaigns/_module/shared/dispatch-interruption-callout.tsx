"use client";

import { Callout } from "@/components/ui/callout";
import { CAMPAIGN_DISPATCH_INTERRUPTION_COPY } from "@/lib/campaigns/dispatch/interruption-policy";
import type { TCampaignDispatchInterruptionReasonEnum } from "@/schemas/enums";
import { ExternalLink, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";

type DispatchInterruptionCalloutProps = {
	motivo: TCampaignDispatchInterruptionReasonEnum;
	codigo: number | null;
	// Título/detalhe do erro como a Meta mandou — o código sozinho não diz nada ao lojista.
	tituloMeta?: string | null;
	detalhesMeta?: string | null;
	// Linha de impacto ("6.466 clientes não foram contatados"), quando o contexto tem o número.
	impacto?: ReactNode;
	children?: ReactNode;
};

/**
 * Aviso de envio interrompido por um erro da Meta: o que houve, o impacto e o que fazer.
 * Usado no card do disparo interrompido e no alerta de número bloqueado da página de campanhas.
 */
export function DispatchInterruptionCallout({ motivo, codigo, tituloMeta, detalhesMeta, impacto, children }: DispatchInterruptionCalloutProps) {
	const copy = CAMPAIGN_DISPATCH_INTERRUPTION_COPY[motivo];
	const metaDetail = [tituloMeta, detalhesMeta].filter(Boolean).join(" — ");

	return (
		<Callout.Root tone="danger">
			<Callout.Title>
				<OctagonAlert className="h-4 w-4 min-h-4 min-w-4" />
				{copy.titulo}
			</Callout.Title>
			<Callout.Description>{copy.explicacao}</Callout.Description>
			{impacto ? <Callout.Description>{impacto}</Callout.Description> : null}
			<Callout.Description className="font-medium">{copy.acao}</Callout.Description>
			{codigo != null || metaDetail ? (
				<Callout.Note>
					{codigo != null ? `Código ${codigo} da Meta` : "Retorno da Meta"}
					{metaDetail ? ` · ${metaDetail}` : ""}
				</Callout.Note>
			) : null}
			{copy.acaoUrl || children ? (
				<Callout.Actions>
					{copy.acaoUrl ? (
						<a href={copy.acaoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold underline underline-offset-2">
							{copy.acaoUrlTexto}
							<ExternalLink className="h-3.5 w-3.5" />
						</a>
					) : null}
					{children}
				</Callout.Actions>
			) : null}
		</Callout.Root>
	);
}

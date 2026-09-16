"use client";

import { resolveMessageTemplateStatusForPhone } from "@/lib/message-templates/metadata";
import { cn } from "@/lib/utils";
import type { TMessageTemplateMetadata } from "@/schemas/message-templates";
import { getMessageTemplatePhoneStatusUIDetails } from "@/utils/select-options";
import { CircleSlash } from "lucide-react";

type TemplateStatusBadgeProps = {
	metadata: TMessageTemplateMetadata;
	selectedPhoneId: string;
};

/**
 * Selo de status de um template DENTRO da etapa Mensagem: sempre relativo ao remetente
 * escolhido logo acima, nunca o `statusGeral` (pior status entre todos os números).
 */
export default function TemplateStatusBadge({ metadata, selectedPhoneId }: TemplateStatusBadgeProps) {
	const resolution = resolveMessageTemplateStatusForPhone({ metadata, phoneId: selectedPhoneId });

	if (resolution.escopo === "NAO_REGISTRADO") {
		return (
			<span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-muted px-2 py-1" title="Ao salvar a campanha, este template é submetido para aprovação neste número.">
				<CircleSlash className="h-3.5 w-3.5 text-muted-foreground" />
				<span className="text-[0.65rem] font-semibold uppercase text-muted-foreground">Não registrado</span>
			</span>
		);
	}

	const details = getMessageTemplatePhoneStatusUIDetails(resolution.status);
	if (!details) return null;

	return (
		<span
			className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1", details.colors.background)}
			title={resolution.escopo === "GERAL" ? "Pior status entre os números conectados — escolha um remetente para ver o status dele." : undefined}
		>
			{details.icon}
			<span className={cn("text-[0.65rem] font-semibold uppercase", details.colors.text)}>{details.label}</span>
		</span>
	);
}

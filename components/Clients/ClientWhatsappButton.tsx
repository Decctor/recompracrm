"use client";

import { WhatsappIcon } from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { buildWhatsappChatUrl } from "@/lib/whatsapp/utils";

type ClientWhatsappButtonProps = {
	telefone: string | null | undefined;
	className?: string;
};

/** Atalho com a marca do WhatsApp para abrir a conversa com o cliente. Sem telefone discável, não renderiza. */
export default function ClientWhatsappButton({ telefone, className }: ClientWhatsappButtonProps) {
	const href = buildWhatsappChatUrl(telefone);
	if (!href) return null;

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<a
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Conversar no WhatsApp"
						className={cn(
							"inline-flex size-6 min-w-6 items-center justify-center rounded-full bg-[#25D366] text-white transition-colors hover:bg-[#1DA851] focus-visible:ring-2 focus-visible:ring-[#25D366]/50 focus-visible:outline-none",
							className,
						)}
					>
						<WhatsappIcon className="size-3.5" />
					</a>
				}
			/>
			<TooltipContent>CONVERSAR NO WHATSAPP</TooltipContent>
		</Tooltip>
	);
}

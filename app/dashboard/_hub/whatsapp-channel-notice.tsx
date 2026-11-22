"use client";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { appRoutes } from "@/lib/navigation/routes";
import { useWhatsappChannelStatus } from "@/lib/queries/whatsapp-connections";
import { CircleAlert } from "lucide-react";
import Link from "next/link";

/**
 * Aviso do canal oficial no hub: aparece só quando o próximo passo do WhatsApp está com a loja
 * (falta o pagamento na Meta, um envio foi recusado, o acesso caiu), nunca enquanto a Meta revisa
 * algo — esperar não é tarefa de ninguém. Os passos: lib/whatsapp/channel-activation.ts.
 */
export function WhatsappChannelNotice({ enabled }: { enabled: boolean }) {
	const channel = useWhatsappChannelStatus({ enabled });
	if (!channel.data || channel.data.pronto) return null;
	const blocked = channel.data.telefones.find(
		(phone) => phone.canal.proximo && (phone.canal.proximo.tom === "falhou" || phone.canal.proximo.tom === "pendente"),
	);
	const step = blocked?.canal.proximo;
	if (!blocked || !step) return null;

	return (
		<Callout.Root tone={step.tom === "falhou" ? "warning" : "info"}>
			<Callout.Title>
				<CircleAlert className="size-4" />
				{step.tom === "falhou" ? "O WhatsApp oficial parou num passo" : "Falta um passo para o WhatsApp oficial mandar campanhas"}
			</Callout.Title>
			<Callout.Description>
				{step.titulo}: {step.situacao.toLowerCase()} ({blocked.numero}). {blocked.canal.concluidos} de {blocked.canal.total} passos concluídos.
			</Callout.Description>
			<Callout.Actions>
				<Button asChild size="sm" variant="outline">
					<Link href={`${appRoutes.settings()}?view=meta-oauth`}>Continuar configuração</Link>
				</Button>
			</Callout.Actions>
		</Callout.Root>
	);
}

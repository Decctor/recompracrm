"use client";

import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { clearPhoneSendBlock } from "@/lib/mutations/whatsapp-connections";
import { useWhatsappConnections } from "@/lib/queries/whatsapp-connections";
import type { TCampaignDispatchInterruptionReasonEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DispatchInterruptionCallout } from "../shared/dispatch-interruption-callout";

/**
 * Números com envios de campanha bloqueados por um erro da Meta (pagamento, conta restrita...).
 * Fica no topo do módulo enquanto o bloqueio existir: nenhuma campanha do número sai até que o
 * problema seja resolvido. "Já resolvi" remove o bloqueio direto — ativar campanha é barrado
 * enquanto ele existe, então retomar o disparo nem sempre está ao alcance.
 */
export function BlockedPhonesAlert() {
	const { data: connections } = useWhatsappConnections();
	const blockedPhones = (connections ?? []).flatMap((connection) => connection.telefones).filter((phone) => !!phone.metadados?.bloqueioEnvio);
	if (blockedPhones.length === 0) return null;

	return (
		<div className="flex w-full flex-col gap-2">
			{blockedPhones.map((phone) => {
				const block = phone.metadados?.bloqueioEnvio;
				if (!block) return null;
				return <BlockedPhoneCallout key={phone.id} phone={phone} block={block} />;
			})}
		</div>
	);
}

type BlockedPhoneCalloutProps = {
	phone: { id: string; nome: string; numero: string };
	block: { motivo: TCampaignDispatchInterruptionReasonEnum; codigo: number | null; titulo?: string | null; detalhes?: string | null };
};

function BlockedPhoneCallout({ phone, block }: BlockedPhoneCalloutProps) {
	const queryClient = useQueryClient();
	const { mutate, isPending } = useMutation({
		mutationKey: ["clear-phone-send-block", phone.id],
		mutationFn: () => clearPhoneSendBlock({ phoneId: phone.id }),
		onSuccess: async (response) => {
			toast.success(response.message);
			await queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	return (
		<DispatchInterruptionCallout
			motivo={block.motivo}
			codigo={block.codigo}
			tituloMeta={block.titulo}
			detalhesMeta={block.detalhes}
			impacto={`As campanhas do número ${phone.nome} (${phone.numero}) estão pausadas. Depois de resolver, clique em "Já resolvi" e retome o disparo interrompido na página da campanha.`}
		>
			<Button size="sm" variant="outline" disabled={isPending} className="h-7 text-[0.65rem] font-semibold" onClick={() => mutate()}>
				{isPending ? "LIBERANDO..." : "JÁ RESOLVI"}
			</Button>
		</DispatchInterruptionCallout>
	);
}

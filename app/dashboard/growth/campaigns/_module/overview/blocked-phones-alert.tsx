"use client";

import { useWhatsappConnections } from "@/lib/queries/whatsapp-connections";
import { DispatchInterruptionCallout } from "../shared/dispatch-interruption-callout";

/**
 * Números com envios de campanha bloqueados por um erro da Meta (pagamento, conta restrita...).
 * Fica no topo do módulo enquanto o bloqueio existir: nenhuma campanha do número sai até que o
 * problema seja resolvido e o disparo interrompido seja retomado.
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
				return (
					<DispatchInterruptionCallout
						key={phone.id}
						motivo={block.motivo}
						codigo={block.codigo}
						tituloMeta={block.titulo}
						detalhesMeta={block.detalhes}
						impacto={`As campanhas do número ${phone.nome} (${phone.numero}) estão pausadas. Depois de resolver, retome o disparo interrompido na página da campanha.`}
					/>
				);
			})}
		</div>
	);
}

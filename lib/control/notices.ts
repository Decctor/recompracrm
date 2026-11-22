import { isControlLifecycleSyncEnabled, sendControlEvent } from "@/services/control";
import { controlOrganizationReference } from "./lifecycle";

/**
 * Avisos pontuais para o Syncroniza Control, fora do sync horário: coisas que acontecem num clique
 * (a pessoa tentou conectar o WhatsApp e não conseguiu) e que o time quer saber na hora. Vão como
 * evento na oportunidade da organização (`ref:recompracrm:org_<id>`), com chave diária, para que
 * dez tentativas no mesmo dia virem um empurrão só. Nunca lançam.
 */

const LOG = "[CONTROL_NOTICE]";

function today() {
	return new Date().toISOString().slice(0, 10);
}

async function sendControlNoticeSafely({
	organizationId,
	evento,
	chave,
	propriedades,
}: {
	organizationId: string;
	evento: string;
	chave: string;
	propriedades: Record<string, unknown>;
}) {
	if (!isControlLifecycleSyncEnabled()) return false;
	const reference = controlOrganizationReference(organizationId);
	try {
		await sendControlEvent({
			evento,
			eventId: `${reference}:${chave}`,
			oportunidadeId: `ref:${reference}`,
			propriedades: { organizacaoId: organizationId, ...propriedades },
			dataOcorrencia: new Date().toISOString(),
		});
		return true;
	} catch (error) {
		// A organização ainda sem oportunidade no Control (criada há segundos) é o caso comum: o sync
		// horário cria a oportunidade e o próximo aviso chega.
		console.error(`${LOG} Falha ao enviar ${evento} da organização ${organizationId}:`, error instanceof Error ? error.message : error);
		return false;
	}
}

/** A conexão com a Meta falhou ou foi cancelada: o workflow do Control oferece ajuda e cria tarefa para o CS. */
export function notifyControlWhatsappConnectFailure({ organizationId, codigo }: { organizationId: string; codigo: string }) {
	return sendControlNoticeSafely({
		organizationId,
		evento: "whatsapp_conexao_falhou",
		chave: `whatsapp_conexao_falhou:${today()}`,
		propriedades: { codigo },
	});
}

/** A Meta recusou um envio por falta de forma de pagamento: o time ajuda antes da primeira campanha travar. */
export function notifyControlWhatsappPaymentPending({ organizationId, telefoneId }: { organizationId: string; telefoneId: string }) {
	return sendControlNoticeSafely({
		organizationId,
		evento: "whatsapp_pagamento_pendente",
		chave: `whatsapp_pagamento_pendente:${telefoneId}:${today()}`,
		propriedades: { telefoneId },
	});
}

/** A pessoa pediu ajuda para conectar o WhatsApp: o workflow do Control cria a tarefa de conexão assistida. */
export function notifyControlWhatsappAssistRequested({ organizationId, usuarioNome }: { organizationId: string; usuarioNome: string | null }) {
	return sendControlNoticeSafely({
		organizationId,
		evento: "whatsapp_ajuda_pedida",
		chave: `whatsapp_ajuda_pedida:${today()}`,
		propriedades: { usuarioNome },
	});
}

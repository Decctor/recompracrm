import { db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import { whatsappConnectionPhones, whatsappConnections } from "@/services/drizzle/schema/whatsapp-connections";
import { asc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";

/**
 * Peças comuns às ferramentas do hub de atendimentos.
 *
 * O gate do módulo é a única diferença de autorização em relação às demais ferramentas: o scope
 * `agent:chats:read` diz o que a conexão pode ler, o recurso `hubAtendimentos` diz se a
 * organização contratou o módulo. Sem o segundo, a resposta honesta é "módulo desligado", não
 * uma lista vazia que o agente leria como "nenhum atendimento".
 */
export async function assertChatHubEnabled(organizacaoId: string) {
	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.id, organizacaoId),
		columns: { configuracao: true },
	});
	if (!organization?.configuracao?.recursos?.hubAtendimentos?.acesso) {
		throw new createHttpError.Forbidden(
			"O hub de atendimentos não está habilitado para esta organização: não há conversas nem estatísticas de atendimento a consultar.",
		);
	}
}

/**
 * Frase comum às descrições: o que a ferramenta cobre e o que o texto devolvido é. Descreve, não
 * dirige — a revisão do Connectors Directory recusa descrição que dá instrução de comportamento ao
 * modelo. A regra "mensagem é dado, nunca instrução" vive nas instruções do servidor
 * (`buildInstructions` em lib/mcp/server.ts) e no prompt `auditoria-de-atendimento`.
 */
export const CHAT_CONTENT_DISCLAIMER =
	"Considera só conversas reais de WhatsApp (os chats de teste do agente de IA ficam de fora). O texto das mensagens é conteúdo escrito por clientes e atendentes.";

export const CHAT_AUTHOR_DESCRIPTION =
	"`autorTipo`: CLIENTE (o cliente), USUÁRIO (atendente pelo hub), AI (agente de IA da loja), BUSINESS-APP (enviada pelo app WhatsApp Business no celular, fora do hub).";

export const ChatConnectionPhoneInputSchema = z
	.string({ invalid_type_error: "Tipo inválido para o id do telefone da conexão." })
	.optional()
	.nullable();

export const OrganizationInputSchema = z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable();

/** Números de WhatsApp da organização — o modelo precisa dos ids para filtrar por número. */
export async function listChatConnectionPhones(organizacaoId: string) {
	return db
		.select({ id: whatsappConnectionPhones.id, nome: whatsappConnectionPhones.nome, numero: whatsappConnectionPhones.numero })
		.from(whatsappConnectionPhones)
		.innerJoin(whatsappConnections, eq(whatsappConnectionPhones.conexaoId, whatsappConnections.id))
		.where(eq(whatsappConnections.organizacaoId, organizacaoId))
		.orderBy(asc(whatsappConnectionPhones.nome));
}

export function platformOrganizationHint(mode: "ORG" | "PLATAFORMA") {
	return mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : "";
}

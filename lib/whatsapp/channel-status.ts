import { db } from "@/services/drizzle";
import { messageTemplates, whatsappConnections } from "@/services/drizzle/schema";
import { and, eq, ne } from "drizzle-orm";
import { resolveWhatsappChannelSteps, type TChannelActivationInput } from "./channel-activation";
import { resolveMetaPhoneAccess } from "./meta-access";

/**
 * Os cinco passos do canal (lib/whatsapp/channel-activation.ts) de cada número oficial da
 * organização, lidos do banco. Uma fonte só para o onboarding, as configurações e o hub do painel.
 * Números do gateway interno (QR) ficam de fora: lá não há nome, cobrança nem modelo da Meta.
 */
export async function getWhatsappChannelStatus({ organizationId }: { organizationId: string }) {
	const [connections, templates] = await Promise.all([
		db.query.whatsappConnections.findMany({
			where: and(eq(whatsappConnections.organizacaoId, organizationId), eq(whatsappConnections.tipoConexao, "META_CLOUD_API")),
			columns: { id: true, dataExpiracao: true },
			with: { telefones: { columns: { id: true, nome: true, numero: true, metadados: true } } },
		}),
		db.query.messageTemplates.findMany({
			where: and(eq(messageTemplates.organizacaoId, organizationId), ne(messageTemplates.status, "ARQUIVADO")),
			columns: { metadados: true },
		}),
	]);

	const now = new Date();
	const telefones = connections.flatMap((connection) =>
		connection.telefones.map((phone) => {
			const metadados = phone.metadados ?? {};
			const perPhone = templates.map((template) => template.metadados.porNumeroTelefone?.[phone.id]).filter((entry) => !!entry);
			// A data de expiração gravada é estimativa; a checagem de saúde depois dela vence (meta-access.ts).
			// A falha da checagem segue em `saudeFalha`, com a mensagem da Meta.
			const access = resolveMetaPhoneAccess({ dataExpiracao: connection.dataExpiracao, saude: metadados.saude, now });
			const input: TChannelActivationInput = {
				numero: access === "EXPIRADO" ? "EXPIRADO" : "CONECTADO",
				saudeFalha: metadados.saude?.status === "FALHA" ? (metadados.saude.mensagem ?? "A Meta recusou o acesso a este número.") : null,
				meta: metadados.meta ?? null,
				pagamento: metadados.pagamento?.status ?? "DESCONHECIDO",
				teste: metadados.testeConexao ?? null,
				modelos: {
					total: perPhone.length,
					aprovados: perPhone.filter((entry) => entry.status === "APROVADO").length,
					rejeitados: perPhone.filter((entry) => entry.status === "REJEITADO").length,
				},
			};
			return {
				id: phone.id,
				nome: phone.nome,
				numero: phone.numero,
				meta: input.meta,
				teste: input.teste,
				canal: resolveWhatsappChannelSteps(input),
			};
		}),
	);

	return { telefones, pronto: telefones.some((phone) => phone.canal.pronto) };
}
export type TWhatsappChannelStatus = Awaited<ReturnType<typeof getWhatsappChannelStatus>>;

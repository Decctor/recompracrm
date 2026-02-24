import { sendMessage } from "@/lib/whatsapp/internal-gateway";
import type { TOrganizationEntity } from "@/services/drizzle/schema";

export const LUCAS_WHATSAPP_NUMBER = "5534996626855";
export const ARTHUR_WHATSAPP_NUMBER = "5534999480791";
export const JULIANA_WHATSAPP_NUMBER = "5534998225216";
type TNotifyFoundersOnNewOrganizationInput = {
	organization: {
		nome: TOrganizationEntity["nome"];
		cnpj: TOrganizationEntity["cnpj"];
		email: TOrganizationEntity["email"];
		telefone: TOrganizationEntity["telefone"];
		atuacaoNicho: TOrganizationEntity["atuacaoNicho"];
		tamanhoBaseClientes: TOrganizationEntity["tamanhoBaseClientes"];
		plataformasUtilizadas: TOrganizationEntity["plataformasUtilizadas"];
	};
	subscription: string;
};
const NEW_ORG_ONBOARDED_MESSAGE_TEMPLATE = (o: TNotifyFoundersOnNewOrganizationInput["organization"], subscription: string) =>
	`🎉 Nova organização no CRM!

Uma nova organização completou o onboarding:

🏢 Nome: ${o.nome}
🆔 CNPJ: ${o.cnpj}
✉️ Email: ${o.email}
📞 Telefone: ${o.telefone}
💼 Atuação: ${o.atuacaoNicho}
📊 Base de clientes: ${o.tamanhoBaseClientes ?? "NÃO INFORMADO"}
📱 Plataformas utilizadas: ${o.plataformasUtilizadas ?? "NÃO INFORMADO"}
📦 Assinatura: ${subscription}`;

export async function notifyInternalsOnNewOrganization({ organization, subscription }: TNotifyFoundersOnNewOrganizationInput) {
	const sessionId = process.env.INTERNAL_WHATSAPP_GATEWAY_SESSION_COMS as string;
	const text = NEW_ORG_ONBOARDED_MESSAGE_TEMPLATE(organization, subscription);
	await Promise.all([
		sendMessage(sessionId, LUCAS_WHATSAPP_NUMBER, { type: "text", text }),
		sendMessage(sessionId, ARTHUR_WHATSAPP_NUMBER, { type: "text", text }),
		sendMessage(sessionId, JULIANA_WHATSAPP_NUMBER, { type: "text", text }),
	]);
}

import { db } from "@/services/drizzle";
import { whatsappConnections } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";

export type TOrganizationWhatsappPhone = {
	id: string;
	numero: string;
	nome: string;
	whatsappBusinessAccountId: string | null;
	whatsappTelefoneId: string | null;
	conexao: {
		id: string;
		token: string | null;
		tipoConexao: string;
	};
};

export async function getOrganizationWhatsappPhoneIds(organizationId: string): Promise<Set<string>> {
	const connections = await db.query.whatsappConnections.findMany({
		where: eq(whatsappConnections.organizacaoId, organizationId),
		columns: { id: true },
		with: {
			telefones: {
				columns: { id: true },
			},
		},
	});
	return new Set(connections.flatMap((connection) => connection.telefones.map((phone) => phone.id)));
}

export async function getOrganizationWhatsappPhones(organizationId: string): Promise<TOrganizationWhatsappPhone[]> {
	const connections = await db.query.whatsappConnections.findMany({
		where: eq(whatsappConnections.organizacaoId, organizationId),
		columns: {
			id: true,
			token: true,
			tipoConexao: true,
		},
		with: {
			// Desativados ficam fora: sincronizar ou submeter template por eles bate na Meta sem acesso.
			telefones: { where: (phone, { isNull }) => isNull(phone.dataDesativacao) },
		},
	});

	return connections.flatMap((connection) =>
		connection.telefones.map((phone) => ({
			...phone,
			conexao: connection,
		})),
	);
}

import { formatPhoneAsBase } from "@/lib/formatting";
import type { DB, DBTransaction } from "@/services/drizzle";
import { organizationMembers, sellers, users } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";

type TDb = DB | DBTransaction;

/**
 * O número é de alguém da equipe da organização (membro do hub ou vendedor)?
 *
 * Um vendedor que manda o endereço da obra pelo número da loja não é um cliente, e a IA
 * respondendo a ele ("quer que eu registre no CRM?") é ruído para todo mundo. A comparação é
 * pela base do telefone (DDD + 8 dígitos), a mesma da deduplicação de clientes.
 *
 * Compartilhada entre o runtime (`confirmClientInAgentScope`) e o gate do hub
 * (`resolveAiAssignmentAvailability`): os dois precisam responder a mesma coisa, senão o hub
 * entrega ao agente uma conversa que o runtime libera no turno seguinte.
 */
export async function isOrganizationStaffPhone(
	db: TDb,
	{ organizationId, telefoneBase }: { organizationId: string; telefoneBase: string },
): Promise<boolean> {
	if (!telefoneBase) return false;
	const [members, orgSellers] = await Promise.all([
		db
			.select({ telefone: users.telefone })
			.from(organizationMembers)
			.innerJoin(users, eq(users.id, organizationMembers.usuarioId))
			.where(eq(organizationMembers.organizacaoId, organizationId)),
		db
			.select({ telefone: sellers.telefone })
			.from(sellers)
			.where(and(eq(sellers.organizacaoId, organizationId), eq(sellers.ativo, true))),
	]);
	return [...members, ...orgSellers].some((row) => row.telefone && formatPhoneAsBase(row.telefone) === telefoneBase);
}

/** Base do telefone do cliente da conversa, com fallback para o telefone cru de registros antigos. */
export function resolveClientPhoneBase(cliente: { telefone?: string | null; telefoneBase?: string | null } | null | undefined): string {
	return cliente?.telefoneBase || (cliente?.telefone ? formatPhoneAsBase(cliente.telefone) : "");
}

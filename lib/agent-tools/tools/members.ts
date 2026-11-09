import { db } from "@/services/drizzle";
import { organizationMembers, users } from "@/services/drizzle/schema";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import z from "zod";
import { resolveOrganizationScope } from "../organization-scope";
import { defineAgentTool } from "../types";

const ListMembersInputSchema = z.object({
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

function maskEmail(email: string) {
	const [local = "", domain = ""] = email.split("@");
	if (!domain) return "••••";
	return `${local.slice(0, 2)}${"•".repeat(Math.max(local.length - 2, 3))}@${domain}`;
}

export const listMembersTool = defineAgentTool({
	name: "list_members",
	title: "Listar membros",
	scopes: ["agent:members:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: ListMembersInputSchema,
	describe: (actor) =>
		[
			"Lista os membros humanos da organização que podem receber responsabilidades de negócio em campanhas e outras ações.",
			"A autoria de auditoria das chamadas é definida pela conexão MCP, não por esta lista.",
			actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const rows = await db
			.select({ id: users.id, nome: users.nome, email: users.email })
			.from(organizationMembers)
			.innerJoin(users, eq(users.id, organizationMembers.usuarioId))
			.where(and(eq(organizationMembers.organizacaoId, organizacaoId), isNotNull(organizationMembers.usuarioId)))
			.orderBy(asc(users.nome));

		return {
			total: rows.length,
			membros: rows.map((member) => ({ id: member.id, nome: member.nome, emailMascarado: maskEmail(member.email) })),
		};
	},
});

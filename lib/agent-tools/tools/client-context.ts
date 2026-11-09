import { getClientContext } from "@/lib/clients/context";
import z from "zod";
import { canReadClientPii, maskSensitiveValue, resolveOrganizationScope } from "../organization-scope";
import { defineAgentTool } from "../types";

const GetClientContextInputSchema = z.object({
	clienteId: z.string({
		required_error: "Informe o id do cliente.",
		invalid_type_error: "Tipo inválido para o id do cliente.",
	}),
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

export const clientContextTool = defineAgentTool({
	name: "get_client_context",
	title: "Contexto do cliente",
	scopes: ["agent:clients:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: GetClientContextInputSchema,
	describe: (actor) =>
		[
			"Retrato completo de um cliente: histórico de compras (quantidade, valor, ticket médio, intervalo médio entre compras e",
			"próxima compra estimada), saldo de cashback e quanto expira em 30 dias, cupons disponíveis, produtos preferidos,",
			"produto sugerido para cross-sell, tags e as últimas compras.",
			"Reúne o necessário para decidir se e como abordar um cliente. O `clienteId` vem de `search_clients`.",
			canReadClientPii(actor) ? "Telefone e e-mail vêm completos." : "Telefone e e-mail vêm mascarados nesta conexão.",
			actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const result = await getClientContext({ input: { clientId: input.clienteId }, organizacaoId });
		const { cliente, ...rest } = result.data;

		if (canReadClientPii(actor)) return { ...rest, cliente };

		// O mascaramento acontece aqui, e não em `lib/clients/context`: o painel mostra o contato
		// para o lojista logado. Quem é limitado é esta conexão, não a consulta.
		return {
			...rest,
			cliente: {
				...cliente,
				telefone: maskSensitiveValue("telefone" in cliente ? (cliente.telefone as string | null) : null),
				email: maskSensitiveValue("email" in cliente ? (cliente.email as string | null) : null),
				cpfCnpj: maskSensitiveValue("cpfCnpj" in cliente ? (cliente.cpfCnpj as string | null) : null),
			},
		};
	},
});

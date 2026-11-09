import { db } from "@/services/drizzle";
import { audiences, clients } from "@/services/drizzle/schema";
import { and, count, desc, eq, isNotNull, ne } from "drizzle-orm";
import z from "zod";
import { resolveOrganizationScope } from "../organization-scope";
import { defineAgentTool } from "../types";

const ListSegmentsInputSchema = z.object({
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

export const listSegmentsTool = defineAgentTool({
	name: "list_segments",
	title: "Segmentos e públicos",
	scopes: ["agent:campaigns:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: ListSegmentsInputSchema,
	describe: (actor) =>
		[
			"Como a base de clientes desta organização está dividida: a distribuição RFM (quantos clientes em cada categoria,",
			"por exemplo Campeões, Em risco, Hibernando) e os públicos salvos que as campanhas usam.",
			"As categorias RFM são definidas por organização e variam entre elas: esta lista é a referência das categorias e",
			"públicos que existem nesta organização.",
			"`clientesSemCategoria` são clientes que a análise RFM ainda não classificou, normalmente por falta de histórico.",
			actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);

		const [rfmRows, savedAudiences, totalClients] = await Promise.all([
			db
				.select({ categoria: clients.analiseRFMTitulo, total: count() })
				.from(clients)
				// Título vazio não é categoria: entra no bolo dos não classificados, abaixo.
				.where(and(eq(clients.organizacaoId, organizacaoId), isNotNull(clients.analiseRFMTitulo), ne(clients.analiseRFMTitulo, "")))
				.groupBy(clients.analiseRFMTitulo)
				.orderBy(desc(count())),
			db.query.audiences.findMany({
				where: eq(audiences.organizacaoId, organizacaoId),
				orderBy: [desc(audiences.dataInsercao)],
				limit: 50,
				columns: { id: true, nome: true, descricao: true, segmentacoes: true, dataInsercao: true },
			}),
			db.select({ total: count() }).from(clients).where(eq(clients.organizacaoId, organizacaoId)),
		]);

		const categorized = rfmRows.reduce((accumulator, row) => accumulator + row.total, 0);
		const total = totalClients[0]?.total ?? 0;

		return {
			totalClientes: total,
			segmentosRFM: rfmRows.map((row) => ({
				categoria: row.categoria,
				qtdeClientes: row.total,
				percentual: total > 0 ? Math.round((row.total / total) * 1000) / 10 : undefined,
			})),
			// Contabilizado explicitamente porque a soma das categorias não fecha com o total, e um
			// modelo que percebe a diferença sozinho tende a inventar uma explicação para ela.
			clientesSemCategoria: Math.max(total - categorized, 0),
			publicosSalvos: savedAudiences.map((audience) => ({
				id: audience.id,
				nome: audience.nome,
				descricao: audience.descricao,
				segmentacoes: audience.segmentacoes,
				dataInsercao: audience.dataInsercao,
			})),
		};
	},
});

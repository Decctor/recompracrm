import { createSimplifiedPhoneSearchCondition, createSimplifiedSearchCondition } from "@/lib/search";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, desc, eq, isNull, lte, or, type SQL } from "drizzle-orm";
import z from "zod";
import { canReadClientPii, maskSensitiveValue, resolveOrganizationScope } from "../organization-scope";
import { roundForModel } from "../serialization";
import { defineAgentTool } from "../types";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const SearchClientsInputSchema = z.object({
	termo: z.string({ invalid_type_error: "Tipo inválido para o termo de busca." }).optional().nullable(),
	telefone: z.string({ invalid_type_error: "Tipo inválido para o telefone." }).optional().nullable(),
	rfmCategoria: z.string({ invalid_type_error: "Tipo inválido para a categoria RFM." }).optional().nullable(),
	semCompraHaDias: z.number({ invalid_type_error: "Tipo inválido para dias sem compra." }).int().positive().optional().nullable(),
	limite: z.number({ invalid_type_error: "Tipo inválido para o limite." }).int().positive().max(MAX_LIMIT).optional().nullable(),
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

export const searchClientsTool = defineAgentTool({
	name: "search_clients",
	title: "Buscar clientes",
	scopes: ["agent:clients:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: SearchClientsInputSchema,
	describe: (actor) =>
		[
			"Busca clientes da organização por nome, telefone, documento, categoria RFM ou tempo desde a última compra.",
			"Devolve o resumo de cada cliente: total de compras, valor acumulado, ticket médio, categoria RFM e data da última compra.",
			"Sem nenhum filtro, lista os clientes que compraram mais recentemente.",
			`Devolve no máximo ${MAX_LIMIT} clientes por chamada, sempre acompanhados do total encontrado; não há paginação.`,
			canReadClientPii(actor)
				? "Telefone, e-mail e CPF/CNPJ vêm completos."
				: "Telefone, e-mail e CPF/CNPJ vêm mascarados: esta conexão não tem permissão para dados de contato.",
			actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const showPii = canReadClientPii(actor);
		const limite = input.limite ?? DEFAULT_LIMIT;

		const conditions: SQL[] = [eq(clients.organizacaoId, organizacaoId)];

		const termo = input.termo?.trim();
		if (termo && termo.length >= 2) {
			const termCondition = or(
				createSimplifiedSearchCondition(clients.nome, termo),
				createSimplifiedSearchCondition(clients.cpfCnpj, termo),
				createSimplifiedPhoneSearchCondition(clients.telefoneBase, termo),
			);
			if (termCondition) conditions.push(termCondition);
		}

		const telefone = input.telefone?.trim();
		if (telefone) conditions.push(createSimplifiedPhoneSearchCondition(clients.telefoneBase, telefone));

		const rfmCategoria = input.rfmCategoria?.trim();
		if (rfmCategoria) conditions.push(eq(clients.analiseRFMTitulo, rfmCategoria));

		if (input.semCompraHaDias) {
			const cutoff = dayjs().subtract(input.semCompraHaDias, "days").toDate();
			// Cliente que nunca comprou também está "sem comprar há N dias" — e é exatamente quem
			// o lojista quer ver numa pergunta de reativação.
			const staleCondition = or(lte(clients.ultimaCompraData, cutoff), isNull(clients.ultimaCompraData));
			if (staleCondition) conditions.push(staleCondition);
		}

		const where = and(...conditions);

		const [rows, totalResult] = await Promise.all([
			db.query.clients.findMany({
				where,
				orderBy: [desc(clients.ultimaCompraData)],
				limit: limite,
				columns: {
					id: true,
					nome: true,
					telefone: true,
					email: true,
					cpfCnpj: true,
					analiseRFMTitulo: true,
					primeiraCompraData: true,
					ultimaCompraData: true,
					metadataTotalCompras: true,
					metadataValorTotalCompras: true,
					localizacaoCidade: true,
					localizacaoEstado: true,
					comunicacaoPausadaAte: true,
				},
			}),
			db.select({ total: count() }).from(clients).where(where),
		]);

		const total = totalResult[0]?.total ?? 0;

		return {
			total,
			exibindo: rows.length,
			// O modelo precisa saber que a lista foi cortada, senão conclui que o total é o que viu.
			truncado: total > rows.length,
			clientes: rows.map((client) => {
				const totalCompras = client.metadataTotalCompras ?? 0;
				const valorTotalCompras = client.metadataValorTotalCompras ?? 0;
				const pausaComunicacao = client.comunicacaoPausadaAte;
				return {
					id: client.id,
					nome: client.nome,
					telefone: showPii ? client.telefone : maskSensitiveValue(client.telefone),
					email: showPii ? client.email : maskSensitiveValue(client.email),
					cpfCnpj: showPii ? client.cpfCnpj : maskSensitiveValue(client.cpfCnpj),
					categoriaRFM: client.analiseRFMTitulo,
					cidade: client.localizacaoCidade,
					estado: client.localizacaoEstado,
					primeiraCompraData: client.primeiraCompraData,
					ultimaCompraData: client.ultimaCompraData,
					totalCompras,
					valorTotalCompras: roundForModel(valorTotalCompras),
					ticketMedio: totalCompras > 0 ? roundForModel(valorTotalCompras / totalCompras) : undefined,
					// Só aparece quando de fato há pausa vigente: é uma restrição operacional, e o
					// agente precisa vê-la antes de sugerir contato.
					comunicacaoPausadaAte: pausaComunicacao && dayjs(pausaComunicacao).isAfter(dayjs()) ? pausaComunicacao : undefined,
				};
			}),
		};
	},
});

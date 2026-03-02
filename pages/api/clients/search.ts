import { apiHandler } from "@/lib/api";
import { getCurrentSessionUncached } from "@/lib/authentication/pages-session";
import { createSimplifiedPhoneSearchCondition, createSimplifiedSearchCondition } from "@/lib/search";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import { and, asc, eq, or } from "drizzle-orm";
import createHttpError from "http-errors";
import type { NextApiHandler } from "next";
import z from "zod";

const SearchClientsInputSchema = z.object({
	search: z.string({
		required_error: "Termo de busca não informado.",
		invalid_type_error: "Tipo não válido para termo de busca.",
	}),
});
export type TSearchClientsInput = z.infer<typeof SearchClientsInputSchema>;

async function searchClients({ input, userOrgId }: { input: TSearchClientsInput; userOrgId: string }) {
	const normalizedSearch = input.search.trim();
	if (normalizedSearch.length < 2) {
		return {
			data: {
				clients: [],
			},
			message: "Busca de clientes realizada com sucesso.",
		};
	}

	const result = await db.query.clients.findMany({
		where: and(
			eq(clients.organizacaoId, userOrgId),
			or(
				createSimplifiedSearchCondition(clients.nome, normalizedSearch),
				createSimplifiedPhoneSearchCondition(clients.telefoneBase, normalizedSearch),
				createSimplifiedSearchCondition(clients.cpfCnpj, normalizedSearch),
			),
		),
		orderBy: asc(clients.nome),
		limit: 10,
		columns: {
			id: true,
			nome: true,
			telefone: true,
			cpfCnpj: true,
			email: true,
			localizacaoCidade: true,
			localizacaoEstado: true,
		},
	});

	return {
		data: {
			clients: result,
		},
		message: "Busca de clientes realizada com sucesso.",
	};
}

export type TSearchClientsOutput = Awaited<ReturnType<typeof searchClients>>;

const searchClientsRoute: NextApiHandler<TSearchClientsOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached(req.cookies);
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const input = SearchClientsInputSchema.parse({
		search: req.query.search,
	});

	const result = await searchClients({ input, userOrgId });
	return res.status(200).json(result);
};

export default apiHandler({ GET: searchClientsRoute });

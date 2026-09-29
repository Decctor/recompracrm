import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { CLIENT_LOCATION_STREET_REQUIRED_MESSAGE, ClientLocationSchema, hasClientLocationStreet } from "@/schemas/clients";
import { db } from "@/services/drizzle";
import { clientLocations, clients } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";

const GetClientLocationsInputSchema = z.object({
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para ID do cliente.",
	}),
});
export type TGetClientLocationsInput = z.infer<typeof GetClientLocationsInputSchema>;

const GetClientLocationByIdInputSchema = z.object({
	id: z.string({
		required_error: "ID da localização não informado.",
		invalid_type_error: "Tipo não válido para ID da localização.",
	}),
});
export type TGetClientLocationByIdInput = z.infer<typeof GetClientLocationByIdInputSchema>;

const ClientLocationInputSchema = ClientLocationSchema.omit({
	dataInsercao: true,
	organizacaoId: true,
	clienteId: true,
}).extend({
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para ID do cliente.",
	}),
});

const CreateClientLocationInputSchema = ClientLocationInputSchema.refine(hasClientLocationStreet, {
	message: CLIENT_LOCATION_STREET_REQUIRED_MESSAGE,
	path: ["localizacaoLogradouro"],
});
export type TCreateClientLocationInput = z.infer<typeof CreateClientLocationInputSchema>;

const UpdateClientLocationInputSchema = ClientLocationInputSchema.extend({
	id: z.string({
		required_error: "ID da localização não informado.",
		invalid_type_error: "Tipo não válido para ID da localização.",
	}),
});
export type TUpdateClientLocationInput = z.infer<typeof UpdateClientLocationInputSchema>;

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	return {
		session,
		orgId,
	};
}

async function getClientLocations({ input, session }: { input: TGetClientLocationsInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	const locations = await db.query.clientLocations.findMany({
		where: and(eq(clientLocations.organizacaoId, orgId), eq(clientLocations.clienteId, input.clienteId)),
		orderBy: (fields, { desc }) => [desc(fields.dataInsercao)],
	});

	return {
		data: {
			locations,
		},
		message: "Localizações encontradas com sucesso.",
	};
}
export type TGetClientLocationsOutput = Awaited<ReturnType<typeof getClientLocations>>;

async function getClientLocationById({ input, session }: { input: TGetClientLocationByIdInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	const location = await db.query.clientLocations.findFirst({
		where: and(eq(clientLocations.id, input.id), eq(clientLocations.organizacaoId, orgId)),
	});
	if (!location) throw new createHttpError.NotFound("Localização não encontrada.");

	return {
		data: {
			location,
		},
		message: "Localização encontrada com sucesso.",
	};
}
export type TGetClientLocationByIdOutput = Awaited<ReturnType<typeof getClientLocationById>>;

async function createClientLocation({ input, session }: { input: TCreateClientLocationInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	const existingClient = await db.query.clients.findFirst({
		where: and(eq(clients.id, input.clienteId), eq(clients.organizacaoId, orgId)),
		columns: { id: true },
	});
	if (!existingClient) throw new createHttpError.NotFound("Cliente não encontrado.");

	const inserted = await db
		.insert(clientLocations)
		.values({
			clienteId: input.clienteId,
			organizacaoId: orgId,
			titulo: input.titulo,
			localizacaoCep: input.localizacaoCep,
			localizacaoEstado: input.localizacaoEstado,
			localizacaoCidade: input.localizacaoCidade,
			localizacaoBairro: input.localizacaoBairro,
			localizacaoLogradouro: input.localizacaoLogradouro,
			localizacaoNumero: input.localizacaoNumero,
			localizacaoComplemento: input.localizacaoComplemento,
			localizacaoLatitude: input.localizacaoLatitude,
			localizacaoLongitude: input.localizacaoLongitude,
		})
		.returning();

	const location = inserted[0];
	if (!location) throw new createHttpError.InternalServerError("Erro ao criar localização do cliente.");

	return {
		data: {
			location,
		},
		message: "Localização criada com sucesso.",
	};
}
export type TCreateClientLocationOutput = Awaited<ReturnType<typeof createClientLocation>>;

async function updateClientLocation({ input, session }: { input: TUpdateClientLocationInput; session: TAuthUserSession }) {
	const orgId = session.membership!.organizacao.id;

	const existingLocation = await db.query.clientLocations.findFirst({
		where: and(eq(clientLocations.id, input.id), eq(clientLocations.organizacaoId, orgId)),
		columns: { id: true },
	});
	if (!existingLocation) throw new createHttpError.NotFound("Localização não encontrada.");

	const existingClient = await db.query.clients.findFirst({
		where: and(eq(clients.id, input.clienteId), eq(clients.organizacaoId, orgId)),
		columns: { id: true },
	});
	if (!existingClient) throw new createHttpError.NotFound("Cliente não encontrado.");

	const updated = await db
		.update(clientLocations)
		.set({
			clienteId: input.clienteId,
			titulo: input.titulo,
			localizacaoCep: input.localizacaoCep,
			localizacaoEstado: input.localizacaoEstado,
			localizacaoCidade: input.localizacaoCidade,
			localizacaoBairro: input.localizacaoBairro,
			localizacaoLogradouro: input.localizacaoLogradouro,
			localizacaoNumero: input.localizacaoNumero,
			localizacaoComplemento: input.localizacaoComplemento,
			localizacaoLatitude: input.localizacaoLatitude,
			localizacaoLongitude: input.localizacaoLongitude,
		})
		.where(and(eq(clientLocations.id, input.id), eq(clientLocations.organizacaoId, orgId)))
		.returning();

	const location = updated[0];
	if (!location) throw new createHttpError.InternalServerError("Erro ao atualizar localização do cliente.");

	return {
		data: {
			location,
		},
		message: "Localização atualizada com sucesso.",
	};
}
export type TUpdateClientLocationOutput = Awaited<ReturnType<typeof updateClientLocation>>;

const getClientLocationsRoute: PagesRouteHandler<TGetClientLocationsOutput | TGetClientLocationByIdOutput> = async (req, res) => {
	const { session } = getSessionWithOrg(await getCurrentSessionUncached());

	if (req.query.id) {
		const input = GetClientLocationByIdInputSchema.parse({ id: req.query.id });
		const result = await getClientLocationById({ input, session });
		return res.status(200).json(result);
	}

	const input = GetClientLocationsInputSchema.parse({ clienteId: req.query.clienteId });
	const result = await getClientLocations({ input, session });
	return res.status(200).json(result);
};

const createClientLocationRoute: PagesRouteHandler<TCreateClientLocationOutput> = async (req, res) => {
	const { session } = getSessionWithOrg(await getCurrentSessionUncached());
	const input = CreateClientLocationInputSchema.parse(req.body);
	const result = await createClientLocation({ input, session });
	return res.status(201).json(result);
};

const updateClientLocationRoute: PagesRouteHandler<TUpdateClientLocationOutput> = async (req, res) => {
	const { session } = getSessionWithOrg(await getCurrentSessionUncached());
	const input = UpdateClientLocationInputSchema.parse({ ...(req.body as Record<string, unknown>), id: req.query.id });
	const result = await updateClientLocation({ input, session });
	return res.status(200).json(result);
};

const routeHandlers = {
	GET: getClientLocationsRoute,
	POST: createClientLocationRoute,
	PUT: updateClientLocationRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});
export const PUT = appApiHandler({
	PUT: (request) => runPagesRouteHandler({ request, handler: routeHandlers.PUT! }),
});

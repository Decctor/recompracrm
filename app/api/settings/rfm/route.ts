import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanManageClientBase, assertCanViewClients } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { UtilsRFMSchema } from "@/schemas/utils";
import { db } from "@/services/drizzle";
import { utils } from "@/services/drizzle/schema";
import type { TRFMConfig } from "@/utils/rfm";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";

async function getRFMConfig({ sessionUser }: { sessionUser: TAuthUserSession }) {
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const sessionUserOrgId = sessionUser.membership?.organizacao.id;
	if (!sessionUserOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const configReturned = await db.query.utils.findFirst({
		where: and(eq(utils.identificador, "CONFIG_RFM"), eq(utils.organizacaoId, sessionUserOrgId)),
	});

	const organizationRFMConfig = configReturned && configReturned.valor.identificador === "CONFIG_RFM" ? configReturned.valor : null;
	return {
		data: organizationRFMConfig,
		message: organizationRFMConfig ? "Configuração RFM encontrada com sucesso." : "Configuração RFM não encontrada.",
	};
}
export type TGetRFMConfigOutput = Awaited<ReturnType<typeof getRFMConfig>>;

const getRFMConfigRoute: PagesRouteHandler<TGetRFMConfigOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanViewClients(sessionUser);

	const result = await getRFMConfig({ sessionUser });
	return res.status(200).json(result);
};

const UpdateRFMConfigInputSchema = z.object({
	rfmConfig: UtilsRFMSchema.shape.valor,
});
export type TUpdateRFMConfigInput = z.infer<typeof UpdateRFMConfigInputSchema>;

async function updateRFMConfig({ sessionUser, input }: { sessionUser: TAuthUserSession; input: TUpdateRFMConfigInput }) {
	const sessionUserOrgId = sessionUser.membership?.organizacao.id;
	if (!sessionUserOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const organizationRFMConfig = await db.query.utils.findFirst({
		where: and(eq(utils.identificador, "CONFIG_RFM"), eq(utils.organizacaoId, sessionUserOrgId)),
	});

	if (!organizationRFMConfig) throw new createHttpError.NotFound("Configuração RFM não encontrada.");

	const updateRFMConfigResponse = await db
		.update(utils)
		.set({
			identificador: "CONFIG_RFM",
			valor: input.rfmConfig,
		})
		.where(and(eq(utils.id, organizationRFMConfig.id), eq(utils.organizacaoId, sessionUserOrgId)))
		.returning({
			id: utils.id,
		});

	const updatedRFMConfigId = updateRFMConfigResponse[0]?.id;
	if (!updatedRFMConfigId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar configuração.");

	return {
		data: {
			updatedId: updatedRFMConfigId,
		},
		message: "Configuração RFM atualizada com sucesso.",
	};
}
export type TUpdateRFMConfigOutput = Awaited<ReturnType<typeof updateRFMConfig>>;

const updateRFMConfigRoute: PagesRouteHandler<TUpdateRFMConfigOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	// A configuração RFM define os segmentos da base inteira: clientes.gerenciarBase.
	assertCanManageClientBase(sessionUser);

	const input = UpdateRFMConfigInputSchema.parse(req.body);
	const result = await updateRFMConfig({ sessionUser, input });
	return res.status(200).json(result);
};

const CreateRFMConfigInputSchema = z.object({
	rfmConfig: UtilsRFMSchema.shape.valor,
});
export type TCreateRFMConfigInput = z.infer<typeof CreateRFMConfigInputSchema>;

async function createRFMConfig({ sessionUser, input }: { sessionUser: TAuthUserSession; input: TCreateRFMConfigInput }) {
	const sessionUserOrgId = sessionUser.membership?.organizacao.id;
	if (!sessionUserOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const existingOrganizationRFMConfig = await db.query.utils.findFirst({
		where: and(eq(utils.identificador, "CONFIG_RFM"), eq(utils.organizacaoId, sessionUserOrgId)),
	});
	if (existingOrganizationRFMConfig) throw new createHttpError.Conflict("Já existe uma configuração RFM para esta organização.");

	const createdRFMConfig = await db
		.insert(utils)
		.values({
			identificador: "CONFIG_RFM",
			valor: input.rfmConfig,
			organizacaoId: sessionUserOrgId,
		})
		.returning({
			id: utils.id,
		});

	const createdRFMConfigId = createdRFMConfig[0]?.id;

	if (!createdRFMConfigId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar configuração.");

	return {
		data: {
			createdId: createdRFMConfigId,
		},
		message: "Configuração RFM criada com sucesso.",
	};
}
export type TCreateRFMConfigOutput = Awaited<ReturnType<typeof createRFMConfig>>;

const createRFMConfigRoute: PagesRouteHandler<TCreateRFMConfigOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanManageClientBase(sessionUser);

	const input = CreateRFMConfigInputSchema.parse(req.body);
	const result = await createRFMConfig({ sessionUser, input });
	return res.status(200).json(result);
};
const routeHandlers = {
	GET: getRFMConfigRoute,
	PUT: updateRFMConfigRoute,
	POST: createRFMConfigRoute,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
export const PUT = appApiHandler({
	PUT: (request) => runPagesRouteHandler({ request, handler: routeHandlers.PUT! }),
});
export const POST = appApiHandler({
	POST: (request) => runPagesRouteHandler({ request, handler: routeHandlers.POST! }),
});

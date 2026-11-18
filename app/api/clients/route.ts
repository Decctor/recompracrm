import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanLookupClients, assertCanRegisterClients, assertCanUpdateClientRecords, assertCanViewClients } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { formatPhoneAsBase } from "@/lib/formatting";
import {
	CLIENT_LOCATION_STREET_REQUIRED_MESSAGE,
	ClientLocationSchema,
	ClientSchema,
	ClientTagReferenceSchema,
	hasClientLocationStreet,
} from "@/schemas/clients";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import { clientLocations, clientTagReferences } from "@/services/drizzle/schema/clients";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import z from "zod";
import { NextRequest, NextResponse } from "next/server";
import { handleSimpleChildRowsProcessing } from "@/lib/db-utils";
import { resolveValidatedAuthorSeller } from "@/lib/clients/authorship";
import { recomputeClientDuplicatesSafely } from "@/lib/clients/duplicates";
import { normalizeSocialProfile, normalizeWebsiteUrl } from "@/lib/socials";
import { getClients, parseGetClientsSearchParams } from "@/lib/clients/listing";

export type { TGetClientsInput, TGetClientsOutput, TGetClientsOutputById, TGetClientsOutputDefault } from "@/lib/clients/listing";

const getClientsRoute = async (req: NextRequest) => {
	const sessionUser = await getCurrentSessionUncached();

	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const searchParams = await req.nextUrl.searchParams;

	// A listagem é o módulo de clientes (clientes.visualizar). O byId também abre o cliente vinculado
	// na venda e no atendimento, então aceita quem localiza clientes para operar.
	if (searchParams.get("id")) assertCanLookupClients(sessionUser);
	else assertCanViewClients(sessionUser);
	const input = parseGetClientsSearchParams(searchParams);
	const result = await getClients({ input, session: sessionUser });
	return NextResponse.json(result);
};

const ClientNonEditableFieldsOmit = {
	// Autoria de usuário é sempre resolvida da sessão — nunca aceita no payload.
	autorId: true,
	primeiraCompraData: true,
	primeiraCompraId: true,
	ultimaCompraData: true,
	ultimaCompraId: true,
	analiseRFMTitulo: true,
	analiseRFMNotasRecencia: true,
	analiseRFMNotasFrequencia: true,
	analiseRFMNotasMonetario: true,
	analiseRFMUltimaAtualizacao: true,
	dataSincronizacaoExterna: true,
} as const;

const ClientEditableDateInputSchema = {
	dataNascimento: z
		.string({
			invalid_type_error: "Tipo não válido para data de nascimento.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	dataFundacao: z
		.string({
			invalid_type_error: "Tipo nao valido para data de fundacao.",
		})
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
};

const CreateClientEntityInputSchema = ClientSchema.omit({
	organizacaoId: true,
	dataInsercao: true,
	...ClientNonEditableFieldsOmit,
}).extend(ClientEditableDateInputSchema);

const CreateClientInputSchema = z.object({
	client: CreateClientEntityInputSchema,
	clientLocations: z.array(
		ClientLocationSchema.omit({
			organizacaoId: true,
			clienteId: true,
			dataInsercao: true,
		}).refine(hasClientLocationStreet, { message: CLIENT_LOCATION_STREET_REQUIRED_MESSAGE, path: ["localizacaoLogradouro"] }),
	),
	clientTags: z.array(
		ClientTagReferenceSchema.omit({ clienteId: true, organizacaoId: true }).extend({
			id: z.string({ invalid_type_error: "Tipo não válido para o ID da tag do cliente." }).optional(),
			deletar: z.boolean({ invalid_type_error: "Tipo não válido para a flag de exclusão da tag do cliente." }).optional(),
		}),
	),
});

export type TCreateClientInput = z.infer<typeof CreateClientInputSchema>;

async function createClientService({ input, session }: { input: TCreateClientInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	// autorVendedorId viaja na própria entidade (ex.: vendedor da venda no new-sale);
	// validado contra a org quando informado, senão fallback para o vínculo da sessão.
	const autorVendedorId = input.client.autorVendedorId
		? await resolveValidatedAuthorSeller({ organizacaoId: userOrgId, vendedorId: input.client.autorVendedorId })
		: (session.membership?.usuarioVendedorId ?? null);

	const insertedId = await db.transaction(async (tx) => {
		const firstLocation = input.clientLocations[0] ?? null;

		const insertResponse = await tx
			.insert(clients)
			.values({
				...input.client,
				organizacaoId: userOrgId,
				autorId: session.user.id,
				autorVendedorId,
				telefone: input.client.telefone ?? "",
				telefoneBase: formatPhoneAsBase(input.client.telefone ?? ""),
				websiteUrl: normalizeWebsiteUrl(input.client.websiteUrl),
				instagram: normalizeSocialProfile(input.client.instagram, "instagram"),
				linkedin: normalizeSocialProfile(input.client.linkedin, "linkedin"),
				twitter: normalizeSocialProfile(input.client.twitter, "twitter"),
				localizacaoCep: firstLocation?.localizacaoCep ?? input.client.localizacaoCep,
				localizacaoEstado: firstLocation?.localizacaoEstado ?? input.client.localizacaoEstado,
				localizacaoCidade: firstLocation?.localizacaoCidade ?? input.client.localizacaoCidade,
				localizacaoBairro: firstLocation?.localizacaoBairro ?? input.client.localizacaoBairro,
				localizacaoLogradouro: firstLocation?.localizacaoLogradouro ?? input.client.localizacaoLogradouro,
				localizacaoNumero: firstLocation?.localizacaoNumero ?? input.client.localizacaoNumero,
				localizacaoComplemento: firstLocation?.localizacaoComplemento ?? input.client.localizacaoComplemento,
			})
			.returning({ id: clients.id });

		const insertedClientId = insertResponse[0]?.id;
		if (!insertedClientId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar cliente.");

		if (input.clientLocations.length > 0) {
			await tx.insert(clientLocations).values(
				input.clientLocations.map((location) => ({
					organizacaoId: userOrgId,
					clienteId: insertedClientId,
					titulo: location.titulo,
					localizacaoCep: location.localizacaoCep,
					localizacaoEstado: location.localizacaoEstado,
					localizacaoCidade: location.localizacaoCidade,
					localizacaoBairro: location.localizacaoBairro,
					localizacaoLogradouro: location.localizacaoLogradouro,
					localizacaoNumero: location.localizacaoNumero,
					localizacaoComplemento: location.localizacaoComplemento,
					localizacaoLatitude: location.localizacaoLatitude,
					localizacaoLongitude: location.localizacaoLongitude,
				})),
			);
		}

		if (input.clientTags.length > 0) {
			await tx.insert(clientTagReferences).values(
				input.clientTags.map((reference) => ({
					organizacaoId: userOrgId,
					clienteId: insertedClientId,
					clienteTagId: reference.clienteTagId,
				})),
			);
		}

		return insertedClientId;
	});

	await recomputeClientDuplicatesSafely({ organizacaoId: userOrgId, clienteId: insertedId });

	return {
		data: {
			insertedId,
		},
		message: "Cliente criado com sucesso.",
	};
}
export type TCreateClientOutput = Awaited<ReturnType<typeof createClientService>>;
const createClientRoute = async (req: NextRequest) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	// Também é o cadastro rápido do PDV e das contas de atendimento: ver canRegisterClients.
	assertCanRegisterClients(sessionUser);

	const payload = await req.json();
	const input = CreateClientInputSchema.parse(payload);
	const result = await createClientService({ input, session: sessionUser });
	return NextResponse.json(result);
};
const UpdateClientEntityInputSchema = ClientSchema.omit({
	organizacaoId: true,
	dataInsercao: true,
	// Autoria é imutável: aceita apenas na criação, nunca no update.
	autorVendedorId: true,
	...ClientNonEditableFieldsOmit,
}).extend(ClientEditableDateInputSchema);
const UpdateClientInputSchema = z.object({
	clientId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para ID do cliente.",
	}),
	client: UpdateClientEntityInputSchema,
	clientLocations: z.array(
		ClientLocationSchema.omit({
			organizacaoId: true,
			clienteId: true,
			dataInsercao: true,
		})
			.extend({
				id: z
					.string({
						required_error: "ID da localização não informado.",
						invalid_type_error: "Tipo não válido para ID da localização.",
					})
					.optional(),
				deletar: z
					.boolean({
						invalid_type_error: "Tipo não válido para marcador de exclusão.",
					})
					.optional()
					.nullable(),
			})
			.refine((location) => !!location.id || !!location.deletar || hasClientLocationStreet(location), {
				message: CLIENT_LOCATION_STREET_REQUIRED_MESSAGE,
				path: ["localizacaoLogradouro"],
			}),
	),
	clientTags: z.array(
		ClientTagReferenceSchema.omit({ clienteId: true, organizacaoId: true }).extend({
			id: z.string({ invalid_type_error: "Tipo não válido para o ID da tag do cliente." }).optional(),
			deletar: z.boolean({ invalid_type_error: "Tipo não válido para a flag de exclusão da tag do cliente." }).optional(),
		}),
	),
});
export type TUpdateClientInput = z.infer<typeof UpdateClientInputSchema>;

async function updateClientService({ input, session }: { input: TUpdateClientInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const transactionResult = await db.transaction(async (tx) => {
		const updatedClient = await tx
			.update(clients)
			.set({
				...input.client,
				organizacaoId: userOrgId,
				telefone: input.client.telefone ?? "",
				telefoneBase: formatPhoneAsBase(input.client.telefone ?? ""),
				websiteUrl: normalizeWebsiteUrl(input.client.websiteUrl),
				instagram: normalizeSocialProfile(input.client.instagram, "instagram"),
				linkedin: normalizeSocialProfile(input.client.linkedin, "linkedin"),
				twitter: normalizeSocialProfile(input.client.twitter, "twitter"),
			})
			.where(and(eq(clients.id, input.clientId), eq(clients.organizacaoId, userOrgId)))
			.returning({ id: clients.id });

		if (!updatedClient) throw new createHttpError.NotFound("Cliente não encontrado.");
		const updatedClientId = updatedClient[0]?.id;

		await handleSimpleChildRowsProcessing({
			trx: tx,
			table: clientLocations,
			entities: input.clientLocations,
			fatherEntityKey: "clienteId",
			fatherEntityId: updatedClientId,
			organizacaoId: userOrgId,
		});
		await handleSimpleChildRowsProcessing({
			trx: tx,
			table: clientTagReferences,
			entities: input.clientTags,
			fatherEntityKey: "clienteId",
			fatherEntityId: updatedClientId,
			organizacaoId: userOrgId,
		});
		return {
			updatedId: updatedClientId,
		};
	});

	await recomputeClientDuplicatesSafely({ organizacaoId: userOrgId, clienteId: input.clientId });

	return {
		data: {
			updatedId: transactionResult.updatedId,
		},
		message: "Cliente atualizado com sucesso.",
	};
}
export type TUpdateClientOutput = Awaited<ReturnType<typeof updateClientService>>;
const updateClientRoute = async (req: NextRequest) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = sessionUser.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	// Também é o ajuste do cliente vinculado na venda: ver canUpdateClientRecords.
	assertCanUpdateClientRecords(sessionUser);

	const payload = await req.json();
	const input = UpdateClientInputSchema.parse(payload);
	const result = await updateClientService({ input, session: sessionUser });
	return NextResponse.json(result);
};
export const POST = appApiHandler({
	POST: (request) => createClientRoute(request),
});
export const GET = appApiHandler({
	GET: (request) => getClientsRoute(request),
});
export const PUT = appApiHandler({
	PUT: (request) => updateClientRoute(request),
});

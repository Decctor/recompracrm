import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { TAuthUserSession } from "@/lib/authentication/types";
import { findFiscalTaxGroupById, listFiscalTaxGroups, upsertFiscalTaxGroup } from "@/lib/fiscal/settings";
import { FiscalTaxGroupRuleSchema, FiscalTaxGroupSchema } from "@/schemas/fiscal";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

async function requireOrgSession() {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return { session, orgId };
}

const FiscalTaxGroupInputSchema = FiscalTaxGroupSchema.omit({ organizacaoId: true, dataInsercao: true }).superRefine((group, ctx) => {
	if (group.csosnComCredito && !["101", "201"].includes(group.csosnComCredito))
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["csosnComCredito"], message: "O tratamento com crédito deve utilizar CSOSN 101 ou 201." });
	if (group.csosnSemCredito && !["102", "202"].includes(group.csosnSemCredito))
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["csosnSemCredito"], message: "O tratamento sem crédito deve utilizar CSOSN 102 ou 202." });
});
const FiscalTaxGroupRuleInputSchema = FiscalTaxGroupRuleSchema.omit({ grupoTributarioId: true, organizacaoId: true, dataInsercao: true }).extend({
	id: z.string({ invalid_type_error: "Tipo não valido para o ID da regra." }).optional(),
	deletar: z.boolean({ invalid_type_error: "Tipo não valido para deletar regra." }).optional(),
});

const GetFiscalTaxGroupsInputSchema = z.object({
	id: z
		.string({
			required_error: "ID do grupo tributario nao informado.",
			invalid_type_error: "Tipo nao valido para o ID do grupo tributario.",
		})
		.optional()
		.nullable(),
});
export type TGetFiscalTaxGroupsInput = z.infer<typeof GetFiscalTaxGroupsInputSchema>;

async function getFiscalTaxGroups({ input }: { input: TGetFiscalTaxGroupsInput }) {
	const { session, orgId } = await requireOrgSession();
	const userHasFiscalConfigurePermission = session.membership?.permissoes.fiscal.configurar;
	if (!userHasFiscalConfigurePermission) throw new createHttpError.Forbidden("Oops, você não possui permissão para configurar grupos tributarios.");

	if (input.id) {
		const taxGroup = await findFiscalTaxGroupById({ fiscalTaxGroupId: input.id, organizationId: orgId });
		if (!taxGroup) throw new createHttpError.NotFound("Grupo tributario nao encontrado.");
		return {
			data: { default: null, byId: taxGroup },
			message: "Grupo tributario encontrado com sucesso.",
		};
	}

	return {
		data: { default: await listFiscalTaxGroups(orgId) },
		message: "Grupos tributarios encontrados com sucesso.",
	};
}
export type TGetFiscalTaxGroupsOutput = Awaited<ReturnType<typeof getFiscalTaxGroups>>;
export type TGetFiscalTaxGroupsOutputDefault = NonNullable<TGetFiscalTaxGroupsOutput["data"]["default"]>;
export type TGetFiscalTaxGroupsOutputById = NonNullable<TGetFiscalTaxGroupsOutput["data"]["byId"]>;

async function getFiscalTaxGroupsRoute(request: NextRequest) {
	const params = request.nextUrl.searchParams;
	const input = GetFiscalTaxGroupsInputSchema.parse({ id: params.get("id") ?? undefined });
	const result = await getFiscalTaxGroups({ input });
	return NextResponse.json(result);
}

const CreateFiscalTaxGroupInputSchema = z.object({
	taxGroup: FiscalTaxGroupInputSchema,
	regras: z.array(FiscalTaxGroupRuleInputSchema).default([]),
});
export type TCreateFiscalTaxGroupInput = z.infer<typeof CreateFiscalTaxGroupInputSchema>;

async function createFiscalTaxGroup({
	sessionMembership,
	input,
}: {
	sessionMembership: NonNullable<TAuthUserSession["membership"]>;
	input: TCreateFiscalTaxGroupInput;
}) {
	const result = await upsertFiscalTaxGroup({
		group: { organizacaoId: sessionMembership.organizacao.id, ...input.taxGroup },
		regras: input.regras,
	});
	return {
		data: { insertedId: result.id },
		message: "Grupo tributario salvo com sucesso.",
	};
}
export type TCreateFiscalTaxGroupOutput = Awaited<ReturnType<typeof createFiscalTaxGroup>>;

async function createFiscalTaxGroupRoute(request: NextRequest) {
	const { session } = await requireOrgSession();
	const sessionMembership = session.membership;
	if (!sessionMembership) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!sessionMembership.permissoes.fiscal.configurar)
		throw new createHttpError.Forbidden("Oops, você não possui permissão para configurar grupos tributarios.");

	const payload = await request.json();
	const input = CreateFiscalTaxGroupInputSchema.parse(payload);
	const result = await createFiscalTaxGroup({ sessionMembership, input });
	return NextResponse.json(result);
}

const UpdateFiscalTaxGroupInputSchema = z.object({
	taxGroupId: z.string({
		required_error: "ID do grupo tributario nao informado.",
		invalid_type_error: "Tipo nao valido para o ID do grupo tributario.",
	}),
	taxGroup: FiscalTaxGroupInputSchema,
	regras: z.array(FiscalTaxGroupRuleInputSchema).default([]),
});
export type TUpdateFiscalTaxGroupInput = z.infer<typeof UpdateFiscalTaxGroupInputSchema>;

async function updateFiscalTaxGroup({
	sessionMembership,
	input,
}: {
	sessionMembership: NonNullable<TAuthUserSession["membership"]>;
	input: TUpdateFiscalTaxGroupInput;
}) {
	const result = await upsertFiscalTaxGroup({
		group: { id: input.taxGroupId, organizacaoId: sessionMembership.organizacao.id, ...input.taxGroup },
		regras: input.regras,
	});
	return {
		data: { updatedId: result.id },
		message: "Grupo tributario atualizado com sucesso.",
	};
}
export type TUpdateFiscalTaxGroupOutput = Awaited<ReturnType<typeof updateFiscalTaxGroup>>;

async function updateFiscalTaxGroupRoute(request: NextRequest) {
	const { session } = await requireOrgSession();
	const sessionMembership = session.membership;
	if (!sessionMembership) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!sessionMembership.permissoes.fiscal.configurar)
		throw new createHttpError.Forbidden("Oops, você não possui permissão para configurar grupos tributarios.");

	const payload = await request.json();
	const input = UpdateFiscalTaxGroupInputSchema.parse(payload);
	const result = await updateFiscalTaxGroup({ sessionMembership, input });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getFiscalTaxGroupsRoute });
export const POST = appApiHandler({ POST: createFiscalTaxGroupRoute });
export const PUT = appApiHandler({ PUT: updateFiscalTaxGroupRoute });

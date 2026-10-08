import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { generatePublicToken, hashPublicToken } from "@/lib/tabs";
import { ServicePointTypeEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { servicePoints } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

const GetServicePointsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo nao valido para ID do ponto." }).optional().nullable(),
	activeOnly: z
		.string({ invalid_type_error: "Tipo nao valido para filtro de ativos." })
		.optional()
		.nullable()
		.transform((v) => v === "true"),
});
export type TGetServicePointsInput = z.infer<typeof GetServicePointsInputSchema>;

const CreateServicePointInputSchema = z.object({
	rotulo: z.string({ required_error: "Rotulo do ponto nao informado." }).min(1, { message: "Rotulo do ponto nao informado." }),
	grupo: z.string({ invalid_type_error: "Tipo nao valido para grupo." }).optional().nullable(),
	tipo: ServicePointTypeEnum.default("MESA"),
	capacidade: z.number({ invalid_type_error: "Tipo nao valido para capacidade." }).positive().optional().nullable(),
});
export type TCreateServicePointInput = z.infer<typeof CreateServicePointInputSchema>;

const UpdateServicePointInputSchema = z.object({
	id: z.string({ required_error: "ID do ponto nao informado." }),
	rotulo: z.string({ invalid_type_error: "Tipo nao valido para rotulo." }).min(1).optional(),
	grupo: z.string({ invalid_type_error: "Tipo nao valido para grupo." }).optional().nullable(),
	tipo: ServicePointTypeEnum.optional(),
	capacidade: z.number({ invalid_type_error: "Tipo nao valido para capacidade." }).positive().optional().nullable(),
	ativo: z.boolean({ invalid_type_error: "Tipo nao valido para ativo." }).optional(),
	regenerarToken: z.boolean({ invalid_type_error: "Tipo nao valido para regeneracao de token." }).optional(),
});
export type TUpdateServicePointInput = z.infer<typeof UpdateServicePointInputSchema>;

// ============================================================================
// SERVICES
// ============================================================================

async function getServicePoints({ input, orgId }: { input: TGetServicePointsInput; orgId: string }) {
	if (input.id) {
		const point = await db.query.servicePoints.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.id as string), eq(fields.organizacaoId, orgId)),
		});
		if (!point) throw new createHttpError.NotFound("Ponto de atendimento nao encontrado.");
		return {
			data: { byId: point, default: null },
			message: "Ponto de atendimento encontrado.",
		};
	}

	const points = await db.query.servicePoints.findMany({
		where: (fields, { and, eq }) => (input.activeOnly ? and(eq(fields.organizacaoId, orgId), eq(fields.ativo, true)) : eq(fields.organizacaoId, orgId)),
		orderBy: (fields, { asc }) => [asc(fields.grupo), asc(fields.rotulo)],
	});

	return {
		data: { byId: null, default: points },
		message: "Pontos de atendimento carregados com sucesso.",
	};
}
export type TGetServicePointsOutput = Awaited<ReturnType<typeof getServicePoints>>;

async function createServicePoint({ input, orgId }: { input: TCreateServicePointInput; orgId: string }) {
	const tokenPublico = generatePublicToken();

	const [created] = await db
		.insert(servicePoints)
		.values({
			organizacaoId: orgId,
			rotulo: input.rotulo,
			grupo: input.grupo ?? null,
			tipo: input.tipo,
			capacidade: input.capacidade ?? null,
			tokenPublico,
			tokenPublicoHash: hashPublicToken(tokenPublico),
		})
		.returning();

	return {
		data: { servicePoint: created },
		message: "Ponto de atendimento criado com sucesso.",
	};
}
export type TCreateServicePointOutput = Awaited<ReturnType<typeof createServicePoint>>;

async function updateServicePoint({ input, orgId }: { input: TUpdateServicePointInput; orgId: string }) {
	const existing = await db.query.servicePoints.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.id), eq(fields.organizacaoId, orgId)),
		columns: { id: true },
	});
	if (!existing) throw new createHttpError.NotFound("Ponto de atendimento nao encontrado.");

	const tokenPublico = input.regenerarToken ? generatePublicToken() : null;

	const [updated] = await db
		.update(servicePoints)
		.set({
			rotulo: input.rotulo,
			grupo: input.grupo,
			tipo: input.tipo,
			capacidade: input.capacidade,
			ativo: input.ativo,
			// Regenerar invalida o QR impresso: o hash antigo deixa de resolver.
			...(tokenPublico ? { tokenPublico, tokenPublicoHash: hashPublicToken(tokenPublico) } : {}),
		})
		.where(and(eq(servicePoints.id, input.id), eq(servicePoints.organizacaoId, orgId)))
		.returning();

	return {
		data: { servicePoint: updated },
		message: "Ponto de atendimento atualizado com sucesso.",
	};
}
export type TUpdateServicePointOutput = Awaited<ReturnType<typeof updateServicePoint>>;

// ============================================================================
// HANDLERS
// ============================================================================


async function getServicePointsRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const { searchParams } = new URL(request.url);
	const input = GetServicePointsInputSchema.parse({
		id: searchParams.get("id"),
		activeOnly: searchParams.get("activeOnly"),
	});
	const result = await getServicePoints({ input, orgId: session.membership!.organizacao.id });
	return NextResponse.json(result);
}

async function createServicePointRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const body = await request.json();
	const input = CreateServicePointInputSchema.parse(body);
	const result = await createServicePoint({ input, orgId: session.membership!.organizacao.id });
	return NextResponse.json(result);
}

async function updateServicePointRoute(request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());
	const { searchParams } = new URL(request.url);
	const body = await request.json();
	const input = UpdateServicePointInputSchema.parse({ ...body, id: searchParams.get("id") ?? body.id });
	const result = await updateServicePoint({ input, orgId: session.membership!.organizacao.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getServicePointsRoute });
export const POST = appApiHandler({ POST: createServicePointRoute });
export const PUT = appApiHandler({ PUT: updateServicePointRoute });

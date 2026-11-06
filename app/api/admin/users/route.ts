import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { DEFAULT_PAGE_SIZE, pageSizeInputSchema } from "@/lib/pagination";
import { createSimplifiedEmailSearchCondition, createSimplifiedPhoneSearchCondition, createSimplifiedSearchCondition } from "@/lib/search";
import { UserSchema } from "@/schemas/users";
import { db } from "@/services/drizzle";
import { users } from "@/services/drizzle/schema";
import { and, count, eq, or } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const USER_COLUMNS = {
	id: true,
	admin: true,
	nome: true,
	email: true,
	telefone: true,
	avatarUrl: true,
	usuario: true,
	dataNascimento: true,
	dataInsercao: true,
} as const;

// Get Users
const GetUsersAdminInputSchema = z.object({
	id: z
		.string({
			invalid_type_error: "Tipo inválido para ID do usuário.",
		})
		.optional()
		.nullable(),
	page: z
		.string({
			invalid_type_error: "Tipo inválido para página.",
		})
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
	pageSize: pageSizeInputSchema(),
	search: z
		.string({
			invalid_type_error: "Tipo inválido para busca.",
		})
		.optional()
		.nullable(),
});
export type TGetUsersAdminInput = z.infer<typeof GetUsersAdminInputSchema>;

async function getUsersAdmin({ input }: { input: TGetUsersAdminInput }) {
	if ("id" in input && input.id) {
		const inputId = input.id;
		if (typeof inputId !== "string") throw new createHttpError.BadRequest("ID inválido.");
		const user = await db.query.users.findFirst({
			where: (fields, { eq }) => eq(fields.id, inputId),
			columns: USER_COLUMNS,
			with: {
				associacoes: {
					with: {
						organizacao: {
							columns: {
								id: true,
								nome: true,
								logoUrl: true,
							},
						},
					},
				},
			},
		});
		if (!user) throw new createHttpError.NotFound("Usuário não encontrado.");
		return {
			data: {
				byId: user,
				default: null,
			},
			message: "Usuário encontrado com sucesso.",
		};
	}

	const conditions = [];
	if (input.search) {
		conditions.push(
			or(
				createSimplifiedSearchCondition(users.nome, input.search),
				createSimplifiedEmailSearchCondition(users.email, input.search),
				createSimplifiedPhoneSearchCondition(users.telefone, input.search),
			),
		);
	}

	const PAGE_SIZE = input.pageSize ?? DEFAULT_PAGE_SIZE;
	const skip = PAGE_SIZE * (input.page - 1);
	const limit = PAGE_SIZE;

	const usersMatchedResult = await db
		.select({ count: count(users.id) })
		.from(users)
		.where(and(...conditions));

	const usersMatchedCount = usersMatchedResult[0]?.count || 0;
	const totalPages = Math.ceil(usersMatchedCount / PAGE_SIZE);

	const usersResult = await db.query.users.findMany({
		where: and(...conditions),
		columns: USER_COLUMNS,
		with: {
			associacoes: {
				with: {
					organizacao: {
						columns: {
							id: true,
							nome: true,
							logoUrl: true,
						},
					},
				},
			},
		},
		orderBy: (fields, { asc }) => asc(fields.nome),
		offset: skip,
		limit: limit,
	});

	return {
		data: {
			byId: null,
			default: {
				users: usersResult,
				usersMatched: usersMatchedCount,
				totalPages: totalPages,
			},
		},
		message: "Usuários obtidos com sucesso.",
	};
}
export type TGetUsersAdminOutput = Awaited<ReturnType<typeof getUsersAdmin>>;
export type TGetUsersAdminOutputDefault = Exclude<TGetUsersAdminOutput["data"]["default"], undefined | null>;
export type TGetUsersAdminOutputById = Exclude<TGetUsersAdminOutput["data"]["byId"], undefined | null>;

async function getUsersAdminRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetUsersAdminInputSchema.parse({
		id: searchParams.get("id"),
		page: searchParams.get("page"),
		pageSize: searchParams.get("pageSize"),
		search: searchParams.get("search"),
	});
	const result = await getUsersAdmin({ input });

	return NextResponse.json(result);
}

export const GET = appApiHandler({
	GET: getUsersAdminRoute,
});

// Update User
const UpdateUserAdminInputSchema = z.object({
	userId: z.string({
		required_error: "ID do usuário não informado.",
		invalid_type_error: "Tipo inválido para ID do usuário.",
	}),
	user: UserSchema.pick({
		nome: true,
		email: true,
		telefone: true,
		avatarUrl: true,
		usuario: true,
		dataNascimento: true,
	}),
});
export type TUpdateUserAdminInput = z.infer<typeof UpdateUserAdminInputSchema>;

async function updateUserAdmin({ input }: { input: TUpdateUserAdminInput }) {
	const { userId, user } = input;
	const updatedUser = await db.update(users).set(user).where(eq(users.id, userId)).returning({ id: users.id });

	const updatedUserId = updatedUser[0]?.id;
	if (!updatedUserId) throw new createHttpError.NotFound("Usuário não encontrado.");

	return {
		data: { updatedId: updatedUserId },
		message: "Usuário atualizado com sucesso.",
	};
}
export type TUpdateUserAdminOutput = Awaited<ReturnType<typeof updateUserAdmin>>;

async function updateUserAdminRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateUserAdminInputSchema.parse(payload);
	const result = await updateUserAdmin({ input });

	return NextResponse.json(result);
}

export const PUT = appApiHandler({
	PUT: updateUserAdminRoute,
});

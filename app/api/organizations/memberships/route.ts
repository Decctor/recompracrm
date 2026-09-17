import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { OrganizationMemberSchema } from "@/schemas/organizations";
import { UserSchema } from "@/schemas/users";
import { db } from "@/services/drizzle";
import { authSessions, organizationMembers, users } from "@/services/drizzle/schema";
import { and, count, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// GET - Fetch all user memberships
async function getUserMemberships(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const memberships = await db.query.organizationMembers.findMany({
		where: (fields, { eq }) => eq(fields.usuarioId, session.user.id),
		with: {
			organizacao: true,
		},
		orderBy: (fields, { desc }) => desc(fields.dataInsercao),
	});

	return NextResponse.json({
		data: {
			memberships: memberships.map((m) => ({
				id: m.id,
				organizacao: {
					id: m.organizacao.id,
					nome: m.organizacao.nome,
					cnpj: m.organizacao.cnpj,
					logoUrl: m.organizacao.logoUrl,
				},
				permissoes: m.permissoes,
				dataInsercao: m.dataInsercao,
			})),
			activeOrganizationId: session.session.organizacaoAtivaId,
		},
	});
}

export type TGetUserMembershipsOutput = {
	data: {
		memberships: Array<{
			id: string;
			organizacao: {
				id: string;
				nome: string;
				cnpj: string;
				logoUrl: string | null;
			};
			permissoes: unknown;
			dataInsercao: Date;
		}>;
		activeOrganizationId: string | null;
	};
};

// PUT - Switch active organization
const UpdateOrganizationMembershipInputSchema = z.object({
	id: z.string({
		required_error: "ID do usuário não informado.",
		invalid_type_error: "Tipo inválido para ID do usuário.",
	}),
	user: UserSchema.omit({ nome: true, telefone: true, email: true, dataInsercao: true, admin: true }),
	membership: OrganizationMemberSchema.omit({ organizacaoId: true, usuarioId: true, dataInsercao: true }),
});

export type TUpdateOrganizationMembershipInput = z.infer<typeof UpdateOrganizationMembershipInputSchema>;

async function updateOrganizationMembership({ input, session }: { input: TUpdateOrganizationMembershipInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const sessionUserHasPermission = session.membership?.permissoes.usuarios.editar;
	if (!sessionUserHasPermission) throw new createHttpError.BadRequest("Você não possui permissão para acessar esse recurso.");

	// Checking if the user to update has a membership
	const userToUpdateMembership = await db.query.organizationMembers.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.usuarioId, input.id), eq(fields.organizacaoId, userOrgId)),
	});
	if (!userToUpdateMembership) throw new createHttpError.NotFound("Membro da organização não encontrado.");

	// Now, updating the user
	const updatedUser = await db
		.update(users)
		.set({
			...input.user,
		})
		.where(and(eq(users.id, input.id)))
		.returning({
			id: users.id,
		});
	const updatedUserId = updatedUser[0]?.id;
	if (!updatedUserId) throw new createHttpError.NotFound("Usuário não encontrado.");

	// Now, updating the membership
	await db
		.update(organizationMembers)
		.set({
			...input.membership,
		})
		.where(and(eq(organizationMembers.usuarioId, input.id), eq(organizationMembers.organizacaoId, userOrgId)));
	return {
		data: {
			updatedId: updatedUserId,
			updatedMembershipId: userToUpdateMembership.id,
		},
		message: "Usuário atualizado com sucesso.",
	};
}

export type TUpdateOrganizationMembershipOutput = Awaited<ReturnType<typeof updateOrganizationMembership>>;

async function updateOrganizationMembershipRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const payload = await request.json();
	const input = UpdateOrganizationMembershipInputSchema.parse(payload);

	const result = await updateOrganizationMembership({ input, session });

	return NextResponse.json(result);
}

export const GET = appApiHandler({
	GET: getUserMemberships,
});

export const PUT = appApiHandler({
	PUT: updateOrganizationMembershipRoute,
});

const DeleteOrganizationMembershipInputSchema = z.object({
	id: z.string({
		required_error: "ID do usuário não informado.",
		invalid_type_error: "Tipo inválido para ID do usuário.",
	}),
});

export type TDeleteOrganizationMembershipInput = z.infer<typeof DeleteOrganizationMembershipInputSchema>;

async function deleteOrganizationMembership({ input, session }: { input: TDeleteOrganizationMembershipInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const sessionUserHasPermission = session.membership?.permissoes.usuarios.excluir;
	if (!sessionUserHasPermission) throw new createHttpError.Forbidden("Você não possui permissão para remover membros.");

	if (input.id === session.user.id) {
		throw new createHttpError.BadRequest("Você não pode remover a si mesmo da organização.");
	}

	const userToRemoveMembership = await db.query.organizationMembers.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.usuarioId, input.id), eq(fields.organizacaoId, userOrgId)),
	});
	if (!userToRemoveMembership) throw new createHttpError.NotFound("Membro da organização não encontrado.");

	const [{ totalMembers }] = await db
		.select({ totalMembers: count() })
		.from(organizationMembers)
		.where(eq(organizationMembers.organizacaoId, userOrgId));
	if (totalMembers <= 1) {
		throw new createHttpError.BadRequest("Não é possível remover o último membro da organização.");
	}

	await db
		.delete(organizationMembers)
		.where(and(eq(organizationMembers.usuarioId, input.id), eq(organizationMembers.organizacaoId, userOrgId)));

	await db
		.update(authSessions)
		.set({ organizacaoAtivaId: null })
		.where(and(eq(authSessions.usuarioId, input.id), eq(authSessions.organizacaoAtivaId, userOrgId)));

	return {
		data: {
			removedUserId: input.id,
		},
		message: "Membro removido da organização com sucesso.",
	};
}

export type TDeleteOrganizationMembershipOutput = Awaited<ReturnType<typeof deleteOrganizationMembership>>;

async function deleteOrganizationMembershipRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const payload = await request.json();
	const input = DeleteOrganizationMembershipInputSchema.parse(payload);

	const result = await deleteOrganizationMembership({ input, session });
	return NextResponse.json(result);
}

export const DELETE = appApiHandler({
	DELETE: deleteOrganizationMembershipRoute,
});

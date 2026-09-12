import { createSession, deleteSession, deleteSessionTokenCookie, generateSessionToken, setSetSessionCookie } from "@/lib/authentication/session";
import { createEmailMatchCondition } from "@/lib/authentication/email";
import { formatAsSlug, normalizeEmail } from "@/lib/formatting";
import { db } from "@/services/drizzle";
import { organizationMembers, organizationMembershipInvitations, sellers, users } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function buildInviteErrorRedirect(request: NextRequest, message: string) {
	const url = new URL(request.url);
	url.pathname = "/auth/invites/error";
	url.search = `?message=${encodeURIComponent(message)}`;
	return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams;
	const invitationId = searchParams.get("invitationId");

	if (!invitationId || typeof invitationId !== "string") {
		return buildInviteErrorRedirect(request, "Convite inválido.");
	}

	console.log("[INFO] [INVITE ACCEPT] Invitation ID:", invitationId);
	const invitation = await db.query.organizationMembershipInvitations.findFirst({
		where: (fields, { eq }) => eq(fields.id, invitationId),
	});
	if (!invitation) {
		return buildInviteErrorRedirect(request, "Convite não encontrado.");
	}

	const now = dayjs();
	const expirationDate = dayjs(invitation.dataExpiracao);
	if (now.isAfter(expirationDate)) {
		return buildInviteErrorRedirect(request, "Convite expirado.");
	}
	if (invitation.dataEfetivacao) {
		return buildInviteErrorRedirect(request, "Convite já utilizado.");
	}

	let invitedUserId: string | null = null;
	const invitedEmail = normalizeEmail(invitation.email);
	const existingUser = await db.query.users.findFirst({
		where: (fields) => createEmailMatchCondition(fields.email, invitedEmail),
	});
	if (!existingUser) {
		const insertedUserResponse = await db
			.insert(users)
			.values({
				admin: false,
				nome: invitation.nome,
				email: invitedEmail,
				telefone: invitation.telefone ?? "",
				usuario: formatAsSlug(invitation.nome),
				senha: "",
			})
			.returning({ id: users.id });
		invitedUserId = insertedUserResponse[0]?.id ?? null;
		if (!invitedUserId) {
			return buildInviteErrorRedirect(request, "Não foi possível criar o usuário.");
		}
	} else {
		invitedUserId = existingUser.id;
	}

	console.log("[INFO] [INVITE ACCEPT] Creating membership for user ID:", invitedUserId);
	const existingMembership = await db.query.organizationMembers.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.usuarioId, invitedUserId), eq(fields.organizacaoId, invitation.organizacaoId)),
	});
	if (existingMembership) {
		return buildInviteErrorRedirect(request, "Este usuário já faz parte da organização.");
	}

	await db.insert(organizationMembers).values({
		usuarioId: invitedUserId,
		organizacaoId: invitation.organizacaoId,
		permissoes: invitation.permissoes,
	});

	await db
		.update(organizationMembershipInvitations)
		.set({ dataEfetivacao: now.toDate() })
		.where(eq(organizationMembershipInvitations.id, invitation.id));

	// Handling seller attribution
	if (invitation.vendedorAplicavel) {
		if (invitation.vendedorId) {
			await db
				.update(organizationMembers)
				.set({ usuarioVendedorId: invitation.vendedorId })
				.where(and(eq(organizationMembers.usuarioId, invitedUserId), eq(organizationMembers.organizacaoId, invitation.organizacaoId)));
		} else {
			const currentSellersCountResult = await db
				.select({ count: count(sellers.id) })
				.from(sellers)
				.where(eq(sellers.organizacaoId, invitation.organizacaoId));
			const newSellersCount = (currentSellersCountResult[0]?.count ?? 0) + 1;
			const newSellerOperatorPassword = `${newSellersCount.toString().padStart(5, "0")}`;
			await db.insert(sellers).values({
				organizacaoId: invitation.organizacaoId,
				nome: invitation.nome,
				identificador: invitation.nome,
				senhaOperador: newSellerOperatorPassword,
			});
		}
	}
	// Checking for possible permission "resultados.escopo" ajustments
	if (invitation.permissoes.resultados.escopo && invitation.permissoes.resultados.escopo.length === 0) {
		// In cases where scope was defined as an empty array, that means the user has access only to him self, so we should use his ids as the solo item

		await db
			.update(organizationMembers)
			.set({ permissoes: { ...invitation.permissoes, resultados: { ...invitation.permissoes.resultados, escopo: [invitedUserId] } } })
			.where(and(eq(organizationMembers.usuarioId, invitedUserId), eq(organizationMembers.organizacaoId, invitation.organizacaoId)));
	}
	await deleteSessionTokenCookie();
	const sessionToken = await generateSessionToken();
	const session = await createSession({
		token: sessionToken,
		userId: invitedUserId,
	});
	try {
		setSetSessionCookie({
			token: sessionToken,
			expiresAt: session.dataExpiracao,
		});
	} catch (error) {
		console.log("[ERROR] [INVITE ACCEPT] Error setting session cookie", error);
		return buildInviteErrorRedirect(request, "Não foi possível iniciar a sessão.");
	}

	return redirect("/dashboard");
}

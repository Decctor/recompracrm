import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { sendOrganizationInvite } from "@/lib/organizations/invite-delivery";
import { ORGANIZATION_INVITE_EXPIRES_IN_HOURS } from "@/lib/organizations/invite-template";
import { OrganizationMembershipInvitationSchema } from "@/schemas/organizations";
import { db } from "@/services/drizzle";
import { organizationMembershipInvitations } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { eq, isNull } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const CreateOrganizationMembershipInvitationInputSchema = z.object({
	invitation: OrganizationMembershipInvitationSchema.omit({
		organizacaoId: true,
		autorId: true,
		dataExpiracao: true,
		dataEfetivacao: true,
	}),
});
export type TCreateOrganizationMembershipInvitationInput = z.infer<typeof CreateOrganizationMembershipInvitationInputSchema>;

async function createOrganizationMembershipInvitation({
	input,
	session,
}: {
	input: TCreateOrganizationMembershipInvitationInput;
	session: TAuthUserSession;
}) {
	const sessionUserOrg = session.membership?.organizacao.id;
	if (!sessionUserOrg) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const { invitation } = input;

	const invitationExpirationDate = dayjs().add(ORGANIZATION_INVITE_EXPIRES_IN_HOURS, "hour").toDate();
	const insertedInvitation = await db
		.insert(organizationMembershipInvitations)
		.values({
			...invitation,
			organizacaoId: sessionUserOrg,
			autorId: session.user.id,
			dataExpiracao: invitationExpirationDate,
			dataEfetivacao: null,
		})
		.returning({ id: organizationMembershipInvitations.id });

	const insertedInvitationId = insertedInvitation[0]?.id;
	if (!insertedInvitationId)
		throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar convite de membro da organização.");

	await sendOrganizationInvite({
		invitationId: insertedInvitationId,
		organizacaoId: sessionUserOrg,
		organizationName: session.membership?.organizacao.nome ?? null,
		organizationLogoUrl: session.membership?.organizacao.logoUrl ?? null,
		invitedName: invitation.nome,
		inviterName: session.user.nome,
		inviterEmail: session.user.email,
		email: invitation.email,
		phone: invitation.telefone,
	});

	return {
		data: {
			insertedId: insertedInvitationId,
		},
		message: "Convite de membro da organização criado com sucesso.",
	};
}
export type TCreateOrganizationMembershipInvitationOutput = Awaited<ReturnType<typeof createOrganizationMembershipInvitation>>;

const createOrganizationMembershipInvitationHandler = async (req: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const payload = await req.json();
	const input = CreateOrganizationMembershipInvitationInputSchema.parse(payload);
	const data = await createOrganizationMembershipInvitation({ session, input });
	return NextResponse.json(data);
};

export const POST = appApiHandler({
	POST: createOrganizationMembershipInvitationHandler,
});

const GetOrganizationMembershipInvitationsInputSchema = z.object({
	pendingOnly: z
		.string({ invalid_type_error: "Tipo não válido para o filtro de convites pendentes." })
		.optional()
		.nullable()
		.transform((val) => val === "true"),
});

export type TGetOrganizationMembershipInvitationsInput = z.infer<typeof GetOrganizationMembershipInvitationsInputSchema>;

async function getOrganizationMembershipInvitations({
	input,
	session,
}: {
	input: TGetOrganizationMembershipInvitationsInput;
	session: TAuthUserSession;
}) {
	const sessionUserOrg = session.membership?.organizacao.id;
	if (!sessionUserOrg) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const { pendingOnly } = input;

	const conditions = [eq(organizationMembershipInvitations.organizacaoId, sessionUserOrg)];
	if (pendingOnly) {
		conditions.push(isNull(organizationMembershipInvitations.dataEfetivacao));
	}
	const invitations = await db.query.organizationMembershipInvitations.findMany({
		where: (fields, { and, eq }) => and(...conditions),
	});

	return {
		data: {
			default: invitations,
		},
		message: "Convites de membro da organização encontrados com sucesso.",
	};
}
export type TGetOrganizationMembershipInvitationsOutput = Awaited<ReturnType<typeof getOrganizationMembershipInvitations>>;

const getOrganizationMembershipInvitationsHandler = async (req: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const searchParams = req.nextUrl.searchParams;
	const input = GetOrganizationMembershipInvitationsInputSchema.parse({
		pendingOnly: searchParams.get("pendingOnly"),
	});
	const data = await getOrganizationMembershipInvitations({ session, input });
	return NextResponse.json(data);
};

export const GET = appApiHandler({
	GET: getOrganizationMembershipInvitationsHandler,
});

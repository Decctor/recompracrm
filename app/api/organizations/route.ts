import {
	AppSubscriptionPlans,
	DEFAULT_ORGANIZATION_CONFIGURATION_RESOURCES,
	DEFAULT_ORGANIZATION_OWNER_PERMISSIONS,
	DEFAULT_ORGANIZATION_RFM_CONFIG,
	FREE_TRIAL_DURATION_DAYS,
} from "@/config";
import { RecompraCRMDefaultCampaigns, getOrganizationNicheByValue } from "@/config/onboarding";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { OrganizationSchema } from "@/schemas/organizations";
import { db } from "@/services/drizzle";
import {
	authSessions,
	campaignSegmentations,
	campaigns,
	cashbackPrograms,
	organizationMembers,
	organizations,
	sellers,
	users,
	utils,
} from "@/services/drizzle/schema";
import { stripe } from "@/services/stripe";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

export const CreateOrganizationInputSchema = z.object({
	organization: OrganizationSchema.omit({ dataInsercao: true, autorId: true, configuracao: true }),
	subscription: z
		.enum(["ESSENCIAL-MONTHLY", "ESSENCIAL-YEARLY", "CRESCIMENTO-MONTHLY", "CRESCIMENTO-YEARLY", "ESCALA-MONTHLY", "ESCALA-YEARLY", "FREE-TRIAL"])
		.optional()
		.nullable(),
});

export type TCreateOrganizationInputSchema = z.infer<typeof CreateOrganizationInputSchema>;

async function getOrganization({ session }: { session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, userOrgId),
		with: {
			autor: {
				columns: {
					id: true,
					nome: true,
					avatarUrl: true,
				},
			},
			membros: {
				with: {
					usuario: {
						columns: {
							id: true,
							nome: true,
							avatarUrl: true,
						},
					},
				},
			},
		},
	});
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");
	return {
		data: organization,
		message: "Organização encontrada com sucesso.",
	};
}
export type TGetOrganizationOutput = Awaited<ReturnType<typeof getOrganization>>;

async function getOrganizationRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const result = await getOrganization({ session: session });
	return NextResponse.json(result);
}
export const GET = appApiHandler({
	GET: getOrganizationRoute,
});
// This route must be called at the end of the onboarding process
async function createOrganization({ input, session }: { input: TCreateOrganizationInputSchema; session: TAuthUserSession }) {
	const { organization, subscription } = input;
	const sessionUser = session.user;

	console.log("[INFO] [CREATE_ORGANIZATION] Starting the organization onboarding conclusion process:", JSON.stringify(input, null, 2));

	// Pré-Stripe: grava apenas dados locais em uma transação curta.
	const insertedOrgId = await db.transaction(async (tx) => {
		// 1. Insert organization first
		const insertedOrganizationResponse = await tx
			.insert(organizations)
			.values({
				...organization,
				configuracao: {
					recursos: DEFAULT_ORGANIZATION_CONFIGURATION_RESOURCES,
				},
				autorId: sessionUser.id,
			})
			.returning({ id: organizations.id });

		const createdOrgId = insertedOrganizationResponse[0]?.id;
		if (!createdOrgId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar organização.");
		console.log("[INFO] [CREATE_ORGANIZATION] Organization created successfully with ID:", createdOrgId);

		// 2. Inserting the organization member
		await tx.insert(organizationMembers).values({
			usuarioId: sessionUser.id,
			organizacaoId: createdOrgId,
			permissoes: DEFAULT_ORGANIZATION_OWNER_PERMISSIONS,
		});

		// 3. Inserting org default seller
		await tx.insert(sellers).values({
			organizacaoId: createdOrgId,
			ativo: true,
			nome: sessionUser.nome,
			identificador: sessionUser.nome,
			telefone: sessionUser.telefone,
			email: sessionUser.email,
			avatarUrl: sessionUser.avatarUrl,
			senhaOperador: "00000",
		});
		// 4. Inserting org default RFM Config to avoid "blank canvas" paralysis
		await tx.insert(utils).values({
			organizacaoId: createdOrgId,
			identificador: "CONFIG_RFM",
			valor: DEFAULT_ORGANIZATION_RFM_CONFIG,
		});

		// 5. Inserting org default cashback program
		const orgNiche = organization.atuacaoNicho;
		const orgNicheData = orgNiche ? getOrganizationNicheByValue(orgNiche) : null;
		if (orgNicheData) {
			await tx.insert(cashbackPrograms).values({
				organizacaoId: createdOrgId,
				ativo: true,
				titulo: `Program de Cashback ${organization.nome}`,
				descricao: "Nosso programa de fidelidade.",
				...orgNicheData.cashbackProgramDefault,
			});
			console.log("[INFO] [CREATE_ORGANIZATION] Default cashback program created successfully.");
		}

		// 6. Inserting org default campaigns
		for (const campaign of RecompraCRMDefaultCampaigns) {
			const insertedCampaignResponse = await tx
				.insert(campaigns)
				.values({
					organizacaoId: createdOrgId,
					autorId: sessionUser.id,
					ativo: true,
					...campaign.campaign,
				})
				.returning({ id: campaigns.id });
			const insertedCampaignId = insertedCampaignResponse[0]?.id;
			if (!insertedCampaignId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar campanha.");
			await tx.insert(campaignSegmentations).values(
				campaign.campaignSegmentations.map((s) => ({
					campanhaId: insertedCampaignId,
					organizacaoId: createdOrgId,
					segmentacao: s.segmentacao,
				})),
			);
			console.log("[INFO] [CREATE_ORGANIZATION] Default campaigns created successfully.");
		}

		// Define organização ativa logo após criação local para evitar sessão órfã em falhas externas.
		await tx
			.update(authSessions)
			.set({
				organizacaoAtivaId: createdOrgId,
			})
			.where(eq(authSessions.id, session.session.id));

		return createdOrgId;
	});

	// 6. Process subscription
	if (!subscription || subscription === "FREE-TRIAL") {
		console.log("[INFO] [CREATE_ORGANIZATION] Free trial selected. Defining free trial period.");
		// FREE-TRIAL logic
		const periodoTesteInicio = new Date();
		const periodoTesteFim = new Date();
		periodoTesteFim.setDate(periodoTesteFim.getDate() + FREE_TRIAL_DURATION_DAYS);

		const freeTrialConfig = AppSubscriptionPlans.CRESCIMENTO.capabilities;
		await db.transaction(async (tx) => {
			await tx
				.update(organizations)
				.set({
					configuracao: {
						recursos: freeTrialConfig,
					},
					periodoTesteInicio,
					periodoTesteFim,
				})
				.where(eq(organizations.id, insertedOrgId));
		});

		console.log("[INFO] [CREATE_ORGANIZATION] Free trial period defined successfully.");
		return {
			data: {
				insertedId: insertedOrgId,
				redirectTo: "/dashboard",
			},
			message: "Organização criada com sucesso! Período de teste iniciado.",
		};
	}

	console.log("[INFO] [CREATE_ORGANIZATION] Paid plan selected, starting Stripe checkout processing.", {
		organizationId: insertedOrgId,
		subscription,
	});
	// Paid plans logic
	// Parse subscription format: "ESSENCIAL-MONTHLY" -> plan: "ESSENCIAL", modality: "monthly"
	const [planName, modalityName] = subscription.split("-") as [keyof typeof AppSubscriptionPlans, "MONTHLY" | "YEARLY"];
	const modality = modalityName.toLowerCase() as "monthly" | "yearly";

	const plan = AppSubscriptionPlans[planName];
	if (!plan) throw new createHttpError.BadRequest("Plano de assinatura inválido.");

	const stripePriceId = plan.pricing[modality].stripePriceId;
	if (!stripePriceId) throw new createHttpError.InternalServerError("Price ID do Stripe não configurado para este plano.");

	// Create Stripe customer
	const customerEmail = organization.email || sessionUser.email;
	if (!customerEmail) throw new createHttpError.BadRequest("Email é necessário para criar assinatura.");

	const stripeCustomer = await stripe.customers.create({
		email: customerEmail,
		name: organization.nome,
		metadata: {
			organizationId: insertedOrgId,
		},
	});
	console.log("[INFO] [CREATE_ORGANIZATION] Stripe customer created successfully with ID:", stripeCustomer.id);

	// Create checkout session
	const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
	const checkoutSession = await stripe.checkout.sessions.create({
		customer: stripeCustomer.id,
		line_items: [
			{
				price: stripePriceId,
				quantity: 1,
			},
		],
		mode: "subscription",
		success_url: `${baseUrl}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${baseUrl}/onboarding`,
		subscription_data: {
			metadata: {
				organizationId: insertedOrgId,
			},
		},
	});
	if (!checkoutSession.url) throw new createHttpError.InternalServerError("Erro ao criar sessão de checkout.");
	console.log("[INFO] [CREATE_ORGANIZATION] Stripe checkout session created successfully with URL:", checkoutSession.url);

	// Pós-Stripe: grava dados locais derivados das APIs externas em nova transação curta.
	await db.transaction(async (tx) => {
		await tx
			.update(organizations)
			.set({
				configuracao: {
					recursos: plan.capabilities,
				},
				stripeCustomerId: stripeCustomer.id,
				assinaturaPlano: planName,
			})
			.where(eq(organizations.id, insertedOrgId));
	});

	return {
		data: {
			insertedId: insertedOrgId,
			redirectTo: checkoutSession.url,
		},
		message: "Organização criada com sucesso! Redirecionando para pagamento.",
	};
}

export type TCreateOrganizationOutput = Awaited<ReturnType<typeof createOrganization>>;

async function createOrganizationRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const payload = await request.json();
	const input = CreateOrganizationInputSchema.parse(payload);

	const result = await createOrganization({ input, session: session });

	return NextResponse.json(result);
}

const UpdateOrganizationInputSchema = z.object({
	organization: OrganizationSchema.omit({
		dataInsercao: true,
		assinaturaPlano: true,
		periodoTesteFim: true,
		periodoTesteInicio: true,
		configuracao: true,
		autorId: true,
	}).partial(),
});
export type TUpdateOrganizationInput = z.infer<typeof UpdateOrganizationInputSchema>;

async function updateOrganization({ input, session }: { input: TUpdateOrganizationInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const { organization } = input;
	console.log("[INFO] [UPDATE_ORGANIZATION] Updating organization:", JSON.stringify(organization, null, 2));
	const updatedOrganization = await db
		.update(organizations)
		.set({
			...organization,
		})
		.where(eq(organizations.id, userOrgId))
		.returning({ id: organizations.id });

	const updatedOrganizationId = updatedOrganization[0]?.id;
	if (!updatedOrganizationId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao atualizar organização.");

	return {
		data: {
			updatedId: updatedOrganizationId,
		},
		message: "Organização atualizada com sucesso.",
	};
}
export type TUpdateOrganizationOutput = Awaited<ReturnType<typeof updateOrganization>>;

async function updateOrganizationRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const payload = await request.json();
	const input = UpdateOrganizationInputSchema.parse(payload);

	const result = await updateOrganization({ input, session: session });

	return NextResponse.json(result);
}
export const POST = appApiHandler({
	POST: createOrganizationRoute,
});
export const PUT = appApiHandler({
	PUT: updateOrganizationRoute,
});

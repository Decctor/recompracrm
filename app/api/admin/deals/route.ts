import { AppSubscriptionPlans, DEAL_PLAN_KEY } from "@/config";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { DEFAULT_PAGE_SIZE, pageSizeInputSchema } from "@/lib/pagination";
import {
	countDealLicencasUtilizadas,
	dealHasBlockingSubscription,
	linkOrganizationToDeal,
	syncDealSubscriptionState,
	unlinkOrganizationFromDeal,
} from "@/lib/deals";
import { ensureDealStripeCheckout, reissueDealCheckout } from "@/lib/deals/checkout";
import {
	buildDealOnboardingUrl,
	emitDealOnboardingForm,
	findActiveDealOnboardingForm,
	parseOnboardingAnswers,
	parseOnboardingStructure,
	resolveDealOnboardingSituation,
	revokeDealOnboardingForm,
} from "@/lib/deals/onboarding";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { DealSchema } from "@/schemas/deals";
import { db } from "@/services/drizzle";
import { deals, organizations } from "@/services/drizzle/schema";
import { getStripeClient, resolveStripeAccount } from "@/services/stripe";
import { count, eq, or } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Get Deals

const GetDealsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo inválido para ID do deal." }).optional().nullable(),
	page: z
		.string({ invalid_type_error: "Tipo inválido para página." })
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : 1)),
	pageSize: pageSizeInputSchema(),
	search: z.string({ invalid_type_error: "Tipo inválido para busca." }).optional().nullable(),
});
export type TGetDealsInput = z.infer<typeof GetDealsInputSchema>;

async function getDeals({ input }: { input: TGetDealsInput }) {
	if (input.id) {
		const deal = await db.query.deals.findFirst({
			where: (fields, { eq }) => eq(fields.id, input.id as string),
			with: {
				obtentor: {
					columns: { id: true, nome: true, email: true, avatarUrl: true },
				},
				autor: {
					columns: { id: true, nome: true, avatarUrl: true },
				},
				organizacoes: {
					columns: {
						id: true,
						nome: true,
						cnpj: true,
						logoUrl: true,
						stripeSubscriptionStatus: true,
						dataInsercao: true,
					},
				},
			},
		});
		if (!deal) throw new createHttpError.NotFound("Deal não encontrado.");

		// Formulário público de onboarding (no máximo um ativo). O hash do token nunca sai daqui;
		// a URL bruta só é exibida uma vez, na resposta da emissão.
		const onboardingForm = await findActiveDealOnboardingForm({ dealId: deal.id });
		const formularioOnboarding = onboardingForm
			? {
					id: onboardingForm.id,
					status: onboardingForm.status,
					situacao: resolveDealOnboardingSituation({ form: onboardingForm, deal }),
					estrutura: parseOnboardingStructure(onboardingForm.estrutura),
					respostas: onboardingForm.respostas ? parseOnboardingAnswers(onboardingForm.respostas) : null,
					dataExpiracao: onboardingForm.dataExpiracao,
					dataPreenchimento: onboardingForm.dataPreenchimento,
					dataUltimoRascunho: onboardingForm.dataUltimoRascunho,
					dataInsercao: onboardingForm.dataInsercao,
				}
			: null;

		return {
			data: {
				byId: { ...deal, formularioOnboarding },
				default: null,
			},
			message: "Deal encontrado com sucesso.",
		};
	}

	const conditions = [];
	if (input.search) {
		conditions.push(or(createSimplifiedSearchCondition(deals.nome, input.search), createSimplifiedSearchCondition(deals.emailObtentor, input.search)));
	}
	const whereCondition = conditions.length > 0 ? conditions[0] : undefined;

	const PAGE_SIZE = input.pageSize ?? DEFAULT_PAGE_SIZE;
	const skip = PAGE_SIZE * (input.page - 1);

	const dealsMatchedResult = await db
		.select({ count: count(deals.id) })
		.from(deals)
		.where(whereCondition);
	const dealsMatchedCount = dealsMatchedResult[0]?.count || 0;
	const totalPages = Math.ceil(dealsMatchedCount / PAGE_SIZE);

	const dealsResult = await db.query.deals.findMany({
		where: whereCondition,
		with: {
			obtentor: {
				columns: { id: true, nome: true, email: true, avatarUrl: true },
			},
			organizacoes: {
				columns: { id: true, nome: true, logoUrl: true },
			},
		},
		orderBy: (fields, { desc }) => desc(fields.dataInsercao),
		offset: skip,
		limit: PAGE_SIZE,
	});

	return {
		data: {
			byId: null,
			default: {
				deals: dealsResult,
				dealsMatched: dealsMatchedCount,
				totalPages,
			},
		},
		message: "Deals obtidos com sucesso.",
	};
}
export type TGetDealsOutput = Awaited<ReturnType<typeof getDeals>>;
export type TGetDealsOutputDefault = Exclude<TGetDealsOutput["data"]["default"], undefined | null>;
export type TGetDealsOutputById = Exclude<TGetDealsOutput["data"]["byId"], undefined | null>;

async function getDealsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetDealsInputSchema.parse({
		id: searchParams.get("id"),
		page: searchParams.get("page"),
		pageSize: searchParams.get("pageSize"),
		search: searchParams.get("search"),
	});
	const result = await getDeals({ input });
	return NextResponse.json(result);
}

// Create Deal

const CreateDealInputSchema = z.object({
	deal: DealSchema.omit({
		// O tier não é negociável pelo admin: o servidor grava DEAL_PLAN_KEY (separação deprecada).
		planoBase: true,
		status: true,
		stripePriceId: true,
		stripeCustomerId: true,
		stripeSubscriptionId: true,
		stripeCheckoutSessionId: true,
		stripeSubscriptionStatus: true,
		stripeSubscriptionStatusUltimaAlteracao: true,
		autorId: true,
		dataInsercao: true,
	}),
});
export type TCreateDealInput = z.infer<typeof CreateDealInputSchema>;

async function createDeal({ input, authorId }: { input: TCreateDealInput; authorId: string }) {
	const { deal: dealInput } = input;

	// Plano fixo (DEAL_PLAN_KEY) — a separação em tiers está deprecada. Valida contra a
	// configuração antes de tocar no Stripe para falhar cedo se o plano sumir do config.
	const plan = AppSubscriptionPlans[DEAL_PLAN_KEY];
	if (!plan) throw new createHttpError.InternalServerError("Plano base de assinatura não configurado.");

	// Se o obtentor não foi selecionado manualmente, tenta o match por email — caso o
	// comprador ainda não tenha conta, o claim acontece depois, na criação de organização.
	let usuarioObtentorId = dealInput.usuarioObtentorId ?? null;
	if (usuarioObtentorId) {
		const user = await db.query.users.findFirst({ where: (fields, { eq }) => eq(fields.id, usuarioObtentorId as string) });
		if (!user) throw new createHttpError.BadRequest("Usuário obtentor não encontrado.");
	} else {
		const userByEmail = await db.query.users.findFirst({
			where: (fields, { sql }) => sql`lower(${fields.email}) = lower(${dealInput.emailObtentor})`,
		});
		usuarioObtentorId = userByEmail?.id ?? null;
	}

	const [insertedDeal] = await db
		.insert(deals)
		.values({
			...dealInput,
			planoBase: DEAL_PLAN_KEY,
			usuarioObtentorId,
			status: "PENDENTE",
			autorId: authorId,
		})
		.returning();
	if (!insertedDeal) throw new createHttpError.InternalServerError("Erro ao criar deal.");

	// Stripe fora da transação: se falhar, o deal fica PENDENTE sem checkout e o link
	// pode ser (re)emitido pela ação REEMITIR_CHECKOUT sem recriar o deal.
	let checkoutUrl: string | null = null;
	try {
		const stripeResult = await ensureDealStripeCheckout(insertedDeal);
		checkoutUrl = stripeResult.checkoutUrl;
	} catch (error) {
		console.error("[ERROR] [ADMIN_DEALS] Falha ao gerar checkout do deal:", insertedDeal.id, error);
	}

	return {
		data: {
			insertedId: insertedDeal.id,
			checkoutUrl,
		},
		message: checkoutUrl
			? "Deal criado com sucesso. Envie o link de checkout ao comprador."
			: "Deal criado, mas houve uma falha ao gerar o checkout. Utilize a opção de reemitir o link.",
	};
}
export type TCreateDealOutput = Awaited<ReturnType<typeof createDeal>>;

async function createDealRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = CreateDealInputSchema.parse(payload);
	const result = await createDeal({ input, authorId: session.user.id });
	return NextResponse.json(result);
}

// Update Deal (ações administrativas)

const UpdateDealInputSchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("ATUALIZAR"),
		dealId: z.string({ required_error: "ID do deal não informado.", invalid_type_error: "Tipo inválido para ID do deal." }),
		deal: DealSchema.pick({
			nome: true,
			descricao: true,
			nomeObtentor: true,
			emailObtentor: true,
			telefoneObtentor: true,
			usuarioObtentorId: true,
		}).partial(),
	}),
	z.object({
		action: z.literal("VINCULAR_ORGANIZACAO"),
		dealId: z.string({ required_error: "ID do deal não informado.", invalid_type_error: "Tipo inválido para ID do deal." }),
		organizacaoId: z.string({
			required_error: "ID da organização não informado.",
			invalid_type_error: "Tipo inválido para ID da organização.",
		}),
	}),
	z.object({
		action: z.literal("DESVINCULAR_ORGANIZACAO"),
		dealId: z.string({ required_error: "ID do deal não informado.", invalid_type_error: "Tipo inválido para ID do deal." }),
		organizacaoId: z.string({
			required_error: "ID da organização não informado.",
			invalid_type_error: "Tipo inválido para ID da organização.",
		}),
	}),
	z.object({
		action: z.literal("REEMITIR_CHECKOUT"),
		dealId: z.string({ required_error: "ID do deal não informado.", invalid_type_error: "Tipo inválido para ID do deal." }),
	}),
	z.object({
		action: z.literal("CANCELAR"),
		dealId: z.string({ required_error: "ID do deal não informado.", invalid_type_error: "Tipo inválido para ID do deal." }),
	}),
	z.object({
		action: z.literal("EMITIR_FORMULARIO"),
		dealId: z.string({ required_error: "ID do deal não informado.", invalid_type_error: "Tipo inválido para ID do deal." }),
		dataExpiracao: z
			.string({ invalid_type_error: "Tipo inválido para a data de expiração do formulário." })
			.datetime({ message: "Data de expiração do formulário inválida." })
			.transform((val) => new Date(val))
			.optional()
			.nullable(),
	}),
	z.object({
		action: z.literal("REVOGAR_FORMULARIO"),
		dealId: z.string({ required_error: "ID do deal não informado.", invalid_type_error: "Tipo inválido para ID do deal." }),
	}),
]);
export type TUpdateDealInput = z.infer<typeof UpdateDealInputSchema>;

async function updateDeal({ input, userId }: { input: TUpdateDealInput; userId: string }) {
	const deal = await db.query.deals.findFirst({
		where: (fields, { eq }) => eq(fields.id, input.dealId),
	});
	if (!deal) throw new createHttpError.NotFound("Deal não encontrado.");

	if (input.action === "ATUALIZAR") {
		await db.update(deals).set(input.deal).where(eq(deals.id, input.dealId));
		return {
			data: { updatedId: input.dealId, checkoutUrl: null, formularioUrl: null },
			message: "Deal atualizado com sucesso.",
		};
	}

	if (input.action === "VINCULAR_ORGANIZACAO") {
		if (deal.status === "CANCELADO") throw new createHttpError.BadRequest("Não é possível vincular organizações a um deal cancelado.");

		const organization = await db.query.organizations.findFirst({
			where: (fields, { eq }) => eq(fields.id, input.organizacaoId),
			columns: { id: true, dealId: true, stripeSubscriptionStatus: true },
		});
		if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");
		if (organization.dealId === deal.id) throw new createHttpError.BadRequest("A organização já está vinculada a este deal.");
		if (organization.dealId) throw new createHttpError.BadRequest("A organização já está vinculada a outro deal.");
		if (organization.stripeSubscriptionStatus && ["active", "trialing", "past_due"].includes(organization.stripeSubscriptionStatus))
			throw new createHttpError.BadRequest("A organização possui assinatura própria ativa no Stripe. Cancele-a antes de vincular ao deal.");

		const licencasUtilizadas = await countDealLicencasUtilizadas({ dealId: deal.id });
		if (licencasUtilizadas >= deal.quantidadeLicencas)
			throw new createHttpError.BadRequest(
				`Todas as ${deal.quantidadeLicencas} licenças do deal já estão em uso. Desvincule uma organização ou negocie mais licenças.`,
			);

		await linkOrganizationToDeal({ organizationId: input.organizacaoId, deal });
		return {
			data: { updatedId: input.dealId, checkoutUrl: null, formularioUrl: null },
			message: "Organização vinculada ao deal com sucesso.",
		};
	}

	if (input.action === "DESVINCULAR_ORGANIZACAO") {
		await unlinkOrganizationFromDeal({ organizationId: input.organizacaoId, dealId: deal.id });
		return {
			data: { updatedId: input.dealId, checkoutUrl: null, formularioUrl: null },
			message: "Organização desvinculada do deal. Ela voltará ao fluxo convencional de assinatura.",
		};
	}

	if (input.action === "REEMITIR_CHECKOUT") {
		if (dealHasBlockingSubscription(deal)) throw new createHttpError.BadRequest("O deal já possui uma assinatura ativa no Stripe.");
		if (deal.status === "CANCELADO") throw new createHttpError.BadRequest("Não é possível reemitir o checkout de um deal cancelado.");

		const stripeResult = await reissueDealCheckout(deal);
		return {
			data: { updatedId: input.dealId, checkoutUrl: stripeResult.checkoutUrl, formularioUrl: null },
			message: "Novo link de checkout gerado com sucesso.",
		};
	}

	if (input.action === "EMITIR_FORMULARIO") {
		if (deal.status === "CANCELADO") throw new createHttpError.BadRequest("Não é possível emitir o formulário de um deal cancelado.");
		if (deal.status === "ATIVO") throw new createHttpError.BadRequest("O deal já está ativo — o formulário não é mais necessário.");

		const { token } = await emitDealOnboardingForm({ deal, userId, dataExpiracao: input.dataExpiracao });
		return {
			data: { updatedId: input.dealId, checkoutUrl: null, formularioUrl: buildDealOnboardingUrl(token) },
			message: "Link do formulário gerado. Copie e envie ao comprador — ele não será exibido novamente.",
		};
	}

	if (input.action === "REVOGAR_FORMULARIO") {
		await revokeDealOnboardingForm({ dealId: deal.id });
		return {
			data: { updatedId: input.dealId, checkoutUrl: null, formularioUrl: null },
			message: "Formulário revogado. O link antigo deixou de funcionar.",
		};
	}

	// CANCELAR
	const stripe = getStripeClient(resolveStripeAccount(deal.stripeConta));
	if (deal.stripeSubscriptionId && dealHasBlockingSubscription(deal)) {
		// O webhook também processará o customer.subscription.deleted, mas sincronizamos
		// localmente para resposta imediata no painel.
		await stripe.subscriptions.cancel(deal.stripeSubscriptionId);
		await syncDealSubscriptionState({ dealId: deal.id, stripeStatus: "canceled" });
	} else {
		if (deal.stripeCheckoutSessionId) {
			try {
				await stripe.checkout.sessions.expire(deal.stripeCheckoutSessionId);
			} catch (error) {
				console.warn("[WARN] [ADMIN_DEALS] Falha ao expirar checkout do deal cancelado:", deal.id, error);
			}
		}
		await db.update(deals).set({ status: "CANCELADO" }).where(eq(deals.id, deal.id));
		await db
			.update(organizations)
			.set({ stripeSubscriptionStatus: null, stripeSubscriptionStatusUltimaAlteracao: new Date() })
			.where(eq(organizations.dealId, deal.id));
	}

	return {
		data: { updatedId: input.dealId, checkoutUrl: null, formularioUrl: null },
		message: "Deal cancelado com sucesso.",
	};
}
export type TUpdateDealOutput = Awaited<ReturnType<typeof updateDeal>>;

async function updateDealRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const payload = await request.json();
	const input = UpdateDealInputSchema.parse(payload);
	const result = await updateDeal({ input, userId: session.user.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({
	GET: getDealsRoute,
});

export const POST = appApiHandler({
	POST: createDealRoute,
});

export const PUT = appApiHandler({
	PUT: updateDealRoute,
});

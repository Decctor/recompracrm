import {
	AppSubscriptionPlans,
	DEFAULT_ORGANIZATION_CONFIGURATION_DEFAULTS,
	DEFAULT_ORGANIZATION_CONFIGURATION_PREFERENCES,
	DEFAULT_ORGANIZATION_CONFIGURATION_RESOURCES,
	DEFAULT_ORGANIZATION_OWNER_PERMISSIONS,
	DEFAULT_ORGANIZATION_RFM_CONFIG,
	FREE_TRIAL_DURATION_DAYS,
} from "@/config";
import {
	buildOrganizationAccountingDefaults,
	buildOrganizationPaymentMethodDefaults,
	RecompraCRMDefaultAccountCharts,
	RecompraCRMDefaultFinancialAccounts,
	type TOnboardingAccountChartNode,
	type TOnboardingFinancialAccountNode,
} from "@/config/onboarding";
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getDealWithAvailableLicense, linkOrganizationToDeal } from "@/lib/deals";
import { getDefaultFinancialAccountConfiguration } from "@/lib/finances/financial-account-configuration";
import type { TAuthUserSession } from "@/lib/authentication/types";
import {
	OrganizationConfigurationSchema,
	OrganizationDefaultsSchema,
	OrganizationSchema,
	OrganizationSlugCreateInputSchema,
} from "@/schemas/organizations";
import { db } from "@/services/drizzle";
import {
	authSessions,
	accountsCharts,
	financialAccounts,
	organizationMembers,
	organizations,
	platformPartnerReferrals,
	sellers,
	utils,
} from "@/services/drizzle/schema";
import { getStripeClient, getStripeSalesAccount } from "@/services/stripe";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { generateOrganizationPoiQrCodes, getAppBaseUrl } from "@/lib/organizations/poi-qr-codes";
import { isValidOrganizationSlug, ORGANIZATION_SLUG_INVALID_MESSAGE } from "@/lib/organizations/slug";
import { getUniqueOrganizationSlug, isOrganizationSlugTaken } from "@/lib/organizations/slug-server";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { getActivePlatformPartnerByCode, normalizeIndicadorCodigo } from "@/lib/platform-partnerships/attribution";
import { PLATFORM_PARTNER_COOKIE_NAME } from "@/lib/platform-partnerships/constants";

export const CreateOrganizationInputSchema = z.object({
	organization: OrganizationSchema.omit({
		dataInsercao: true,
		autorId: true,
		configuracao: true,
		poiQrCodeKioskDataUrl: true,
		poiQrCodeMobileDataUrl: true,
		poiConfirmacaoValorObrigatoria: true,
		dataOnboardingConclusao: true,
	}).extend({
		// O endereço da loja é opcional no cadastro: sem um válido, o servidor gera a partir do nome.
		slug: OrganizationSlugCreateInputSchema,
	}),
	subscription: z
		.enum(["ESSENCIAL-MONTHLY", "ESSENCIAL-YEARLY", "CRESCIMENTO-MONTHLY", "CRESCIMENTO-YEARLY", "ESCALA-MONTHLY", "ESCALA-YEARLY", "FREE-TRIAL", "FREE-TRIAL-ERP"])
		.optional()
		.nullable(),
	indicadorCodigo: z.string({ invalid_type_error: "Tipo invalido para o codigo de indicacao." }).optional().nullable(),
});

export type TCreateOrganizationInputSchema = z.infer<typeof CreateOrganizationInputSchema>;

async function seedDefaultAccountCharts({
	tx,
	organizationId,
	nodes,
	parentId = null,
	accountIdsByKey,
}: {
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
	organizationId: string;
	nodes: TOnboardingAccountChartNode[];
	parentId?: string | null;
	accountIdsByKey: Map<string, string>;
}) {
	for (const node of nodes) {
		const [createdAccount] = await tx
			.insert(accountsCharts)
			.values({
				organizacaoId: organizationId,
				nome: node.nome,
				codigo: node.codigo,
				natureza: node.natureza,
				idContaPai: parentId,
			})
			.returning({ id: accountsCharts.id });

		const createdAccountId = createdAccount?.id;
		if (!createdAccountId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar plano de contas.");

		accountIdsByKey.set(node.key, createdAccountId);

		if (node.children?.length) {
			await seedDefaultAccountCharts({
				tx,
				organizationId,
				nodes: node.children,
				parentId: createdAccountId,
				accountIdsByKey,
			});
		}
	}
}

async function seedDefaultFinancialAccounts({
	tx,
	organizationId,
	nodes,
	accountIdsByKey,
	financialAccountIdsByKey,
}: {
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
	organizationId: string;
	nodes: TOnboardingFinancialAccountNode[];
	accountIdsByKey: Map<string, string>;
	financialAccountIdsByKey: Map<string, string>;
}) {
	for (const node of nodes) {
		const [createdFinancialAccount] = await tx
			.insert(financialAccounts)
			.values({
				organizacaoId: organizationId,
				nome: node.nome,
				descricao: node.descricao,
				tipo: node.tipo,
				moeda: node.moeda,
				ativo: node.ativo,
				contaContabilId: node.contaContabilKey ? (accountIdsByKey.get(node.contaContabilKey) ?? null) : null,
				saldoInicial: node.saldoInicial,
				dataSaldoInicial: new Date(),
				configuracao: getDefaultFinancialAccountConfiguration(node.tipo),
			})
			.returning({ id: financialAccounts.id });

		const createdFinancialAccountId = createdFinancialAccount?.id;
		if (!createdFinancialAccountId) {
			throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar conta financeira.");
		}

		financialAccountIdsByKey.set(node.key, createdFinancialAccountId);
	}
}

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

async function getOrganizationRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const result = await getOrganization({ session: session });
	return NextResponse.json(result);
}
export const GET = appApiHandler({
	GET: getOrganizationRoute,
});
// This route must be called at the end of the onboarding process
async function createOrganization({
	input,
	session,
	indicadorOrigem,
}: {
	input: TCreateOrganizationInputSchema;
	session: TAuthUserSession;
	indicadorOrigem?: "MANUAL" | "BACKEND_COOKIE";
}) {
	const { organization, subscription } = input;
	const sessionUser = session.user;
	const indicadorCodigo = input.indicadorCodigo ? normalizeIndicadorCodigo(input.indicadorCodigo) : null;
	const indicadorPartner = indicadorCodigo ? await getActivePlatformPartnerByCode(indicadorCodigo) : null;
	if (indicadorCodigo && !indicadorPartner) throw new createHttpError.BadRequest("Codigo de indicacao invalido.");

	console.log("[INFO] [CREATE_ORGANIZATION] Starting the organization onboarding conclusion process:", JSON.stringify(input, null, 2));

	// Endereço público da loja: usa o escolhido no onboarding como base e resolve
	// colisões com sufixo — a unicidade é garantida aqui, não no cliente.
	const organizationSlug = await getUniqueOrganizationSlug({ base: organization.slug || organization.nome });

	// Pré-Stripe: grava apenas dados locais em uma transação curta.
	const { createdOrgId: insertedOrgId, organizationDefaults } = await db.transaction(async (tx) => {
		// 1. Insert organization first
		const [createdOrgResponse] = await tx
			.insert(organizations)
			.values({
				...organization,
				slug: organizationSlug,
				configuracao: {
					recursos: DEFAULT_ORGANIZATION_CONFIGURATION_RESOURCES,
					preferencias: DEFAULT_ORGANIZATION_CONFIGURATION_PREFERENCES,
					defaults: DEFAULT_ORGANIZATION_CONFIGURATION_DEFAULTS,
				},
				// Registro de vendas do POI é config explícita (D8). Org nova nasce sem integração,
				// então o POI registra — mesmo comportamento de antes, agora como dado.
				poiConfiguracao: organization.poiConfiguracao ?? { vendas: { registroAtivo: true } },
				autorId: sessionUser.id,
			})
			.returning({ id: organizations.id });

		const createdOrgId = createdOrgResponse?.id;
		if (!createdOrgId) throw new createHttpError.InternalServerError("Oops, houve um erro desconhecido ao criar organização.");

		console.log("[INFO] [CREATE_ORGANIZATION] Organization created successfully with ID:", createdOrgId);
		const organizationPoiQrCodes = await generateOrganizationPoiQrCodes({ orgId: createdOrgId });

		await tx
			.update(organizations)
			.set({
				...organizationPoiQrCodes,
			})
			.where(eq(organizations.id, createdOrgId));

		const accountIdsByKey = new Map<string, string>();
		await seedDefaultAccountCharts({
			tx,
			organizationId: createdOrgId,
			nodes: RecompraCRMDefaultAccountCharts,
			accountIdsByKey,
		});

		const financialAccountIdsByKey = new Map<string, string>();
		await seedDefaultFinancialAccounts({
			tx,
			organizationId: createdOrgId,
			nodes: RecompraCRMDefaultFinancialAccounts,
			accountIdsByKey,
			financialAccountIdsByKey,
		});

		const organizationDefaults = {
			contabilidade: buildOrganizationAccountingDefaults(accountIdsByKey),
			pagamentos: buildOrganizationPaymentMethodDefaults(financialAccountIdsByKey),
		};
		await tx
			.update(organizations)
			.set({
				configuracao: {
					recursos: DEFAULT_ORGANIZATION_CONFIGURATION_RESOURCES,
					preferencias: DEFAULT_ORGANIZATION_CONFIGURATION_PREFERENCES,
					defaults: organizationDefaults,
				},
			})
			.where(eq(organizations.id, createdOrgId));

		// 2. Inserting the organization member
		await tx.insert(organizationMembers).values({
			usuarioId: sessionUser.id,
			organizacaoId: createdOrgId,
			permissoes: DEFAULT_ORGANIZATION_OWNER_PERMISSIONS,
		});

		if (indicadorPartner && indicadorCodigo) {
			await tx.insert(platformPartnerReferrals).values({
				partnerId: indicadorPartner.id,
				organizacaoId: createdOrgId,
				usuarioId: sessionUser.id,
				codigoUsado: indicadorCodigo,
				origem: indicadorOrigem ?? "MANUAL",
				status: "ORGANIZACAO_CRIADA",
				dataCaptura: null,
				metadata: {
					source: "ORGANIZATION_ONBOARDING",
				},
			});
		}

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

		// The default cashback program and campaigns are no longer seeded here — they are
		// configured explicitly by the dedicated onboarding stages (cashback-config and
		// campaigns-config), which also seed the per-org message templates the campaigns reference.

		// Define organização ativa logo após criação local para evitar sessão órfã em falhas externas.
		await tx
			.update(authSessions)
			.set({
				organizacaoAtivaId: createdOrgId,
			})
			.where(eq(authSessions.id, session.session.id));

		return {
			createdOrgId,
			organizationDefaults,
		};
	});

	// 6. Process subscription
	// Deal (multi-licença): se o usuário é obtentor de um deal ATIVO com licença disponível,
	// a organização nasce vinculada ao deal — sem trial e sem checkout próprio. O claim por
	// email (deals criados antes do comprador ter conta) acontece dentro desta checagem.
	const availableDealLicense = await getDealWithAvailableLicense({ userId: sessionUser.id, email: sessionUser.email });

	try {
		await captureServerEvent({
			distinctId: sessionUser.id,
			event: "onboarding_organization_created",
			properties: {
				organization_id: insertedOrgId,
				subscription: availableDealLicense ? `DEAL-${availableDealLicense.deal.planoBase}` : (subscription ?? "FREE-TRIAL"),
			},
		});
	} catch (error) {
		console.error("[WARN] [CREATE_ORGANIZATION] Falha ao capturar evento onboarding_organization_created:", error);
	}

	if (availableDealLicense) {
		const { deal, licencasUtilizadas } = availableDealLicense;
		console.log("[INFO] [CREATE_ORGANIZATION] Deal license available. Linking organization to deal.", {
			organizationId: insertedOrgId,
			dealId: deal.id,
			licencasUtilizadas,
			quantidadeLicencas: deal.quantidadeLicencas,
		});
		await linkOrganizationToDeal({ organizationId: insertedOrgId, deal });

		return {
			data: {
				insertedId: insertedOrgId,
				redirectTo: "/dashboard",
			},
			message: `Organização criada com sucesso! Licença ${licencasUtilizadas + 1} de ${deal.quantidadeLicencas} do seu plano utilizada.`,
		};
	}

	if (!subscription || subscription === "FREE-TRIAL" || subscription === "FREE-TRIAL-ERP") {
		console.log("[INFO] [CREATE_ORGANIZATION] Free trial selected. Defining free trial period.");
		// FREE-TRIAL logic
		const periodoTesteInicio = new Date();
		const periodoTesteFim = new Date();
		periodoTesteFim.setDate(periodoTesteFim.getDate() + FREE_TRIAL_DURATION_DAYS);

		const trialPlan = subscription === "FREE-TRIAL-ERP" ? "ESCALA" : "CRESCIMENTO";
		const freeTrialConfig = AppSubscriptionPlans[trialPlan].capabilities;
		await db.transaction(async (tx) => {
			await tx
				.update(organizations)
				.set({
					configuracao: {
						recursos: freeTrialConfig,
						preferencias: {
							...DEFAULT_ORGANIZATION_CONFIGURATION_PREFERENCES,
							rastreamentoEstoque: freeTrialConfig.erp.acesso === true,
						},
						defaults: organizationDefaults,
					},
					periodoTesteInicio,
					periodoTesteFim,
					assinaturaPlano: trialPlan,
				})
				.where(eq(organizations.id, insertedOrgId));
		});

		console.log("[INFO] [CREATE_ORGANIZATION] Free trial period defined successfully.");

		// Founder notification, owner welcome message and the `onboarding_completed` event are
		// fired by the onboarding completion endpoint (POST /api/organizations/onboarding), not here —
		// the org is created at stage 1 but the onboarding is only "done" once the user concludes it.

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

	const salesAccount = getStripeSalesAccount();
	const stripe = getStripeClient(salesAccount);
	const stripeCustomer = await stripe.customers.create({
		email: customerEmail,
		name: organization.nome,
		metadata: {
			organizationId: insertedOrgId,
			indicadorCodigo: indicadorCodigo ?? "",
		},
	});
	console.log("[INFO] [CREATE_ORGANIZATION] Stripe customer created successfully with ID:", stripeCustomer.id);

	// Create checkout session
	const baseUrl = getAppBaseUrl();
	const checkoutSession = await stripe.checkout.sessions.create({
		customer: stripeCustomer.id,
		line_items: [
			{
				price: stripePriceId,
				quantity: 1,
			},
		],
		mode: "subscription",
		allow_promotion_codes: true,
		success_url: `${baseUrl}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${baseUrl}/onboarding`,
		subscription_data: {
			metadata: {
				organizationId: insertedOrgId,
				indicadorCodigo: indicadorCodigo ?? "",
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
					preferencias: {
						...DEFAULT_ORGANIZATION_CONFIGURATION_PREFERENCES,
						rastreamentoEstoque: plan.capabilities.erp.acesso === true,
					},
					defaults: organizationDefaults,
				},
				stripeCustomerId: stripeCustomer.id,
				stripeConta: salesAccount,
				assinaturaPlano: planName,
			})
			.where(eq(organizations.id, insertedOrgId));
	});

	// Founder notification, owner welcome message and the onboarding completion event are fired by
	// POST /api/organizations/onboarding once the user concludes the flow, not at org creation.

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
	const rawIndicadorCodigo = typeof payload?.indicadorCodigo === "string" && payload.indicadorCodigo.trim() ? payload.indicadorCodigo : null;
	const cookieIndicadorCodigo = request.cookies.get(PLATFORM_PARTNER_COOKIE_NAME)?.value ?? null;
	const indicadorCodigo = rawIndicadorCodigo ?? cookieIndicadorCodigo;
	const indicadorOrigem = rawIndicadorCodigo ? "MANUAL" : cookieIndicadorCodigo ? "BACKEND_COOKIE" : undefined;
	const input = CreateOrganizationInputSchema.parse({
		...payload,
		indicadorCodigo,
	});

	const result = await createOrganization({ input, session: session, indicadorOrigem });

	return NextResponse.json(result);
}

const UpdateOrganizationConfigSchema = z
	.object({
		preferencias: OrganizationConfigurationSchema.shape.preferencias.partial().optional(),
		defaults: OrganizationDefaultsSchema.partial().optional(),
	})
	.optional();

const UpdateOrganizationInputSchema = z.object({
	// Opcional: uma seção de configurações que só edita `configuracao` não tem por que enviar um
	// objeto vazio de campos raiz só para satisfazer o schema.
	organization: OrganizationSchema.omit({
		dataInsercao: true,
		assinaturaPlano: true,
		periodoTesteFim: true,
		periodoTesteInicio: true,
		configuracao: true,
		autorId: true,
		poiQrCodeKioskDataUrl: true,
		poiQrCodeMobileDataUrl: true,
		dataOnboardingConclusao: true,
	})
		.partial()
		.optional(),
	configuracao: UpdateOrganizationConfigSchema,
});
export type TUpdateOrganizationInput = z.infer<typeof UpdateOrganizationInputSchema>;

async function updateOrganization({ input, session }: { input: TUpdateOrganizationInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const { organization, configuracao } = input;
	console.log("[INFO] [UPDATE_ORGANIZATION] Updating organization:", JSON.stringify(organization, null, 2));

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let updatePayload: Record<string, any> = { ...organization };

	// Endereço da loja: normaliza, valida (formato + reservados) e garante unicidade.
	// `null` não limpa o slug — remover o endereço não é uma operação suportada aqui.
	if (organization?.slug === null) {
		delete updatePayload.slug;
	} else if (typeof organization?.slug === "string") {
		const normalizedSlug = organization.slug.trim().toLowerCase();
		if (!isValidOrganizationSlug(normalizedSlug)) throw new createHttpError.BadRequest(ORGANIZATION_SLUG_INVALID_MESSAGE);
		if (await isOrganizationSlugTaken({ slug: normalizedSlug, excludeOrgId: userOrgId })) {
			throw new createHttpError.Conflict("Este endereço já está em uso por outra organização.");
		}
		updatePayload.slug = normalizedSlug;
	}

	if (configuracao) {
		const currentOrg = await db.query.organizations.findFirst({
			where: eq(organizations.id, userOrgId),
			columns: { configuracao: true },
		});
		if (!currentOrg) throw new createHttpError.NotFound("Organização não encontrada.");

		const currentConfig = currentOrg.configuracao;
		const mergedConfig = {
			...currentConfig,
			preferencias: configuracao.preferencias ? { ...currentConfig.preferencias, ...configuracao.preferencias } : currentConfig.preferencias,
			defaults: configuracao.defaults
				? {
						contabilidade: configuracao.defaults.contabilidade
							? { ...currentConfig.defaults.contabilidade, ...configuracao.defaults.contabilidade }
							: currentConfig.defaults.contabilidade,
						pagamentos: configuracao.defaults.pagamentos
							? { ...currentConfig.defaults.pagamentos, ...configuracao.defaults.pagamentos }
							: currentConfig.defaults.pagamentos,
					}
				: currentConfig.defaults,
		};
		updatePayload = { ...updatePayload, configuracao: mergedConfig };
	}

	// Sem nada para gravar o UPDATE sairia sem SET e estouraria no driver.
	if (Object.keys(updatePayload).length === 0) throw new createHttpError.BadRequest("Nenhum dado informado para atualizar a organização.");

	const updatedOrganization = await db
		.update(organizations)
		.set(updatePayload)
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

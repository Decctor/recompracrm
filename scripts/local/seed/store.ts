import {
	DEFAULT_ORGANIZATION_CONFIGURATION_PREFERENCES,
	DEFAULT_ORGANIZATION_OWNER_PERMISSIONS,
	DEFAULT_ORGANIZATION_RFM_CONFIG,
	FREE_TRIAL_ADDONS,
	FREE_TRIAL_DURATION_DAYS,
	type TSubscriptionAddonKey,
	type TSubscriptionBasePlanKey,
} from "@/config";
import {
	RecompraCRMDefaultAccountCharts,
	RecompraCRMDefaultFinancialAccounts,
	type TOnboardingAccountChartNode,
	buildOrganizationAccountingDefaults,
	buildOrganizationPaymentMethodDefaults,
} from "@/config/onboarding";
import { getDefaultFinancialAccountConfiguration } from "@/lib/finances/financial-account-configuration";
import { resolveSubscriptionEntitlements } from "@/lib/subscriptions/entitlements";
import type { TOrganizationConfiguration, TOrganizationMemberPermissions } from "@/schemas/organizations";
import { type DBTransaction, db } from "@/services/drizzle";
import { accountsCharts, financialAccounts, organizationMembers, organizations, sellers, users, utils } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { eq } from "drizzle-orm";

type TSeedUser = { id: string; email: string; nome: string };

export async function createSeedUser({ user, telefone }: { user: TSeedUser; telefone: string }) {
	await db.insert(users).values({
		id: user.id,
		nome: user.nome,
		email: user.email,
		telefone,
		usuario: user.email,
		// Password login is not part of local mode: sessions come from `npm run local:login`.
		senha: "local-dev-no-password",
	});
}

async function insertAccountCharts({
	tx,
	organizationId,
	nodes,
	parentId,
	accountIdsByKey,
}: {
	tx: DBTransaction;
	organizationId: string;
	nodes: TOnboardingAccountChartNode[];
	parentId: string | null;
	accountIdsByKey: Map<string, string>;
}) {
	for (const node of nodes) {
		const id = `${organizationId}-chart-${node.key}`;
		await tx
			.insert(accountsCharts)
			.values({ id, organizacaoId: organizationId, nome: node.nome, codigo: node.codigo, natureza: node.natureza, idContaPai: parentId });
		accountIdsByKey.set(node.key, id);
		if (node.children?.length) await insertAccountCharts({ tx, organizationId, nodes: node.children, parentId: id, accountIdsByKey });
	}
}

/** Every permission of the owner set to `false`, so a restricted profile lists only what it can do. */
export function buildRestrictedPermissions(allowed: {
	[Section in keyof TOrganizationMemberPermissions]?: Partial<TOrganizationMemberPermissions[Section]>;
}): TOrganizationMemberPermissions {
	const permissions = structuredClone(DEFAULT_ORGANIZATION_OWNER_PERMISSIONS) as Record<string, Record<string, unknown>>;
	for (const [section, flags] of Object.entries(permissions)) {
		for (const flag of Object.keys(flags)) {
			if (typeof flags[flag] === "boolean") flags[flag] = false;
		}
		Object.assign(flags, (allowed as Record<string, Record<string, unknown>>)[section] ?? {});
	}
	return permissions as unknown as TOrganizationMemberPermissions;
}

type TCreateSeedStoreInput = {
	store: { id: string; slug: string; nome: string };
	owner: TSeedUser;
	ownerSellerId: string;
	basePlan: TSubscriptionBasePlanKey;
	/** `PAGANTE`: active Stripe subscription state (no Stripe call is ever made). `TESTE`: a running free trial. */
	subscription: "PAGANTE" | "TESTE";
	addons?: TSubscriptionAddonKey[];
	preferencias?: Partial<TOrganizationConfiguration["preferencias"]>;
	cnpj: string;
};

/**
 * A store the way `POST /api/organizations` leaves it — default chart of accounts, financial
 * accounts, accounting and payment defaults, owner membership, owner seller, RFM config — plus the
 * subscription state, with onboarding concluded so the dashboard opens.
 *
 * It mirrors `createOrganization` (app/api/organizations/route.ts) instead of calling it because
 * that function is private to the route and needs a browser session. Everything that carries a
 * rule comes from the same config builders the route uses.
 */
export async function createSeedStore({ store, owner, ownerSellerId, basePlan, subscription, addons, preferencias, cnpj }: TCreateSeedStoreInput) {
	const now = new Date();
	const storeAddons = addons ?? (subscription === "TESTE" ? FREE_TRIAL_ADDONS : []);
	const recursos = resolveSubscriptionEntitlements({ basePlan, addons: storeAddons });

	return db.transaction(async (tx) => {
		const accountIdsByKey = new Map<string, string>();
		const financialAccountIdsByKey = new Map<string, string>();

		await tx.insert(organizations).values({
			id: store.id,
			nome: store.nome,
			slug: store.slug,
			cnpj,
			telefone: "(34) 3333-0000",
			email: owner.email,
			localizacaoCep: "38300-000",
			localizacaoEstado: "MG",
			localizacaoCidade: "ITUIUTABA",
			localizacaoBairro: "CENTRO",
			localizacaoLogradouro: "RUA VINTE",
			localizacaoNumero: "100",
			atuacaoNicho: "Alimentação",
			corPrimaria: "#15599a",
			corPrimariaForeground: "#ffffff",
			dataOnboardingConclusao: now,
			assinaturaPlano: basePlan,
			assinaturaAdicionais: storeAddons,
			...(subscription === "PAGANTE"
				? {
						stripeConta: "RECOMPRACRM" as const,
						stripeCustomerId: `cus_local_${store.slug}`,
						stripeSubscriptionId: `sub_local_${store.slug}`,
						stripeSubscriptionStatus: "active",
						stripeSubscriptionStatusUltimaAlteracao: now,
						assinaturaPeriodoPagoFim: dayjs(now).add(10, "year").toDate(),
					}
				: {
						periodoTesteInicio: now,
						periodoTesteFim: dayjs(now).add(FREE_TRIAL_DURATION_DAYS, "day").toDate(),
					}),
			poiConfiguracao: { vendas: { registroAtivo: true } },
			configuracao: { recursos, preferencias: DEFAULT_ORGANIZATION_CONFIGURATION_PREFERENCES, defaults: { contabilidade: {}, pagamentos: {} } } as never,
			autorId: owner.id,
		});

		await insertAccountCharts({ tx, organizationId: store.id, nodes: RecompraCRMDefaultAccountCharts, parentId: null, accountIdsByKey });
		for (const node of RecompraCRMDefaultFinancialAccounts) {
			const id = `${store.id}-account-${node.key}`;
			await tx.insert(financialAccounts).values({
				id,
				organizacaoId: store.id,
				nome: node.nome,
				descricao: node.descricao,
				tipo: node.tipo,
				moeda: node.moeda,
				ativo: node.ativo,
				contaContabilId: node.contaContabilKey ? (accountIdsByKey.get(node.contaContabilKey) ?? null) : null,
				saldoInicial: node.saldoInicial,
				dataSaldoInicial: now,
				configuracao: getDefaultFinancialAccountConfiguration(node.tipo),
			});
			financialAccountIdsByKey.set(node.key, id);
		}

		const configuracao: TOrganizationConfiguration = {
			recursos,
			preferencias: {
				...DEFAULT_ORGANIZATION_CONFIGURATION_PREFERENCES,
				rastreamentoEstoque: recursos.erp.acesso === true,
				...preferencias,
			},
			defaults: {
				contabilidade: buildOrganizationAccountingDefaults(accountIdsByKey),
				pagamentos: buildOrganizationPaymentMethodDefaults(financialAccountIdsByKey),
			},
		};
		await tx.update(organizations).set({ configuracao }).where(eq(organizations.id, store.id));

		await tx.insert(sellers).values({
			id: ownerSellerId,
			organizacaoId: store.id,
			ativo: true,
			nome: owner.nome,
			identificador: owner.nome,
			email: owner.email,
			senhaOperador: "00000",
		});
		await tx.insert(organizationMembers).values({
			id: `${store.id}-member-${owner.id}`,
			usuarioId: owner.id,
			organizacaoId: store.id,
			usuarioVendedorId: ownerSellerId,
			permissoes: DEFAULT_ORGANIZATION_OWNER_PERMISSIONS,
		});
		await tx.insert(utils).values({ organizacaoId: store.id, identificador: "CONFIG_RFM", valor: DEFAULT_ORGANIZATION_RFM_CONFIG });

		return { configuracao, financialAccountIdsByKey, accountIdsByKey };
	});
}

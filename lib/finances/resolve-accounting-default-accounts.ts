import {
	getDefaultAccountChartCodeByKey,
	RecompraCRMDefaultAccountCharts,
	RecompraCRMDefaultAccountingDefaults,
	type TOnboardingAccountChartNode,
} from "@/config/onboarding";
import type { TOrganizationDefaults } from "@/schemas/organizations";
import type { DBTransaction } from "@/services/drizzle";
import { accountsCharts } from "@/services/drizzle/schema";
import createHttpError from "http-errors";

// `patrimonio` tem contas próprias (imobilizado, depreciação, CIAP), não um par débito/crédito: lib/fixed-assets/accounts.ts.
export type TAccountingEntryDefaultsKind = Exclude<keyof typeof RecompraCRMDefaultAccountingDefaults.lancamentosPadrao, "patrimonio">;

type TAccountingEntryDefaultsBlock = TOrganizationDefaults["contabilidade"]["lancamentosPadrao"]["vendas"];

const KIND_LABELS: Record<TAccountingEntryDefaultsKind, string> = {
	vendas: "vendas",
	compras: "compras",
	transferencias: "transferências",
	perdasEstoque: "perdas de estoque",
	taxasCanal: "taxas de canal",
};

/**
 * Núcleo puro da resolução: prefere os IDs gravados na configuração e, para organizações
 * onboardadas antes das chaves serem semeadas, resolve pela chave → código no plano de contas da
 * organização (`accountIdByCode`). IDs não resolvidos voltam `null` junto da chave do seed que
 * permitiria provisionar a conta ausente.
 */
export function resolveAccountingDefaultAccountIdsAgainstChart({
	defaults,
	kind,
	accountIdByCode,
}: {
	defaults: TAccountingEntryDefaultsBlock | undefined;
	kind: TAccountingEntryDefaultsKind;
	accountIdByCode: Map<string, string>;
}): { debitAccountId: string | null; creditAccountId: string | null; debitKey: string; creditKey: string } {
	const seedDefaults = RecompraCRMDefaultAccountingDefaults.lancamentosPadrao[kind];
	const debitKey = defaults?.debitoContaKey ?? seedDefaults.debitoKey;
	const creditKey = defaults?.creditoContaKey ?? seedDefaults.creditoKey;

	let debitAccountId = defaults?.debitoContaId ?? null;
	let creditAccountId = defaults?.creditoContaId ?? null;

	if (!debitAccountId) {
		const debitCode = getDefaultAccountChartCodeByKey(debitKey);
		debitAccountId = (debitCode ? accountIdByCode.get(debitCode) : null) ?? null;
	}
	if (!creditAccountId) {
		const creditCode = getDefaultAccountChartCodeByKey(creditKey);
		creditAccountId = (creditCode ? accountIdByCode.get(creditCode) : null) ?? null;
	}

	return { debitAccountId, creditAccountId, debitKey, creditKey };
}

function findSeedNodeWithParent(
	key: string,
	nodes: TOnboardingAccountChartNode[] = RecompraCRMDefaultAccountCharts,
	parent: TOnboardingAccountChartNode | null = null,
): { node: TOnboardingAccountChartNode; parent: TOnboardingAccountChartNode | null } | null {
	for (const node of nodes) {
		if (node.key === key) return { node, parent };
		const foundInChildren = node.children ? findSeedNodeWithParent(key, node.children, node) : null;
		if (foundInChildren) return foundInChildren;
	}
	return null;
}

/**
 * Cria no plano da organização a conta do seed identificada pela `key`, pendurada na conta pai do
 * seed quando ela existir no plano da organização. Chamar somente após confirmar (na mesma
 * transação) que não existe conta com o código do seed.
 */
export async function provisionSeedAccountChart({ trx, orgId, key }: { trx: DBTransaction; orgId: string; key: string }): Promise<string | null> {
	const seed = findSeedNodeWithParent(key);
	if (!seed) return null;

	let parentId: string | null = null;
	if (seed.parent) {
		const parentAccount = await trx.query.accountsCharts.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, orgId), eq(fields.codigo, seed.parent?.codigo ?? "")),
			columns: { id: true },
		});
		parentId = parentAccount?.id ?? null;
	}

	const [inserted] = await trx
		.insert(accountsCharts)
		.values({
			organizacaoId: orgId,
			nome: seed.node.nome,
			codigo: seed.node.codigo,
			natureza: seed.node.natureza,
			idContaPai: parentId,
		})
		.returning({ id: accountsCharts.id });

	return inserted?.id ?? null;
}

/**
 * Resolve as contas contábeis de débito/crédito para lançamentos automáticos de um tipo
 * (`vendas`, `compras`, `transferencias`, `perdasEstoque`) a partir dos padrões da organização.
 *
 * Com `autoProvisionFromSeed`, contas do seed ausentes no plano da organização são criadas na hora
 * (organizações antigas não têm contas semeadas depois do seu onboarding) — usado por fluxos
 * operacionais que não podem falhar por configuração contábil ausente, como o descarte de lotes.
 */
export async function resolveAccountingDefaultAccountIds({
	trx,
	orgId,
	kind,
	autoProvisionFromSeed = false,
}: {
	trx: DBTransaction;
	orgId: string;
	kind: TAccountingEntryDefaultsKind;
	autoProvisionFromSeed?: boolean;
}): Promise<{ debitAccountId: string; creditAccountId: string }> {
	const organization = await trx.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
		columns: { configuracao: true },
	});
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	// Configs persistidas antes do bloco existir não passaram pelo default do Zod — pode vir undefined.
	const defaults = organization.configuracao.defaults.contabilidade.lancamentosPadrao[kind] as TAccountingEntryDefaultsBlock | undefined;

	const needsChartLookup = !defaults?.debitoContaId || !defaults?.creditoContaId;
	const orgAccounts = needsChartLookup
		? await trx.query.accountsCharts.findMany({
				where: (fields, { and, eq, isNotNull }) => and(eq(fields.organizacaoId, orgId), isNotNull(fields.codigo)),
				columns: { id: true, codigo: true },
			})
		: [];
	const accountIdByCode = new Map(orgAccounts.filter((account) => !!account.codigo).map((account) => [account.codigo as string, account.id]));

	const resolution = resolveAccountingDefaultAccountIdsAgainstChart({ defaults, kind, accountIdByCode });
	let { debitAccountId, creditAccountId } = resolution;

	if (autoProvisionFromSeed) {
		if (!debitAccountId) debitAccountId = await provisionSeedAccountChart({ trx, orgId, key: resolution.debitKey });
		if (!creditAccountId) creditAccountId = await provisionSeedAccountChart({ trx, orgId, key: resolution.creditKey });
	}

	if (!debitAccountId || !creditAccountId)
		throw new createHttpError.BadRequest(
			`Contas contábeis padrão de ${KIND_LABELS[kind]} não configuradas. Defina-as nas configurações da organização.`,
		);

	return { debitAccountId, creditAccountId };
}

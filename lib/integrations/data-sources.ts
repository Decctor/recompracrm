import type { TDataSourceIntegrationConfig } from "@/schemas/integrations";
import type { DB, DBTransaction } from "@/services/drizzle";
import { integrations } from "@/services/drizzle/schema";
import type { TIntegrationEntity } from "@/services/drizzle/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

/**
 * Fontes de dados (ERP/marketplace) dentro de `integrations` — sucessor dos três papéis da
 * coluna deprecada `organizations.integracaoTipo`:
 *
 * (a) "existe fonte de dados ativa?" → `organizationHasActiveDataSource` (defaults de cashback e
 *     sinalização de UI; o gate do POI NÃO deriva daqui — é config explícita em
 *     `organizations.poiConfiguracao.vendas.registroAtivo`, D8);
 * (b) "de qual org é este merchant/store?" → consulta por `tipo` + `refExterno` (Nuvemshop,
 *     Cardápio Web) ou scan dos `merchantIds` das linhas IFOOD ativas (webhooks);
 * (c) "quais configs carrego?" → `getActiveDataSourceIntegrations` (cron/scripts — loop POR
 *     INTEGRAÇÃO, não por org; N conexões do mesmo tipo são suportadas, D5).
 */

export const DATA_SOURCE_INTEGRATION_TYPES = ["ONLINE-SOFTWARE", "CARDAPIO-WEB", "NUVEM-SHOP", "IFOOD", "BLING", "ERP-FLEX"] as const;
export type TDataSourceIntegrationType = (typeof DATA_SOURCE_INTEGRATION_TYPES)[number];

export type TDataSourceExecutor = DB | DBTransaction;

/** Linha de `integrations` cuja `configuracao` é garantidamente uma variante de fonte de dados. */
export type TDataSourceIntegration = Omit<TIntegrationEntity, "tipo" | "configuracao"> & {
	tipo: TDataSourceIntegrationType;
	configuracao: TDataSourceIntegrationConfig;
};

export function isDataSourceIntegrationType(tipo: string | null | undefined): tipo is TDataSourceIntegrationType {
	return !!tipo && (DATA_SOURCE_INTEGRATION_TYPES as readonly string[]).includes(tipo);
}

/**
 * Uma linha só entra no pipeline quando `tipo` é de fonte de dados e a config jsonb existe com o
 * mesmo discriminante — linha incoerente (config nula/divergente) fica de fora, como o gate
 * antigo do cron fazia por org.
 */
export function isUsableDataSourceIntegration(integration: TIntegrationEntity): integration is TDataSourceIntegration {
	return isDataSourceIntegrationType(integration.tipo) && integration.configuracao?.tipo === integration.tipo;
}

/**
 * Fontes de dados ATIVAS, opcionalmente de uma única organização. Ordenação estável por data de
 * criação para runs determinísticos do cron.
 */
export async function getActiveDataSourceIntegrations({
	executor,
	organizationId,
	types,
}: {
	executor: TDataSourceExecutor;
	organizationId?: string;
	types?: readonly TDataSourceIntegrationType[];
}): Promise<TDataSourceIntegration[]> {
	const conditions = [
		inArray(integrations.tipo, [...(types ?? DATA_SOURCE_INTEGRATION_TYPES)]),
		eq(integrations.ativo, true),
	];
	if (organizationId) conditions.push(eq(integrations.organizacaoId, organizationId));

	const rows = await executor
		.select()
		.from(integrations)
		.where(and(...conditions))
		.orderBy(integrations.dataInsercao, integrations.id);

	return rows.filter(isUsableDataSourceIntegration);
}

/**
 * Sucessor do papel (a) de `integracaoTipo`: defaults de cashback e sinalização de UI. O POI não
 * lê isto — registro de vendas do POI é `poiConfiguracao.vendas.registroAtivo` (D8).
 */
export async function organizationHasActiveDataSource({
	executor,
	organizationId,
}: {
	executor: TDataSourceExecutor;
	organizationId: string;
}): Promise<boolean> {
	const [row] = await executor
		.select({ id: integrations.id })
		.from(integrations)
		.where(
			and(
				eq(integrations.organizacaoId, organizationId),
				eq(integrations.ativo, true),
				inArray(integrations.tipo, [...DATA_SOURCE_INTEGRATION_TYPES]),
			),
		)
		.limit(1);
	return !!row;
}

/** Deriva o `refExterno` canônico de uma config de fonte de dados (§3.1 do plano). */
export function deriveDataSourceRefExterno(config: TDataSourceIntegrationConfig): string | null {
	switch (config.tipo) {
		case "NUVEM-SHOP":
			return String(config.storeId);
		case "CARDAPIO-WEB":
			return config.merchantId;
		case "ERP-FLEX":
			return config.database;
		default:
			// IFOOD (merchants ficam em configuracao.merchantIds, D3), BLING e ONLINE-SOFTWARE
			// não carregam identificador estável de conta.
			return null;
	}
}

/**
 * Guard de identidade do D5 — N conexões do mesmo tipo são permitidas; a MESMA conta externa não
 * duplica. Lança mensagem legível (Portuguese, vira resposta de API) quando a nova config colide
 * com uma linha ativa existente da organização.
 */
export async function assertDataSourceIdentityAvailable({
	executor,
	organizationId,
	config,
	ignoreIntegrationId,
}: {
	executor: TDataSourceExecutor;
	organizationId: string;
	config: TDataSourceIntegrationConfig;
	ignoreIntegrationId?: string;
}): Promise<void> {
	const activeSameType = (
		await getActiveDataSourceIntegrations({ executor, organizationId, types: [config.tipo] })
	).filter((row) => row.id !== ignoreIntegrationId);
	if (activeSameType.length === 0) return;

	const refExterno = deriveDataSourceRefExterno(config);
	if (refExterno) {
		const duplicate = activeSameType.find((row) => row.refExterno === refExterno);
		if (duplicate) throw new Error("Esta conta já está conectada nesta organização.");
	}

	if (config.tipo === "IFOOD") {
		const newMerchantIds = new Set(config.merchantIds);
		const overlapping = activeSameType.find(
			(row) => row.configuracao.tipo === "IFOOD" && row.configuracao.merchantIds.some((merchantId) => newMerchantIds.has(merchantId)),
		);
		if (overlapping) throw new Error("Uma das lojas iFood desta conta já está conectada em outra conexão desta organização.");
	}
}

function configsShareIfoodMerchants(left: TDataSourceIntegrationConfig, right: TDataSourceIntegrationConfig): boolean {
	if (left.tipo !== "IFOOD" || right.tipo !== "IFOOD") return false;
	if (!left.merchantIds.length || !right.merchantIds.length) return false;
	const rightMerchantIds = new Set(right.merchantIds);
	return left.merchantIds.some((merchantId) => rightMerchantIds.has(merchantId));
}

/**
 * Encontra a linha (ativa OU desativada) que representa a MESMA conta externa da config, quando o
 * provedor expõe identidade verificável: `refExterno` (Nuvemshop/Cardápio Web) ou interseção de
 * `merchantIds` (iFood). Tipos sem identidade (Bling, Online Software) nunca casam aqui.
 */
async function findDataSourceRowForSameExternalAccount({
	executor,
	organizationId,
	config,
}: {
	executor: TDataSourceExecutor;
	organizationId: string;
	config: TDataSourceIntegrationConfig;
}): Promise<TIntegrationEntity | null> {
	const refExterno = deriveDataSourceRefExterno(config);
	if (refExterno) {
		const [row] = await executor
			.select()
			.from(integrations)
			.where(and(eq(integrations.organizacaoId, organizationId), eq(integrations.tipo, config.tipo), eq(integrations.refExterno, refExterno)))
			.limit(1);
		return row ?? null;
	}

	if (config.tipo === "IFOOD") {
		const rows = await executor
			.select()
			.from(integrations)
			.where(and(eq(integrations.organizacaoId, organizationId), eq(integrations.tipo, "IFOOD")))
			.orderBy(desc(integrations.ativo), desc(integrations.dataInsercao));
		return (
			rows.find(
				(row): row is TIntegrationEntity =>
					row.configuracao?.tipo === "IFOOD" && configsShareIfoodMerchants(row.configuracao, config),
			) ?? null
		);
	}

	return null;
}

export type TConnectDataSourceIntegrationResult = {
	integration: TIntegrationEntity;
	/** true quando uma linha existente (mesma conta externa ou alvo explícito) foi reativada/atualizada. */
	reconnected: boolean;
};

/**
 * Conecta uma fonte de dados criando/reativando a linha em `integrations` (D5/D9):
 *
 * - `reconnectIntegrationId` explícito reativa aquela linha — validando a identidade externa
 *   quando o provedor a expõe; identidade divergente vira NOVA conexão (outra conta), preservando
 *   a linha anterior desativada.
 * - Sem alvo explícito, a MESMA conta externa (refExterno igual, ou merchants iFood em comum) é
 *   reconectada na própria linha — preservando `integrationId` e a proveniência das vendas.
 * - Caso contrário cria outra linha; N conexões ativas do mesmo tipo são permitidas e o guard de
 *   identidade impede apenas duplicar a mesma conta.
 */
export async function connectDataSourceIntegration({
	executor,
	organizationId,
	config,
	apelido,
	autorId,
	reconnectIntegrationId,
}: {
	executor: TDataSourceExecutor;
	organizationId: string;
	config: TDataSourceIntegrationConfig;
	apelido?: string | null;
	autorId?: string | null;
	reconnectIntegrationId?: string | null;
}): Promise<TConnectDataSourceIntegrationResult> {
	let target: TIntegrationEntity | null = null;

	if (reconnectIntegrationId) {
		const [explicitTarget] = await executor
			.select()
			.from(integrations)
			.where(
				and(eq(integrations.id, reconnectIntegrationId), eq(integrations.organizacaoId, organizationId), eq(integrations.tipo, config.tipo)),
			)
			.limit(1);
		if (!explicitTarget) throw new Error("Conexão anterior não encontrada para reconexão.");

		// Identidade externa divergente COMPROVADA vira nova conexão (outra conta); sem identidade
		// verificável (Bling/Online Software, iFood recém-autorizado sem merchants), o alvo
		// explícito decide.
		const refExterno = deriveDataSourceRefExterno(config);
		const identityMismatchProven =
			(refExterno && explicitTarget.refExterno && explicitTarget.refExterno !== refExterno) ||
			(config.tipo === "IFOOD" &&
				explicitTarget.configuracao?.tipo === "IFOOD" &&
				explicitTarget.configuracao.merchantIds.length > 0 &&
				config.merchantIds.length > 0 &&
				!configsShareIfoodMerchants(explicitTarget.configuracao, config));
		if (identityMismatchProven && config.tipo === "IFOOD") {
			throw new Error("A conta iFood autorizada não corresponde à conexão selecionada. Autorize a mesma conta para preservar esta conexão.");
		}
		if (!identityMismatchProven) target = explicitTarget;
	}

	if (!target) {
		target = await findDataSourceRowForSameExternalAccount({ executor, organizationId, config });
	}

	await assertDataSourceIdentityAvailable({ executor, organizationId, config, ignoreIntegrationId: target?.id });

	if (target) {
		const updatedConfig =
			config.tipo === "IFOOD" && target.configuracao?.tipo === "IFOOD"
				? { ...config, aceiteAutomaticoPedidos: target.configuracao.aceiteAutomaticoPedidos }
				: config;
		const [updated] = await executor
			.update(integrations)
			.set({
				ativo: true,
				dataDesativacao: null,
				configuracao: updatedConfig,
				refExterno: deriveDataSourceRefExterno(config),
				status: "CONECTADO",
				ultimoErro: null,
				...(apelido !== undefined ? { apelido } : {}),
			})
			.where(eq(integrations.id, target.id))
			.returning();
		return { integration: updated, reconnected: true };
	}

	const [created] = await executor
		.insert(integrations)
		.values({
			organizacaoId: organizationId,
			tipo: config.tipo,
			ativo: true,
			apelido: apelido ?? null,
			refExterno: deriveDataSourceRefExterno(config),
			configuracao: config,
			status: "CONECTADO",
			ultimoErro: null,
			autorId: autorId ?? null,
		})
		.returning();
	return { integration: created, reconnected: false };
}

/** Soft delete (D9): a linha permanece como identidade histórica da conta externa. */
export async function disconnectDataSourceIntegration({
	executor,
	organizationId,
	integrationId,
}: {
	executor: TDataSourceExecutor;
	organizationId: string;
	integrationId: string;
}): Promise<TIntegrationEntity> {
	const [updated] = await executor
		.update(integrations)
		.set({ ativo: false, dataDesativacao: new Date() })
		.where(and(eq(integrations.id, integrationId), eq(integrations.organizacaoId, organizationId)))
		.returning();
	if (!updated) throw new Error("Integração não encontrada.");
	return updated;
}

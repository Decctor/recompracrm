import { createHash, randomBytes } from "node:crypto";
import { DEFAULT_SERVICE_SETTINGS_CONFIGURATION, ServiceSettingsConfigurationSchema, type TServiceSettingsConfiguration } from "@/schemas/service-settings";
import { type DBTransaction, db } from "@/services/drizzle";
import { saleItems, sales } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

// ============================================================================
// Tokens publicos (QR de ponto e de tab). A busca publica e sempre pelo hash
// (sha256 hex). O QR da tab guarda apenas o hash (mostra consumo; o bruto aparece
// somente na abertura). O QR do ponto tambem guarda o bruto, para reimpressao.
// ============================================================================

export function generatePublicToken(): string {
	return randomBytes(32).toString("hex");
}

export function hashPublicToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

// ============================================================================
// Configuracao de atendimento (serviceSettings)
// ============================================================================

/**
 * Resolve as politicas de atendimento da organizacao. Organizacoes sem registro
 * (ou com configuracao invalida/antiga) caem no default "Balcao" — tudo desabilitado.
 */
export async function resolveServiceSettings({ orgId }: { orgId: string }): Promise<TServiceSettingsConfiguration> {
	const settings = await db.query.serviceSettings.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, orgId),
		columns: { configuracoes: true },
	});
	if (!settings) return DEFAULT_SERVICE_SETTINGS_CONFIGURATION;

	const parsed = ServiceSettingsConfigurationSchema.safeParse(settings.configuracoes);
	return parsed.success ? parsed.data : DEFAULT_SERVICE_SETTINGS_CONFIGURATION;
}

// ============================================================================
// Guardas transacionais
// ============================================================================

/**
 * Advisory lock transacional para a abertura de tab em um ponto. O partial unique de
 * `codigo` so protege comandas fisicas; no preset "Somente mesas" (codigo nulo), dois
 * operadores abrindo a mesma mesa simultaneamente criariam duas tabs sem esta guarda.
 * Mesmo padrao de lib/whatsapp/smb-contacts-sync.ts.
 */
export async function acquireTabOpeningLock(tx: DBTransaction, { orgId, servicePointId }: { orgId: string; servicePointId: string }) {
	await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tab-open:${orgId}:${servicePointId}`}))`);
}

/**
 * Recalcula os totais da venda rascunho da tab a partir dos itens nao cancelados.
 * Chamado apos lancar ou cancelar pedidos, na mesma transacao.
 */
export async function recomputeTabDraftSaleTotals(tx: DBTransaction, { saleId }: { saleId: string }) {
	const items = await tx
		.select({
			valorVendaTotalLiquido: saleItems.valorVendaTotalLiquido,
			valorTotalDesconto: saleItems.valorTotalDesconto,
			valorCustoTotal: saleItems.valorCustoTotal,
			quantidade: saleItems.quantidade,
			quantidadeCancelada: saleItems.quantidadeCancelada,
		})
		.from(saleItems)
		.where(eq(saleItems.vendaId, saleId));

	// v1 cancela itens inteiros (quantidadeCancelada === quantidade); itens cancelados saem dos totais.
	const activeItems = items.filter((item) => item.quantidadeCancelada < item.quantidade);
	const valorTotal = activeItems.reduce((sum, item) => sum + item.valorVendaTotalLiquido, 0);
	const descontosTotal = activeItems.reduce((sum, item) => sum + item.valorTotalDesconto, 0);
	const custoTotal = activeItems.reduce((sum, item) => sum + item.valorCustoTotal, 0);

	await tx
		.update(sales)
		.set({
			valorTotal,
			descontosTotal: descontosTotal > 0 ? descontosTotal : null,
			custoTotal,
		})
		.where(eq(sales.id, saleId));

	return { valorTotal, descontosTotal, custoTotal };
}

/**
 * Resolve a venda rascunho (ORCAMENTO) de uma tab, se existir.
 */
export async function findTabDraftSale(tx: DBTransaction, { tabId }: { tabId: string }) {
	const [draft] = await tx
		.select({ id: sales.id, valorTotal: sales.valorTotal, clienteId: sales.clienteId })
		.from(sales)
		.where(and(eq(sales.tabId, tabId), eq(sales.statusVenda, "ORCAMENTO")))
		.limit(1);
	return draft ?? null;
}

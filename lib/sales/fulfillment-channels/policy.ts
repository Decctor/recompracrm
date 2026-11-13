import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TSaleIntegrationMetadata } from "@/schemas/sales";

/**
 * Política de canal para vendas de integrações (fase 3 do plano iFood/fulfillment):
 * decide quais efeitos de ERP as vendas de canais gerenciados geram na plataforma.
 *
 * Cashback NÃO faz parte da política: continua governado pela configuração do programa
 * (`cashbackPrograms.acumuloPermitirViaIntegracao`), que já é o padrão vigente.
 */
export type TChannelErpPolicy = {
	fulfillment: boolean;
	estoque: boolean;
	financeiro: boolean;
	fiscal: boolean;
};

const DEFAULT_CHANNEL_ERP_POLICY: TChannelErpPolicy = {
	fulfillment: false,
	estoque: false,
	financeiro: false,
	fiscal: false,
};

/**
 * Lê a política com defaults defensivos: o jsonb de organizações antigas pode não ter o bloco
 * `integracaoERP` apesar do tipo dizer que tem (o schema Zod só aplica default em runtime de parse).
 */
export function getChannelErpPolicy(configuracao: TOrganizationConfiguration | null | undefined): TChannelErpPolicy {
	const raw = configuracao?.preferencias?.integracaoERP as Partial<TChannelErpPolicy> | undefined;
	return { ...DEFAULT_CHANNEL_ERP_POLICY, ...raw };
}

/** Modelos de venda (`sales.modelo`) cujos canais têm fulfillment gerenciável pela plataforma. */
const MANAGED_FULFILLMENT_SALE_MODELS = new Set(["IFOOD"]);

export function isManagedFulfillmentSaleModel(modelo: string | null | undefined): boolean {
	if (!modelo) return false;
	return MANAGED_FULFILLMENT_SALE_MODELS.has(modelo.toUpperCase());
}

/**
 * Canais que gravam `integracaoMetadados` só como registro da fonte (auditoria das decisões da
 * importação), sem frete, patrocínio nem pagamentos do canal a tratar. Venda deles é venda comum
 * para o fiscal e para o cupom.
 */
export const RECORD_ONLY_INTEGRATION_CHANNELS = { SQL_VIEWS: "SQL_VIEWS" } as const;
const RECORD_ONLY_INTEGRATION_CHANNEL_SET = new Set<string>(Object.values(RECORD_ONLY_INTEGRATION_CHANNELS));

/**
 * `integracaoMetadados` que carregam o tratamento de canal gerenciado. Ter a coluna preenchida
 * não basta: o fiscal desliga desconto de cabeçalho e `vOutro` e reconstrói os pagamentos para
 * venda de canal, e o cupom imprime COBRAR/PAGO_CANAL — nada disso vale para um registro da fonte.
 */
export function getManagedChannelIntegrationMetadata(metadata: TSaleIntegrationMetadata | null | undefined): TSaleIntegrationMetadata | null {
	if (!metadata || RECORD_ONLY_INTEGRATION_CHANNEL_SET.has(metadata.canal)) return null;
	return metadata;
}

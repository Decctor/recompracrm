import { SqlViewsIntegrationConfigSchema, type TSqlViewsIntegrationConfig } from "@/schemas/integrations";
import z from "zod";

export const SqlViewsConfigSchema = SqlViewsIntegrationConfigSchema;
export type TSqlViewsConfig = TSqlViewsIntegrationConfig;

/** Versões MAJOR do contrato de views que este conector entende. */
export const SQL_VIEWS_SUPPORTED_CONTRACT_MAJOR_VERSIONS = ["1"];

export const SQL_VIEWS = {
	metadata: "vw_recompra_metadados",
	sellers: "vw_recompra_vendedores",
	clients: "vw_recompra_clientes",
	products: "vw_recompra_produtos",
	sales: "vw_recompra_vendas",
	saleItems: "vw_recompra_venda_itens",
} as const;

/** Nomes genéricos que ERPs usam para venda sem cliente identificado. */
export const SQL_VIEWS_ANONYMOUS_CLIENT_NAMES = ["CLIENTE PADRAO", "CONSUMIDOR", "CONSUMIDOR FINAL", "AO CONSUMIDOR", "CLIENTE NAO IDENTIFICADO"];

const NullableTextSchema = z
	.union([z.string(), z.number()])
	.optional()
	.nullable()
	.transform((value) => {
		if (value === null || value === undefined) return null;
		const text = String(value).trim();
		return text.length > 0 ? text : null;
	});

const RequiredIdSchema = z.union([z.string(), z.number()]).transform((value) => String(value).trim());

/** `numeric` chega como string pelo driver `pg`. */
const NumericSchema = z
	.union([z.string(), z.number()])
	.optional()
	.nullable()
	.transform((value) => {
		if (value === null || value === undefined || value === "") return 0;
		const numberValue = Number(value);
		return Number.isFinite(numberValue) ? numberValue : 0;
	});

const TimestampSchema = z.date();
const NullableTimestampSchema = z.date().optional().nullable();

/** `date` chega como `YYYY-MM-DD` (o client desliga o parser que o converteria no fuso local). */
const NullableDateOnlySchema = z
	.string()
	.optional()
	.nullable()
	.transform((value) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null));

export const SqlViewsMetadataRowSchema = z.object({
	contrato_versao: NullableTextSchema,
	sistema_nome: NullableTextSchema,
	fuso_horario: NullableTextSchema,
	ultima_venda_em: NullableTimestampSchema,
	ultima_atualizacao_em: NullableTimestampSchema,
	gerado_em: NullableTimestampSchema,
});
export type TSqlViewsMetadataRow = z.infer<typeof SqlViewsMetadataRowSchema>;

export const SqlViewsSaleRowSchema = z.object({
	venda_id: RequiredIdSchema,
	venda_numero: NullableTextSchema,
	loja_id: NullableTextSchema,
	data_venda: TimestampSchema,
	data_atualizacao: NullableTimestampSchema,
	status_codigo: NullableTextSchema,
	status_original: NullableTextSchema,
	data_cancelamento: NullableTimestampSchema,
	valor_total: NumericSchema,
	cliente_id: NullableTextSchema,
	cliente_nome: NullableTextSchema,
	cliente_telefone: NullableTextSchema,
	cliente_cpf_cnpj: NullableTextSchema,
	vendedor_id: NullableTextSchema,
	vendedor_nome: NullableTextSchema,
	canal: NullableTextSchema,
	modalidade_entrega: NullableTextSchema,
	documento_fiscal_numero: NullableTextSchema,
	documento_fiscal_serie: NullableTextSchema,
	documento_fiscal_modelo: NullableTextSchema,
	documento_fiscal_chave: NullableTextSchema,
});
export type TSqlViewsSaleRow = z.infer<typeof SqlViewsSaleRowSchema>;

export const SqlViewsSaleItemRowSchema = z.object({
	item_id: NullableTextSchema,
	venda_id: RequiredIdSchema,
	produto_id: NullableTextSchema,
	produto_codigo: NullableTextSchema,
	produto_descricao: NullableTextSchema,
	quantidade: NumericSchema,
	valor_unitario: NumericSchema,
	valor_bruto: NumericSchema,
	valor_desconto: NumericSchema,
	valor_liquido: NumericSchema,
	custo_unitario: NumericSchema,
	custo_total: NumericSchema,
	sequencia: NumericSchema,
	unidade: NullableTextSchema,
});
export type TSqlViewsSaleItemRow = z.infer<typeof SqlViewsSaleItemRowSchema>;

export const SqlViewsClientRowSchema = z.object({
	cliente_id: RequiredIdSchema,
	nome: NullableTextSchema,
	nome_fantasia: NullableTextSchema,
	telefone: NullableTextSchema,
	telefone_secundario: NullableTextSchema,
	email: NullableTextSchema,
	cpf_cnpj: NullableTextSchema,
	inscricao_estadual: NullableTextSchema,
	data_nascimento: NullableDateOnlySchema,
	cep: NullableTextSchema,
	estado: NullableTextSchema,
	cidade: NullableTextSchema,
	bairro: NullableTextSchema,
	logradouro: NullableTextSchema,
	numero: NullableTextSchema,
	complemento: NullableTextSchema,
});
export type TSqlViewsClientRow = z.infer<typeof SqlViewsClientRowSchema>;

export const SqlViewsProductRowSchema = z.object({
	produto_id: RequiredIdSchema,
	codigo: NullableTextSchema,
	descricao: NullableTextSchema,
	unidade: NullableTextSchema,
	grupo: NullableTextSchema,
	tipo: NullableTextSchema,
	ncm: NullableTextSchema,
	variante_descricao: NullableTextSchema,
});
export type TSqlViewsProductRow = z.infer<typeof SqlViewsProductRowSchema>;

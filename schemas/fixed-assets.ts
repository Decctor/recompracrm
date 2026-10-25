import { z } from "zod";
import { FixedAssetStatusEnum } from "./enums";

const money = (label: string) =>
	z.number({ required_error: `${label} não informado.`, invalid_type_error: `Tipo não válido para ${label.toLowerCase()}.` });

/** Bem do ativo imobilizado (ADR-0002, decisão 8). Campos em português: viajam como dado. */
export const FixedAssetSchema = z.object({
	organizacaoId: z.string({ required_error: "ID da organização não informado.", invalid_type_error: "Tipo não válido para o ID da organização." }),
	produtoId: z.string({ invalid_type_error: "Tipo não válido para o ID do produto." }).optional().nullable(),
	produtoVarianteId: z.string({ invalid_type_error: "Tipo não válido para o ID da variante." }).optional().nullable(),
	compraId: z.string({ invalid_type_error: "Tipo não válido para o ID da compra." }).optional().nullable(),
	compraItemId: z.string({ invalid_type_error: "Tipo não válido para o ID do item de compra." }).optional().nullable(),
	codigoPatrimonio: z.string({ invalid_type_error: "Tipo não válido para o código de patrimônio." }).max(60).optional().nullable(),
	descricao: z
		.string({ required_error: "Descrição do bem não informada.", invalid_type_error: "Tipo não válido para a descrição do bem." })
		.trim()
		.min(1, "Descrição do bem não informada."),
	numeroSerie: z.string({ invalid_type_error: "Tipo não válido para o número de série." }).max(120).optional().nullable(),
	localizacao: z.string({ invalid_type_error: "Tipo não válido para a localização." }).max(255).optional().nullable(),
	responsavelId: z.string({ invalid_type_error: "Tipo não válido para o responsável." }).optional().nullable(),
	status: FixedAssetStatusEnum.default("EM_USO"),
	quantidade: z
		.number({ required_error: "Quantidade do bem não informada.", invalid_type_error: "Tipo não válido para a quantidade do bem." })
		.int("A quantidade do bem deve ser inteira.")
		.positive("A quantidade do bem deve ser maior que zero."),
	valorAquisicao: money("Valor de aquisição").nonnegative("O valor de aquisição não pode ser negativo."),
	dataInicioUso: z
		.string({ required_error: "Data de início de uso não informada.", invalid_type_error: "Tipo não válido para a data de início de uso." })
		.datetime({ message: "Tipo não válido para a data de início de uso." })
		.transform((value) => new Date(value)),
	vidaUtilMeses: z
		.number({ required_error: "Vida útil não informada.", invalid_type_error: "Tipo não válido para a vida útil." })
		.int("A vida útil deve ser em meses inteiros.")
		.positive("A vida útil deve ser maior que zero."),
	valorResidual: money("Valor residual").nonnegative("O valor residual não pode ser negativo.").default(0),
	depreciacaoAcumuladaInicial: money("Depreciação acumulada inicial").nonnegative("A depreciação acumulada inicial não pode ser negativa.").default(0),
	creditoIcmsCiap: money("Crédito de ICMS (CIAP)").nonnegative("O crédito de ICMS não pode ser negativo.").optional().nullable(),
	dataBaixa: z
		.string({ invalid_type_error: "Tipo não válido para a data de baixa." })
		.datetime({ message: "Tipo não válido para a data de baixa." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	motivoBaixa: z.string({ invalid_type_error: "Tipo não válido para o motivo da baixa." }).optional().nullable(),
	valorBaixa: money("Valor da baixa").nonnegative("O valor da baixa não pode ser negativo.").optional().nullable(),
	anotacoes: z.string({ invalid_type_error: "Tipo não válido para as anotações do bem." }).optional().nullable(),
	autorId: z.string({ invalid_type_error: "Tipo não válido para o autor." }).optional().nullable(),
	dataInsercao: z
		.string({ invalid_type_error: "Tipo não válido para a data de inserção." })
		.datetime()
		.transform((value) => new Date(value)),
	dataAtualizacao: z
		.string({ invalid_type_error: "Tipo não válido para a data de atualização." })
		.datetime()
		.transform((value) => new Date(value)),
});
export type TFixedAsset = z.infer<typeof FixedAssetSchema>;

/** Vida útil assumida quando nem o produto nem a pessoa informaram outra (móveis e utensílios, IN RFB 1700/2017). */
export const DEFAULT_FIXED_ASSET_USEFUL_LIFE_MONTHS = 120;
/** Parcelas mensais do CIAP (LC 87/96, art. 20, §5º, I). */
export const CIAP_INSTALLMENTS = 48;

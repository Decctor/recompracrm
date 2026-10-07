import { z } from "zod";
import { CashbackProgramTerminologyEnum } from "./enums";

/** Frozen purchase facts; never reconstruct thresholds from a later customer balance. */
const number = z.number({ required_error: "Valor do evento não informado.", invalid_type_error: "Valor do evento inválido." }).finite();
const text = z.string({ required_error: "Texto do evento não informado.", invalid_type_error: "Texto do evento inválido." });
export const SaleCampaignEventSnapshotSchema = z.object({
	compraValor: number,
	comprasQuantidadeAnterior: number.int().nonnegative(),
	comprasQuantidadePosterior: number.int().nonnegative(),
	comprasValorAnterior: number,
	comprasValorPosterior: number,
	segmentacao: text.nullable(),
	vendedorNome: text,
	terminologia: CashbackProgramTerminologyEnum,
	cashbackAcumulado: number,
	cashbackSaldoDisponivel: number,
	cashbackTotalAcumulado: number,
	primeiraCompra: z.boolean({ invalid_type_error: "Primeira compra inválida." }).optional(),
	contabilizarCompra: z.boolean({ invalid_type_error: "Contabilização inválida." }).optional(),
	janelaReferencia: text.optional(),
	origem: text.optional(),
	canal: text.nullable().optional(),
	dataCompra: text.datetime().optional(),
	cashbackTotalResgatado: number.optional(),
});
export type TSaleCampaignEventSnapshot = z.infer<typeof SaleCampaignEventSnapshotSchema>;

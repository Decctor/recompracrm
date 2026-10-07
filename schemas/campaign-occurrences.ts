import { z } from "zod";
import { CampaignTriggerTypeEnum, CampaignDispatchSkipReasonEnum } from "./enums";
import { InteractionContextMetadataSchema } from "./interactions";

const text = z.string({ required_error: "Texto da ocorrência não informado.", invalid_type_error: "Texto da ocorrência inválido." });
const number = z.number({ required_error: "Valor da ocorrência não informado.", invalid_type_error: "Valor da ocorrência inválido." }).finite();
export const CampaignOccurrencePayloadSchema = z.object({
	campanhaId: text.min(1),
	gatilho: CampaignTriggerTypeEnum,
	janelaReferencia: text.min(1),
	dataAgendada: text.datetime().nullable(),
	destinatarios: z.array(
		z.object({
			clienteId: text.min(1),
			vendaId: text.nullable().optional(),
			contexto: InteractionContextMetadataSchema.nullable().optional(),
			descricao: text.nullable().optional(),
			motivoPulo: CampaignDispatchSkipReasonEnum.nullable().optional(),
		}),
		{ required_error: "Destinatários não informados.", invalid_type_error: "Destinatários inválidos." },
	),
	segmentacaoEsperada: text.optional(),
	nascimentoMes: number.int().optional(),
	nascimentoDia: number.int().optional(),
	expiracaoAte: text.datetime().optional(),
	expiracaoDe: text.datetime().optional(),
	expiracaoValorMinimo: number.optional(),
});
export type TCampaignOccurrencePayload = z.infer<typeof CampaignOccurrencePayloadSchema>;

export const ScheduledCampaignPayloadSchema = CampaignOccurrencePayloadSchema.omit({ destinatarios: true });
export type TScheduledCampaignPayload = z.infer<typeof ScheduledCampaignPayloadSchema>;

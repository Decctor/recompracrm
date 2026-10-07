import type { TSaleCampaignEventSnapshot } from "./sale-campaign-events";
import { SaleCampaignEventSnapshotSchema } from "./sale-campaign-events";
import { z } from "zod";
import {
	CampaignOccurrencePayloadSchema,
	ScheduledCampaignPayloadSchema,
	type TCampaignOccurrencePayload,
	type TScheduledCampaignPayload,
} from "./campaign-occurrences";

const identifier = z
	.string({ required_error: "Identificador do evento não informado.", invalid_type_error: "Identificador do evento inválido." })
	.min(1);
export const CampaignEventEnvelopeSchema = z.object({
	organizacaoId: identifier,
	clienteId: identifier.nullable(),
	publicacaoPermitida: z.boolean({ invalid_type_error: "Permissão de publicação inválida." }).optional(),
	fonteTipo: identifier,
	fonteId: identifier,
	tipo: identifier,
	versao: z.number({ required_error: "Versão do evento não informada.", invalid_type_error: "Versão do evento inválida." }).int().positive(),
	chaveIdempotencia: identifier,
	dataEvento: z.date({ required_error: "Data do evento não informada.", invalid_type_error: "Data do evento inválida." }),
});

const payloadSchemas = {
	COMPRA_CONFIRMADA: { 1: SaleCampaignEventSnapshotSchema },
	CASHBACK_ACUMULADO: { 1: SaleCampaignEventSnapshotSchema },
	ENTRADA_SEGMENTACAO: { 1: CampaignOccurrencePayloadSchema },
	PERMANENCIA_SEGMENTACAO: { 1: CampaignOccurrencePayloadSchema },
	ANIVERSARIO_CLIENTE: { 1: CampaignOccurrencePayloadSchema },
	CASHBACK_EXPIRANDO: { 1: CampaignOccurrencePayloadSchema },
	PIOR_DIA_VENDAS: { 1: CampaignOccurrencePayloadSchema },
	CAMPANHA_SOLICITADA: { 1: CampaignOccurrencePayloadSchema },
	CAMPANHA_AGENDADA: { 1: ScheduledCampaignPayloadSchema },
};

export function parseCampaignEventPayload(event: { tipo: string; versao: number; contexto: unknown }) {
	const versions = Object.hasOwn(payloadSchemas, event.tipo) ? payloadSchemas[event.tipo as TCampaignEventType] : undefined;
	const schema = versions && Object.hasOwn(versions, event.versao) ? versions[event.versao as 1] : undefined;
	if (!schema) throw new Error(`Contexto de evento não suportado: ${event.tipo} v${event.versao}.`);
	return schema.parse(event.contexto);
}

/** Add a payload here and a versioned handler to the registry for each new business event. */
export type TCampaignEventPayloadMap = {
	COMPRA_CONFIRMADA: TSaleCampaignEventSnapshot;
	CASHBACK_ACUMULADO: TSaleCampaignEventSnapshot;
	ENTRADA_SEGMENTACAO: TCampaignOccurrencePayload;
	PERMANENCIA_SEGMENTACAO: TCampaignOccurrencePayload;
	ANIVERSARIO_CLIENTE: TCampaignOccurrencePayload;
	CASHBACK_EXPIRANDO: TCampaignOccurrencePayload;
	PIOR_DIA_VENDAS: TCampaignOccurrencePayload;
	CAMPANHA_SOLICITADA: TCampaignOccurrencePayload;
	CAMPANHA_AGENDADA: TScheduledCampaignPayload;
};

export type TCampaignEventType = keyof TCampaignEventPayloadMap;

export type TRecordCampaignEventInput = {
	[K in TCampaignEventType]: {
		organizacaoId: string;
		clienteId: string | null;
		publicacaoPermitida?: boolean;
		fonteTipo: string;
		fonteId: string;
		tipo: K;
		versao: 1;
		chaveIdempotencia: string;
		dataEvento: Date;
		contexto: TCampaignEventPayloadMap[K];
	};
}[TCampaignEventType];

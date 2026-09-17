import z from "zod";
import { CashbackProgramTerminologyEnum, InteractionTypeEnum } from "./enums";

// Estado de entrega de uma interação de campanha (espelho de interactionDeliveryStatusEnum).
// Só existe depois do envio: bloqueios de quota/contato e falhas antes do provedor vivem em
// campaign_dispatch_recipients (PULADA/FALHOU), nunca aqui.
export const InteractionsStatusEnum = z.enum(["PENDENTE", "ENVIADO", "ENTREGUE", "LIDO", "FALHOU"]);
export type TInteractionsStatusEnum = z.infer<typeof InteractionsStatusEnum>;
export const InteractionDeliveryChannelEnum = z.enum(["WHATSAPP", "EMAIL"]);
export type TInteractionDeliveryChannelEnum = z.infer<typeof InteractionDeliveryChannelEnum>;

// Contexto de variáveis de template congelado no enfileiramento/envio (valor da compra, saldos,
// cupom, produto sugerido). É o único schema desse contexto: lib/message-templates re-exporta o
// tipo daqui, e campaign_dispatch_recipients.contexto usa a mesma forma.
export const InteractionContextMetadataSchema = z.object({
	terminologia: CashbackProgramTerminologyEnum.optional(),
	cashbackAcumuladoValor: z.number().optional().nullable(),
	compraValor: z.number().optional(),
	compraCashbackAcumulado: z.number().optional(),
	compraCashbackNovoSaldo: z.number().optional(),
	compraVendedorNome: z.string().optional(),
	compraQuantidadeTotal: z.number().optional(),
	compraValorTotalAcumulado: z.number().optional(),
	cashbackSaldoDisponivel: z.number().optional(),
	cashbackTotalAcumuladoVida: z.number().optional(),
	cashbackTotalResgatadoVida: z.number().optional(),
	cashbackExpirandoValor: z.number().optional(),
	cashbackExpirandoData: z.string().optional(),
	cashbackExpirandoJanela: z.string().optional(),
	cupomCodigo: z.string().optional(),
	cupomTitulo: z.string().optional(),
	cupomExpiracaoData: z.string().optional(),
	// Snapshot do produto sugerido da promoção, resolvido por cliente no enfileiramento
	// (ver lib/campaigns/promotion-suggestion.ts). Congelar aqui mantém a mensagem estável
	// mesmo que o catálogo mude entre o enfileiramento e o envio.
	promocaoProdutoId: z.string().optional(),
	promocaoProdutoNome: z.string().optional(),
	promocaoProdutoPrecoOriginal: z.number().optional(),
	promocaoProdutoPrecoPromocional: z.number().optional(), // preço efetivo (sobrescrita ?? preço de venda)
	promocaoProdutoImagemUrl: z.string().optional(), // sem uso na v1; habilita o cabeçalho dinâmico da v2
});
export type TInteractionContextMetadata = z.infer<typeof InteractionContextMetadataSchema>;

// Metadados persistidos em interactions.metadados: contexto acima + rastreio de entrega por canal
// + snapshots de interações manuais.
export const InteractionMetadataSchema = InteractionContextMetadataSchema.extend({
	whatsappMessageId: z.string().optional().nullable(),
	whatsappTemplateId: z.string().optional().nullable(),
	messageTemplateId: z.string().optional().nullable(),
	emailMessageId: z.string().optional().nullable(),
	clientMessageId: z.string().optional().nullable(),
	jobId: z.string().optional().nullable(),
	chatMessageId: z.string().optional().nullable(),
	whatsappStatus: z.string().optional().nullable(),
	whatsappErrors: z.array(z.unknown()).optional().nullable(),
	emailStatus: z.string().optional().nullable(),
	channelsAttempted: z.array(InteractionDeliveryChannelEnum).optional(),
	channelsSkipped: z.array(z.string()).optional(),
	channelsSent: z.array(InteractionDeliveryChannelEnum).optional(),
	channelErrors: z.record(z.string()).optional(),
	// Disparo que originou o envio (campaign_dispatch_recipients): permite navegar do registro
	// para a fila que o produziu.
	dispatchId: z.string().optional().nullable(),
	dispatchRecipientId: z.string().optional().nullable(),
	// Envio de teste do construtor de campanhas (não entra em quota nem em estatísticas de envio).
	teste: z.boolean().optional().nullable(),

	// Interações manuais (carteira do vendedor) — snapshots do contexto no momento do contato,
	// para analytics por segmento sem reprocessar histórico.
	snapshotSegmentoRFM: z.string().optional().nullable(),
	snapshotDiasSemContato: z.number().optional().nullable(),
	// dataInsercao - dataInteracao acima do limiar: registro retroativo honesto na timeline,
	// mas excluído da métrica de influência (anti-gaming — docs/seller-routine-hub-design.md §7).
	registroRetroativo: z.boolean().optional().nullable(),
});
export type TInteractionMetadata = z.infer<typeof InteractionMetadataSchema>;

export const InteractionSchema = z.object({
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para o ID do cliente.",
	}),
	campanhaId: z
		.string({
			required_error: "ID da campanha não informado.",
			invalid_type_error: "Tipo não válido para o ID da campanha.",
		})
		.optional()
		.nullable(),
	titulo: z.string({
		required_error: "Título da interação não informado.",
		invalid_type_error: "Tipo não válido para o título da interação.",
	}),
	descricao: z
		.string({
			required_error: "Descrição da interação não informada.",
			invalid_type_error: "Tipo não válido para a descrição da interação.",
		})
		.optional()
		.nullable(),
	tipo: InteractionTypeEnum,
	autorId: z
		.string({
			required_error: "ID do autor da interação não informado.",
			invalid_type_error: "Tipo não válido para o ID do autor da interação.",
		})
		.optional()
		.nullable(),

	dataInsercao: z
		.string({
			required_error: "Data de inserção da interação não informada.",
			invalid_type_error: "Tipo não válido para a data de inserção da interação.",
		})
		.datetime({ message: "Tipo não válido para a data de inserção da interação." })
		.transform((val) => new Date(val))
		.default(new Date().toISOString()),
	dataExecucao: z
		.string({
			required_error: "Data de execução da interação não informada.",
			invalid_type_error: "Tipo não válido para a data de execução da interação.",
		})
		.datetime({ message: "Tipo não válido para a data de execução da interação." })
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	metadados: InteractionMetadataSchema.optional().nullable(),

	// Delivery status tracking
	statusEnvio: InteractionsStatusEnum.optional().nullable(),
	dataEnvio: z
		.string({
			required_error: "Data de envio da interação não informada.",
			invalid_type_error: "Tipo não válido para a data de envio da interação.",
		})
		.datetime({ message: "Tipo não válido para a data de envio da interação." })
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
});

export const InteractionStateSchema = z.object({
	interaction: InteractionSchema.omit({ dataInsercao: true, autorId: true }),
});
export type TInteractionState = z.infer<typeof InteractionStateSchema>;

import type { TMessageTemplateMetadata } from "@/schemas/message-templates";
import type { TMessageTemplateApprovalStatus, TMessageTemplateQuality } from "./types";

export function createEmptyMessageTemplateMetadata(): TMessageTemplateMetadata {
	return { porNumeroTelefone: {} };
}

export function computeWorstMessageTemplateStatus(statuses: TMessageTemplateApprovalStatus[]): TMessageTemplateApprovalStatus {
	const priority: TMessageTemplateApprovalStatus[] = ["REJEITADO", "DESABILITADO", "PAUSADO", "PENDENTE", "RASCUNHO", "APROVADO"];
	return priority.find((status) => statuses.includes(status)) ?? "RASCUNHO";
}

export function computeWorstMessageTemplateQuality(qualities: TMessageTemplateQuality[]): TMessageTemplateQuality {
	const priority: TMessageTemplateQuality[] = ["BAIXA", "MEDIA", "PENDENTE", "ALTA"];
	return priority.find((quality) => qualities.includes(quality)) ?? "PENDENTE";
}

export function filterMessageTemplateMetadataByPhoneIds({
	metadata,
	phoneIds,
}: {
	metadata: TMessageTemplateMetadata;
	phoneIds: ReadonlySet<string>;
}): TMessageTemplateMetadata {
	return {
		...metadata,
		porNumeroTelefone: Object.fromEntries(Object.entries(metadata.porNumeroTelefone).filter(([phoneId]) => phoneIds.has(phoneId))),
	};
}

/**
 * Aprovação de template é por número, não por template: `statusGeral` é o PIOR status entre todos
 * os telefones conectados. Onde a UI já fixou um remetente (a etapa Mensagem do construtor de
 * campanhas, por exemplo), mostrar `statusGeral` mente — um template aprovado no número escolhido
 * apareceria como "Rejeitado" por causa de outro número que nem participa daquele envio.
 *
 * - `escopo: "TELEFONE"` — status real do template naquele remetente.
 * - `escopo: "NAO_REGISTRADO"` — o template nunca foi submetido para aquele remetente.
 * - `escopo: "GERAL"` — nenhum remetente escolhido (campanha só por e-mail): cai no pior status.
 */
export type TMessageTemplatePhoneStatusResolution =
	| { escopo: "TELEFONE"; status: TMessageTemplateApprovalStatus; qualidade: TMessageTemplateQuality }
	| { escopo: "NAO_REGISTRADO" }
	| { escopo: "GERAL"; status: TMessageTemplateApprovalStatus };

export function resolveMessageTemplateStatusForPhone({
	metadata,
	phoneId,
}: {
	metadata: TMessageTemplateMetadata;
	phoneId?: string | null;
}): TMessageTemplatePhoneStatusResolution {
	const phoneMetadata = Object.values(metadata.porNumeroTelefone);

	if (!phoneId) {
		return {
			escopo: "GERAL",
			status: phoneMetadata.length > 0 ? computeWorstMessageTemplateStatus(phoneMetadata.map((entry) => entry.status)) : "RASCUNHO",
		};
	}

	const entry = metadata.porNumeroTelefone[phoneId];
	if (!entry) return { escopo: "NAO_REGISTRADO" };
	return { escopo: "TELEFONE", status: entry.status, qualidade: entry.qualidade };
}

/** O template pode efetivamente disparar por WhatsApp a partir do remetente escolhido? */
export function isMessageTemplateSendableFromPhone({
	metadata,
	phoneId,
}: {
	metadata: TMessageTemplateMetadata;
	phoneId?: string | null;
}): boolean {
	const resolution = resolveMessageTemplateStatusForPhone({ metadata, phoneId });
	if (resolution.escopo === "NAO_REGISTRADO") return false;
	return resolution.status === "APROVADO";
}

export function withComputedMessageTemplateStatus<T extends { metadados: TMessageTemplateMetadata }>(
	template: T,
	connectedPhoneIds?: ReadonlySet<string>,
) {
	const metadados = connectedPhoneIds
		? filterMessageTemplateMetadataByPhoneIds({ metadata: template.metadados, phoneIds: connectedPhoneIds })
		: template.metadados;
	const phoneMetadata = Object.values(metadados.porNumeroTelefone);
	return {
		...template,
		metadados,
		statusGeral: phoneMetadata.length > 0 ? computeWorstMessageTemplateStatus(phoneMetadata.map((metadata) => metadata.status)) : "RASCUNHO",
		qualidadeGeral: phoneMetadata.length > 0 ? computeWorstMessageTemplateQuality(phoneMetadata.map((metadata) => metadata.qualidade)) : "PENDENTE",
		telefonesTotal: phoneMetadata.length,
		telefonesAprovados: phoneMetadata.filter((metadata) => metadata.status === "APROVADO").length,
	};
}

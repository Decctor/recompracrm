"use client";

import type { TGetFiscalDocumentsOutputById } from "@/app/api/fiscal/documents/route";
import { Section } from "@/components/ui/section";
import { Timeline, type TTimelineTone } from "@/components/ui/timeline";
import { formatDateAsLocale } from "@/lib/formatting";
import type { TFiscalDocumentEventTypeEnum } from "@/schemas/enums";
import { History } from "lucide-react";

const FISCAL_EVENT_TYPE_LABELS: Record<TFiscalDocumentEventTypeEnum, string> = {
	CRIADO: "Documento criado",
	ENVIO_SOLICITADO: "Envio solicitado",
	PROCESSAMENTO_INICIADO: "Processamento iniciado",
	AUTORIZADO: "Autorizado",
	REJEITADO: "Rejeitado",
	SINCRONIZADO: "Sincronizado",
	CANCELAMENTO_SOLICITADO: "Cancelamento solicitado",
	CANCELADO: "Cancelado",
	CARTA_CORRECAO: "Carta de correção",
	INUTILIZACAO: "Inutilização",
	CLASSIFICACAO_PRESENCA_EXCEPCIONAL: "Classificação presencial excepcional",
	ERRO: "Erro",
};

// Tom do ponto: so o que mudou o destino do documento ganha cor; o resto e neutro.
const FISCAL_EVENT_TONES: Partial<Record<TFiscalDocumentEventTypeEnum, TTimelineTone>> = {
	AUTORIZADO: "success",
	REJEITADO: "danger",
	ERRO: "danger",
	CANCELADO: "strong",
	INUTILIZACAO: "strong",
	CLASSIFICACAO_PRESENCA_EXCEPCIONAL: "brand",
};

type FiscalDocumentEventsTimelineProps = {
	events: TGetFiscalDocumentsOutputById["events"];
};

/** Historico do documento como linha do tempo, do mais recente para o mais antigo (ordem da API). */
export function FiscalDocumentEventsTimeline({ events }: FiscalDocumentEventsTimelineProps) {
	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<History />
				</Section.Icon>
				<Section.Title>Histórico</Section.Title>
				<Section.Count>{events.length}</Section.Count>
			</Section.Header>
			<Section.Body>
				{events.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
				) : (
					<Timeline.Root>
						{events.map((event) => {
							const tipo = event.tipo as TFiscalDocumentEventTypeEnum;
							return (
								<Timeline.Item key={event.id}>
									<Timeline.Dot tone={FISCAL_EVENT_TONES[tipo] ?? "neutral"} />
									<Timeline.Content>
										<Timeline.Header>
											<Timeline.Title>{FISCAL_EVENT_TYPE_LABELS[tipo] ?? event.tipo}</Timeline.Title>
											<Timeline.Time>{formatDateAsLocale(event.dataInsercao, true)}</Timeline.Time>
										</Timeline.Header>
										{event.descricao ? <Timeline.Description>{event.descricao}</Timeline.Description> : null}
										{event.autor?.nome ? <Timeline.Meta>{event.autor.nome}</Timeline.Meta> : null}
									</Timeline.Content>
								</Timeline.Item>
							);
						})}
					</Timeline.Root>
				)}
			</Section.Body>
		</Section.Root>
	);
}

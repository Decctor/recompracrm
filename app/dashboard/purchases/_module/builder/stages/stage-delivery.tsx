"use client";

import { StageShell } from "@/app/dashboard/growth/campaigns/_module/builder/components/stage-shell";
import PurchaseDeliveryBlock from "@/components/Modals/Purchases/Blocks/Delivery";
import PurchaseTransportBlock from "@/components/Modals/Purchases/Blocks/Transport";
import type { TPurchaseFreightModalityEnum } from "@/schemas/enums";
import { BUILDER_STAGES } from "../helpers/stages";
import { useBuilder } from "../components/builder-provider";
import { FieldLabel, RadioCard, ReadBadge, SectionLabel, StaticField } from "../components/builder-ui";
import { useBuilderSummary } from "../components/use-builder-summary";

const FREIGHT_MODALITY_LABELS: Record<TPurchaseFreightModalityEnum, string> = {
	REMETENTE: "Por conta do fornecedor (CIF)",
	DESTINATARIO: "Por conta do comprador (FOB)",
	TERCEIROS: "Por conta de terceiros",
	PROPRIO_REMETENTE: "Transporte próprio do fornecedor",
	PROPRIO_DESTINATARIO: "Transporte próprio do comprador",
	SEM_FRETE: "Sem frete",
};

export default function StageDelivery() {
	const { back, next, state, updatePurchase, received, setReceived, importData, readFields } = useBuilder();
	const { activeValidation } = useBuilderSummary();
	const stage = BUILDER_STAGES.delivery;
	const freightModality = importData?.documento?.modalidadeFrete ?? null;

	return (
		<StageShell>
			<StageShell.Title icon={stage.icon} label={stage.label} description={stage.description} />
			<StageShell.Body className="gap-5">
				<div className="flex flex-col gap-2">
					<SectionLabel>A mercadoria já chegou?</SectionLabel>
					<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
						<RadioCard
							selected={!received}
							onClick={() => setReceived(false)}
							title="Ainda não"
							description="A compra fica confirmada. O estoque só entra quando você registrar o recebimento."
						/>
						<RadioCard
							selected={received}
							onClick={() => setReceived(true)}
							title="Sim, receber agora"
							description="Dá entrada no estoque, gera lotes e trava os itens desta compra."
						/>
					</div>
				</div>
				{importData ? (
					<div className="flex flex-col gap-1 md:w-1/2">
						<FieldLabel read={!!freightModality}>FRETE</FieldLabel>
						<StaticField muted={!freightModality}>{freightModality ? FREIGHT_MODALITY_LABELS[freightModality] : "Não consta no documento"}</StaticField>
						<p className="text-[0.7rem] text-muted-foreground">Informativo: lido da nota, não é salvo com a compra.</p>
					</div>
				) : null}
				<div className="flex flex-col gap-1.5">
					{readFields.has("transportadora") ? (
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							Transportadora <ReadBadge />
						</div>
					) : null}
					<PurchaseTransportBlock purchase={state.purchase} updatePurchase={updatePurchase} />
				</div>
				<PurchaseDeliveryBlock purchase={state.purchase} updatePurchase={updatePurchase} />
			</StageShell.Body>
			<StageShell.Footer onBack={back} onNext={next} nextDisabled={!activeValidation.valid} nextDisabledReason={activeValidation.reason} />
		</StageShell>
	);
}

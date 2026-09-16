import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { useCoupons } from "@/lib/queries/coupons";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import type { TUseCampaignState } from "@/state-hooks/use-campaign-state";
import { TimeDurationUnitsOptions } from "@/utils/select-options";
import { Ticket } from "lucide-react";

type CampaignsCouponGenerationBlockProps = {
	campaign: TUseCampaignState["state"]["campaign"];
	updateCampaign: TUseCampaignState["updateCampaign"];
};

export default function CampaignsCouponGenerationBlock({ campaign, updateCampaign }: CampaignsCouponGenerationBlockProps) {
	const { data: couponsResult } = useCoupons({ initialParams: { activeOnly: true } });
	// A campanha materializa atribuições, então só cupons INDIVIDUAIS são elegíveis.
	const individualCoupons = (couponsResult?.coupons ?? []).filter((coupon) => coupon.escopo === "INDIVIDUAL");

	return (
		<ResponsiveMenuSection title="GERAÇÃO DE CUPOM" icon={<Ticket className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full flex flex-col gap-1">
				<p className="text-center text-sm tracking-tight text-muted-foreground">
					Configure a atribuição automática de um cupom individual para clientes que ativarem esta campanha. Use as variáveis de template
					{" {{couponCode}}"} e {"{{couponExpirationDate}}"} para comunicar o cupom na mensagem.
				</p>
				<CheckboxInput
					checked={!!campaign.cupomGeracaoAtivo}
					labelTrue="ATRIBUIR CUPOM"
					labelFalse="ATRIBUIR CUPOM"
					handleChange={(value) => updateCampaign({ cupomGeracaoAtivo: value })}
				/>

				{campaign.cupomGeracaoAtivo ? (
					<div className="w-full flex flex-col gap-2">
						<SelectInput
							label="CUPOM"
							value={campaign.cupomGeracaoCupomId}
							resetOptionLabel="SELECIONE O CUPOM"
							options={individualCoupons.map((coupon) => ({ id: coupon.id, value: coupon.id, label: `${coupon.codigo} — ${coupon.titulo}` }))}
							handleChange={(value) => updateCampaign({ cupomGeracaoCupomId: value })}
							onReset={() => updateCampaign({ cupomGeracaoCupomId: null })}
						/>
						{individualCoupons.length === 0 ? (
							<p className="text-xs text-amber-600 text-center">
								Nenhum cupom individual ativo encontrado. Crie um cupom com escopo INDIVIDUAL no módulo de cupons.
							</p>
						) : null}
						<div className="w-full flex flex-col gap-2 items-center lg:flex-row">
							<div className="w-full lg:w-1/2">
								<SelectInput
									label="EXPIRAÇÃO DA ATRIBUIÇÃO (MEDIDA)"
									value={campaign.cupomGeracaoExpiracaoMedida}
									resetOptionLabel="SELECIONE A MEDIDA"
									options={TimeDurationUnitsOptions}
									handleChange={(value) => updateCampaign({ cupomGeracaoExpiracaoMedida: value as TTimeDurationUnitsEnum })}
									onReset={() => updateCampaign({ cupomGeracaoExpiracaoMedida: null })}
								/>
							</div>
							<div className="w-full lg:w-1/2">
								<NumberInput
									label="EXPIRAÇÃO DA ATRIBUIÇÃO (VALOR)"
									value={campaign.cupomGeracaoExpiracaoValor ?? null}
									placeholder="Ex: 3 para expirar em 3 dias..."
									handleChange={(value) => updateCampaign({ cupomGeracaoExpiracaoValor: value })}
								/>
							</div>
						</div>
						<p className="text-xs text-muted-foreground text-center">Sem expiração configurada, a atribuição vale pela vigência do próprio cupom.</p>
					</div>
				) : null}
			</div>
		</ResponsiveMenuSection>
	);
}

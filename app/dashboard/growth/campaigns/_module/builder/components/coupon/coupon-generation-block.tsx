"use client";

import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { useCoupons } from "@/lib/queries/coupons";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import type { TTimeDurationUnitsEnum } from "@/schemas/enums";
import type { TUseCampaignState } from "@/state-hooks/use-campaign-state";
import { TimeDurationUnitsOptions } from "@/utils/select-options";
import { Plus, Ticket } from "lucide-react";
import { useMemo } from "react";
import { useBuilderCouponDraft } from "../builder-provider";
import CouponQuickForm, { EMPTY_COUPON_QUICK_FORM, type TCouponQuickFormDraft } from "./coupon-quick-form";

type CouponGenerationBlockProps = {
	campaign: TUseCampaignState["state"]["campaign"];
	updateCampaign: TUseCampaignState["updateCampaign"];
};

/**
 * Versão do bloco de cupom usada no construtor: além de escolher um cupom existente, permite
 * criar um na hora. O rascunho vive no `BuilderProvider` e sobe como `couponToCreate` no submit.
 *
 * O bloco antigo (`_module/shared/form/Blocks/CouponGeneration`) continua atendendo os modais de
 * edição da tela de detalhe, que ainda não têm o caminho de criação inline.
 */
export default function BuilderCouponGenerationBlock({ campaign, updateCampaign }: CouponGenerationBlockProps) {
	const { couponDraft, setCouponDraft } = useBuilderCouponDraft();
	const { data: couponsResult } = useCoupons({ initialParams: { activeOnly: true } });

	// A campanha materializa atribuições, então só cupons INDIVIDUAIS são elegíveis.
	const individualCoupons = useMemo(() => (couponsResult?.coupons ?? []).filter((coupon) => coupon.escopo === "INDIVIDUAL"), [couponsResult]);

	const mode: "existing" | "create" = couponDraft ? "create" : "existing";

	const quickFormDraft: TCouponQuickFormDraft = couponDraft
		? {
				codigo: couponDraft.codigo,
				titulo: couponDraft.titulo,
				beneficioTipo: couponDraft.beneficioTipo,
				beneficioValor: couponDraft.beneficioValor ?? null,
				beneficioDescontoMaximo: couponDraft.beneficioDescontoMaximo ?? null,
			}
		: EMPTY_COUPON_QUICK_FORM;

	function selectExistingMode() {
		setCouponDraft(null);
	}

	function selectCreateMode() {
		// Escolher "criar" abandona o cupom existente: os dois juntos são recusados no servidor.
		updateCampaign({ cupomGeracaoCupomId: null });
		setCouponDraft({ ...EMPTY_COUPON_QUICK_FORM });
	}

	return (
		<ResponsiveMenuSection title="GERAÇÃO DE CUPOM" icon={<Ticket className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="flex w-full flex-col gap-2">
				<p className="text-center text-sm tracking-tight text-muted-foreground">
					Configure a atribuição automática de um cupom individual para clientes que ativarem esta campanha. Use as variáveis de template
					{" {{couponCode}}"} e {"{{couponExpirationDate}}"} para comunicar o cupom na mensagem.
				</p>
				<CheckboxInput
					checked={!!campaign.cupomGeracaoAtivo}
					labelTrue="ATRIBUIR CUPOM"
					labelFalse="ATRIBUIR CUPOM"
					handleChange={(value) => {
						updateCampaign({ cupomGeracaoAtivo: value });
						// Desligar a atribuição descarta o rascunho — senão ele subiria no payload
						// e o servidor recusaria por `cupomGeracaoAtivo` falso.
						if (!value) setCouponDraft(null);
					}}
				/>

				{campaign.cupomGeracaoAtivo ? (
					<div className="flex w-full flex-col gap-3">
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							<button
								type="button"
								onClick={selectExistingMode}
								className={cn(
									"relative flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40",
									mode === "existing" && "ring-2 ring-primary ring-inset",
								)}
							>
								<span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
									<Ticket className="h-3.5 w-3.5" />
								</span>
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="text-sm font-semibold tracking-tight">Usar um cupom existente</span>
									<span className="text-xs leading-snug text-muted-foreground">
										{individualCoupons.length === 0
											? "Nenhum cupom individual ativo na sua conta."
											: individualCoupons.length === 1
												? "1 cupom individual ativo na sua conta."
												: `${individualCoupons.length} cupons individuais ativos na sua conta.`}
									</span>
								</span>
							</button>

							<button
								type="button"
								onClick={selectCreateMode}
								className={cn(
									"relative flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40",
									mode === "create" && "ring-2 ring-primary ring-inset",
								)}
							>
								<span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
									<Plus className="h-3.5 w-3.5" />
								</span>
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="text-sm font-semibold tracking-tight">Criar cupom para esta campanha</span>
									<span className="text-xs leading-snug text-muted-foreground">
										Código, benefício e validade. O resto entra com o padrão de campanha.
									</span>
								</span>
							</button>
						</div>

						{mode === "existing" ? (
							<div className="flex w-full flex-col gap-2">
								<SelectInput
									label="CUPOM"
									value={campaign.cupomGeracaoCupomId}
									resetOptionLabel="SELECIONE O CUPOM"
									options={individualCoupons.map((coupon) => ({
										id: coupon.id,
										value: coupon.id,
										label: `${coupon.codigo} — ${coupon.titulo}`,
									}))}
									handleChange={(value) => updateCampaign({ cupomGeracaoCupomId: value })}
									onReset={() => updateCampaign({ cupomGeracaoCupomId: null })}
								/>
								{individualCoupons.length === 0 ? (
									<p className="text-center text-xs text-amber-600 dark:text-amber-400">
										Nenhum cupom individual ativo encontrado. Crie um aqui mesmo em "Criar cupom para esta campanha".
									</p>
								) : null}
							</div>
						) : (
							<CouponQuickForm
								draft={quickFormDraft}
								onChange={(next) => setCouponDraft(next)}
								couponBuilderHref={appRoutes.growth.newCoupon()}
							/>
						)}

						<div className="flex w-full flex-col items-center gap-2 lg:flex-row">
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
						<p className="text-center text-xs text-muted-foreground">
							Sem expiração configurada, a atribuição vale pela vigência do próprio cupom.
						</p>
					</div>
				) : null}
			</div>
		</ResponsiveMenuSection>
	);
}

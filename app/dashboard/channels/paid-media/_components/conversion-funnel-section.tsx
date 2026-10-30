"use client";

import { Panel } from "@/app/dashboard/_hub/panel";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import type { TMetaAdsRichMetrics } from "@/lib/integrations/meta/ads/types";
import { formatAdsCurrency, formatAdsFraction, formatAdsNumber } from "@/lib/paid-media/format";
import { useMetaAdsAccountInsights } from "@/lib/queries/meta-ads";
import { cn } from "@/lib/utils";
import { Clapperboard, SlidersHorizontal, Waypoints } from "lucide-react";
import { useMemo, useState } from "react";
import { usePaidMedia } from "./paid-media-context";
import { InfoHint } from "./paid-media-ui";

type TStage = {
	key: string;
	label: string;
	get: (metrics: TMetaAdsRichMetrics) => number;
	cost: (metrics: TMetaAdsRichMetrics) => number | null;
};

const STAGES: TStage[] = [
	{
		key: "linkClicks",
		label: "Cliques no link",
		get: (m) => m.funnel.linkClicks,
		cost: (m) => (m.funnel.linkClicks > 0 ? m.spend / m.funnel.linkClicks : null),
	},
	{ key: "landingPageViews", label: "Visualizações da página", get: (m) => m.funnel.landingPageViews, cost: (m) => m.funnel.costPerLandingPageView },
	{ key: "addToCart", label: "Adições ao carrinho", get: (m) => m.funnel.addToCart, cost: (m) => m.funnel.costPerAddToCart },
	{ key: "initiateCheckout", label: "Checkouts iniciados", get: (m) => m.funnel.initiateCheckout, cost: (m) => m.funnel.costPerInitiateCheckout },
	{ key: "purchases", label: "Compras", get: (m) => m.funnel.purchases, cost: (m) => m.funnel.costPerPurchase },
];

/**
 * Funil do site, do clique à compra, com a taxa de passagem entre etapas, e os sinais de criativo
 * dos vídeos. Etapas finais vazias são cortadas: um varejo que anuncia para o WhatsApp não tem
 * carrinho, e um funil cheio de zeros só diz que o pixel não está lá.
 */
export function ConversionFunnelSection({ objectId }: { objectId?: string | null }) {
	const { scope, currency } = usePaidMedia();
	const account = useMetaAdsAccountInsights({ scope, campaignId: objectId });
	const [showDetails, setShowDetails] = useState(false);
	const metrics = account.data?.metrics;

	const stages = useMemo(() => {
		if (!metrics) return [];
		const rows = STAGES.map((stage) => ({ ...stage, value: stage.get(metrics), unitCost: stage.cost(metrics) }));
		const lastNonZero = rows.reduce((last, row, index) => (row.value > 0 ? index : last), -1);
		return lastNonZero < 0 ? [] : rows.slice(0, lastNonZero + 1);
	}, [metrics]);

	const top = stages[0]?.value ?? 0;
	const video = metrics?.video;
	const hasVideo = !!video && (video.video3sViews > 0 || video.thruPlays > 0);
	const conversations = metrics?.messagingConversationsStarted ?? 0;
	const leads = metrics?.leads ?? 0;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Waypoints />
				</Section.Icon>
				<Section.Title>Funil de conversão</Section.Title>
				<InfoHint>
					Do clique até a compra, com a parcela que passa de uma etapa para a outra. Os eventos de site dependem do pixel ou da API de conversões.
				</InfoHint>
				{stages.length > 0 ? (
					<Section.Actions>
						<Button
							type="button"
							variant={showDetails ? "default" : "outline"}
							size="xs"
							aria-pressed={showDetails}
							onClick={() => setShowDetails((value) => !value)}
						>
							<SlidersHorizontal />
							CUSTOS E TAXAS
						</Button>
					</Section.Actions>
				) : null}
			</Section.Header>
			<Section.Body className="text-numeric gap-4">
				{account.isLoading ? (
					<Panel.Loading rows={5} />
				) : account.isError || !metrics ? (
					<Panel.Error error={account.error} />
				) : (
					<>
						{stages.length === 0 ? (
							<p className="text-sm text-muted-foreground">Nenhum evento de site no período. Se a loja vende online, confira o pixel em Conversions API.</p>
						) : (
							<div className="flex flex-col gap-3">
								{stages.map((stage, index) => {
									const width = top > 0 && stage.value > 0 ? Math.max(4, (stage.value / top) * 100) : 4;
									const next = stages[index + 1];
									const passRate = next && stage.value > 0 ? next.value / stage.value : null;
									return (
										<div key={stage.key} className="flex flex-col gap-1.5">
											<div className="flex items-baseline justify-between gap-3">
												<span className="text-xs font-medium">{stage.label}</span>
												<span className="text-sm font-bold">{formatAdsNumber(stage.value)}</span>
											</div>
											<div className="flex items-center gap-2">
												<div className="h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-muted">
													<div
														className={cn("h-full rounded-md transition-[width] duration-700 ease-out", index === stages.length - 1 ? "bg-success" : "bg-primary")}
														style={{ width: `${width}%` }}
													/>
												</div>
												{showDetails ? (
													<span className="text-micro w-28 shrink-0 text-right text-muted-foreground">
														{stage.unitCost != null ? `${formatAdsCurrency(stage.unitCost, currency)} cada` : "—"}
													</span>
												) : null}
											</div>
											{showDetails && passRate != null ? (
												<p className="text-micro text-muted-foreground">
													<b className="text-foreground">{formatAdsFraction(passRate)}</b> seguem para a próxima etapa
												</p>
											) : null}
										</div>
									);
								})}
							</div>
						)}

						{conversations > 0 || leads > 0 ? (
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
								{conversations > 0 ? (
									<OutcomeTile
										label="Conversas iniciadas"
										value={formatAdsNumber(conversations)}
										cost={formatAdsCurrency(metrics.spend / conversations, currency)}
									/>
								) : null}
								{leads > 0 ? (
									<OutcomeTile label="Leads" value={formatAdsNumber(leads)} cost={formatAdsCurrency(metrics.funnel.costPerLead, currency)} />
								) : null}
							</div>
						) : null}

						{hasVideo && video ? (
							<div className="flex flex-col gap-3 border-border border-t pt-4">
								<span className="text-label flex items-center gap-1.5 text-muted-foreground [&_svg]:size-3.5">
									<Clapperboard />
									Sinais de criativo (vídeo)
								</span>
								<div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
									<CreativeStat
										label="Gancho"
										value={formatAdsFraction(video.hookRate)}
										hint="Visualizações de 3 segundos ÷ impressões: quantos pararam de rolar."
									/>
									<CreativeStat label="Retenção" value={formatAdsFraction(video.holdRate)} hint="ThruPlays ÷ impressões: quantos ficaram." />
									<CreativeStat label="Conclusão" value={formatAdsFraction(video.completionRate)} hint="Assistiram até o fim ÷ visualizações de 3 segundos." />
									<CreativeStat
										label="ThruPlays"
										value={formatAdsNumber(video.thruPlays)}
										hint="Reproduções de pelo menos 15 segundos (ou até o fim, se o vídeo for menor)."
									/>
									<CreativeStat
										label="Tempo médio"
										value={video.avgTimeWatched != null ? `${formatAdsNumber(video.avgTimeWatched, 1)}s` : "—"}
										hint="Tempo médio assistido por reprodução."
									/>
								</div>
							</div>
						) : null}
					</>
				)}
			</Section.Body>
		</Section.Root>
	);
}

function OutcomeTile({ label, value, cost }: { label: string; value: string; cost: string }) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-lg border border-success/25 bg-success-surface px-3 py-2">
			<span className="text-label text-success-surface-foreground">{label}</span>
			<span className="flex items-baseline gap-2 text-success-surface-foreground">
				<span className="text-micro">{cost} cada</span>
				<span className="text-sm font-bold">{value}</span>
			</span>
		</div>
	);
}

function CreativeStat({ label, value, hint }: { label: string; value: string; hint: string }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-label flex items-center gap-1 text-muted-foreground">
				{label}
				<InfoHint label={`Sobre ${label}`}>{hint}</InfoHint>
			</span>
			<span className="text-base font-bold">{value}</span>
		</div>
	);
}

"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import DateIntervalInput from "@/components/Inputs/DateIntervalInput";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import { META_ADS_MAX_RANGE_DAYS } from "@/lib/integrations/meta/ads/types";
import { pickMetaResultKey } from "@/lib/paid-media/format";
import { useIntegrations } from "@/lib/queries/integrations";
import { type TMetaAdsScope, useMetaAdsAccountInsights } from "@/lib/queries/meta-ads";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Settings2, Target } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MetaCapiSettingsModal } from "./_components/MetaCapiSettingsModal";
import { AdLibrarySection } from "./_components/ad-library-section";
import { BreakdownsSection } from "./_components/breakdowns-section";
import { CampaignRankingSection, SpendDistributionSection } from "./_components/campaign-ranking-section";
import { CampaignsTableSection } from "./_components/campaigns-table-section";
import { ConversionFunnelSection } from "./_components/conversion-funnel-section";
import { MetricGroupsSection } from "./_components/metric-groups-section";
import { PaidMediaProvider } from "./_components/paid-media-context";
import { LazyMount } from "./_components/paid-media-ui";
import { SummarySection } from "./_components/summary-section";
import { PaidMediaDetailSheet } from "./_sheet/PaidMediaDetailSheet";

const CONNECT_URL = "/api/integrations/meta/ads/auth?redirectTo=/dashboard/channels/paid-media";
const DAY_FORMAT = "YYYY-MM-DD";

type TRange = { since: string; until: string };

/** Os últimos 30 dias contra os 30 anteriores. */
function defaultRanges(): { period: TRange; comparing: TRange } {
	const until = dayjs();
	const since = until.subtract(29, "day");
	return {
		period: { since: since.format(DAY_FORMAT), until: until.format(DAY_FORMAT) },
		comparing: { since: since.subtract(30, "day").format(DAY_FORMAT), until: since.subtract(1, "day").format(DAY_FORMAT) },
	};
}

/** A Meta aceita no máximo 90 dias por consulta: um intervalo maior é cortado na ponta inicial. */
function clampRange(after: Date, before: Date): { range: TRange; clamped: boolean } {
	const end = dayjs(before);
	let start = dayjs(after);
	const clamped = end.diff(start, "day") + 1 > META_ADS_MAX_RANGE_DAYS;
	if (clamped) start = end.subtract(META_ADS_MAX_RANGE_DAYS - 1, "day");
	return { range: { since: start.format(DAY_FORMAT), until: end.format(DAY_FORMAT) }, clamped };
}

/** O mesmo número de dias imediatamente antes do período. */
function previousRange(range: TRange): TRange {
	const days = dayjs(range.until).diff(dayjs(range.since), "day") + 1;
	return {
		since: dayjs(range.since).subtract(days, "day").format(DAY_FORMAT),
		until: dayjs(range.since).subtract(1, "day").format(DAY_FORMAT),
	};
}

const toDate = (day: string) => dayjs(day).toDate();

type PaidMediaPageProps = {
	canManageIntegrations: boolean;
};

export default function PaidMediaPage({ canManageIntegrations }: PaidMediaPageProps) {
	const queryClient = useQueryClient();
	const { data: integrations, isLoading, isError, error, queryKey } = useIntegrations({ tipo: "META_ADS" });
	const defaults = useMemo(defaultRanges, []);
	const [accountParam, setAccountParam] = useQueryState("conta", parseAsString);
	const [since, setSince] = useQueryState("de", parseAsString.withDefault(defaults.period.since));
	const [until, setUntil] = useQueryState("ate", parseAsString.withDefault(defaults.period.until));
	const [comparingSince, setComparingSince] = useQueryState("comparacaoDe", parseAsString.withDefault(defaults.comparing.since));
	const [comparingUntil, setComparingUntil] = useQueryState("comparacaoAte", parseAsString.withDefault(defaults.comparing.until));
	const [capiModalOpen, setCapiModalOpen] = useState(false);

	const accounts = (integrations ?? []).filter((integration) => integration.configuracao?.tipo === "META_ADS");
	const account =
		accounts.find((integration) => integration.id === accountParam) ?? accounts.find((integration) => integration.ativo) ?? accounts[0] ?? null;
	const config = account?.configuracao?.tipo === "META_ADS" ? account.configuracao : null;

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;

	const accountLabel = (integration: (typeof accounts)[number]) =>
		integration.apelido ?? (integration.configuracao?.tipo === "META_ADS" ? integration.configuracao.adAccountName : integration.id);

	const updatePeriod = (value: { after?: Date; before?: Date }) => {
		if (!value.after || !value.before) return;
		const { range, clamped } = clampRange(value.after, value.before);
		if (clamped) toast.info(`A Meta aceita até ${META_ADS_MAX_RANGE_DAYS} dias por consulta; o início foi ajustado.`);
		const comparing = previousRange(range);
		setSince(range.since);
		setUntil(range.until);
		setComparingSince(comparing.since);
		setComparingUntil(comparing.until);
	};
	const updateComparing = (value: { after?: Date; before?: Date }) => {
		if (!value.after || !value.before) return;
		const { range, clamped } = clampRange(value.after, value.before);
		if (clamped) toast.info(`A Meta aceita até ${META_ADS_MAX_RANGE_DAYS} dias por consulta; o início foi ajustado.`);
		setComparingSince(range.since);
		setComparingUntil(range.until);
	};

	return (
		<div className="flex w-full flex-col gap-4 p-1">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div className="flex flex-col">
					<h1 className="font-black text-2xl tracking-tight">Mídia paga</h1>
					<p className="text-sm text-muted-foreground">
						Investimento, resultados e criativos das suas campanhas no Meta Ads, comparados com outro período.
					</p>
				</div>
				{account ? (
					<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
						{accounts.length > 1 ? (
							<Select
								items={accounts.map((integration) => ({ value: integration.id, label: accountLabel(integration) }))}
								value={account.id}
								onValueChange={(value) => {
									if (value !== null) void setAccountParam(value);
								}}
							>
								<SelectTrigger className="w-full sm:w-[240px]" aria-label="Conta de anúncios">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{accounts.map((integration) => (
											<SelectItem key={integration.id} value={integration.id}>
												{accountLabel(integration)}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						) : null}
						<div className="w-full sm:w-[240px]">
							<DateIntervalInput label="Período" value={{ after: toDate(since), before: toDate(until) }} handleChange={updatePeriod} />
						</div>
						<div className="w-full sm:w-[240px]">
							<DateIntervalInput
								label="Comparar com"
								value={{ after: toDate(comparingSince), before: toDate(comparingUntil) }}
								handleChange={updateComparing}
							/>
						</div>
						<Button variant="outline" size="icon" aria-label="Conversions API" title="Conversions API" onClick={() => setCapiModalOpen(true)}>
							<Settings2 />
						</Button>
					</div>
				) : null}
			</div>

			{!account || !config ? (
				<ConnectEmptyState canConnect={canManageIntegrations} />
			) : (
				<>
					{account.status === "EXPIRADO" ? (
						<Callout.Root tone="warning">
							<Callout.Title>A conexão com a Meta expirou</Callout.Title>
							<Callout.Description>
								Os números abaixo podem não carregar até a conta ser reconectada. Reconectar mantém a configuração da Conversions API.
							</Callout.Description>
							{canManageIntegrations ? (
								<Callout.Actions>
									<Button asChild size="sm">
										<a href={CONNECT_URL}>RECONECTAR COM A META</a>
									</Button>
								</Callout.Actions>
							) : null}
						</Callout.Root>
					) : null}
					<PaidMediaContent
						key={account.id}
						integrationId={account.id}
						scope={{ integrationId: account.id, since, until, comparingSince, comparingUntil }}
						currency={config.currency ?? "BRL"}
						adAccountNumericId={config.adAccountNumericId ?? null}
						canManage={canManageIntegrations}
					/>
				</>
			)}

			{capiModalOpen && account ? (
				<MetaCapiSettingsModal
					integrationId={account.id}
					initialPixelId={config?.pixelId}
					initialTestEventCode={config?.capiTestEventCode}
					initialPurchaseEnabled={(config?.eventosCapi ?? []).map((event) => event.toLowerCase()).includes("purchase")}
					closeModal={() => setCapiModalOpen(false)}
					onSaved={() => queryClient.invalidateQueries({ queryKey })}
				/>
			) : null}
		</div>
	);
}

type PaidMediaContentProps = {
	integrationId: string;
	scope: TMetaAdsScope;
	currency: string;
	adAccountNumericId: string | null;
	canManage: boolean;
};

/**
 * As seções da conta selecionada. O resultado principal (compras, leads ou conversas) sai dos totais
 * da conta — a mesma consulta do resumo, então não custa uma chamada a mais.
 */
function PaidMediaContent({ integrationId, scope, currency, adAccountNumericId, canManage }: PaidMediaContentProps) {
	const account = useMetaAdsAccountInsights({ scope });
	const resultKey = pickMetaResultKey(account.data?.metrics);

	return (
		<PaidMediaProvider scope={scope} currency={currency} adAccountNumericId={adAccountNumericId} resultKey={resultKey}>
			<div className="flex w-full flex-col gap-3">
				<SummarySection />
				<MetricGroupsSection />
				<div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-[3fr_2fr]">
					<CampaignRankingSection />
					<SpendDistributionSection />
				</div>
				<LazyMount minHeight={360}>
					<div className="grid w-full grid-cols-1 gap-3 xl:grid-cols-[2fr_3fr]">
						<ConversionFunnelSection />
						<BreakdownsSection />
					</div>
				</LazyMount>
				<LazyMount minHeight={480}>
					<AdLibrarySection integrationId={integrationId} canManage={canManage} />
				</LazyMount>
				<LazyMount minHeight={360}>
					<CampaignsTableSection />
				</LazyMount>
			</div>
			<PaidMediaDetailSheet />
		</PaidMediaProvider>
	);
}

function ConnectEmptyState({ canConnect }: { canConnect: boolean }) {
	return (
		<Empty className="rounded-xl border border-border border-dashed">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Target />
				</EmptyMedia>
				<EmptyTitle>Conecte sua conta do Meta Ads</EmptyTitle>
				<EmptyDescription>
					Acompanhe investimento, resultados e criativos das suas campanhas, comparando períodos, sem sair do RecompraCRM.
				</EmptyDescription>
			</EmptyHeader>
			{canConnect ? (
				<EmptyContent>
					<Button asChild>
						<a href={CONNECT_URL}>CONECTAR COM A META</a>
					</Button>
				</EmptyContent>
			) : (
				<EmptyContent>
					<p className="text-sm text-muted-foreground">Peça a um administrador da organização para conectar a conta.</p>
				</EmptyContent>
			)}
		</Empty>
	);
}

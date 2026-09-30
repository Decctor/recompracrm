"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { getErrorMessage } from "@/lib/errors";
import { buildPlatformPartnerShareMessage, getPlatformPartnerReferralLink } from "@/lib/platform-partnerships/constants";
import { formatPartnerDate, formatPartnerMonthName, getLocalDaysUntil } from "@/lib/platform-partnerships/earnings";
import { usePlatformPartnerDashboard } from "@/lib/queries/platform-partnerships";
import { cn } from "@/lib/utils";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { EarningsChart } from "../_components/earnings-chart";
import { PartnerCard, StaticPartnerCard } from "../_components/partner-card";
import { HideValuesButton, PanelBody, TopSheet } from "../_components/partner-shell";
import { EmptyNote, Money, PanelCard, PanelCardHeader, PanelLink, PanelSkeleton, StatTile } from "../_components/partner-ui";
import { StatementFeed } from "../_components/statement-feed";
import { StoreRow } from "../_components/store-row";

type TDashboard = NonNullable<ReturnType<typeof usePlatformPartnerDashboard>["data"]>;
type TSummary = NonNullable<TDashboard["resumo"]>;

function Greeting({ nome }: { nome: string }) {
	return (
		<div className="flex items-center justify-between pb-5 md:pb-4">
			<div className="flex items-center gap-3">
				<BrandLogo lockup="icon-badge" tone="color" width={36} height={36} className="rounded-full md:hidden" />
				<div className="flex flex-col gap-[3px]">
					<span className="text-[11px] leading-none font-extrabold tracking-[0.08em] text-primary uppercase md:hidden">Programa de Parcerias</span>
					<span className="text-xl leading-tight font-extrabold tracking-[-0.015em]">Olá, {nome.split(" ")[0]}</span>
				</div>
			</div>
			<HideValuesButton className="md:hidden" />
		</div>
	);
}

function ForecastCard({ resumo }: { resumo: TSummary }) {
	const { previsao, bonusTerceiraMensalidade: bonus } = resumo;
	const ceiling = previsao.garantidoCentavos + previsao.projetadoCentavos;
	const guaranteedShare = ceiling > 0 ? (previsao.garantidoCentavos / ceiling) * 100 : 0;
	const bonusDays = bonus?.dataFatura ? getLocalDaysUntil(bonus.dataFatura, new Date()) : null;

	return (
		<PanelCard className="flex flex-col gap-4 p-5">
			<div className="flex items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<span className="text-label text-muted-foreground">Previsão · {formatPartnerMonthName(previsao.mes)}</span>
					<span className="text-2xl font-extrabold tracking-[-0.015em]">
						<Money centavos={previsao.garantidoCentavos} />
					</span>
				</div>
				<span className="inline-flex items-center rounded-full bg-info-surface px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-info-surface-foreground">
					paga em {formatPartnerDate(previsao.data, { short: true })}
				</span>
			</div>
			<div className="flex flex-col gap-1.5">
				<div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
					<span className="bg-primary transition-[width] duration-700" style={{ width: `${guaranteedShare}%` }} />
					{previsao.projetadoCentavos > 0 ? (
						<span
							className="flex-1"
							style={{ backgroundImage: "repeating-linear-gradient(135deg,var(--color-border) 0 4px,var(--color-muted) 4px 8px)" }}
						/>
					) : null}
				</div>
				<div className="flex justify-between gap-3 text-xs text-muted-foreground">
					<span>
						<Money centavos={previsao.garantidoCentavos} /> garantidos
					</span>
					{previsao.projetadoCentavos > 0 ? (
						<span>
							até <Money centavos={ceiling} />
						</span>
					) : null}
				</div>
			</div>
			{bonus ? (
				<div className="flex items-center gap-3 rounded-[18px] bg-warning-surface px-3.5 py-3">
					<div className="flex shrink-0 gap-[3px]" aria-hidden>
						<span className="h-[22px] w-2 rounded-full bg-warning" />
						<span className="h-[22px] w-2 rounded-full bg-primary" />
						<span className="h-[22px] w-2 rounded-full border-[1.5px] border-dashed border-chart-3" />
					</div>
					<p className="text-[13px] leading-[1.45] text-pretty text-warning-surface-foreground">
						<b className="font-extrabold">{bonus.lojaNome}</b>{" "}
						{bonusDays !== null && bonusDays > 0
							? `chega à 3ª mensalidade em ${bonusDays} ${bonusDays === 1 ? "dia" : "dias"}.`
							: "chega à 3ª mensalidade."}{" "}
						Bônus de 100%:{" "}
						<b className="font-extrabold">
							<Money centavos={bonus.valorComissaoCentavos} />
						</b>
						.
					</p>
				</div>
			) : null}
		</PanelCard>
	);
}

function FirstReferralCard({ link, mensagem }: { link: string; mensagem: string | null }) {
	const steps = ["Envie seu link para um lojista", "Ele cria a conta e assina um plano", "A comissão entra no seu extrato"];
	return (
		<PanelCard className="flex flex-col gap-[18px] px-5 py-6">
			<div className="flex flex-col gap-1.5">
				<h2 className="text-[22px] leading-tight font-extrabold tracking-[-0.015em] text-pretty">Sua primeira indicação rende 100% da mensalidade</h2>
				<p className="text-sm leading-normal text-muted-foreground">Três passos até o primeiro PIX:</p>
			</div>
			<ol className="flex flex-col gap-3.5">
				{steps.map((step, index) => (
					<li key={step} className="flex items-center gap-3">
						<span
							className={cn(
								"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
								index === 0 ? "bg-primary text-primary-foreground" : "border-[1.5px] border-border text-muted-foreground",
							)}
						>
							{index + 1}
						</span>
						<span className={cn("text-sm font-semibold", index > 0 && "text-foreground/75")}>{step}</span>
					</li>
				))}
			</ol>
			<a
				href={`https://wa.me/?text=${encodeURIComponent(buildPlatformPartnerShareMessage({ mensagem, link }))}`}
				target="_blank"
				rel="noreferrer"
				className="flex h-12 items-center justify-center gap-2 rounded-[18px] bg-whatsapp text-[15px] font-extrabold text-whatsapp-foreground"
			>
				<MessageCircle className="h-[18px] w-[18px]" />
				Enviar no WhatsApp
			</a>
			<Link
				href="/partner-dashboard/divulgar"
				className="flex h-11 items-center justify-center rounded-[18px] border border-border bg-card text-sm font-bold transition-colors hover:bg-muted"
			>
				Mostrar QR code
			</Link>
		</PanelCard>
	);
}

export default function PartnerHomePage() {
	const { data, isLoading, isError, error } = usePlatformPartnerDashboard();

	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (isLoading || !data?.partner || !data.resumo) {
		return (
			<div className="p-4 md:p-0">
				<PanelSkeleton />
			</div>
		);
	}

	const { partner, resumo, lojas, extrato } = data;
	const link = getPlatformPartnerReferralLink(partner.codigo);

	if (lojas.length === 0) {
		return (
			<div className="mx-auto flex w-full max-w-[560px] flex-col md:gap-4">
				<TopSheet>
					<Greeting nome={partner.nome} />
					<StaticPartnerCard nome={partner.nome} codigo={partner.codigo}>
						<div className="relative flex flex-col gap-1.5">
							<span className="text-[13px] text-white/72">A receber</span>
							<span className="text-[42px] leading-none font-extrabold tracking-[-0.025em] text-white/50">
								<Money centavos={0} />
							</span>
						</div>
					</StaticPartnerCard>
				</TopSheet>
				<PanelBody className="md:p-0">
					<FirstReferralCard link={link} mensagem={partner.mensagemDivulgacao} />
				</PanelBody>
			</div>
		);
	}

	return (
		<div className="flex flex-col md:grid md:grid-cols-2 md:items-start md:gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
			<div className="flex flex-col md:gap-4">
				<TopSheet>
					<Greeting nome={partner.nome} />
					<PartnerCard codigo={partner.codigo} link={link} proximoPix={resumo.proximoPix} />
					<div className="mt-3.5 grid grid-cols-2 gap-2.5">
						<StatTile label="Já recebido" value={<Money centavos={resumo.valorRecebidoCentavos} />} />
						<StatTile
							label="Lojas pagantes"
							value={
								<>
									{resumo.lojasPagantes}{" "}
									<span className="text-sm font-semibold text-muted-foreground">
										de {resumo.lojasIndicadas} {resumo.lojasIndicadas === 1 ? "indicada" : "indicadas"}
									</span>
								</>
							}
						/>
					</div>
				</TopSheet>
				<div className="flex flex-col gap-3 px-4 pt-4 md:p-0">
					<ForecastCard resumo={resumo} />
				</div>
			</div>

			<div className="flex flex-col gap-3 p-4 pt-3 md:gap-4 md:p-0">
				<EarningsChart months={resumo.ganhosPorMes} totalCentavos={resumo.valorTotalCentavos} firstMonth={resumo.primeiroMes} />

				<PanelCard className="py-2">
					<PanelCardHeader title="Suas lojas" action={lojas.length > 5 ? <PanelLink href="/partner-dashboard/lojas">Ver todas</PanelLink> : null} />
					{lojas.slice(0, 5).map((store, index) => (
						<StoreRow key={store.id} store={store} first={index === 0} />
					))}
				</PanelCard>

				<PanelCard className="py-2">
					<PanelCardHeader title="Extrato" action={extrato.length > 6 ? <PanelLink href="/partner-dashboard/extrato">Ver completo</PanelLink> : null} />
					{extrato.length > 0 ? <StatementFeed items={extrato.slice(0, 6)} /> : <EmptyNote>Nada por aqui ainda.</EmptyNote>}
				</PanelCard>
			</div>
		</div>
	);
}

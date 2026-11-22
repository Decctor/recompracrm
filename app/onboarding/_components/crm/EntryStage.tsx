"use client";

import { Button } from "@/components/ui/button";
import { ImportProgress } from "../shared/ImportProgress";
import { formatCount, getConclusionCopy } from "@/lib/onboarding/copy";
import type { TOnboardingReadiness } from "@/lib/onboarding/readiness";
import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { DependencyList } from "../shared/DependencyList";
import { ReadinessPill, type TReadinessTone } from "../shared/ReadinessPill";

type EntryStageProps = {
	readiness: TOnboardingReadiness;
	deferredStages: string[];
	onEnableCampaigns: (chaves: string[]) => void;
	isEnabling: boolean;
	onComplete: () => void;
	isCompleting: boolean;
};

function WorkingRow({ label, value, tone }: { label: string; value: string; tone: TReadinessTone }) {
	return (
		<li className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
			<span className="text-sm font-semibold">{label}</span>
			<ReadinessPill tone={tone} className="max-w-full whitespace-normal break-words">
				{value}
			</ReadinessPill>
		</li>
	);
}

function describeCashback(readiness: TOnboardingReadiness): { value: string; tone: TReadinessTone } {
	const resumo = readiness.cashback.resumo;
	if (readiness.cashback.estado === "ATIVO" && resumo) {
		const valor =
			resumo.acumuloTipo === "PERCENTUAL"
				? `${resumo.acumuloValor}%`
				: resumo.acumuloValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
		return { value: `Ativo, ${valor} de volta`, tone: "ok" };
	}
	if (readiness.cashback.estado === "CONFIGURADO_INATIVO") return { value: "Configurado, desligado", tone: "andamento" };
	return { value: "Não configurado", tone: "adiado" };
}

function describeSource(readiness: TOnboardingReadiness): { value: string; tone: TReadinessTone } {
	const broken = readiness.fonteDados.integracoes.some((integration) => integration.status !== "CONECTADO");
	switch (readiness.fonteDados.modo) {
		case "AMBOS":
			return { value: broken ? "Integração com atenção" : "Integração e balcão", tone: broken ? "falhou" : "ok" };
		case "INTEGRACAO":
			return {
				value: broken
					? "Integração com atenção"
					: `${readiness.fonteDados.integracoes.map((integration) => integration.apelido ?? integration.tipo).join(", ")}`,
				tone: broken ? "falhou" : "ok",
			};
		case "POI":
			return { value: "Registro no balcão", tone: "ok" };
		default:
			// Com ERP, as vendas nascem no PDV: a fonte existe mesmo sem integração nem balcão.
			return readiness.fonteDados.definida ? { value: "PDV do ERP", tone: "ok" } : { value: "Não definida", tone: "adiado" };
	}
}

function describeWhatsapp(readiness: TOnboardingReadiness): { value: string; tone: TReadinessTone } {
	switch (readiness.whatsapp.numero) {
		case "CONECTADO":
			return { value: "Número conectado", tone: "ok" };
		case "EXPIRADO":
			return { value: "Conexão expirada", tone: "falhou" };
		case "DESCONECTADO":
			return { value: "Desconectado", tone: "falhou" };
		default:
			return { value: "Não conectado", tone: "adiado" };
	}
}

function describeCampaigns(readiness: TOnboardingReadiness): { value: string; tone: TReadinessTone } {
	const total = readiness.campanhas.length;
	const manual = readiness.campanhasManuais.ativas;
	if (total === 0)
		return manual > 0 ? { value: formatCount(manual, "ativa", "ativas"), tone: "ok" } : { value: "Nenhuma por enquanto", tone: "adiado" };
	const active = readiness.campanhas.filter((campaign) => campaign.estado === "ATIVA").length;
	const ready = readiness.campanhas.filter((campaign) => campaign.estado === "PRONTA").length;
	if (active === total) return { value: `${formatCount(active, "enviando", "enviando")}`, tone: "ok" };
	if (active > 0) return { value: `${active} de ${total} enviando`, tone: "ok" };
	if (ready > 0) return { value: `${formatCount(ready, "pronta para liberar", "prontas para liberar")}`, tone: "pendente" };
	return { value: `${formatCount(total, "preparada", "preparadas")}`, tone: "andamento" };
}

export function EntryStage({ readiness, deferredStages, onEnableCampaigns, isEnabling, onComplete, isCompleting }: EntryStageProps) {
	const copy = getConclusionCopy(readiness);
	const cashback = describeCashback(readiness);
	const source = describeSource(readiness);
	const whatsapp = describeWhatsapp(readiness);
	const campaigns = describeCampaigns(readiness);
	const readyCampaigns = readiness.campanhas.filter((campaign) => campaign.estado === "PRONTA");
	const pendingCampaigns = readiness.campanhas.filter((campaign) => campaign.estado !== "ATIVA");

	return (
		<div className="flex w-full flex-col gap-8">
			<ImportProgress integrations={readiness.fonteDados.integracoes} />
			<div className="flex flex-col gap-1">
				<h2 className="text-xl font-extrabold tracking-tight">{copy.titulo}</h2>
				<p className="max-w-[68ch] text-sm text-muted-foreground">{copy.descricao}</p>
			</div>

			<div className="grid min-w-0 grid-cols-1 gap-8">
				<section className="flex min-w-0 flex-col gap-2">
					<p className="text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">O que já funciona</p>
					<ul className="flex flex-col divide-y divide-border">
						<WorkingRow label="Vendas" value={source.value} tone={source.tone} />
						<li className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
							<span className="text-sm font-semibold">Base</span>
							<span className="min-w-0 text-sm text-muted-foreground tabular-nums">
								{formatCount(readiness.dados.vendasValidas, "venda válida", "vendas válidas")} ·{" "}
								{formatCount(readiness.dados.clientes, "cliente", "clientes")}
							</span>
						</li>
						<WorkingRow label="Cashback" value={cashback.value} tone={cashback.tone} />
						<WorkingRow label="WhatsApp" value={whatsapp.value} tone={whatsapp.tone} />
						<WorkingRow label="Campanhas" value={campaigns.value} tone={campaigns.tone} />
					</ul>
					{deferredStages.length > 0 ? (
						<p className="pt-2 text-xs text-muted-foreground">
							Você deixou {deferredStages.length === 1 ? "uma etapa" : `${deferredStages.length} etapas`} para depois. Elas continuam no painel, sem pressa.
						</p>
					) : null}

					{pendingCampaigns.length > 0 ? (
						<div className="mt-4 flex flex-col gap-3">
							<p className="text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Dependências das campanhas</p>
							<ul className="flex flex-col gap-3">
								{pendingCampaigns.map((campaign) => (
									<li key={campaign.id} className="rounded-xl border border-border p-4">
										<p className="pb-1 text-sm font-bold">{campaign.titulo}</p>
										<DependencyList dependencias={campaign.dependencias} />
									</li>
								))}
							</ul>
						</div>
					) : null}
				</section>

				<aside className="flex flex-col gap-3">
					<p className="text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Próxima ação</p>
					{readyCampaigns.length > 0 ? (
						<div className="flex flex-col gap-3 rounded-2xl border border-border p-5">
							<div className="flex flex-col gap-1">
								<p className="text-sm font-bold">Liberar envios</p>
								<p className="text-sm text-muted-foreground">
									{readyCampaigns.length === 1
										? `"${readyCampaigns[0].titulo}" está pronta. Ela só começa a enviar quando você liberar.`
										: `${readyCampaigns.length} campanhas estão prontas. Elas só começam a enviar quando você liberar.`}
								</p>
							</div>
							<Button
								size="sm"
								className="w-fit gap-1.5 font-bold"
								disabled={isEnabling}
								onClick={() => onEnableCampaigns(readyCampaigns.map((campaign) => campaign.chave))}
							>
								{isEnabling ? <Loader2 className="size-4 animate-spin" /> : null}
								Liberar {readyCampaigns.length === 1 ? "campanha" : "campanhas"}
							</Button>
						</div>
					) : readiness.proximaAcao ? (
						<div className="flex flex-col gap-3 rounded-2xl border border-border p-5">
							<div className="flex flex-col gap-1">
								<p className="text-sm font-bold">{readiness.proximaAcao.rotulo}</p>
								<p className="text-sm text-muted-foreground">{readiness.proximaAcao.descricao}</p>
							</div>
							<Button asChild size="sm" variant="outline" className="w-fit font-bold">
								<Link href={readiness.proximaAcao.href}>Ir para lá</Link>
							</Button>
						</div>
					) : (
						<div className="flex flex-col gap-1 rounded-2xl border border-border p-5">
							<p className="text-sm font-bold">Nada pendente por enquanto</p>
							<p className="text-sm text-muted-foreground">Quando algo precisar de você, aparece no painel.</p>
						</div>
					)}
				</aside>
			</div>

			<div className="flex justify-end border-t border-border pt-4">
				<Button size="lg" onClick={onComplete} disabled={isCompleting} className="gap-1.5 font-bold">
					{isCompleting ? <Loader2 className="size-4 animate-spin" /> : null}
					Entrar no RecompraCRM
					{!isCompleting ? <ArrowRight className="size-4" /> : null}
				</Button>
			</div>
		</div>
	);
}

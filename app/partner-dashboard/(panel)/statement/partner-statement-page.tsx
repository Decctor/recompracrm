"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { getErrorMessage } from "@/lib/errors";
import { formatPartnerDate, formatPartnerMonthName, getLocalMonthKey } from "@/lib/platform-partnerships/earnings";
import { usePlatformPartnerDashboard } from "@/lib/queries/platform-partnerships";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { PanelBody, TopSheet } from "../../_components/partner-shell";
import { EmptyNote, Money, PanelCard, PanelCardHeader, PanelSkeleton, StatTile } from "../../_components/partner-ui";
import { StatementFeed, type TPartnerStatementItem } from "../../_components/statement-feed";

const FILTERS: { key: string; label: string; match: (item: TPartnerStatementItem) => boolean }[] = [
	{ key: "tudo", label: "Tudo", match: () => true },
	{ key: "comissoes", label: "Comissões", match: (item) => item.tipo === "COMISSAO" },
	{ key: "pix", label: "PIX recebidos", match: (item) => item.tipo === "PIX" },
	{ key: "lojas", label: "Novas lojas", match: (item) => item.tipo === "INDICACAO" },
];

export default function PartnerStatementPage() {
	const { data, isLoading, isError, error } = usePlatformPartnerDashboard();
	const [filter, setFilter] = useState("tudo");

	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (isLoading || !data?.resumo) {
		return (
			<div className="p-4 md:p-0">
				<PanelSkeleton />
			</div>
		);
	}

	const active = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];
	const items = data.extrato.filter(active.match);
	// Agrupa por mês local, mantendo a ordem (mais recente primeiro) que a API já entrega.
	const groups: { mes: string; items: TPartnerStatementItem[] }[] = [];
	for (const item of items) {
		const mes = getLocalMonthKey(new Date(item.data));
		const last = groups.at(-1);
		if (last?.mes === mes) last.items.push(item);
		else groups.push({ mes, items: [item] });
	}
	const currentYear = getLocalMonthKey(new Date()).slice(0, 4);

	return (
		<div className="mx-auto flex w-full max-w-[720px] flex-col md:gap-4">
			<TopSheet className="gap-4">
				<div className="flex flex-col gap-1.5">
					<span className="text-[11px] font-extrabold tracking-[0.08em] text-primary uppercase">Extrato</span>
					<h1 className="text-2xl leading-tight font-extrabold tracking-[-0.015em]">Comissões e pagamentos</h1>
				</div>
				<div className="grid grid-cols-2 gap-2.5">
					<StatTile
						label={`Próximo PIX · ${formatPartnerDate(data.resumo.proximoPix.data, { short: true })}`}
						value={<Money centavos={data.resumo.proximoPix.valorCentavos} />}
					/>
					<StatTile label="Já recebido" value={<Money centavos={data.resumo.valorRecebidoCentavos} />} />
				</div>
				<div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="tablist" aria-label="Filtrar extrato">
					{FILTERS.map((item) => (
						<button
							key={item.key}
							type="button"
							role="tab"
							aria-selected={filter === item.key}
							onClick={() => setFilter(item.key)}
							className={cn(
								"h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-bold transition-colors",
								filter === item.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
							)}
						>
							{item.label}
						</button>
					))}
				</div>
			</TopSheet>
			<PanelBody className="md:p-0">
				{groups.length === 0 ? (
					<PanelCard className="py-2">
						<EmptyNote>Nada por aqui ainda. As comissões aparecem assim que as lojas indicadas pagarem a fatura.</EmptyNote>
					</PanelCard>
				) : (
					groups.map((group) => {
						const [year] = group.mes.split("-");
						return (
							<PanelCard key={group.mes} className="py-2">
								<PanelCardHeader title={`${formatPartnerMonthName(group.mes)}${year !== currentYear ? ` de ${year}` : ""}`} />
								<StatementFeed items={group.items} />
							</PanelCard>
						);
					})
				)}
			</PanelBody>
		</div>
	);
}

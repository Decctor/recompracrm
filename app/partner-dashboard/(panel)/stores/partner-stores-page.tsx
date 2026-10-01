"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { getErrorMessage } from "@/lib/errors";
import { usePlatformPartnerDashboard } from "@/lib/queries/platform-partnerships";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";
import { PanelBody, TopSheet } from "../../_components/partner-shell";
import { EmptyNote, Money, PanelCard, PanelSkeleton, StatTile } from "../../_components/partner-ui";
import { StoreRow, type TPartnerStoreSummary } from "../../_components/store-row";

const FILTERS: { key: string; label: string; match: (store: TPartnerStoreSummary) => boolean }[] = [
	{ key: "todas", label: "Todas", match: () => true },
	{ key: "ativas", label: "Ativas", match: (store) => store.situacao === "ATIVA" },
	{ key: "teste", label: "Em teste", match: (store) => store.situacao === "EM_TESTE" || store.situacao === "SEM_ASSINATURA" },
	{ key: "atencao", label: "Atenção", match: (store) => store.situacao === "EM_ATRASO" || store.situacao === "CANCELADA" },
];

export default function PartnerStoresPage() {
	const { data, isLoading, isError, error } = usePlatformPartnerDashboard();
	const [filter, setFilter] = useState("todas");

	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (isLoading || !data?.resumo) {
		return (
			<div className="p-4 md:p-0">
				<PanelSkeleton />
			</div>
		);
	}

	const active = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];
	const stores = data.lojas.filter(active.match);

	return (
		<div className="mx-auto flex w-full max-w-[720px] flex-col md:gap-4">
			<TopSheet className="gap-4">
				<div className="flex flex-col gap-1.5">
					<span className="text-[11px] font-extrabold tracking-[0.08em] text-primary uppercase">Lojas</span>
					<h1 className="text-2xl leading-tight font-extrabold tracking-[-0.015em]">Suas indicações</h1>
				</div>
				<div className="grid grid-cols-2 gap-2.5">
					<StatTile label="Lojas pagantes" value={`${data.resumo.lojasPagantes} de ${data.resumo.lojasIndicadas}`} />
					<StatTile label="Total ganho" value={<Money centavos={data.resumo.valorTotalCentavos} />} />
				</div>
				<div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="tablist" aria-label="Filtrar lojas">
					{FILTERS.map((item) => {
						const count = data.lojas.filter(item.match).length;
						return (
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
								{item.label} · {count}
							</button>
						);
					})}
				</div>
			</TopSheet>
			<PanelBody className="md:p-0">
				<PanelCard className="py-2">
					{stores.length > 0 ? (
						stores.map((store, index) => <StoreRow key={store.id} store={store} first={index === 0} />)
					) : data.lojas.length === 0 ? (
						<EmptyNote>
							Nenhuma loja indicada ainda.{" "}
							<Link href="/partner-dashboard/share" className="font-bold text-primary">
								Compartilhe seu link
							</Link>{" "}
							e as lojas aparecem aqui assim que criarem a conta.
						</EmptyNote>
					) : (
						<EmptyNote>Nenhuma loja neste filtro.</EmptyNote>
					)}
				</PanelCard>
			</PanelBody>
		</div>
	);
}

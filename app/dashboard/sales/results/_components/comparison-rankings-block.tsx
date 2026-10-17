"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Ranking } from "@/components/ui/ranking";
import { formatDecimalPlaces, formatNameAsInitials, formatToMoney } from "@/lib/formatting";
import type { TComparisonRankingRow, TSalesComparisonStats } from "@/lib/sales/comparison-stats";
import { BadgeDollarSign, CirclePlus, Radio, ShoppingCart, UserRound, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";

type ComparisonRankingsBlockProps = {
	data: TSalesComparisonStats;
};

type TMetric = "total" | "qtde";

/** Vendedores, produtos e canais, cada um com o período base em destaque e o de comparação embaixo. */
export function ComparisonRankingsBlock({ data }: ComparisonRankingsBlockProps) {
	return (
		<Ranking.Provider>
			<div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-3">
				<ComparisonRanking title="Vendedores" rows={data.porVendedor} kind="seller" emptyLabel="Nenhuma venda com vendedor nos dois períodos." />
				<ComparisonRanking title="Produtos" rows={data.porProduto} kind="product" emptyLabel="Nenhum item vendido nos dois períodos." />
				<ComparisonRanking title="Canais" rows={data.porCanal} kind="channel" emptyLabel="Nenhuma venda nos dois períodos." />
			</div>
		</Ranking.Provider>
	);
}

type ComparisonRankingProps = {
	title: string;
	rows: TComparisonRankingRow[];
	kind: "seller" | "product" | "channel";
	emptyLabel: string;
};

function ComparisonRanking({ title, rows, kind, emptyLabel }: ComparisonRankingProps) {
	const [metric, setMetric] = useState<TMetric>("total");

	// A ordem é sempre a do período base na métrica escolhida; quem só vendeu no outro período fecha a lista.
	const sortedRows = useMemo(
		() =>
			[...rows].sort((a, b) => {
				const secondary: TMetric = metric === "total" ? "qtde" : "total";
				return b.base[metric] - a.base[metric] || b.base[secondary] - a.base[secondary] || b.comparacao[metric] - a.comparacao[metric];
			}),
		[rows, metric],
	);

	const format = metric === "total" ? (n: number) => formatToMoney(n) : (n: number) => formatDecimalPlaces(n, 0, 0);
	const MetricIcon: LucideIcon = metric === "total" ? BadgeDollarSign : CirclePlus;
	const secondaryLabel = (row: TComparisonRankingRow) =>
		metric === "total" ? `${formatDecimalPlaces(row.base.qtde, 0, 0)} ${row.base.qtde === 1 ? "venda" : "vendas"}` : formatToMoney(row.base.total);

	return (
		<Ranking.Panel className="min-h-0">
			<Ranking.Header>
				<Ranking.Title>{title}</Ranking.Title>
				<Ranking.Actions>
					<Ranking.SortButton active={metric === "total"} tooltip="Ordenar por valor" onClick={() => setMetric("total")}>
						<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
					</Ranking.SortButton>
					<Ranking.SortButton active={metric === "qtde"} tooltip="Ordenar por quantidade" onClick={() => setMetric("qtde")}>
						<CirclePlus className="h-4 min-h-4 w-4 min-w-4" />
					</Ranking.SortButton>
				</Ranking.Actions>
			</Ranking.Header>
			<Ranking.List className="max-h-[560px]">
				{sortedRows.length === 0 ? (
					<Ranking.Empty>{emptyLabel}</Ranking.Empty>
				) : (
					sortedRows.map((row, index) => {
						const rankDelta = metric === "total" ? row.variacaoPosicaoPorValor : row.variacaoPosicaoPorQtde;
						return (
							<Ranking.Item key={row.id} rank={index + 1}>
								<Ranking.ItemMedia>
									<RankingMedia kind={kind} row={row} />
								</Ranking.ItemMedia>
								<Ranking.ItemTitleRow>
									<Ranking.ItemTitle tooltip={row.titulo}>{row.titulo}</Ranking.ItemTitle>
									<Ranking.ItemDelta rankDelta={rankDelta} />
								</Ranking.ItemTitleRow>
								<Ranking.ItemMeta>{secondaryLabel(row)}</Ranking.ItemMeta>
								<Ranking.ItemMetric icon={MetricIcon} value={format(row.base[metric])} />
								<Ranking.ItemComparison value={format(row.comparacao[metric])} />
							</Ranking.Item>
						);
					})
				)}
			</Ranking.List>
		</Ranking.Panel>
	);
}

function RankingMedia({ kind, row }: { kind: ComparisonRankingProps["kind"]; row: TComparisonRankingRow }) {
	if (kind === "seller") {
		return (
			<Avatar className="h-8 w-8">
				<AvatarImage src={row.avatarUrl ?? undefined} alt={row.titulo} />
				<AvatarFallback className="text-[0.65rem] font-bold">{formatNameAsInitials(row.titulo)}</AvatarFallback>
			</Avatar>
		);
	}
	if (kind === "product" && row.avatarUrl) {
		return <Image src={row.avatarUrl} alt={row.titulo} fill sizes="32px" className="object-cover" />;
	}
	const Icon = kind === "product" ? ShoppingCart : kind === "channel" ? Radio : UserRound;
	return (
		<div className="flex h-full w-full items-center justify-center bg-primary/15 text-foreground">
			<Icon className="h-4 w-4" />
		</div>
	);
}

"use client";
import type { TGetProductsRankingInput } from "@/app/api/products/stats/ranking/route";
import { Ranking } from "@/components/ui/ranking";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useProductsRanking } from "@/lib/queries/products";
import { BadgeDollarSign, CirclePlus, Code, ShoppingCart, TrendingUp } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type ProductsRankingProps = {
	periodAfter: Date | null;
	periodBefore: Date | null;
	comparingPeriodAfter?: Date | null;
	comparingPeriodBefore?: Date | null;
	// dadosSensiveis.visualizarCustos: sem ela não há ordenação por margem (a rota a recusa e anula as margens).
	canViewCosts: boolean;
};

export default function ProductsRanking({ periodAfter, periodBefore, comparingPeriodAfter, comparingPeriodBefore, canViewCosts }: ProductsRankingProps) {
	const [rankingBy, setRankingBy] = useState<TGetProductsRankingInput["rankingBy"]>("sales-total-value");

	const { data: rankingData, isLoading: rankingLoading } = useProductsRanking({
		rankingBy,
		periodAfter: periodAfter ?? null,
		periodBefore: periodBefore ?? null,
		comparingPeriodAfter: comparingPeriodAfter ?? null,
		comparingPeriodBefore: comparingPeriodBefore ?? null,
	});

	return (
		<Ranking.Root>
			<Ranking.Panel>
				<Ranking.Provider>
					<Ranking.Header>
						<Ranking.Title>RANKING DE PRODUTOS - TOP 10</Ranking.Title>
						<Ranking.Actions>
							<Ranking.SortButton
								active={rankingBy === "sales-total-value"}
								onClick={() => setRankingBy("sales-total-value")}
								tooltip="Ordenar por Faturamento"
							>
								<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
							</Ranking.SortButton>
							<Ranking.SortButton
								active={rankingBy === "sales-total-qty"}
								onClick={() => setRankingBy("sales-total-qty")}
								tooltip="Ordenar por Quantidade"
							>
								<CirclePlus className="h-4 min-h-4 w-4 min-w-4" />
							</Ranking.SortButton>
							{canViewCosts ? (
								<Ranking.SortButton
									active={rankingBy === "sales-total-margin"}
									onClick={() => setRankingBy("sales-total-margin")}
									tooltip="Ordenar por Margem"
								>
									<TrendingUp className="h-4 min-h-4 w-4 min-w-4" />
								</Ranking.SortButton>
							) : null}
						</Ranking.Actions>
					</Ranking.Header>
					<Ranking.List>
					{rankingLoading ? (
						<Ranking.Loading />
					) : rankingData && rankingData.length > 0 ? (
						rankingData.map((product) => {
							const metricConfig =
								rankingBy === "sales-total-value"
									? {
											icon: BadgeDollarSign,
											value: formatToMoney(product.totalRevenue),
											comparison:
												product.totalRevenueComparison !== null ? formatToMoney(product.totalRevenueComparison) : null,
										}
									: rankingBy === "sales-total-qty"
										? {
												icon: CirclePlus,
												value: formatDecimalPlaces(product.totalQuantity),
												comparison:
													product.totalQuantityComparison !== null
														? formatDecimalPlaces(product.totalQuantityComparison)
														: null,
											}
										: {
												icon: TrendingUp,
												value: product.marginPercentage !== null ? `${formatDecimalPlaces(product.marginPercentage)}%` : "—",
												comparison:
													product.marginPercentageComparison !== null
														? `${formatDecimalPlaces(product.marginPercentageComparison)}%`
														: null,
											};

							return (
								<Ranking.Item key={product.produtoId} rank={product.rank}>
									<Ranking.ItemMedia>
										{product.imagemCapaUrl ? (
											<Image src={product.imagemCapaUrl} alt="Imagem de capa do produto" fill={true} objectFit="cover" />
										) : (
											<div className="flex h-full w-full items-center justify-center bg-primary/15 text-foreground">
												<ShoppingCart className="h-4 w-4" />
											</div>
										)}
									</Ranking.ItemMedia>
									<Ranking.ItemTitleRow>
										<Ranking.ItemTitle tooltip={product.nome}>{product.nome}</Ranking.ItemTitle>
										<Ranking.ItemDelta rankDelta={product.rankDelta} />
									</Ranking.ItemTitleRow>
									<Ranking.ItemMeta icon={Code}>{product.codigo}</Ranking.ItemMeta>
									<Ranking.ItemMetric icon={metricConfig.icon} value={metricConfig.value} />
									<Ranking.ItemComparison value={metricConfig.comparison} />
								</Ranking.Item>
							);
						})
					) : (
						<Ranking.Empty>Nenhum produto encontrado para o período selecionado.</Ranking.Empty>
					)}
					</Ranking.List>
				</Ranking.Provider>
			</Ranking.Panel>
		</Ranking.Root>
	);
}

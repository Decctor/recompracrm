"use client";
import { Ranking } from "@/components/ui/ranking";
import { formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { useProductAddOnsRanking } from "@/lib/queries/products";
import { BadgeDollarSign, CirclePlus, Layers, Link2 } from "lucide-react";
import { useState } from "react";

type ProductAddOnsRankingProps = {
	periodAfter: Date | null;
	periodBefore: Date | null;
};

// Adicionais mais vendidos, com ou sem produto vinculado. Sem produto, a receita do adicional
// entra no produto do item nas demais estatísticas; aqui ela aparece por conta própria.
export default function ProductAddOnsRanking({ periodAfter, periodBefore }: ProductAddOnsRankingProps) {
	const [rankingBy, setRankingBy] = useState<"sales-total-value" | "sales-total-qty">("sales-total-value");
	const { data: ranking, isLoading } = useProductAddOnsRanking({ periodAfter, periodBefore, rankingBy });

	// Organização sem adicionais vendidos no período (a maioria da base): o bloco não aparece.
	// As duas ordenações listam os mesmos adicionais, então vazio numa é vazio na outra.
	if (!isLoading && (!ranking || ranking.length === 0)) return null;

	return (
		<div className="w-full h-[450px] min-h-0">
			<Ranking.Root>
				<Ranking.Panel>
					<Ranking.Provider>
						<Ranking.Header>
							<Ranking.Title>ADICIONAIS MAIS VENDIDOS - TOP 10</Ranking.Title>
							<Ranking.Actions>
								<Ranking.SortButton
									active={rankingBy === "sales-total-value"}
									onClick={() => setRankingBy("sales-total-value")}
									tooltip="Ordenar por Faturamento"
								>
									<BadgeDollarSign className="h-4 min-h-4 w-4 min-w-4" />
								</Ranking.SortButton>
								<Ranking.SortButton active={rankingBy === "sales-total-qty"} onClick={() => setRankingBy("sales-total-qty")} tooltip="Ordenar por Quantidade">
									<CirclePlus className="h-4 min-h-4 w-4 min-w-4" />
								</Ranking.SortButton>
							</Ranking.Actions>
						</Ranking.Header>
						<Ranking.List>
							{isLoading ? (
								<Ranking.Loading />
							) : ranking && ranking.length > 0 ? (
								ranking.map((addOn) => (
									<Ranking.Item key={addOn.chave} rank={addOn.posicao}>
										<Ranking.ItemMedia>
											<div className="flex h-full w-full items-center justify-center bg-primary/15 text-foreground">
												<CirclePlus className="h-4 w-4" />
											</div>
										</Ranking.ItemMedia>
										<Ranking.ItemTitleRow>
											<Ranking.ItemTitle tooltip={addOn.nome}>{addOn.nome}</Ranking.ItemTitle>
										</Ranking.ItemTitleRow>
										{/* Uma célula só no grid do ranking: grupo e produto vinculado dividem a linha. */}
										<Ranking.ItemMeta icon={addOn.produtoVinculadoNome ? Link2 : Layers}>
											{[addOn.grupo, addOn.produtoVinculadoNome ? `Produto: ${addOn.produtoVinculadoNome}` : null].filter(Boolean).join(" · ") || "Sem grupo"}
										</Ranking.ItemMeta>
										<Ranking.ItemMetric
											icon={rankingBy === "sales-total-value" ? BadgeDollarSign : CirclePlus}
											value={rankingBy === "sales-total-value" ? formatToMoney(addOn.faturamento) : formatDecimalPlaces(addOn.quantidade)}
										/>
									</Ranking.Item>
								))
							) : (
								<Ranking.Empty>Nenhum adicional vendido no período selecionado.</Ranking.Empty>
							)}
						</Ranking.List>
					</Ranking.Provider>
				</Ranking.Panel>
			</Ranking.Root>
		</div>
	);
}

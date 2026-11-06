"use client";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Section } from "@/components/ui/section";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { usePortfolio } from "@/lib/queries/client-portfolios";
import { cn } from "@/lib/utils";
import { RFMLabels, getRFMConfigByLabel } from "@/utils/rfm";
import { Info, PauseCircle, Wallet } from "lucide-react";
import Link from "next/link";
import { getClientInitials } from "./utils";

const SEGMENT_FILTERS = ["Todos", ...RFMLabels.map((label) => label.text)];

type PortfolioProps = {
	sellerId: string | null;
};

export function Portfolio({ sellerId }: PortfolioProps) {
	const { data, isLoading, error, filters, updateFilters } = usePortfolio({ vendedorId: sellerId });

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Wallet className="h-4 w-4 min-h-4 min-w-4" />
				</Section.Icon>
				<Section.Title>Minha carteira</Section.Title>
				<Section.Actions>
					{data ? <span className="text-[0.65rem] font-semibold text-muted-foreground">{data.carteiraTotal} clientes</span> : null}
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				<div className="flex flex-wrap gap-1.5">
					{SEGMENT_FILTERS.map((segment) => {
						const value = segment === "Todos" ? null : segment;
						const isActive = filters.segmento === value;
						return (
							<Button
								key={segment}
								type="button"
								variant={isActive ? "default" : "outline"}
								size="sm"
								className={cn("h-7 rounded-full px-3 text-[0.7rem]", !isActive && "text-muted-foreground")}
								onClick={() => updateFilters({ segmento: value, page: 1 })}
							>
								{segment}
							</Button>
						);
					})}
				</div>
				<GeneralPaginationComponent
					activePage={filters.page}
					totalPages={data?.pagination.totalPages ?? 0}
					selectPage={(page) => updateFilters({ page })}
					queryLoading={isLoading}
					pageSize={filters.pageSize}
					onPageSizeChange={(pageSize) => updateFilters({ pageSize, page: 1 })}
					itemsMatchedText={data?.pagination.total === 1 ? "1 cliente encontrado" : `${data?.pagination.total ?? 0} clientes encontrados`}
					itemsShowingText={`mostrando ${data?.carteira.length ?? 0}`}
				/>
				{isLoading ? <LoadingComponent /> : null}
				{error ? <ErrorComponent msg={getErrorMessage(error)} /> : null}

				{data && data.carteira.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Wallet />
							</EmptyMedia>
							<EmptyTitle>Nenhum cliente encontrado</EmptyTitle>
							<EmptyDescription>
								A carteira é derivada automaticamente das suas vendas: quem compra com você de forma recorrente entra aqui.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : null}

				{data && data.carteira.length > 0 ? (
					<div className="flex flex-col gap-2">
						{data.carteira.map((client) => {
							const segmentConfig = client.segmento ? getRFMConfigByLabel(client.segmento) : null;
							return (
								<div
									key={client.clienteId}
									className="bg-card border-border flex items-center gap-3 rounded-xl border px-3 py-3 shadow-2xs transition-all hover:shadow-sm"
								>
									<span className="flex h-9 w-9 min-h-9 min-w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
										{getClientInitials(client.nome)}
									</span>
									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<div className="flex flex-wrap items-center gap-1.5">
											<h3 className="text-sm font-extrabold tracking-tight uppercase truncate">{client.nome}</h3>
											{segmentConfig ? (
												<span
													className={cn(
														"rounded-full px-2 py-0.5 text-[0.6rem] font-bold tracking-wide",
														segmentConfig.backgroundCollor,
														segmentConfig.textCollor,
													)}
												>
													{client.segmento}
												</span>
											) : null}
											{client.comunicacaoPausada ? (
												<span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.6rem] font-bold text-muted-foreground">
													<PauseCircle className="h-3 w-3" /> PAUSADO
												</span>
											) : null}
										</div>
										<p className="text-xs text-muted-foreground">
											{client.comprasComVoce} compra{client.comprasComVoce === 1 ? "" : "s"} com você
											{client.ultimaCompraComVoce ? ` · última em ${formatDateAsLocale(client.ultimaCompraComVoce)}` : ""}
											{client.cicloMedioDias ? ` · ciclo ~${client.cicloMedioDias} dias` : ""}
										</p>
									</div>
									<div className="hidden shrink-0 flex-col items-end gap-0.5 md:flex">
										<span className="text-sm font-bold tabular-nums">{formatToMoney(client.ltv)}</span>
										<span className="text-[0.65rem] text-muted-foreground uppercase">LTV</span>
									</div>
									<div className="hidden w-28 shrink-0 flex-col gap-1 lg:flex">
										<span className="text-[0.6rem] font-bold tracking-wide uppercase text-muted-foreground">Força do vínculo</span>
										<div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
											<div className="h-full rounded-full bg-primary" style={{ width: `${client.forcaVinculo}%` }} />
										</div>
									</div>
									<Button asChild variant="link" size="sm" className="shrink-0 text-xs font-bold uppercase">
										<Link href={appRoutes.customers.details(client.clienteId)}>Detalhes</Link>
									</Button>
								</div>
							);
						})}
					</div>
				) : null}

				<div className="flex items-start gap-2 text-xs text-muted-foreground">
					<Info className="mt-0.5 h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
					<span>
						<b className="text-foreground">Como a carteira é montada:</b> consideramos os clientes que compram com você de forma recorrente — quem vendeu
						mais vezes (e mais recentemente) para o cliente detém o vínculo. Clientes sem vendedor frequente ficam na carteira da loja.
					</span>
				</div>
			</Section.Body>
		</Section.Root>
	);
}

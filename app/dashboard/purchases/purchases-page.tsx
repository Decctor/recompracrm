"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InboundDocumentsTab from "./components/InboundDocumentsTab";
import { Button } from "@/components/ui/button";
import { TAuthUserSession } from "@/lib/authentication/types";
import { usePurchases } from "@/lib/queries/purchases";
import { Factory, ListFilter, Plus, ShoppingCart, Truck, SquareArrowOutUpRight } from "lucide-react";
import { BsCalendar, BsCalendarCheck, BsCalendarEvent, BsCalendarPlus } from "react-icons/bs";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { getErrorMessage } from "@/lib/errors";
import LoadingComponent from "@/components/Layouts/LoadingComponent";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import type { TGetPurchasesOutputDefault } from "@/app/api/purchases/route";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDateAsLocale, formatNameAsInitials } from "@/lib/formatting";
import Link from "next/link";
import { appRoutes } from "@/lib/navigation/routes";
import { PurchaseStatusOptions } from "@/utils/select-options";
import { cn } from "@/lib/utils";
type PurchasesPageProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

export default function PurchasesPage({ membership }: PurchasesPageProps) {
	const { data, isLoading, isError, isSuccess, error, filters, updateFilters } = usePurchases({ initialFilters: { page: 1, search: "" } });
	const purchases = data?.purchases ?? [];
	const purchasesMatched = data?.purchasesMatched ?? 0;
	const purchasesTotalPages = data?.totalPages ?? 0;
	const purchasesShowing = purchases.length;

	return (
		<Tabs defaultValue="compras" className="w-full flex flex-col gap-3">
			<TabsList variant="page">
				<TabsTrigger value="compras">
					<ShoppingCart className="h-4 w-4 min-h-4 min-w-4" />
					COMPRAS
				</TabsTrigger>
				<TabsTrigger value="notas-recebidas">
					<Truck className="h-4 w-4 min-h-4 min-w-4" />
					NOTAS RECEBIDAS
				</TabsTrigger>
			</TabsList>
			<TabsContent value="compras" className="w-full flex flex-col gap-3">
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<Input
					value={filters.search ?? ""}
					placeholder="Pesquisar compra..."
					onChange={(e) => updateFilters({ search: e.target.value })}
					className="grow rounded-xl"
				/>

				<Button className="flex items-center gap-2" size="sm" asChild>
					<Link href={appRoutes.newPurchase()}>
						<Plus className="w-4 h-4 min-w-4 min-h-4" />
						NOVA COMPRA
					</Link>
				</Button>
			</div>
			<GeneralPaginationComponent
				activePage={filters.page}
				queryLoading={isLoading}
				selectPage={(page) => updateFilters({ page })}
				totalPages={purchasesTotalPages || 0}
				itemsMatchedText={purchasesMatched > 0 ? `${purchasesMatched} compras encontradas.` : `${purchasesMatched} compra encontrada.`}
				itemsShowingText={purchasesShowing > 0 ? `Mostrando ${purchasesShowing} compras.` : `Mostrando ${purchasesShowing} compra.`}
			/>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess && purchases ? (
				purchases.length > 0 ? (
					purchases.map((purchase, index: number) => (
						<PurchasePageCard key={purchase.id} purchase={purchase} />
					))
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ShoppingCart />
							</EmptyMedia>
							<EmptyTitle>Nenhuma compra encontrada</EmptyTitle>
							<EmptyDescription>Você não tem nenhuma compra ainda. Comece criando sua primeira compra.</EmptyDescription>
						</EmptyHeader>
						<EmptyContent className="flex-row justify-center gap-2">
							<Button asChild>
								<Link href={appRoutes.newPurchase()}>CRIAR NOVA COMPRA</Link>
							</Button>
						</EmptyContent>
					</Empty>
				)
			) : null}
			</TabsContent>
			<TabsContent value="notas-recebidas" className="w-full">
				<InboundDocumentsTab />
			</TabsContent>
		</Tabs>
	);
}

type PurchasePageCardProps = {
	purchase: TGetPurchasesOutputDefault["purchases"][number];
};
function PurchasePageCard({ purchase }: PurchasePageCardProps) {
	const getPurchaseStatus = useCallback(() => {
		const status = PurchaseStatusOptions.find((status) => status.value === purchase.status);
		return status || null;
	}, [purchase.status]);

	const purchaseStatus = getPurchaseStatus();
	return (
		<div className="bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs">
			<div className="flex w-full flex-col items-center justify-between gap-2 lg:flex-row">
				<div className="flex items-center gap-2">
					<Link href={appRoutes.purchase(purchase.id)} className="text-xs font-bold tracking-tight hover:underline lg:text-sm">
						{purchase.titulo || "TÍTULO NÃO DEFINIDO"}
					</Link>
				</div>
				{purchaseStatus ? (
					<div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg", purchaseStatus.className, "border-none")}>
						{purchaseStatus.icon}
						<span className="text-xs font-medium">{purchaseStatus.label}</span>
					</div>
				) : null}
			</div>
			<div className="flex w-full flex-col items-center justify-between gap-2 lg:flex-row"></div>

			<div className="flex w-full flex-col items-center justify-between gap-2 lg:flex-row">
				<div className="flex flex-wrap items-center gap-2">
					<div className="flex items-center gap-1">
						<BsCalendarPlus className="w-4 h-4 min-w-4 min-h-4" />
						<h2 className="text-[0.65rem] font-medium text-muted-foreground">{formatDateAsLocale(purchase.dataInsercao, true)}</h2>
					</div>
					{purchase.dataEfetivacao ? (
						<div className="flex items-center gap-1">
							<BsCalendarCheck className="w-4 h-4 min-w-4 min-h-4" color="#22c55e" />
							<h2 className="text-[0.65rem] font-medium text-muted-foreground">{formatDateAsLocale(purchase.dataEfetivacao, true)}</h2>
						</div>
					) : null}

					<div className="flex items-center gap-1">
						<Avatar className="h-5 w-5">
							<AvatarImage src={purchase.autor?.avatarUrl || undefined} alt={purchase.autor?.nome || "N/A"} />
							<AvatarFallback>{formatNameAsInitials(purchase.autor?.nome || "N/A")}</AvatarFallback>
						</Avatar>
						<h2 className="text-[0.65rem] font-medium text-muted-foreground">{purchase.autor?.nome || "N/A"}</h2>
					</div>
				</div>
				<Button variant="ghost" size="xs" asChild>
					<Link href={appRoutes.purchase(purchase.id)}>
						<SquareArrowOutUpRight className="w-4 h-4 min-w-4 min-h-4" />
						<p>ABRIR</p>
					</Link>
				</Button>
			</div>
		</div>
	);
}

"use client";

import CouponDetailHeader from "@/app/dashboard/growth/coupons/[couponId]/_components/CouponDetailHeader";
import CouponRedemptionsTab from "@/app/dashboard/growth/coupons/[couponId]/coupon-redemptions-tab";
import CouponRegistryTab from "@/app/dashboard/growth/coupons/[couponId]/coupon-registry-tab";
import CouponStatsTab from "@/app/dashboard/growth/coupons/[couponId]/coupon-stats-tab";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/errors";
import { formatDecimalPlaces } from "@/lib/formatting";
import { useCouponById } from "@/lib/queries/coupons";
import { useQueryClient } from "@tanstack/react-query";
import { ChartBarIcon, PencilIcon, ReceiptIcon } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";

const TABS = ["cadastro", "estatisticas", "resgates"] as const;
type TCouponTab = (typeof TABS)[number];

/**
 * Página do cupom por ID, em abas — o mesmo desenho das páginas de produto e de cliente.
 *
 * ESTATÍSTICAS é a aba padrão porque a pergunta que traz alguém até aqui é de desempenho; o
 * cadastro é o que se abre depois, para ajustar o que os números mostraram. Cada aba carrega a
 * própria consulta e só quando está visível (`enabled`), então abrir a página não dispara as três.
 */
export default function CouponByIdPage({ couponId }: { couponId: string }) {
	const [tab, setTab] = useQueryState("tab", parseAsStringEnum([...TABS]).withDefault("estatisticas"));
	const queryClient = useQueryClient();
	const { data: coupon, queryKey, isLoading, isError, error } = useCouponById({ couponId });

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey });

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!coupon) return null;

	const activeTab = (tab ?? "estatisticas") as TCouponTab;

	return (
		<div className="flex w-full max-w-full grow flex-col gap-6 overflow-x-hidden bg-background py-3">
			<CouponDetailHeader coupon={coupon} callbacks={{ onSettled: handleOnSettled }} />
			<Tabs value={activeTab} onValueChange={(value) => setTab(value as TCouponTab)}>
				<TabsList variant="page">
					<TabsTrigger value="cadastro">
						<PencilIcon className="h-4 w-4 min-h-4 min-w-4" />
						CADASTRO
					</TabsTrigger>
					<TabsTrigger value="estatisticas">
						<ChartBarIcon className="h-4 w-4 min-h-4 min-w-4" />
						ESTATÍSTICAS
					</TabsTrigger>
					<TabsTrigger value="resgates">
						<ReceiptIcon className="h-4 w-4 min-h-4 min-w-4" />
						RESGATES
						{coupon.impacto.resgates > 0 ? (
							<span className="flex h-5 items-center rounded-full bg-secondary px-2 text-xs font-bold tabular-nums">
								{formatDecimalPlaces(coupon.impacto.resgates)}
							</span>
						) : null}
					</TabsTrigger>
				</TabsList>
				<TabsContent value="cadastro" className="mt-4">
					<CouponRegistryTab coupon={coupon} callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }} />
				</TabsContent>
				<TabsContent value="estatisticas" className="mt-4">
					<CouponStatsTab coupon={coupon} enabled={activeTab === "estatisticas"} />
				</TabsContent>
				<TabsContent value="resgates" className="mt-4">
					<CouponRedemptionsTab coupon={coupon} enabled={activeTab === "resgates"} />
				</TabsContent>
			</Tabs>
		</div>
	);
}

"use client";
import type { TGetCouponsOutputDefault } from "@/app/api/coupons/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import GeneralPaginationComponent from "@/components/Utils/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { appRoutes } from "@/lib/navigation/routes";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { deleteCoupon } from "@/lib/mutations/coupons";
import { useCoupons } from "@/lib/queries/coupons";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, CalendarClock, Globe, Plus, Tag, Ticket, TrendingUp, Trash2, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

type CouponsPageProps = {
	user: TAuthUserSession["user"];
};
export default function CouponsPage({ user: _user }: CouponsPageProps) {
	const queryClient = useQueryClient();
	const {
		data: couponsResult,
		queryKey,
		isLoading,
		isError,
		isSuccess,
		error,
		queryParams,
		updateQueryParams,
	} = useCoupons({ initialParams: { search: "" } });

	const coupons = couponsResult?.coupons;
	const couponsShowing = coupons ? coupons.length : 0;
	const couponsMatched = couponsResult?.couponsMatched || 0;
	const totalPages = couponsResult?.totalPages;

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey });

	const { mutate: handleDeleteCouponMutation } = useMutation({
		mutationKey: ["delete-coupon"],
		mutationFn: deleteCoupon,
		onMutate: handleOnMutate,
		onSuccess: (data) => toast.success(data.message),
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
		onSettled: handleOnSettled,
	});

	return (
		<div className="w-full h-full flex flex-col gap-3">
			<div className="w-full flex items-center gap-2 flex-col-reverse lg:flex-row">
				<Input
					value={queryParams.search ?? ""}
					placeholder="Pesquisar cupom..."
					onChange={(e) => updateQueryParams({ search: e.target.value, page: 1 })}
					className="grow rounded-xl"
				/>
				<Button className="flex items-center gap-2" size="sm" asChild>
					<Link href={appRoutes.growth.newCoupon()}>
						<Plus className="w-4 h-4 min-w-4 min-h-4" />
						NOVO CUPOM
					</Link>
				</Button>
			</div>
			<GeneralPaginationComponent
				activePage={queryParams.page}
				queryLoading={isLoading}
				selectPage={(page) => updateQueryParams({ page })}
				totalPages={totalPages || 0}
				pageSize={queryParams.pageSize}
				onPageSizeChange={(pageSize) => updateQueryParams({ pageSize, page: 1 })}
				itemsMatchedText={couponsMatched === 1 ? "1 cupom encontrado" : `${couponsMatched} cupons encontrados`}
				itemsShowingText={`mostrando ${couponsShowing}`}
			/>
			{isLoading ? <LoadingComponent /> : null}
			{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
			{isSuccess ? (
				<div className="w-full flex flex-col gap-1.5">
					{coupons && coupons.length > 0 ? (
						coupons.map((coupon) => <CouponCard key={coupon.id} coupon={coupon} handleDeleteClick={(id) => handleDeleteCouponMutation({ id })} />)
					) : (
						<p className="w-full flex items-center justify-center">Nenhum cupom encontrado</p>
					)}
				</div>
			) : null}
		</div>
	);
}

function formatCouponBenefit(coupon: TGetCouponsOutputDefault["coupons"][number]) {
	if (coupon.beneficioTipo === "DESCONTO_FIXO") return `${formatToMoney(coupon.beneficioValor ?? 0)} DE DESCONTO`;
	if (coupon.beneficioTipo === "DESCONTO_PERCENTUAL")
		return `${coupon.beneficioValor ?? 0}% DE DESCONTO${coupon.beneficioDescontoMaximo ? ` (MÁX ${formatToMoney(coupon.beneficioDescontoMaximo)})` : ""}`;
	if (coupon.beneficioTipo === "PRECO_FIXO") return `PREÇO FIXO DE ${formatToMoney(coupon.beneficioValor ?? 0)}`;
	if (coupon.beneficioTipo === "COMPRE_X_LEVE_Y") return `LEVE ${coupon.beneficioLeveQuantidade ?? 0} PAGUE ${coupon.beneficioCompreQuantidade ?? 0}`;
	return "BRINDE";
}

function CouponCard({ coupon, handleDeleteClick }: { coupon: TGetCouponsOutputDefault["coupons"][number]; handleDeleteClick: (id: string) => void }) {
	const activeAudiences = coupon.audiencias ?? [];
	return (
		<div className={cn("bg-card border-border flex w-full flex-col gap-1 rounded-xl border px-3 py-4 shadow-2xs", !coupon.ativo && "opacity-60")}>
			<div className="flex items-center justify-between flex-col md:flex-row gap-3">
				<div className="flex items-center gap-3 flex-wrap">
					<Ticket className="w-4 h-4 min-w-4 min-h-4" />
					<h1 className="text-xs font-bold tracking-tight uppercase">{coupon.titulo}</h1>
					<span className="text-xs font-bold tracking-tight uppercase rounded-md px-1.5 py-0.5 bg-primary/10">{coupon.codigo}</span>
					{!coupon.ativo ? (
						<span className="text-xs font-bold tracking-tight uppercase rounded-md px-1.5 py-0.5 bg-destructive/10 text-destructive">INATIVO</span>
					) : null}
					<div className="flex items-center gap-1.5">
						{coupon.escopo === "GLOBAL" ? <Globe className="w-3 min-w-3 h-3 min-h-3" /> : <UserRound className="w-3 min-w-3 h-3 min-h-3" />}
						<p className="text-xs tracking-tight uppercase">{coupon.escopo === "GLOBAL" ? "QUALQUER CLIENTE" : "CLIENTES ESPECÍFICOS"}</p>
					</div>
					<div className="flex items-center gap-1.5">
						<BadgePercent className="w-3 min-w-3 h-3 min-h-3" />
						<p className="text-xs tracking-tight uppercase">{formatCouponBenefit(coupon)}</p>
					</div>
					<p className="text-xs tracking-tight uppercase text-muted-foreground">
						{coupon.validacaoModo === "AUTOMATICA" ? "VALIDAÇÃO AUTOMÁTICA" : "VALIDAÇÃO MANUAL"}
					</p>
				</div>
			</div>
			<div className="w-full flex items-center justify-center lg:justify-end gap-2 flex-wrap">
				{activeAudiences.length > 0 ? (
					<div className="flex items-center gap-1.5">
						{activeAudiences[0]?.clienteTagId ? <Tag className="w-3 min-w-3 h-3 min-h-3" /> : <Users className="w-3 min-w-3 h-3 min-h-3" />}
						<p className="text-xs font-medium tracking-tight uppercase">
							AUDIÊNCIA: {activeAudiences.map((audience) => audience.clienteTag?.titulo ?? audience.segmentacaoRFM).join(", ")}
						</p>
					</div>
				) : null}
				<div className="flex items-center gap-1.5">
					<CalendarClock className="w-3 min-w-3 h-3 min-h-3" />
					<p className="text-xs font-medium tracking-tight uppercase">
						{coupon.vigenciaFim ? `VÁLIDO ATÉ: ${formatDateAsLocale(coupon.vigenciaFim)}` : "SEM EXPIRAÇÃO"}
					</p>
				</div>
				<div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">
					<TrendingUp className="w-3 min-w-3 h-3 min-h-3" />
					<p className="text-xs font-bold tracking-tight uppercase tabular-nums">
						{coupon.resgatesUtilizados} {coupon.resgatesUtilizados === 1 ? "RESGATE" : "RESGATES"}
					</p>
				</div>
				<Button variant="ghost" className="flex items-center gap-1.5" size="sm" asChild>
					<Link href={appRoutes.growth.coupon(coupon.id)}>
						<BadgePercent className="w-3 min-w-3 h-3 min-h-3" />
						DETALHES
					</Link>
				</Button>
				<Button variant="ghost" className="flex items-center gap-1.5 text-destructive" size="sm" onClick={() => handleDeleteClick(coupon.id)}>
					<Trash2 className="w-3 min-w-3 h-3 min-h-3" />
					EXCLUIR
				</Button>
			</div>
		</div>
	);
}

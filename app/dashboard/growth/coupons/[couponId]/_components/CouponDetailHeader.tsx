"use client";

import type { TGetCouponsOutputById } from "@/app/api/coupons/route";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDecimalPlaces, formatToMoney } from "@/lib/formatting";
import { deleteCoupon, updateCoupon } from "@/lib/mutations/coupons";
import { appRoutes } from "@/lib/navigation/routes";
import { buildCouponSectionUpdateInput, mapCouponToState } from "@/lib/coupons/coupon-registry-state";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeDollarSign, BadgePercent, CalendarClock, Gauge, Globe, Pause, Play, Ticket, Trash2, UserRound, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type CouponDetailHeaderProps = {
	coupon: TGetCouponsOutputById;
	callbacks?: { onSettled?: () => void };
};

function formatCouponBenefit(coupon: TGetCouponsOutputById): string {
	if (coupon.beneficioTipo === "DESCONTO_FIXO") return `${formatToMoney(coupon.beneficioValor ?? 0)} de desconto`;
	if (coupon.beneficioTipo === "DESCONTO_PERCENTUAL")
		return `${coupon.beneficioValor ?? 0}% de desconto${coupon.beneficioDescontoMaximo ? ` (até ${formatToMoney(coupon.beneficioDescontoMaximo)})` : ""}`;
	if (coupon.beneficioTipo === "PRECO_FIXO") return `Preço fixo de ${formatToMoney(coupon.beneficioValor ?? 0)}`;
	if (coupon.beneficioTipo === "COMPRE_X_LEVE_Y") return `Leve ${coupon.beneficioLeveQuantidade ?? 0}, pague ${coupon.beneficioCompreQuantidade ?? 0}`;
	return "Brinde";
}

function formatCouponValidity(coupon: TGetCouponsOutputById): string {
	if (coupon.vigenciaInicio && coupon.vigenciaFim) return `${formatDateAsLocale(coupon.vigenciaInicio)} — ${formatDateAsLocale(coupon.vigenciaFim)}`;
	if (coupon.vigenciaFim) return `Válido até ${formatDateAsLocale(coupon.vigenciaFim)}`;
	if (coupon.vigenciaInicio) return `A partir de ${formatDateAsLocale(coupon.vigenciaInicio)}`;
	return "Sem expiração";
}

/** Cartão de um número do placar do cabeçalho. */
function HeaderScoreCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string | null }) {
	return (
		<div className="flex flex-1 flex-col gap-0.5 rounded-xl border border-border bg-card px-3.5 py-3 shadow-2xs">
			<span className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground [&>svg]:size-3.5">
				{icon}
				{label}
			</span>
			<span className="text-xl font-bold leading-tight tabular-nums text-primary">{value}</span>
			<span className="text-[0.65rem] text-muted-foreground">{hint ?? "—"}</span>
		</div>
	);
}

/**
 * Cabeçalho da página do cupom: identidade à esquerda, placar à direita.
 *
 * O placar sobe para o cabeçalho porque a primeira pergunta de quem abre um cupom é "está pegando?",
 * e a resposta não deveria depender de qual aba está aberta. Os números são de vida toda — e não do
 * período filtrado na aba de estatísticas — justamente para não mudarem quando o filtro muda.
 */
export default function CouponDetailHeader({ coupon, callbacks }: CouponDetailHeaderProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { impacto } = coupon;

	const consumoDoLimite = coupon.limiteResgatesTotal ? (impacto.resgates / coupon.limiteResgatesTotal) * 100 : null;
	const resgatesDisponiveis = coupon.limiteResgatesTotal ? Math.max(coupon.limiteResgatesTotal - impacto.resgates, 0) : null;

	const { mutate: handleToggleActive, isPending: toggleIsPending } = useMutation({
		mutationKey: ["toggle-coupon-active", coupon.id],
		mutationFn: () => {
			const state = mapCouponToState(coupon);
			state.coupon.ativo = !coupon.ativo;
			return updateCoupon(buildCouponSectionUpdateInput({ coupon, state, section: "general" }));
		},
		onSuccess: () => toast.success(coupon.ativo ? "Cupom desativado com sucesso." : "Cupom ativado com sucesso."),
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled: () => callbacks?.onSettled?.(),
	});

	const { mutate: handleDeleteCoupon, isPending: deleteIsPending } = useMutation({
		mutationKey: ["delete-coupon", coupon.id],
		mutationFn: deleteCoupon,
		onSuccess: async (data) => {
			toast.success(data.message);
			await queryClient.invalidateQueries({ queryKey: ["coupons"] });
			router.push(appRoutes.growth.coupons());
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	return (
		<div className="flex w-full flex-col gap-4">
			<Button variant="ghost" size="fit" asChild className="flex w-fit items-center gap-1 rounded-full px-2 py-2 hover:bg-primary/10">
				<Link href={appRoutes.growth.coupons()} className="flex items-center gap-1">
					<ArrowLeft className="h-5 w-5" />
					VOLTAR
				</Link>
			</Button>

			<div className="flex w-full flex-col items-stretch gap-3 lg:flex-row">
				<div className="flex min-w-0 flex-1 flex-col gap-2.5">
					<div className="flex flex-wrap items-center gap-2">
						<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<Ticket className="h-5 w-5" />
						</span>
						<h1 className="text-xl font-extrabold leading-none tracking-tight md:text-2xl">{coupon.titulo}</h1>
						<span className="rounded-lg bg-secondary px-2.5 py-1 text-[0.65rem] font-bold uppercase italic tracking-tight text-foreground/80">
							{coupon.codigo}
						</span>
						<span
							className={cn(
								"flex h-5 items-center rounded-full px-2.5 text-xs font-semibold",
								coupon.ativo ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-destructive/10 text-destructive",
							)}
						>
							{coupon.ativo ? "ATIVO" : "INATIVO"}
						</span>
					</div>

					{coupon.descricao ? <p className="max-w-[62ch] text-sm text-muted-foreground">{coupon.descricao}</p> : null}

					<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
						<span className="flex items-center gap-1.5">
							<BadgePercent className="h-3.5 w-3.5" />
							{formatCouponBenefit(coupon)}
						</span>
						<span className="flex items-center gap-1.5">
							{coupon.escopo === "GLOBAL" ? <Globe className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
							{coupon.escopo === "GLOBAL" ? "Qualquer cliente" : "Clientes específicos"}
						</span>
						<span className="flex items-center gap-1.5">
							<CalendarClock className="h-3.5 w-3.5" />
							{formatCouponValidity(coupon)}
						</span>
						<span className="flex items-center gap-1.5">
							<Zap className="h-3.5 w-3.5" />
							{coupon.validacaoModo === "AUTOMATICA" ? "Validação automática" : "Validação manual"}
						</span>
					</div>

					<div className="flex flex-wrap items-center gap-2 pt-0.5">
						<LoadingButton
							type="button"
							variant="outline"
							size="sm"
							className="flex items-center gap-1.5"
							loading={toggleIsPending}
							onClick={() => handleToggleActive()}
						>
							{coupon.ativo ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
							{coupon.ativo ? "DESATIVAR" : "ATIVAR"}
						</LoadingButton>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="flex items-center gap-1.5 text-destructive"
							disabled={deleteIsPending}
							onClick={() => handleDeleteCoupon({ id: coupon.id })}
						>
							<Trash2 className="h-3.5 w-3.5" />
							EXCLUIR
						</Button>
					</div>
				</div>

				<div className="flex w-full shrink-0 flex-col gap-2 lg:w-[420px]">
					<div className="flex gap-2">
						<HeaderScoreCard
							icon={<Ticket />}
							label="RESGATES"
							value={formatDecimalPlaces(impacto.resgates)}
							hint={impacto.clientesUnicos > 0 ? `${formatDecimalPlaces(impacto.clientesUnicos)} clientes únicos` : null}
						/>
						<HeaderScoreCard
							icon={<BadgeDollarSign />}
							label="RECEITA"
							value={formatToMoney(impacto.receitaInfluenciada)}
							hint={`${formatToMoney(impacto.descontoConcedido)} de desconto`}
						/>
					</div>
					{coupon.limiteResgatesTotal && consumoDoLimite !== null ? (
						<div className="flex flex-col gap-2 rounded-xl border border-border bg-brand/10 px-3.5 py-3">
							<div className="flex items-center justify-between gap-2">
								<span className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
									<Gauge className="h-3.5 w-3.5" />
									LIMITE DE RESGATES
								</span>
								<span className="text-sm font-bold tabular-nums">
									{formatDecimalPlaces(impacto.resgates)} / {formatDecimalPlaces(coupon.limiteResgatesTotal)}
								</span>
							</div>
							<div className="h-2 w-full rounded-full bg-card">
								<div className="h-2 rounded-full bg-brand" style={{ width: `${Math.min(consumoDoLimite, 100)}%` }} />
							</div>
							<span className="text-[0.65rem] text-muted-foreground">
								{formatDecimalPlaces(consumoDoLimite, 1, 1)}% do limite consumido · {formatDecimalPlaces(resgatesDisponiveis ?? 0)} resgates disponíveis
							</span>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

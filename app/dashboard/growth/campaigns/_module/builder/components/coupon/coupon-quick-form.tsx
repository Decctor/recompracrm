"use client";

import NumberInput from "@/components/Inputs/NumberInput";
import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { useCoupons } from "@/lib/queries/coupons";
import { cn } from "@/lib/utils";
import { CAMPAIGN_INLINE_COUPON_DEFAULTS, type TCampaignInlineCoupon } from "@/schemas/coupons";
import { BadgePercent, Check, Coins, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const BENEFIT_OPTIONS = [
	{
		value: "DESCONTO_PERCENTUAL" as const,
		icon: BadgePercent,
		titulo: "Desconto percentual",
		descricao: "Tira uma porcentagem do valor. Você pode limitar o teto em reais.",
	},
	{
		value: "DESCONTO_FIXO" as const,
		icon: Coins,
		titulo: "Desconto em reais",
		descricao: "Abate um valor fixo em reais da compra.",
	},
];

/** Espelha o que o servidor fixa em `CAMPAIGN_INLINE_COUPON_DEFAULTS` — a UI só descreve. */
const APPLIED_DEFAULTS = [
	"Escopo individual",
	"Validação automática",
	"Vale na compra toda",
	`${CAMPAIGN_INLINE_COUPON_DEFAULTS.limiteResgatesPorCliente} resgate por cliente`,
	"Sem valor mínimo",
];

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCouponCode() {
	// Alfabeto sem 0/O/1/I: o código é lido em voz alta e digitado no balcão.
	const random = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
	return `VOLTA${random}`;
}

export type TCouponQuickFormDraft = {
	codigo: string;
	titulo: string;
	beneficioTipo: TCampaignInlineCoupon["beneficioTipo"];
	beneficioValor: number | null;
	beneficioDescontoMaximo: number | null;
};

export const EMPTY_COUPON_QUICK_FORM: TCouponQuickFormDraft = {
	codigo: "",
	titulo: "",
	beneficioTipo: "DESCONTO_PERCENTUAL",
	beneficioValor: null,
	beneficioDescontoMaximo: null,
};

type CouponQuickFormProps = {
	draft: TCouponQuickFormDraft;
	onChange: (draft: TCouponQuickFormDraft) => void;
	couponBuilderHref: string;
};

export default function CouponQuickForm({ draft, onChange, couponBuilderHref }: CouponQuickFormProps) {
	const [codeTouched, setCodeTouched] = useState(false);

	// O código é único por organização e, com a criação atômica, uma colisão só estouraria no
	// submit final. Esta busca antecipa o aviso enquanto o usuário ainda está no formulário.
	const trimmedCode = draft.codigo.trim().toUpperCase();
	const { data: codeLookup, isFetching: isCheckingCode } = useCoupons({
		initialParams: { search: trimmedCode, page: 1 },
	});
	const codeAlreadyTaken = useMemo(() => {
		if (!trimmedCode) return false;
		return (codeLookup?.coupons ?? []).some((coupon) => coupon.codigo.toUpperCase() === trimmedCode);
	}, [codeLookup, trimmedCode]);

	function update(patch: Partial<TCouponQuickFormDraft>) {
		onChange({ ...draft, ...patch });
	}

	const isPercentual = draft.beneficioTipo === "DESCONTO_PERCENTUAL";

	return (
		<div className="flex w-full flex-col gap-3.5 rounded-xl border border-border bg-muted/45 p-3.5">
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
				<div className="flex flex-col gap-1">
					<div className="flex items-end gap-2">
						<div className="min-w-0 flex-1">
							<TextInput
								label="CÓDIGO DO CUPOM"
								value={draft.codigo}
								placeholder="Ex: VOLTA15"
								handleChange={(value) => {
									setCodeTouched(true);
									update({ codigo: value.toUpperCase() });
								}}
							/>
						</div>
						<Button
							type="button"
							size="sm"
							variant="secondary"
							onClick={() => {
								setCodeTouched(true);
								update({ codigo: generateCouponCode() });
							}}
							className="mb-0.5 shrink-0 rounded-full"
						>
							GERAR
						</Button>
					</div>
					{codeTouched && codeAlreadyTaken && !isCheckingCode ? (
						<p className="text-xs text-amber-600 dark:text-amber-400">Já existe um cupom com esse código. Escolha outro para salvar a campanha.</p>
					) : null}
				</div>

				<TextInput
					label="TÍTULO INTERNO"
					value={draft.titulo}
					placeholder="Ex: Reativação setembro — clientes em risco"
					handleChange={(value) => update({ titulo: value })}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que o cliente ganha?</span>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{BENEFIT_OPTIONS.map((option) => {
						const Icon = option.icon;
						const isSelected = draft.beneficioTipo === option.value;
						return (
							<button
								key={option.value}
								type="button"
								onClick={() =>
									update({
										beneficioTipo: option.value,
										// O teto em reais só existe para percentual; trocar limpa o campo morto.
										beneficioDescontoMaximo: option.value === "DESCONTO_PERCENTUAL" ? draft.beneficioDescontoMaximo : null,
									})
								}
								className={cn(
									"flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40",
									isSelected && "border-primary bg-primary/[0.06] shadow-sm",
								)}
							>
								<span
									className={cn(
										"mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
										isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
									)}
								>
									<Icon className="h-3.5 w-3.5" />
								</span>
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="text-sm font-semibold tracking-tight">{option.titulo}</span>
									<span className="text-xs leading-snug text-muted-foreground">{option.descricao}</span>
								</span>
							</button>
						);
					})}
				</div>
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-[11px] text-muted-foreground">Preço fixo e "leve mais, pague menos" exigem escolher produtos —</span>
					<Link href={couponBuilderHref} target="_blank" className="text-[11px] font-semibold text-primary hover:underline">
						abrir construtor de cupons
					</Link>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<NumberInput
					label={isPercentual ? "DESCONTO (%)" : "DESCONTO (R$)"}
					value={draft.beneficioValor}
					placeholder={isPercentual ? "Ex: 15 para 15% de desconto..." : "Ex: 20 para R$ 20 de desconto..."}
					handleChange={(value) => update({ beneficioValor: value })}
				/>
				{isPercentual ? (
					<NumberInput
						label="DESCONTO MÁXIMO (R$)"
						value={draft.beneficioDescontoMaximo}
						placeholder="Teto em R$ (opcional)"
						handleChange={(value) => update({ beneficioDescontoMaximo: value })}
					/>
				) : null}
			</div>

			<div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
				<div className="flex items-center justify-between gap-2">
					<p className="flex items-center gap-1.5 text-xs font-bold uppercase">
						<SlidersHorizontal className="h-3.5 w-3.5" />
						Padrões aplicados
					</p>
					<Link href={couponBuilderHref} target="_blank" className="text-xs font-semibold text-primary hover:underline">
						Ajustar no construtor
					</Link>
				</div>
				<div className="flex flex-wrap gap-1.5">
					{APPLIED_DEFAULTS.map((label) => (
						<span key={label} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
							<Check className="h-2.5 w-2.5" />
							{label}
						</span>
					))}
				</div>
			</div>

			<p className="text-xs text-muted-foreground">O cupom é criado junto com a campanha, ao salvar.</p>
		</div>
	);
}

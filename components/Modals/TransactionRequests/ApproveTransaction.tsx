"use client";
import { ResponsiveMenuAnimatedBody } from "@/components/Utils/ResponsiveMenuAnimatedBody";
import { LoadingButton } from "@/components/loading-button";
import { PoiBalanceUsageBar, POI_OPERATION_KINDS, type TPoiOperationKind } from "@/components/PointOfInteraction/operation-kinds";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";

import { SaleValueConfirmationInput } from "@/app/(external)/point-of-interaction/[orgId]/_shared/components/sale-value-confirmation-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";
import { formatCashbackValue, formatDecimalPlaces, formatToMoney, getCashbackUnitLabel } from "@/lib/formatting";
import { approvePoiTransactionRequest } from "@/lib/mutations/poi-transaction-requests";
import { getFreeFormRewardBlockReason } from "@/lib/point-of-interaction/free-form-reward";
import { saleValuesMatch } from "@/lib/point-of-interaction/sale-value-confirmation";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { AlertTriangle } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

const OPERATOR_PASSWORD_LENGTH = 5;

// Acima deste valor a aprovação exige uma confirmação explícita do operador, reduzindo a
// chance de aprovar uma venda com a ordem de grandeza errada (ex.: R$ 20,96 digitado como R$ 2.096,00).
// TODO: tornar configurável por organização quando houver necessidade.
const HIGH_VALUE_CONFIRMATION_THRESHOLD = 1000;

type TApproveTransactionCoupon = {
	cupomId: string;
	valorDesconto: number | null;
	titulo: string | null;
	codigo: string | null;
	validacaoModo: string | null;
	condicoesTexto: string | null;
};

type TApproveTransactionFreeFormReward = {
	descricao: string;
	/** Débito sugerido no pedido; nulo quando o cliente só descreveu o prêmio (pedido pelo celular). */
	valor: number | null;
	/** Saldo atual do cliente, quando conhecido. */
	saldoDisponivel: number | null;
	terminologia: TCashbackProgramTerminologyEnum;
};

type ApproveTransactionProps = {
	requestId: string;
	/** Tipo da operação pedida: dá a cor e o ícone da faixa do topo. */
	kind: TPoiOperationKind;
	clientDisplayName?: string;
	valorBruto: number;
	valorFinal: number;
	/** Saldo usado pela solicitação (desconto ou recompensas do catálogo). */
	valorResgate: number;
	/** Cupom solicitado na transação (quando MANUAL sem valor, o operador informa o desconto aqui). */
	coupon?: TApproveTransactionCoupon | null;
	/** Recompensa avulsa: o operador define aqui quanto debitar do saldo. Sem venda, sem valor a conferir. */
	freeFormReward?: TApproveTransactionFreeFormReward | null;
	/** Quando ausente, é obrigatório informar a senha do operador (vendedor). */
	hasLinkedSeller: boolean;
	requiresOperatorPassword: boolean;
	requiresSaleValueConfirmation: boolean;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

// Exibe o valor com os centavos visualmente separados, deixando a ordem de grandeza inequívoca.
function HighlightedMoney({ value }: { value: number }) {
	const [reais, centavos] = formatDecimalPlaces(value, 2, 2).split(",");
	return (
		<span className="font-black tabular-nums tracking-tight">
			<span className="text-sm align-top text-muted-foreground">R$ </span>
			<span className="text-4xl short:text-3xl">{reais}</span>
			<span className="text-2xl short:text-xl text-muted-foreground">,{centavos}</span>
		</span>
	);
}

export function ApproveTransaction({
	requestId,
	kind,
	clientDisplayName,
	valorBruto,
	valorFinal,
	valorResgate,
	coupon,
	freeFormReward,
	hasLinkedSeller,
	requiresOperatorPassword,
	requiresSaleValueConfirmation,
	closeModal,
	callbacks,
}: ApproveTransactionProps) {
	const [operatorPassword, setOperatorPassword] = useState("");
	const [operatorConfirmedSaleValue, setOperatorConfirmedSaleValue] = useState<number | null>(null);
	const [operatorCouponDiscountValue, setOperatorCouponDiscountValue] = useState<number | null>(null);
	const [highValueConfirmed, setHighValueConfirmed] = useState(false);
	const [operatorFreeFormRewardValue, setOperatorFreeFormRewardValue] = useState<number | null>(freeFormReward?.valor ?? null);

	// Recompensa avulsa não tem venda: o valor em reais a conferir é zero, o que importa é o débito.
	const requiresHighValueConfirmation = !freeFormReward && valorFinal >= HIGH_VALUE_CONFIRMATION_THRESHOLD;
	const hasDiscount = valorBruto > valorFinal;
	// Cupom MANUAL enviado sem valor: o desconto é definido pelo operador na aprovação.
	const requiresCouponDiscountInput = !!coupon && coupon.validacaoModo === "MANUAL" && !coupon.valorDesconto;

	const { mutate, isPending } = useMutation({
		mutationKey: ["approve-poi-transaction-request", requestId],
		mutationFn: approvePoiTransactionRequest,
		onMutate: () => {
			callbacks?.onMutate?.();
		},
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => {
			callbacks?.onError?.(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			callbacks?.onSettled?.();
		},
	});

	const handleApprove = useCallback(() => {
		if (requiresHighValueConfirmation && !highValueConfirmed) {
			toast.error(`Confirme que o valor de ${formatToMoney(valorFinal)} está correto antes de aprovar.`);
			return;
		}
		const code = operatorPassword;
		if (requiresSaleValueConfirmation && operatorConfirmedSaleValue == null) {
			toast.error("Confirme o valor final da venda.");
			return;
		}
		if (requiresSaleValueConfirmation && operatorConfirmedSaleValue != null && !saleValuesMatch(operatorConfirmedSaleValue, valorFinal)) {
			toast.error("O valor confirmado não corresponde ao valor da venda.");
			return;
		}
		if (freeFormReward) {
			const freeFormBlockReason = getFreeFormRewardBlockReason({
				descricao: freeFormReward.descricao,
				valor: operatorFreeFormRewardValue,
				availableBalance: freeFormReward.saldoDisponivel,
			});
			if (freeFormBlockReason) {
				toast.error(freeFormBlockReason);
				return;
			}
		}
		if (requiresCouponDiscountInput) {
			if (!operatorCouponDiscountValue || operatorCouponDiscountValue <= 0) {
				toast.error("Informe o valor do desconto do cupom (validação do operador).");
				return;
			}
			if (operatorCouponDiscountValue > valorBruto) {
				toast.error("O desconto do cupom não pode superar o valor da venda.");
				return;
			}
		}
		if (!hasLinkedSeller || requiresOperatorPassword) {
			if (code.length !== OPERATOR_PASSWORD_LENGTH) {
				toast.error("Informe os 5 dígitos da senha do operador.");
				return;
			}
		} else if (code.length > 0 && code.length !== OPERATOR_PASSWORD_LENGTH) {
			toast.error("Informe os 5 dígitos da senha ou deixe todos os campos em branco para usar o vendedor vinculado ao seu usuário.");
			return;
		}
		mutate({
			requestId,
			operatorIdentifier: code.length === OPERATOR_PASSWORD_LENGTH ? code : undefined,
			operatorConfirmedSaleValue: requiresSaleValueConfirmation ? operatorConfirmedSaleValue : undefined,
			operatorCouponDiscountValue: requiresCouponDiscountInput ? operatorCouponDiscountValue : undefined,
			operatorFreeFormRewardValue: freeFormReward ? operatorFreeFormRewardValue : undefined,
		});
	}, [
		freeFormReward,
		operatorFreeFormRewardValue,
		hasLinkedSeller,
		highValueConfirmed,
		mutate,
		operatorConfirmedSaleValue,
		operatorCouponDiscountValue,
		operatorPassword,
		requestId,
		requiresCouponDiscountInput,
		requiresHighValueConfirmation,
		requiresOperatorPassword,
		requiresSaleValueConfirmation,
		valorBruto,
		valorFinal,
	]);

	const description = hasLinkedSeller
		? requiresOperatorPassword
			? "Informe os 5 dígitos da senha do vendedor que receberá a venda."
			: "Informe os 5 dígitos da senha do vendedor que receberá a venda. Se deixar em branco, será usado o vendedor vinculado ao seu usuário."
		: "Informe os 5 dígitos da senha do operador (vendedor) que receberá esta venda.";

	return (
		<ResponsiveMenu.Root
			open
			onOpenChange={(open) => {
				if (!open) closeModal();
			}}
		>
			<ResponsiveMenu.Content dialogClassName="min-w-0 overflow-x-hidden sm:max-w-lg" drawerClassName={"max-h-[70dvh]" + " " + "overflow-x-hidden"}>
				<ResponsiveMenu.Header>
					<ResponsiveMenu.Title>APROVAR SOLICITAÇÃO</ResponsiveMenu.Title>
					<ResponsiveMenu.Description>
						{clientDisplayName ? `Cliente: ${clientDisplayName}.` : "Confira o valor e identifique o operador."}
					</ResponsiveMenu.Description>
				</ResponsiveMenu.Header>
				<ResponsiveMenuAnimatedBody stateKey="content" className="overflow-x-hidden overflow-y-auto">
					<div className="flex w-full min-w-0 flex-col gap-4 overflow-x-hidden py-2">
						<ApproveTransactionKindBanner kind={kind} />
						{freeFormReward ? (
							<FreeFormRewardApproval freeFormReward={freeFormReward} value={operatorFreeFormRewardValue} onChange={setOperatorFreeFormRewardValue} />
						) : (
							// Valor em destaque: o operador deve conferir o valor no momento da aprovação.
							<div className="flex w-full flex-col items-center gap-1 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-5 text-center">
								<span className="text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">Valor a aprovar</span>
								<HighlightedMoney value={valorFinal} />
								{hasDiscount ? (
									<span className="text-[0.7rem] font-medium text-muted-foreground">
										Bruto {formatToMoney(valorBruto)}
										{valorResgate > 0 ? (
											<>
												{" · "}
												<span className={cn("font-semibold", POI_OPERATION_KINDS[kind].classes.amount)}>resgate − {formatToMoney(valorResgate)}</span>
											</>
										) : (
											" · com desconto aplicado"
										)}
									</span>
								) : null}
							</div>
						)}

						{requiresHighValueConfirmation ? (
							<label
								htmlFor="poi-approve-high-value"
								className={cn(
									"flex w-full cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors",
									highValueConfirmed ? "border-brand/40 bg-brand/5" : "border-amber-300 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/10",
								)}
							>
								<Checkbox
									id="poi-approve-high-value"
									checked={highValueConfirmed}
									onCheckedChange={(v) => setHighValueConfirmed(v === true)}
									className="mt-0.5"
								/>
								<span className="flex items-start gap-1.5 text-xs font-medium leading-snug text-foreground/90">
									<AlertTriangle className="mt-0.5 h-4 w-4 min-h-4 min-w-4 text-amber-500" />
									Valor elevado. Confirmo que conferi e o valor de <strong className="font-black">{formatToMoney(valorFinal)}</strong> está correto.
								</span>
							</label>
						) : null}

						{coupon ? (
							<div className="flex w-full flex-col gap-2 rounded-xl border border-brand/20 bg-brand/5 px-3 py-3">
								<div className="flex items-center justify-between">
									<span className="text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground">
										Cupom {coupon.codigo ?? ""} — {coupon.titulo ?? ""}
									</span>
									{coupon.valorDesconto ? <span className="text-xs font-black text-green-600">- {formatToMoney(coupon.valorDesconto)}</span> : null}
								</div>
								{coupon.condicoesTexto ? <p className="text-[0.7rem] text-muted-foreground">Condições: {coupon.condicoesTexto}</p> : null}
								{requiresCouponDiscountInput ? (
									<div className="flex flex-col gap-1">
										<Label htmlFor="poi-approve-coupon-discount" className="text-xs font-medium tracking-tight text-foreground/80">
											DESCONTO DO CUPOM (R$)<span className="text-red-500">*</span>
										</Label>
										<p className="text-[0.7rem] text-muted-foreground">Confira as condições do cupom na compra e informe o valor do desconto concedido.</p>
										<Input
											id="poi-approve-coupon-discount"
											type="number"
											placeholder="Ex: 25 para R$ 25,00..."
											value={operatorCouponDiscountValue ?? ""}
											onChange={(event) => {
												const inputValue = Number(event.target.value);
												setOperatorCouponDiscountValue(Number.isFinite(inputValue) && inputValue > 0 ? inputValue : null);
											}}
										/>
									</div>
								) : null}
							</div>
						) : null}

						{requiresSaleValueConfirmation ? (
							<SaleValueConfirmationInput value={operatorConfirmedSaleValue} onChange={setOperatorConfirmedSaleValue} compact />
						) : null}

						<div className="flex w-full min-w-0 flex-col gap-3 overflow-x-hidden">
							<Label htmlFor="poi-approve-operator-password" className="text-sm font-medium tracking-tight text-foreground/80">
								SENHA DO OPERADOR (5 DÍGITOS)
								{!hasLinkedSeller || requiresOperatorPassword ? <span className="text-red-500">*</span> : null}
							</Label>
							<p className="text-[0.7rem] text-muted-foreground">{description}</p>
							<InputOTP
								id="poi-approve-operator-password"
								maxLength={OPERATOR_PASSWORD_LENGTH}
								pattern={REGEXP_ONLY_DIGITS}
								inputMode="numeric"
								autoComplete="off"
								pushPasswordManagerStrategy="none"
								value={operatorPassword}
								onChange={(value) => setOperatorPassword(value)}
								containerClassName="mx-auto w-full max-w-full justify-center"
							>
								<InputOTPGroup>
									<InputOTPSlot index={0} />
									<InputOTPSlot index={1} />
									<InputOTPSlot index={2} />
									<InputOTPSlot index={3} />
									<InputOTPSlot index={4} />
								</InputOTPGroup>
							</InputOTP>
						</div>
					</div>
				</ResponsiveMenuAnimatedBody>
				<ResponsiveMenu.Footer>
					<ResponsiveMenu.Close variant="outline">CANCELAR</ResponsiveMenu.Close>
					<LoadingButton loading={isPending} onClick={handleApprove}>
						{freeFormReward && operatorFreeFormRewardValue
							? `APROVAR E DEBITAR ${formatCashbackValue(operatorFreeFormRewardValue, freeFormReward.terminologia)}`
							: "APROVAR"}
					</LoadingButton>
				</ResponsiveMenu.Footer>
			</ResponsiveMenu.Content>
		</ResponsiveMenu.Root>
	);
}

const KIND_BANNER_SUBTITLES: Record<TPoiOperationKind, string> = {
	"sale-only": "Registra a venda",
	discount: "Registra a venda e usa saldo como desconto",
	prize: "Troca saldo por recompensas do catálogo",
	"free-form": "Você define o débito. Nenhuma venda é registrada.",
};

/** Faixa do topo: o tipo da solicitação na mesma cor e ícone da fila e da nova transação. */
function ApproveTransactionKindBanner({ kind }: { kind: TPoiOperationKind }) {
	const meta = POI_OPERATION_KINDS[kind];
	const Icon = meta.icon;
	return (
		<div className={cn("flex w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5", meta.classes.surface)}>
			<span className={cn("flex size-8 min-w-8 items-center justify-center rounded-lg", meta.classes.iconTile)}>
				<Icon className="size-4" />
			</span>
			<span className="flex min-w-0 flex-col">
				<span className={cn("text-sm font-semibold", meta.classes.title)}>{meta.label}</span>
				<span className={cn("text-xs", meta.classes.text)}>{KIND_BANNER_SUBTITLES[kind]}</span>
			</span>
		</div>
	);
}

/**
 * Recompensa avulsa na aprovação: o que o cliente pediu (como ele descreveu) e quanto debitar,
 * contra o saldo atual. O débito é do operador — o celular do cliente não define valor.
 */
function FreeFormRewardApproval({
	freeFormReward,
	value,
	onChange,
}: {
	freeFormReward: TApproveTransactionFreeFormReward;
	value: number | null;
	onChange: (value: number | null) => void;
}) {
	const { terminologia, saldoDisponivel } = freeFormReward;
	const meta = POI_OPERATION_KINDS["free-form"];
	const isPoints = terminologia === "PONTOS";
	const balanceAfter = saldoDisponivel != null && value != null ? saldoDisponivel - value : null;
	const exceedsBalance = balanceAfter != null && balanceAfter < -0.0001;
	return (
		<div
			className={cn(
				"flex w-full flex-col gap-3 rounded-2xl border px-4 py-4",
				exceedsBalance ? "border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30" : meta.classes.surface,
			)}
		>
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className={cn("text-[0.65rem] font-bold uppercase tracking-widest", meta.classes.text)}>Pedido do cliente</span>
				<p className="text-base font-semibold break-words">“{freeFormReward.descricao}”</p>
				<span className="text-xs text-muted-foreground">Confira se é isso que sai do balcão.</span>
			</div>
			<div className="flex flex-col gap-1">
				<Label htmlFor="poi-approve-free-form-value" className="text-xs font-medium tracking-tight text-foreground/80">
					{`VALOR A DEBITAR (${getCashbackUnitLabel(terminologia, { uppercase: true })})`}
					<span className="text-red-500">*</span>
				</Label>
				<Input
					id="poi-approve-free-form-value"
					type="number"
					inputMode={isPoints ? "numeric" : "decimal"}
					min={0}
					step={isPoints ? 1 : 0.01}
					placeholder={isPoints ? "Ex: 500" : "Ex: 25,00"}
					value={value ?? ""}
					onChange={(event) => {
						const inputValue = Number(event.target.value);
						onChange(event.target.value !== "" && Number.isFinite(inputValue) && inputValue > 0 ? inputValue : null);
					}}
				/>
			</div>
			{saldoDisponivel != null ? (
				<div className="flex flex-col gap-1.5">
					<PoiBalanceUsageBar kind="free-form" used={value ?? 0} available={saldoDisponivel} />
					<div
						className={cn(
							"flex flex-wrap justify-between gap-x-3 text-xs",
							exceedsBalance ? "font-semibold text-red-700 dark:text-red-400" : "text-foreground/80",
						)}
					>
						<span>
							Saldo do cliente <strong>{formatCashbackValue(saldoDisponivel, terminologia)}</strong>
						</span>
						<span>{exceedsBalance ? "saldo insuficiente" : balanceAfter != null ? `fica ${formatCashbackValue(balanceAfter, terminologia)}` : null}</span>
					</div>
				</div>
			) : (
				<p className="text-[0.7rem] text-muted-foreground">Combine o valor com o cliente. Só o saldo é debitado, sem registrar venda.</p>
			)}
		</div>
	);
}

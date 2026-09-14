"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatToMoney } from "@/lib/formatting";
import { OperatorConfirmationInput } from "../../_shared/components/operator-confirmation-input";
import { SaleValueConfirmationInput } from "../../_shared/components/sale-value-confirmation-input";

export type TConfirmationStepAppliedCoupon = {
	codigo: string;
	titulo: string;
	validacaoModo: "AUTOMATICA" | "MANUAL";
	condicoesTexto: string | null;
	valorDesconto: number | null;
};

type ConfirmationStepProps = {
	clientName: string;
	finalValue: number;
	operatorIdentifier: string;
	onOperatorIdentifierChange: (identifier: string) => void;
	requiresSaleValueConfirmation: boolean;
	operatorConfirmedSaleValue: number | null;
	onOperatorConfirmedSaleValueChange: (value: number | null) => void;
	appliedCoupon?: TConfirmationStepAppliedCoupon | null;
	onCouponDiscountChange?: (value: number | null) => void;
	onSubmit: () => void;
};

export function ConfirmationStep({
	clientName,
	finalValue,
	operatorIdentifier,
	onOperatorIdentifierChange,
	requiresSaleValueConfirmation,
	operatorConfirmedSaleValue,
	onOperatorConfirmedSaleValueChange,
	appliedCoupon,
	onCouponDiscountChange,
	onSubmit,
}: ConfirmationStepProps) {
	return (
		<form
			className="space-y-8 short:space-y-2 animate-in fade-in slide-in-from-bottom-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			<div className="text-center space-y-2 short:space-y-0.5">
				<h2 className="text-xl short:text-lg font-extrabold tracking-tight">Finalizar operação</h2>
				<p className="text-muted-foreground short:text-xs">Confira os dados e digite o usuário do operador.</p>
			</div>

			<div className="bg-brand/5 rounded-3xl short:rounded-xl p-6 short:p-2.5 space-y-3 short:space-y-1.5 border border-brand/20">
				<div className="flex justify-between">
					<span className="text-muted-foreground font-bold text-xs short:text-[0.7rem] uppercase">Cliente</span>
					<span className="font-black text-brand short:text-xs">{clientName}</span>
				</div>
				{appliedCoupon ? (
					<div className="flex justify-between">
						<span className="text-muted-foreground font-bold text-xs short:text-[0.7rem] uppercase">Cupom {appliedCoupon.codigo}</span>
						<span className="font-black text-green-600 short:text-xs">
							{appliedCoupon.valorDesconto ? `- ${formatToMoney(appliedCoupon.valorDesconto)}` : "VALIDAÇÃO DO OPERADOR"}
						</span>
					</div>
				) : null}
				<div className="flex justify-between">
					<span className="text-muted-foreground font-bold text-xs short:text-[0.7rem] uppercase">Valor Final</span>
					<span className="font-black text-brand text-xl short:text-base">{formatToMoney(finalValue)}</span>
				</div>
			</div>

			{appliedCoupon?.validacaoModo === "MANUAL" && onCouponDiscountChange ? (
				<div className="space-y-2 short:space-y-1">
					<Label className="font-bold text-xs short:text-[0.65rem] text-muted-foreground uppercase tracking-widest text-center block">
						Desconto do cupom {appliedCoupon.codigo} (validação do operador)
					</Label>
					{appliedCoupon.condicoesTexto ? (
						<p className="text-xs short:text-[0.65rem] text-muted-foreground text-center italic">Condições: {appliedCoupon.condicoesTexto}</p>
					) : null}
					<Input
						type="number"
						placeholder="Valor do desconto em R$"
						value={appliedCoupon.valorDesconto ?? ""}
						onChange={(e) => {
							const inputValue = Number(e.target.value);
							onCouponDiscountChange(Number.isFinite(inputValue) && inputValue > 0 ? inputValue : null);
						}}
						className="h-14 short:h-11 text-2xl short:text-xl font-black text-center rounded-2xl short:rounded-lg border border-green-200 bg-green-50/30"
					/>
				</div>
			) : null}

			<OperatorConfirmationInput value={operatorIdentifier} onChange={onOperatorIdentifierChange} useVirtualKeyboard />
			{requiresSaleValueConfirmation ? (
				<SaleValueConfirmationInput value={operatorConfirmedSaleValue} onChange={onOperatorConfirmedSaleValueChange} useVirtualKeyboard />
			) : null}
		</form>
	);
}

"use client";

import { UserRoundCheck } from "lucide-react";
import { SellerPicker } from "./seller-picker";

type SaleSellerPickerProps = {
	orgId: string;
	/** Vendedor escolhido; `null` = a venda fica com o operador (a senha digitada). */
	value: string | null;
	onChange: (sellerId: string | null) => void;
	className?: string;
};

/**
 * "Quem fez a venda?" nas confirmações de venda do ponto de interação (totem, nova transação e
 * aprovação no painel). O operador continua autenticando com a senha; aqui só se diz a quem a
 * venda é creditada. Opcional: o cartão OPERADOR nasce marcado, e tocar de novo no vendedor
 * escolhido volta para ele.
 */
export function SaleSellerPicker({ orgId, value, onChange, className }: SaleSellerPickerProps) {
	return (
		<SellerPicker
			orgId={orgId}
			selectedSellerId={value}
			isSkipped={value === null}
			onSelectSeller={onChange}
			onSkip={() => onChange(null)}
			label="QUEM FEZ A VENDA? (OPCIONAL)"
			skipLabel="OPERADOR"
			SkipIcon={UserRoundCheck}
			hideWhenSingleSeller
			className={className}
		/>
	);
}

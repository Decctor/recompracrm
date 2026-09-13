import CheckboxInput from "@/components/Inputs/CheckboxInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import CouponBlockShell from "./BlockShell";
import type { TUseInternalCouponState } from "@/state-hooks/use-internal-coupon-state";
import { CouponScopeOptions, CouponValidationModeOptions } from "@/utils/select-options";
import { LayoutGrid } from "lucide-react";

type CouponGeneralBlockProps = {
	coupon: TUseInternalCouponState["state"]["coupon"];
	updateCoupon: TUseInternalCouponState["updateCoupon"];
	embedded?: boolean;
};
export default function CouponGeneralBlock({ coupon, updateCoupon, embedded }: CouponGeneralBlockProps) {
	return (
		<CouponBlockShell embedded={embedded} title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full flex items-center justify-center">
				<CheckboxInput
					checked={coupon.ativo}
					labelTrue="ATIVO"
					labelFalse="INATIVO"
					handleChange={(value) => updateCoupon({ ativo: value })}
					justify="justify-center"
				/>
			</div>
			<div className="w-full flex items-center gap-2 flex-col lg:flex-row">
				<div className="w-full lg:w-2/3">
					<TextInput
						value={coupon.titulo}
						label="TÍTULO"
						placeholder="Preencha aqui o título do cupom..."
						handleChange={(value) => updateCoupon({ titulo: value })}
					/>
				</div>
				<div className="w-full lg:w-1/3">
					<TextInput
						value={coupon.codigo}
						label="CÓDIGO"
						placeholder="Ex: PROMO10"
						handleChange={(value) => updateCoupon({ codigo: value.toUpperCase() })}
					/>
				</div>
			</div>
			<TextareaInput
				value={coupon.descricao ?? ""}
				label="DESCRIÇÃO"
				placeholder="Preencha aqui a descrição do cupom (visível ao cliente final)..."
				handleChange={(value) => updateCoupon({ descricao: value })}
			/>
			<div className="w-full flex items-center gap-2 flex-col lg:flex-row">
				<div className="w-full lg:w-1/2">
					<SelectInput
						value={coupon.escopo}
						label="QUEM PODE USAR"
						resetOptionLabel="QUALQUER CLIENTE"
						handleChange={(value) => updateCoupon({ escopo: value as TUseInternalCouponState["state"]["coupon"]["escopo"] })}
						options={CouponScopeOptions}
						onReset={() => updateCoupon({ escopo: "GLOBAL" })}
					/>
				</div>
				<div className="w-full lg:w-1/2">
					<SelectInput
						value={coupon.validacaoModo}
						label="COMO É VALIDADO"
						resetOptionLabel="AUTOMÁTICA (SISTEMA CONFERE)"
						handleChange={(value) => updateCoupon({ validacaoModo: value as TUseInternalCouponState["state"]["coupon"]["validacaoModo"] })}
						options={CouponValidationModeOptions}
						onReset={() => updateCoupon({ validacaoModo: "AUTOMATICA" })}
					/>
				</div>
			</div>
			{coupon.validacaoModo === "MANUAL" ? (
				<TextareaInput
					value={coupon.condicoesTexto ?? ""}
					label="CONDIÇÕES DE RESGATE"
					placeholder="Ex: Desconto válido apenas em calças. O operador deve conferir se há calça na compra..."
					handleChange={(value) => updateCoupon({ condicoesTexto: value })}
				/>
			) : null}
		</CouponBlockShell>
	);
}

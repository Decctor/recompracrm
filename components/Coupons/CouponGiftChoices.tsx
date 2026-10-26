import { Button } from "@/components/ui/button";
import { formatToMoney } from "@/lib/formatting";
import type { TCouponGiftOption } from "@/lib/coupons/gifts";

export default function CouponGiftChoices({
	options,
	itemLabel,
	onChoose,
}: {
	options: TCouponGiftOption[];
	itemLabel: (key: string) => string;
	onChoose: (option: TCouponGiftOption) => void;
}) {
	return (
		<fieldset className="flex min-w-0 flex-col gap-2">
			<legend className="mb-2 text-sm font-semibold">Escolha uma unidade do carrinho como brinde</legend>
			<p className="text-xs text-muted-foreground">Adicionais e entrega são cobrados à parte. O brinde não conta para atingir as condições de compra.</p>
			{options.length === 0 ? (
				<p className="text-sm text-muted-foreground">Adicione um dos produtos permitidos ao carrinho para escolher o brinde.</p>
			) : (
				options.map((option) => (
					<div key={option.itemChave} className="flex flex-col gap-1">
						<Button
							type="button"
							variant="outline"
							className="h-auto min-h-10 justify-between gap-2 whitespace-normal text-left"
							disabled={!option.avaliacao.elegivel}
							onClick={() => onChoose(option)}
						>
							<span>{itemLabel(option.itemChave)}</span>
							{option.avaliacao.elegivel ? <span className="shrink-0">Grátis · {formatToMoney(option.avaliacao.valorDesconto)}</span> : null}
						</Button>
						{!option.avaliacao.elegivel ? <p className="text-xs text-muted-foreground">{option.avaliacao.motivo}</p> : null}
					</div>
				))
			)}
		</fieldset>
	);
}

"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function CouponRemovalAction({
	hasGift,
	onRemove,
	onRemoveGift,
}: {
	hasGift: boolean;
	onRemove: () => void;
	onRemoveGift: () => void;
}) {
	const [choosing, setChoosing] = useState(false);
	if (!choosing || !hasGift)
		return (
			<Button type="button" variant="ghost" size="sm" onClick={() => (hasGift ? setChoosing(true) : onRemove())}>
				Remover cupom
			</Button>
		);
	return (
		<fieldset className="flex flex-col gap-2">
			<legend className="mb-2 text-sm font-semibold">O que fazer com o produto do brinde?</legend>
			<Button type="button" variant="outline" onClick={onRemove}>
				Manter no carrinho pelo preço normal
			</Button>
			<Button
				type="button"
				variant="outline"
				onClick={() => {
					onRemove();
					onRemoveGift();
				}}
			>
				Remover uma unidade do carrinho
			</Button>
			<Button type="button" variant="ghost" size="sm" onClick={() => setChoosing(false)}>
				Cancelar
			</Button>
		</fieldset>
	);
}

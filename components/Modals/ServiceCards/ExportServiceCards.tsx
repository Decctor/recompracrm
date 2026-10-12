import type { TGetServiceCardsOutput } from "@/app/api/service-cards/route";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { compareServiceCardCodes } from "@/lib/tabs/service-card-codes";
import { useMemo, useState } from "react";
import { ServiceCardFileActions } from "./ServiceCardFileActions";

type TServiceCardRow = NonNullable<TGetServiceCardsOutput["data"]["default"]>[number];

type ExportServiceCardsProps = {
	cards: TServiceCardRow[];
	logoUrl?: string | null;
	closeModal: () => void;
};

/** Arquivo para grafica de um intervalo de comandas ativas (vazio = todas). */
export function ExportServiceCards({ cards, logoUrl, closeModal }: ExportServiceCardsProps) {
	const [range, setRange] = useState<{ de: string; ate: string }>({ de: "", ate: "" });

	const exportCards = useMemo(() => {
		const de = range.de.trim();
		const ate = range.ate.trim();
		return cards
			.filter((card) => card.ativo)
			.filter((card) => !de || compareServiceCardCodes(card.codigo, de) >= 0)
			.filter((card) => !ate || compareServiceCardCodes(card.codigo, ate) <= 0)
			.sort((a, b) => compareServiceCardCodes(a.codigo, b.codigo))
			.map((card) => ({ codigo: card.codigo, tokenPublico: card.tokenPublico }));
	}, [cards, range]);

	return (
		<ResponsiveMenu
			mode="read-only"
			menuTitle="ARQUIVO PARA GRÁFICA"
			menuDescription="Comandas ativas no intervalo. Deixe em branco para incluir todas."
			menuCancelButtonText="FECHAR"
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<div className="flex flex-col gap-3 p-1">
				<div className="grid grid-cols-2 gap-3">
					<TextInput
						label="DA COMANDA"
						value={range.de}
						placeholder="Ex: 001"
						handleChange={(value) => setRange((prev) => ({ ...prev, de: value.toUpperCase() }))}
					/>
					<TextInput
						label="ATÉ A COMANDA"
						value={range.ate}
						placeholder="Ex: 200"
						handleChange={(value) => setRange((prev) => ({ ...prev, ate: value.toUpperCase() }))}
					/>
				</div>
				<p className="text-sm">
					<span className="font-bold">{exportCards.length}</span> comanda(s) selecionada(s)
					{exportCards.length > 0 ? `: ${exportCards[0].codigo}${exportCards.length > 1 ? ` a ${exportCards[exportCards.length - 1].codigo}` : ""}` : ""}.
				</p>
				<ServiceCardFileActions cards={exportCards} logoUrl={logoUrl} />
			</div>
		</ResponsiveMenu>
	);
}

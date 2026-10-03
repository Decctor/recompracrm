import type { TVisualKitConfig } from "@/schemas/visual-kits";
import { A4_PAGE, mmToPx } from "../formats";
import type { TVisualKitBrand, TVisualKitPieceItem } from "../types";
import {
	CUT_LINE,
	discountLabel,
	EmptyNotice,
	formatMoney,
	INK,
	PageFrame,
	PAPER,
	paginateSheets,
	PriceValue,
	resolveItemDisplay,
	SheetFooter,
	type TVisualKitPageArgs,
	type TVisualKitPieceRenderer,
} from "./shared";

const PER_SHEET = 65;
const COLUMNS = 5;
const STICKER_WIDTH = mmToPx(38);
const STICKER_HEIGHT = mmToPx(21);
const COLUMN_GAP = mmToPx(1);
const ROW_GAP = mmToPx(0.5);
const SHEET_TOP = mmToPx(7);
const SHEET_LEFT = (A4_PAGE.width - COLUMNS * STICKER_WIDTH - (COLUMNS - 1) * COLUMN_GAP) / 2;

/** Repete cada produto para completar a folha de 65 (mesma regra de `describeVisualKitPiece`). */
export function expandStickerItems(items: TVisualKitPieceItem[]) {
	const copies = Math.max(1, Math.floor(PER_SHEET / Math.max(1, items.length)));
	return items.flatMap((item) => Array.from({ length: copies }, () => item));
}

function Sticker({ item, brand, configuracao }: { item: TVisualKitPieceItem; brand: TVisualKitBrand; configuracao: TVisualKitConfig }) {
	const display = resolveItemDisplay(item, configuracao);
	return (
		<div
			style={{
				position: "relative",
				width: STICKER_WIDTH,
				height: STICKER_HEIGHT,
				boxSizing: "border-box",
				borderRadius: 6,
				outline: CUT_LINE,
				outlineOffset: -0.5,
				overflow: "hidden",
				display: "flex",
				background: PAPER,
			}}
		>
			<div style={{ width: 8, flexShrink: 0, background: brand.corPrimaria }} />
			<div style={{ flex: 1, minWidth: 0, padding: "8px 8px 6px 8px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
				<span
					style={{
						fontSize: 10.5,
						fontWeight: 700,
						lineHeight: 1.05,
						color: INK,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
						paddingRight: display.percentualDesconto != null ? 28 : 0,
					}}
				>
					{item.nome}
				</span>
				<div style={{ display: "flex", alignItems: "flex-end", gap: 4, color: INK }}>
					{display.precoDe != null ? <s style={{ fontSize: 9.5, color: "#6b6b6b", marginBottom: 2 }}>{formatMoney(display.precoDe)}</s> : null}
					<PriceValue value={item.preco} size={32} style={{ marginLeft: "auto" }} />
				</div>
			</div>
			{display.percentualDesconto != null ? (
				<span
					style={{
						position: "absolute",
						top: 0,
						right: 0,
						background: brand.corSecundaria,
						color: brand.corSecundariaForeground,
						fontSize: 9.5,
						fontWeight: 800,
						padding: "2px 6px",
						borderBottomLeftRadius: 6,
					}}
				>
					{discountLabel(display.percentualDesconto)}
				</span>
			) : null}
		</div>
	);
}

function StickerSheet({ props, page }: TVisualKitPageArgs) {
	return (
		<PageFrame size={A4_PAGE} background={PAPER}>
			{page.items.length ? (
				<div
					style={{
						position: "absolute",
						top: SHEET_TOP,
						left: SHEET_LEFT,
						display: "grid",
						gridTemplateColumns: `repeat(${COLUMNS}, ${STICKER_WIDTH}px)`,
						gridAutoRows: `${STICKER_HEIGHT}px`,
						columnGap: COLUMN_GAP,
						rowGap: ROW_GAP,
					}}
				>
					{page.items.map((item, index) => (
						<Sticker key={`${item.chave}-${index}`} item={item} brand={props.brand} configuracao={props.configuracao} />
					))}
				</div>
			) : (
				<EmptyNotice />
			)}
			<SheetFooter brand={props.brand} formato="ADESIVO_PRECO" page={page} hint="38 × 21 mm · 65 por folha" />
		</PageFrame>
	);
}

export const priceStickerRenderer: TVisualKitPieceRenderer = {
	// Mais de 65 produtos: um adesivo de cada, em quantas folhas forem necessárias.
	paginate: (props) => paginateSheets(expandStickerItems(props.items), PER_SHEET),
	pageSize: () => A4_PAGE,
	Page: StickerSheet,
};

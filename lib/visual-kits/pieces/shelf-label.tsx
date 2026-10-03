import type { TVisualKitConfig } from "@/schemas/visual-kits";
import { A4_PAGE, mmToPx } from "../formats";
import type { TVisualKitBrand, TVisualKitPieceItem } from "../types";
import { EanBarcode } from "./ean";
import {
	barcodeFor,
	clampLines,
	CUT_LINE,
	discountLabel,
	EmptyNotice,
	formatValidity,
	FromPrice,
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

const PER_SHEET = 14;
const LABEL_WIDTH = mmToPx(100);
const LABEL_HEIGHT = mmToPx(40);
const SHEET_TOP = mmToPx(6);
const SHEET_LEFT = mmToPx(5);

type TShelfLabelProps = { item: TVisualKitPieceItem; brand: TVisualKitBrand; configuracao: TVisualKitConfig; validity: string | null };

function ShelfLabel({ item, brand, configuracao, validity }: TShelfLabelProps) {
	const display = resolveItemDisplay(item, configuracao);
	const barcode = barcodeFor(item, configuracao);
	return (
		<div
			style={{
				width: LABEL_WIDTH,
				height: LABEL_HEIGHT,
				boxSizing: "border-box",
				outline: CUT_LINE,
				outlineOffset: -0.5,
				overflow: "hidden",
				display: "flex",
				flexDirection: "column",
				background: PAPER,
			}}
		>
			<div style={{ flex: 1, display: "flex", minHeight: 0 }}>
				<div style={{ flex: 1, minWidth: 0, padding: "11px 11px 8px 15px", display: "flex", flexDirection: "column" }}>
					<span style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.01em", color: INK, ...clampLines(2) }}>{item.nome}</span>
					{item.detalhe ? <span style={{ fontSize: 12, color: "#5c5c5c", marginTop: 4 }}>{item.detalhe}</span> : null}
					<div style={{ flex: 1 }} />
					<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
						<EanBarcode code={barcode} width={113} />
						{display.precoUnidade ? (
							<span
								style={{
									marginLeft: "auto",
									display: "flex",
									flexDirection: "column",
									alignItems: "flex-end",
									fontSize: 10.5,
									lineHeight: 1.25,
									color: "#333333",
									textAlign: "right",
								}}
							>
								<span style={{ fontWeight: 700 }}>{display.precoUnidade.valor}</span>
								<span>{display.precoUnidade.rotulo}</span>
							</span>
						) : null}
					</div>
				</div>
				<div
					style={{
						position: "relative",
						width: 159,
						flexShrink: 0,
						background: brand.corSecundaria,
						color: brand.corSecundariaForeground,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						gap: 6,
						padding: "0 6px",
					}}
				>
					{display.percentualDesconto != null ? (
						<span
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								background: brand.corPrimaria,
								color: brand.corPrimariaForeground,
								fontSize: 12.5,
								fontWeight: 800,
								padding: "4px 9px 4px 8px",
								borderBottomRightRadius: 8,
							}}
						>
							{discountLabel(display.percentualDesconto)}
						</span>
					) : null}
					{display.precoDe != null ? (
						<FromPrice value={display.precoDe} style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.85, marginTop: 12 }} />
					) : null}
					<PriceValue value={item.preco} size={57} />
					<span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.8 }}>por {item.unidade}</span>
				</div>
			</div>
			<div
				style={{
					height: 23,
					flexShrink: 0,
					background: brand.corPrimaria,
					color: brand.corPrimariaForeground,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 8,
					padding: "0 15px",
					fontSize: 10.5,
					fontWeight: 700,
					letterSpacing: "0.1em",
					textTransform: "uppercase",
					whiteSpace: "nowrap",
				}}
			>
				<span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{brand.nome}</span>
				{validity ? <span>Válido até {validity}</span> : null}
			</div>
		</div>
	);
}

function ShelfLabelSheet({ props, page }: TVisualKitPageArgs) {
	const validity = formatValidity(props.validadeFim);
	return (
		<PageFrame size={A4_PAGE} background={PAPER}>
			{page.items.length ? (
				<div
					style={{
						position: "absolute",
						top: SHEET_TOP,
						left: SHEET_LEFT,
						display: "grid",
						gridTemplateColumns: `repeat(2, ${LABEL_WIDTH}px)`,
						gridAutoRows: `${LABEL_HEIGHT}px`,
					}}
				>
					{page.items.map((item, index) => (
						<ShelfLabel key={`${item.chave}-${index}`} item={item} brand={props.brand} configuracao={props.configuracao} validity={validity} />
					))}
				</div>
			) : (
				<EmptyNotice />
			)}
			<SheetFooter brand={props.brand} formato="ETIQUETA_GONDOLA" page={page} hint="Recorte nas linhas tracejadas" />
		</PageFrame>
	);
}

export const shelfLabelRenderer: TVisualKitPieceRenderer = {
	paginate: (props) => paginateSheets(props.items, PER_SHEET),
	pageSize: () => A4_PAGE,
	Page: ShelfLabelSheet,
};

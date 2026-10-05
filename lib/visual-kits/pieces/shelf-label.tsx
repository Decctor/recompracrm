import type { TVisualKitConfig } from "@/schemas/visual-kits";
import { A4_PAGE, mmToPx } from "../formats";
import type { TVisualKitBrand, TVisualKitPieceItem } from "../types";
import { barcodeFor } from "./barcode";
import { Code128Barcode } from "./code128";
import { EanBarcode, eanViewHeight } from "./ean";
import {
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
const FOOTER_STRIP_HEIGHT = 20;

// Código de barras para leitura na gôndola. Módulo (X) de 0,28 mm ≈ 85% da nominal GS1 (0,33 mm; o
// mínimo é 80%) e barras de 58 módulos ≈ 16 mm — a GS1 pede ~18 mm a 80%; abaixo de ~15 mm o leitor
// do caixa começa a falhar. A altura é fixada (e não a largura) para EAN-8 manter o mesmo módulo.
// Cabe na coluna: 151 px de etiqueta − 20 da faixa − 15 de respiro − 2 linhas de nome (~36) ≥ 74.
const BARCODE_MODULE = mmToPx(0.28);
const BARCODE_BAR_MODULES = 58;
const BARCODE_HEIGHT = eanViewHeight(BARCODE_BAR_MODULES) * BARCODE_MODULE;
const MAX_CODE128_MODULES = (LABEL_WIDTH - 159 - 15 - 11 - 8) / BARCODE_MODULE;

type TShelfLabelProps = { item: TVisualKitPieceItem; brand: TVisualKitBrand; configuracao: TVisualKitConfig; validity: string | null };

function ShelfLabel({ item, brand, configuracao, validity }: TShelfLabelProps) {
	const display = resolveItemDisplay(item, configuracao);
	const barcode = barcodeFor(item, configuracao, MAX_CODE128_MODULES);
	const hasBarcode = barcode !== null;
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
				<div style={{ flex: 1, minWidth: 0, padding: "9px 11px 6px 15px", display: "flex", flexDirection: "column" }}>
					<span style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.01em", color: INK, ...clampLines(2) }}>{item.nome}</span>
					{item.detalhe && !hasBarcode ? <span style={{ fontSize: 12, color: "#5c5c5c", marginTop: 4, ...clampLines(2) }}>{item.detalhe}</span> : null}
					<div style={{ flex: 1 }} />
					<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
						{barcode?.kind === "EAN" ? (
							<EanBarcode code={barcode.code} height={BARCODE_HEIGHT} barHeight={BARCODE_BAR_MODULES} />
						) : barcode?.kind === "CODE128" ? (
							<Code128Barcode bars={barcode.bars} moduleWidth={BARCODE_MODULE} barHeight={BARCODE_BAR_MODULES} />
						) : null}
						{(item.detalhe && hasBarcode) || display.precoUnidade ? (
							<span
								style={{
									flex: 1,
									minWidth: 0,
									display: "flex",
									flexDirection: "column",
									alignItems: "flex-end",
									gap: 4,
									fontSize: 10.5,
									lineHeight: 1.25,
									color: "#333333",
									textAlign: "right",
								}}
							>
								{/* Com código de barras o detalhe desce para cá: a altura da etiqueta vai para as barras. */}
								{item.detalhe && hasBarcode ? <span style={{ color: "#5c5c5c", ...clampLines(3) }}>{item.detalhe}</span> : null}
								{display.precoUnidade ? (
									<span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
										<span style={{ fontWeight: 700 }}>{display.precoUnidade.valor}</span>
										<span>{display.precoUnidade.rotulo}</span>
									</span>
								) : null}
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
					height: FOOTER_STRIP_HEIGHT,
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
